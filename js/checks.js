// Drill Writer — collision check. Everyone moves in a straight line at a steady speed between sets,
// so for each pair the closest approach during a move can be solved exactly.
import { sectionByKey, moveTiming } from './model.js';

// How close two marchers can pass (center to center, in 8-to-5 steps; 1 step = 22.5").
// Battery carries wide drums, so they need more room.
const RADIUS = { battery: 0.65, pit: 0.8 };
const reach = sec => RADIUS[sectionByKey(sec).family] ?? 0.5;

// Collisions during the move INTO set i: [{a, b, t, count, dist}] (a/b = performer objects)
export function collisionsInto(show, i) {
  if (i <= 0 || i >= show.sets.length) return [];
  const A = show.sets[i - 1].pos, B = show.sets[i].pos, counts = show.sets[i].counts || 0;
  const ps = show.performers.filter(p => A[p.id] && B[p.id]), out = [];
  // each student's path as a function of u (0..1 through the move), with holds
  const tr = new Map(ps.map(p => {
    const t = moveTiming(show, i, p.id), a = A[p.id], b = B[p.id];
    const u1 = counts ? t.pre / counts : 0, u2 = counts ? 1 - t.post / counts : 1;
    const at = u => { const f = u <= u1 ? 0 : u >= u2 ? 1 : (u - u1) / Math.max(1e-9, u2 - u1); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; };
    return [p.id, { at, breaks: [u1, u2], moves: Math.hypot(b.x - a.x, b.y - a.y) > 1e-6 }];
  }));
  for (let m = 0; m < ps.length; m++) {
    const p = ps[m], P = tr.get(p.id);
    for (let n = m + 1; n < ps.length; n++) {
      const q = ps[n], Q = tr.get(q.id);
      if (!P.moves && !Q.moves) continue;
      const r0 = { x: A[q.id].x - A[p.id].x, y: A[q.id].y - A[p.id].y }, r1 = { x: B[q.id].x - B[p.id].x, y: B[q.id].y - B[p.id].y };
      // closest approach over the pieces where both move in straight lines
      const us = [...new Set([0, 1, ...P.breaks, ...Q.breaks].map(u => Math.min(1, Math.max(0, u))))].sort((x, y) => x - y);
      let best = Infinity, bu = 0;
      for (let k = 0; k < us.length - 1; k++) {
        const ua = us[k], ub = us[k + 1]; if (ub - ua < 1e-9) continue;
        const pa = P.at(ua), pb = P.at(ub), qa = Q.at(ua), qb = Q.at(ub);
        const sx = qa.x - pa.x, sy = qa.y - pa.y, vx = (qb.x - pb.x) - sx, vy = (qb.y - pb.y) - sy, vv = vx * vx + vy * vy;
        const s = vv < 1e-12 ? 0 : Math.max(0, Math.min(1, -(sx * vx + sy * vy) / vv));
        const d = Math.hypot(sx + s * vx, sy + s * vy);
        if (d < best - 1e-9) { best = d; bu = ua + s * (ub - ua); }
      }
      if (bu <= 0.02 || bu >= 0.98) continue; // closest at a set — that's the written spacing, not a collision
      const limit = reach(p.section) + reach(q.section);
      const ends = Math.min(Math.hypot(r0.x, r0.y), Math.hypot(r1.x, r1.y));
      if (best < limit && best < ends - 0.25) {
        const pa = P.at(bu), qa = Q.at(bu);
        out.push({ a: p, b: q, t: bu, count: Math.min(counts, Math.floor(bu * counts) + 1), dist: best, set: i,
          at: { x: (pa.x + qa.x) / 2, y: (pa.y + qa.y) / 2 }, pa, qb: qa });
      }
    }
  }
  return out.sort((x, y) => x.dist - y.dist);
}

export function allCollisions(show) {
  return show.sets.map((_, i) => collisionsInto(show, i));
}
