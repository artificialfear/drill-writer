import { moveStep } from './model.js';
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

// The form a performer is part of in a set (saved form, else evenly spaced neighbors), or null.
export function formOf(show, setIdx, pid) {
  const st = show.sets[setIdx];
  if (!st || !st.pos[pid]) return null;
  return savedChain(st, pid) || detectChain(st, pid, show.performers.map(p => p.id));
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
    for (const p of show.performers) if (moveStep(show, i, p.id).big) bigBefore.add(`${i}|${p.id}`);

  const droppedLabel = (show.performers.find(p => p.id === pid) || {}).label || '';
  show.sets.forEach((st, i) => {
    const moves = plans[i].options[choices[i]] || {};
    for (const [id, q] of Object.entries(moves)) st.pos[id] = { ...q };
    // remember empty spots so a new student can fill them later
    if (choices[i] === 'hole' && st.pos[pid]) (st.holes = st.holes || []).push({ x: st.pos[pid].x, y: st.pos[pid].y, was: droppedLabel });
    delete st.pos[pid];
    if (st.timing) delete st.timing[pid];
    st.forms = (st.forms || []).map(f => ({ ...f, ids: f.ids.filter(id => id !== pid) })).filter(f => f.ids.length > 1);
  });
  const dropped = show.performers.find(p => p.id === pid);
  show.performers = show.performers.filter(p => p.id !== pid);

  return { dropped, ...diffReport(show, before, bigBefore, stepSize, setName) };
}

function bigSet(show, stepSize) {
  const out = new Set();
  for (let i = 1; i < show.sets.length; i++)
    for (const p of show.performers) if (moveStep(show, i, p.id).big) out.add(`${i}|${p.id}`);
  return out;
}
function diffReport(show, before, bigBefore, stepSize, setName, skipId = null) {
  const changed = [];
  for (const p of show.performers) {
    if (p.id === skipId) continue;
    const sets = [];
    show.sets.forEach((st, i) => { if (before[i][p.id] && dist(before[i][p.id], st.pos[p.id]) >= 0.01) sets.push(setName(st)); });
    if (sets.length) changed.push({ id: p.id, label: p.label, sets });
  }
  const newBig = [];
  for (let i = 1; i < show.sets.length; i++)
    for (const p of show.performers) {
      const ss = moveStep(show, i, p.id);
      if (ss.big && !bigBefore.has(`${i}|${p.id}`)) newBig.push({ label: p.label, set: setName(show.sets[i]), step: ss.label });
    }
  return { changed, newBig };
}

// ---------------- Adding a student after the drill is written ----------------
// The new student is placed relative to an anchor performer ("put them next to T4") in every set.
// Options per set, fewest movers first:
//   hole    — fill an empty spot left by an earlier drop (nobody moves)
//   end     — add one interval past the end of the anchor's form nearest the anchor (nobody moves)
//   insert  — open a spot right next to the anchor; the shorter side of the form steps out one spot
//   stretch — insert next to the anchor and re-space the whole form between the same end points
//   beside  — a free spot one interval from the anchor (used when the anchor isn't in a form)
const NEAR = 1.0; // anything closer than 1 step to someone else gets flagged

function freeSpot(st, A, s, ids) {
  const tries = [[0, s], [0, -s], [-s, 0], [s, 0], [-s, s], [s, s], [-s, -s], [s, -s], [0, 2 * s], [0, -2 * s]];
  for (const [dx, dy] of tries) {
    const q = { x: r2(A.x + dx), y: r2(A.y + dy) };
    if (ids.every(id => !st.pos[id] || dist(st.pos[id], q) >= Math.min(s, 2) * 0.75)) return q;
  }
  return { x: r2(A.x), y: r2(A.y + s) };
}

