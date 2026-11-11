// Drill Writer — auto-fix by swapping spots.
// Keeps every dot of a set where it is, and changes WHO goes to each spot (within one instrument),
// so the move into that set has the smallest possible largest step and no crossings.
// Swapping happens from that set onward: a student takes over the whole rest of the other student's
// path, so every later move looks exactly the same — only the move into the fixed set changes.
import { moveStep, moveTiming, lookAt } from './model.js';
import { collisionsInto } from './checks.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- "Mark as OK" ----------
export const okKeyX = (i, a, b) => `x:${i}:${[a, b].sort().join(':')}`;
export const okKeyBig = (i, id) => `b:${i}:${id}`;
export const isOkX = (show, c) => !!(show.ok && show.ok[okKeyX(c.set, c.a.id, c.b.id)]);
export const isOkBig = (show, i, id) => !!(show.ok && show.ok[okKeyBig(i, id)]);

export function problemsInto(show, i) {
  if (i <= 0) return { x: [], big: [] };
  const x = collisionsInto(show, i).filter(c => !isOkX(show, c));
  const A = show.sets[i - 1].pos, B = show.sets[i].pos;
  const big = show.performers.filter(p => A[p.id] && B[p.id] && moveStep(show, i, p.id).big && !isOkBig(show, i, p.id));
  return { x, big };
}
function score(show, i, ids) {
  const pr = problemsInto(show, i);
  const A = show.sets[i - 1].pos, B = show.sets[i].pos;
  let worst = 0; for (const id of ids) worst = Math.max(worst, dist(A[id], B[id]));
  return [pr.x.length, pr.big.length, worst];
}
const better = (a, b) => a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2] - 1e-6;

// ---------- assignment (Hungarian, O(n³)); rows = students, cols = spots ----------
function hungarian(cost) {
  const n = cost.length, INF = 1e18;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n);
  for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
  return ans;
}
// can everyone reach some spot within `lim` steps? (augmenting-path matching)
function feasible(d, lim) {
  const n = d.length, match = new Array(n).fill(-1);
  const tryRow = (r, seen) => {
    for (let c = 0; c < n; c++) if (d[r][c] <= lim + 1e-9 && !seen[c]) {
      seen[c] = true;
      if (match[c] < 0 || tryRow(match[c], seen)) { match[c] = r; return true; }
    }
    return false;
  };
  for (let r = 0; r < n; r++) if (!tryRow(r, new Array(n).fill(false))) return false;
  return true;
}

