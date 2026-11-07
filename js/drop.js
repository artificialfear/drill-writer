// Drill Writer — dropping a performer from the show.
// For each set, find the form the dropped dot belongs to and work out who would move for each fix:
//   close   — the form keeps its spacing and gets one interval shorter; only the shorter side slides
//             in, and each mover takes a neighbor's existing spot (clean, already-used coordinates).
//   stretch — the form keeps its end points; everyone in it re-spaces evenly along the same path.
//   hole    — nothing moves.
// Pure functions (no DOM) so they can be tested in Node.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r2 = v => Math.round(v * 100) / 100;
const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// Is this ordered list of ids still an evenly spaced chain in this set?
function isChain(st, ids) {
  if (ids.length < 3) return false;
  const gaps = [];
  for (let i = 1; i < ids.length; i++) gaps.push(dist(st.pos[ids[i - 1]], st.pos[ids[i]]));
  const m = median(gaps);
  return m > 0.3 && gaps.every(g => Math.abs(g - m) <= 0.15 * m + 0.05);
}

// A form saved when it was drawn with Line/Arc/Block/Circle — used only if it still holds together.
function savedChain(st, pid) {
  for (const f of st.forms || []) {
    let ids = f.ids || [];
    const k = ids.indexOf(pid);
    if (k < 0) continue;
    if (f.type === 'block' && f.cols > 1) { const row = Math.floor(k / f.cols); ids = ids.slice(row * f.cols, row * f.cols + f.cols); }
    else if (f.type === 'block') continue; // single-column block = a front-to-back file; detection handles it
    ids = ids.filter(id => st.pos[id]);
    if (!isChain(st, ids)) continue;
    const gaps = []; for (let i = 1; i < ids.length; i++) gaps.push(dist(st.pos[ids[i - 1]], st.pos[ids[i]]));
    const closed = f.type === 'circle' && Math.abs(dist(st.pos[ids[0]], st.pos[ids.at(-1)]) - median(gaps)) < 0.25 * median(gaps);
    return { ids, closed, source: 'saved', kind: f.type };
  }
  return null;
}

// No saved form: look for neighbors at an even interval in a line or gentle curve through the dot.
function detectChain(st, pid, allIds) {
  const D = st.pos[pid];
  const others = allIds.filter(id => id !== pid && st.pos[id]).map(id => ({ id, d: dist(st.pos[id], D) })).sort((a, b) => a.d - b.d);
  if (!others.length || others[0].d > 8 || others[0].d < 0.3) return null;
  const d1 = others[0].d;
  const cands = others.filter(o => o.d <= d1 * 1.15).slice(0, 6);

  const grow = chain => { // extend from the last element
    for (let guard = 0; guard < 80; guard++) {
      const E = st.pos[chain.at(-1)], P = st.pos[chain.at(-2)], s = dist(E, P);
      const pred = { x: E.x + (E.x - P.x), y: E.y + (E.y - P.y) };
      let best = null, bd = Infinity;
      for (const id of allIds) {
        if (chain.includes(id) || !st.pos[id]) continue;
        const q = st.pos[id], dp = dist(q, pred);
        if (dp <= 0.7 * s && Math.abs(dist(q, E) - s) <= 0.2 * s && dp < bd) { best = id; bd = dp; }
      }
      if (!best) return chain;
      chain.push(best);
    }
    return chain;
  };
  let bestChain = null;
  for (const c of cands) {
    let ch = grow([pid, c.id]);          // extend past the neighbor
    ch = grow(ch.reverse()).reverse();   // then extend past the dropped dot the other way
    if (!bestChain || ch.length > bestChain.length) bestChain = ch;
  }
  if (!bestChain || bestChain.length < 3) return null;
  const gaps = []; for (let i = 1; i < bestChain.length; i++) gaps.push(dist(st.pos[bestChain[i - 1]], st.pos[bestChain[i]]));
  const s = median(gaps);
  const closed = bestChain.length >= 6 && Math.abs(dist(st.pos[bestChain[0]], st.pos[bestChain.at(-1)]) - s) < 0.25 * s;
  return { ids: bestChain, closed, source: 'detected', kind: closed ? 'circle' : 'line' };
}

