// Drill Writer — collision check. Everyone moves in a straight line at a steady speed between sets,
// so for each pair the closest approach during a move can be solved exactly.
import { sectionByKey } from './model.js';

// How close two marchers can pass (center to center, in 8-to-5 steps; 1 step = 22.5").
// Battery carries wide drums, so they need more room.
const RADIUS = { battery: 0.65, pit: 0.8 };
const reach = sec => RADIUS[sectionByKey(sec).family] ?? 0.5;

// Collisions during the move INTO set i: [{a, b, t, count, dist}] (a/b = performer objects)
export function collisionsInto(show, i) {
  if (i <= 0 || i >= show.sets.length) return [];
  const A = show.sets[i - 1].pos, B = show.sets[i].pos, counts = show.sets[i].counts || 0;
  const ps = show.performers, out = [];
  for (let m = 0; m < ps.length; m++) {
    const p = ps[m], pa = A[p.id], pb = B[p.id];
    if (!pa || !pb) continue;
    for (let n = m + 1; n < ps.length; n++) {
      const q = ps[n], qa = A[q.id], qb = B[q.id];
      if (!qa || !qb) continue;
      // relative position r(t) = r0 + t * v
      const r0x = qa.x - pa.x, r0y = qa.y - pa.y;
      const r1x = qb.x - pb.x, r1y = qb.y - pb.y;
      const vx = r1x - r0x, vy = r1y - r0y, vv = vx * vx + vy * vy;
      if (vv < 1e-9) continue; // moving together (or both holding): spacing never changes
      const t = -(r0x * vx + r0y * vy) / vv;
      if (t <= 0.02 || t >= 0.98) continue; // closest at a set — that's the written spacing, not a collision
      const dx = r0x + t * vx, dy = r0y + t * vy, dist = Math.hypot(dx, dy);
      const limit = reach(p.section) + reach(q.section);
      const ends = Math.min(Math.hypot(r0x, r0y), Math.hypot(r1x, r1y));
      if (dist < limit && dist < ends - 0.25) {
        out.push({ a: p, b: q, t, count: Math.min(counts, Math.floor(t * counts) + 1), dist, set: i,
          at: { x: (pa.x + (pb.x - pa.x) * t + qa.x + (qb.x - qa.x) * t) / 2, y: (pa.y + (pb.y - pa.y) * t + qa.y + (qb.y - qa.y) * t) / 2 } });
      }
    }
  }
  return out.sort((x, y) => x.dist - y.dist);
}

export function allCollisions(show) {
  return show.sets.map((_, i) => collisionsInto(show, i));
}