export function planAddSet(show, setIdx, anchor) {
  const st = show.sets[setIdx];
  const allIds = show.performers.map(p => p.id);
  const A = st.pos[anchor];
  const plan = { chain: null, options: {}, def: 'beside' };
  if (!A) return plan;

  const holes = (st.holes || []).map((h, i) => ({ ...h, i, d: dist(h, A) })).sort((a, b) => a.d - b.d);
  if (holes.length && holes[0].d <= 12) plan.options.hole = { spot: { x: holes[0].x, y: holes[0].y }, moves: {}, holeIndex: holes[0].i, note: holes[0].was ? `${holes[0].was}'s old spot` : 'empty spot' };

  const chain = savedChain(st, anchor) || detectChain(st, anchor, allIds);
  plan.chain = chain;
  let s = 2;
  if (chain) {
    const { ids, closed } = chain, n = ids.length, k = ids.indexOf(anchor);
    const spots = ids.map(id => ({ ...st.pos[id] }));
    const gaps = []; for (let i = 1; i < n; i++) gaps.push(dist(spots[i - 1], spots[i]));
    s = median(gaps);
    const ext = (a, b) => ({ x: r2(a.x + (a.x - b.x)), y: r2(a.y + (a.y - b.y)) }); // one interval past a, away from b
    if (!closed) {
      const startSide = k <= n - 1 - k;
      // end
      plan.options.end = { spot: startSide ? ext(spots[0], spots[1]) : ext(spots[n - 1], spots[n - 2]), moves: {}, at: startSide ? 0 : n };
      // insert next to the anchor, toward the shorter side
      const ins = { moves: {} };
      if (startSide) {
        ins.spot = k > 0 ? { ...spots[k - 1] } : ext(spots[0], spots[1]);
        for (let j = 0; j < k; j++) ins.moves[ids[j]] = j > 0 ? { ...spots[j - 1] } : ext(spots[0], spots[1]);
        ins.at = k;
      } else {
        ins.spot = k < n - 1 ? { ...spots[k + 1] } : ext(spots[n - 1], spots[n - 2]);
        for (let j = k + 1; j < n; j++) ins.moves[ids[j]] = j < n - 1 ? { ...spots[j + 1] } : ext(spots[n - 1], spots[n - 2]);
        ins.at = k + 1;
      }
      plan.options.insert = ins;
      // stretch: same end points, n+1 evenly spaced, new student right after/before the anchor
      const order = [...ids]; order.splice(ins.at, 0, '__new');
      const { out } = respaceAlong(spots, false, order.length);
      const st2 = { moves: {}, at: ins.at };
      order.forEach((id, i) => { if (id === '__new') st2.spot = out[i]; else st2.moves[id] = out[i]; });
      cleanMoves(st, st2.moves);
      plan.options.stretch = st2;
    } else {
      // closed loop: insert after the anchor and re-space all the way round
      const order = [...ids.slice(k + 1), ...ids.slice(0, k + 1)]; // anchor last, new student right after it
      const all = ['__new', ...order];
      const { cum } = respaceAlong(spots, true, all.length, 0);
      const { out } = respaceAlong(spots, true, all.length, cum[k]);
      const st2 = { moves: {}, at: k + 1 };
      all.forEach((id, i) => { if (id === '__new') st2.spot = out[i]; else st2.moves[id] = out[i]; });
      cleanMoves(st, st2.moves);
      plan.options.stretch = st2;
    }
  }
  plan.options.beside = { spot: freeSpot(st, A, Math.min(s, 4), allIds), moves: {} };

  // flag spots that land on top of someone
  for (const o of Object.values(plan.options)) {
    const final = { ...st.pos, ...o.moves };
    const crowd = show.performers.filter(p => final[p.id] && dist(final[p.id], o.spot) < NEAR).map(p => p.label);
    if (crowd.length) o.warn = `within 1 step of ${crowd.join(', ')}`;
  }
  plan.def = plan.options.hole ? 'hole' : plan.options.end ? 'end' : 'beside';
  return plan;
}

export function planAdd(show, anchor) {
  return show.sets.map((st, i) => planAddSet(show, i, anchor));
}

export function applyAdd(show, perf, plans, choices, stepSize, setName = st => st.name) {
  const before = show.sets.map(st => JSON.parse(JSON.stringify(st.pos)));
  const bigBefore = bigSet(show, stepSize);
  show.performers.push(perf);
  show.sets.forEach((st, i) => {
    const pl = plans[i], o = pl.options[choices[i]] || pl.options.beside;
    for (const [id, q] of Object.entries(o.moves || {})) st.pos[id] = { ...q };
    st.pos[perf.id] = { ...o.spot };
    if (choices[i] === 'hole' && o.holeIndex != null) st.holes.splice(o.holeIndex, 1);
    // keep a saved line/arc/circle form up to date so later drops still rebuild it
    if (pl.chain && pl.chain.source === 'saved' && o.at != null) {
      const f = (st.forms || []).find(f => f.ids.includes(pl.chain.ids[0]));
      if (f && f.type !== 'block') {
        const anchorIdx = f.ids.indexOf(pl.chain.ids[Math.min(o.at, pl.chain.ids.length - 1)]);
        const idx = o.at >= pl.chain.ids.length ? f.ids.length : anchorIdx;
        f.ids.splice(Math.max(0, idx), 0, perf.id);
      } else if (f) st.forms = st.forms.filter(x => x !== f); // a block row changed length; forget the block
    }
  });
  return diffReport(show, before, bigBefore, stepSize, setName, perf.id);
}