function respaceAlong(path, closed, m, startT = 0) {
  // place m points evenly by distance along the polyline `path`
  const pts = closed ? [...path, path[0]] : path;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const L = cum.at(-1);
  const at = t => {
    t = closed ? ((t % L) + L) % L : Math.max(0, Math.min(L, t));
    let i = 1; while (i < cum.length - 1 && cum[i] < t) i++;
    const seg = cum[i] - cum[i - 1] || 1, u = (t - cum[i - 1]) / seg;
    return { x: r2(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u), y: r2(pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u) };
  };
  const out = [];
  for (let i = 0; i < m; i++) out.push(closed ? at(startT + (i + 0.5) * L / m) : at(m > 1 ? L * i / (m - 1) : L / 2));
  return { out, cum };
}

function cleanMoves(st, moves) {
  for (const [id, q] of Object.entries(moves)) if (dist(st.pos[id], q) < 0.01) delete moves[id];
  return moves;
}

export function planSet(show, setIdx, pid) {
  const st = show.sets[setIdx];
  const allIds = show.performers.map(p => p.id);
  const chain = savedChain(st, pid) || detectChain(st, pid, allIds);
  const plan = { chain, options: { hole: {} }, def: 'hole' };
  if (!chain) return plan;
  const { ids, closed } = chain, n = ids.length, k = ids.indexOf(pid);
  const spots = ids.map(id => ({ ...st.pos[id] }));
  const rest = ids.filter(id => id !== pid);

  // stretch
  const stretch = {};
  if (closed) {
    const order = [...ids.slice(k + 1), ...ids.slice(0, k)];
    const { cum } = respaceAlong(spots, true, order.length, 0);
    const { out } = respaceAlong(spots, true, order.length, cum[k]);
    order.forEach((id, i) => { stretch[id] = out[i]; });
  } else {
    const { out } = respaceAlong(spots, false, rest.length);
    rest.forEach((id, i) => { stretch[id] = out[i]; });
  }
  plan.options.stretch = cleanMoves(st, stretch);

  // close the gap
  if (closed) plan.options.close = { ...plan.options.stretch };
  else {
    const close = {};
    const left = k, right = n - 1 - k;
    if (left <= right) for (let j = 0; j < k; j++) close[ids[j]] = { ...spots[j + 1] };
    else for (let j = k + 1; j < n; j++) close[ids[j]] = { ...spots[j - 1] };
    plan.options.close = cleanMoves(st, close);
  }
  plan.def = 'close';
  return plan;
}

export function planDrop(show, pid) {
  return show.sets.map((st, i) => planSet(show, i, pid));
}

// Apply chosen fixes. Mutates `show`. Returns a report of who changed and any new big steps.
export function applyDrop(show, pid, plans, choices, stepSize, setName = st => st.name) {
  const before = show.sets.map(st => JSON.parse(JSON.stringify(st.pos)));
  const bigBefore = new Set();
  for (let i = 1; i < show.sets.length; i++)
    for (const p of show.performers) if (stepSize(show.sets[i - 1].pos[p.id], show.sets[i].pos[p.id], show.sets[i].counts).big) bigBefore.add(`${i}|${p.id}`);

  show.sets.forEach((st, i) => {
    const moves = plans[i].options[choices[i]] || {};
    for (const [id, q] of Object.entries(moves)) st.pos[id] = { ...q };
    delete st.pos[pid];
    st.forms = (st.forms || []).map(f => ({ ...f, ids: f.ids.filter(id => id !== pid) })).filter(f => f.ids.length > 1);
  });
  const dropped = show.performers.find(p => p.id === pid);
  show.performers = show.performers.filter(p => p.id !== pid);

  const changed = [];
  for (const p of show.performers) {
    const sets = [];
    show.sets.forEach((st, i) => { if (dist(before[i][p.id], st.pos[p.id]) >= 0.01) sets.push(setName(st)); });
    if (sets.length) changed.push({ id: p.id, label: p.label, sets });
  }
  const newBig = [];
  for (let i = 1; i < show.sets.length; i++)
    for (const p of show.performers) {
      const ss = stepSize(show.sets[i - 1].pos[p.id], show.sets[i].pos[p.id], show.sets[i].counts);
      if (ss.big && !bigBefore.has(`${i}|${p.id}`)) newBig.push({ label: p.label, set: setName(show.sets[i]), step: ss.label });
    }
  return { dropped, changed, newBig };
}