// Best re-assignment for one group of students for the move into set i: {who: whose path they take}
function optimizeGroup(show, i, ids) {
  const A = show.sets[i - 1].pos, B = show.sets[i].pos, n = ids.length;
  if (n < 2) return {};
  const d = ids.map(r => ids.map(c => dist(A[r], B[c])));
  // 1) the smallest possible largest step
  const vals = [...new Set(d.flat().map(x => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
  let lo = 0, hi = vals.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (feasible(d, vals[mid])) hi = mid; else lo = mid + 1; }
  const limit = vals[lo];
  // 2) within that, the shortest total distance (straight paths that never cross), preferring no change
  const cost = d.map((row, r) => row.map((x, c) => x > limit + 1e-6 ? 1e6 : x - (r === c ? 0.3 : 0)));
  const ans = hungarian(cost), perm = {};
  ans.forEach((c, r) => { if (c !== r) perm[ids[r]] = ids[c]; });
  return perm;
}

// Apply a swap from set i onward: perm[who] = whose path they now take.
export function applySwap(show, i, perm) {
  const who = Object.keys(perm); if (!who.length) return;
  const inv = {}; for (const w of who) inv[perm[w]] = w;
  // looks (facing / horns / flag) carry forward from earlier sets, so first pin down what each PATH looks like
  // at set i and what each student looked like just before — the student takes over the path's look from here on
  const pathLook = {}, wasLook = {};
  for (const w of who) { pathLook[w] = lookAt(show, i, perm[w]); wasLook[w] = i > 0 ? lookAt(show, i - 1, w) : null; }
  for (let j = i; j < show.sets.length; j++) {
    const st = show.sets[j], old = {}, oldT = {};
    for (const w of who) { old[w] = st.pos[w] && { ...st.pos[w] }; oldT[w] = st.timing && st.timing[w]; }
    for (const w of who) if (old[perm[w]]) st.pos[w] = old[perm[w]];
    if (st.timing) for (const w of who) {
      // later moves: timing belongs to the path, so it goes with it; the fixed move itself starts fresh
      const t = j > i ? oldT[perm[w]] : null;
      if (t) st.timing[w] = { ...t }; else delete st.timing[w];
    }
    if (st.look) {
      const oldL = {}; for (const w of who) oldL[w] = st.look[w];
      for (const w of who) { if (oldL[perm[w]]) st.look[w] = { ...oldL[perm[w]] }; else delete st.look[w]; }
    }
    if (j === i) for (const w of who) { // make the hand-over explicit at set i wherever it differs from before
      const l = { ...((st.look || {})[w] || {}) };
      for (const k of ['face', 'horns', 'flag']) {
        const was = wasLook[w] ? wasLook[w][k] : null;
        if (pathLook[w][k] !== was && (was !== null || l[k])) l[k] = pathLook[w][k]; else if (pathLook[w][k] === was) { delete l[k]; delete l[k + 'At']; }
      }
      st.look = st.look || {};
      if (Object.keys(l).length) st.look[w] = l; else delete st.look[w];
    }
    st.forms = (st.forms || []).map(f => ({ ...f, ids: f.ids.map(id => inv[id] ?? id) }));
  }
}
const clone = o => JSON.parse(JSON.stringify(o));

// Propose a swap for the move into set i. focusIds = students in the problem (else everyone with a problem).
export function proposeFix(show, i, focusIds) {
  const pr = problemsInto(show, i);
  const involved = focusIds || [...new Set([...pr.x.flatMap(c => [c.a.id, c.b.id]), ...pr.big.map(p => p.id)])];
  if (!involved.length) return null;
  const secOf = id => (show.performers.find(p => p.id === id) || {}).section;
  const sections = [...new Set(involved.map(secOf))];
  const A = show.sets[i - 1].pos, B = show.sets[i].pos;
  let work = clone(show), perm = {};
  const allIds = show.performers.filter(p => sections.includes(p.section) && A[p.id] && B[p.id]).map(p => p.id);
  const before = score(show, i, allIds);
  let best = before;
  for (const sec of sections) { // accept each instrument's swap only if it makes things better
    const ids = show.performers.filter(p => p.section === sec && A[p.id] && B[p.id]).map(p => p.id);
    const sp = optimizeGroup(work, i, ids);
    if (!Object.keys(sp).length) continue;
    const trial = clone(work); applySwap(trial, i, sp);
    const sc = score(trial, i, allIds);
    if (better(sc, best)) { work = trial; best = sc; Object.assign(perm, sp); }
  }
  // collisions swapping couldn't clear (often two different instruments): try a short hold
  const timing = suggestHolds(work, i, focusIds ? new Set(involved) : null);
  if (!Object.keys(perm).length && !Object.keys(timing).length) return null;
  const after = problemsInto(work, i);
  return { set: i, perm, timing, before: { x: pr.x.length, big: pr.big.length }, after: { x: after.x.length, big: after.big.length } };
}

// For each collision still in the move into set i, find the shortest hold — one of the two students
// waits before moving, or arrives early and holds — that clears it without adding a collision or a big step.
// Mutates `work`; returns {id: {pre, post}} for the students whose timing changed.
function suggestHolds(work, i, only) {
  const out = {}, tried = new Set();
  const st = work.sets[i], counts = st.counts || 0;
  if (counts < 2) return out;
  for (let guard = 0; guard < 40; guard++) {
    const pr = problemsInto(work, i);
    const c = pr.x.find(c => !tried.has(c.a.id + '|' + c.b.id) && (!only || only.has(c.a.id) || only.has(c.b.id)));
    if (!c) break;
    tried.add(c.a.id + '|' + c.b.id);
    const total = pr.x.length;
    let best = null;
    for (const who of [c.a, c.b]) {
      const was = moveTiming(work, i, who.id), wasBig = moveStep(work, i, who.id).big;
      for (const kind of ['pre', 'post']) for (let k = 1; k < counts; k++) {
        const t = { pre: was.pre, post: was.post }; t[kind] = k;
        if (counts - t.pre - t.post < 1) break;
        if (best && k >= best.k) break;
        st.timing = st.timing || {};
        const keep = st.timing[who.id];
        st.timing[who.id] = t;
        const after = problemsInto(work, i);
        const ok = !after.x.some(x => (x.a.id === c.a.id && x.b.id === c.b.id)) && after.x.length < total
          && (wasBig || !moveStep(work, i, who.id).big);
        if (keep) st.timing[who.id] = keep; else delete st.timing[who.id];
        if (ok) { best = { who, t, k, step: moveStep(work, i, who.id) }; break; }
      }
    }
    if (best) { st.timing = st.timing || {}; st.timing[best.who.id] = best.t; out[best.who.id] = best.t; }
  }
  return out;
}

// apply a whole fix (swaps, then holds)
export function applyPlan(show, pl) {
  applySwap(show, pl.set, pl.perm || {});
  const st = show.sets[pl.set];
  for (const [id, t] of Object.entries(pl.timing || {})) { st.timing = st.timing || {}; st.timing[id] = { ...t }; }
}

// Every set with problems, in order. Swaps at one set don't change any other move, so they stack.
export function proposeAll(show) {
  const work = clone(show), plans = [];
  for (let i = 1; i < work.sets.length; i++) {
    const pr = problemsInto(work, i);
    if (!pr.x.length && !pr.big.length) continue;
    const p = proposeFix(work, i);
    if (p) { applyPlan(work, p); plans.push(p); }
  }
  return plans;
}

// Who got new dots, and from which set on.
export function swapReport(show, plans) {
  const label = id => (show.performers.find(p => p.id === id) || {}).label || id;
  const firstSet = {};
  for (const pl of plans) for (const w of Object.keys(pl.perm)) if (firstSet[w] == null || pl.set < firstSet[w]) firstSet[w] = pl.set;
  const rows = Object.entries(firstSet).map(([id, i]) => ({ id, label: label(id), text: `new dots from set ${show.sets[i].name}` }));
  for (const pl of plans) for (const [id, t] of Object.entries(pl.timing || {})) {
    const what = [t.pre ? `hold ${t.pre} before moving` : '', t.post ? `arrive early and hold ${t.post}` : ''].filter(Boolean).join(', ');
    rows.push({ id, label: label(id), text: `${what} into set ${show.sets[pl.set].name}` });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
