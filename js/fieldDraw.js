// Drill Writer — shared 2D field drawing (editor + student view).
import { FIELD_DEPTH, GOAL_X, END_X, refLines } from './model.js';

export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// v = { scale, ox, oy }  (screen = ox + x*scale, oy - y*scale)
export function drawField(ctx, v, field, W, H) {
  // v.flip = performer's view: rotated 180° so the front sideline is at the top and Side 1 on the right
  const f = v.flip ? -1 : 1;
  const sx = x => v.ox + f * x * v.scale, sy = y => v.oy - f * y * v.scale;
  const box = (x0, y0, x1, y1) => { const a = sx(x0), b = sx(x1), c = sy(y0), d = sy(y1); return [Math.min(a, b), Math.min(c, d), Math.abs(b - a), Math.abs(d - c)]; };
  const c = { turf: css('--turf'), line: css('--turf-line'), strong: css('--turf-strong'), grid: css('--turf-grid'), bg: css('--bg'), muted: css('--muted') };
  const s = v.scale;
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
  // turf incl. end zones
  ctx.fillStyle = c.turf;
  ctx.fillRect(...box(-END_X, 0, END_X, FIELD_DEPTH));
  ctx.fillStyle = c.grid;
  ctx.fillRect(...box(-END_X, 0, -GOAL_X, FIELD_DEPTH));
  ctx.fillRect(...box(GOAL_X, 0, END_X, FIELD_DEPTH));

  // 4-step grid: x from the 50, y measured out from each hash
  if (s >= 3) {
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = -GOAL_X; x <= GOAL_X; x += 4) { if (x % 8) { ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(FIELD_DEPTH)); } }
    const refs = refLines(field);
    for (let i = 0; i < refs.length; i++) {
      const lo = i ? (refs[i - 1].y + refs[i].y) / 2 : 0, hi = i < refs.length - 1 ? (refs[i].y + refs[i + 1].y) / 2 : FIELD_DEPTH;
      for (let y = refs[i].y; y >= lo - 1e-6; y -= 4) { if (y > 0.01 && y < FIELD_DEPTH - 0.01) { ctx.moveTo(sx(-GOAL_X), sy(y)); ctx.lineTo(sx(GOAL_X), sy(y)); } }
      for (let y = refs[i].y + 4; y <= hi + 1e-6; y += 4) { if (y < FIELD_DEPTH - 0.01) { ctx.moveTo(sx(-GOAL_X), sy(y)); ctx.lineTo(sx(GOAL_X), sy(y)); } }
    }
    ctx.stroke();
  }

  // yard lines
  for (let k = -10; k <= 10; k++) {
    const x = k * 8;
    ctx.strokeStyle = (k === 0 || Math.abs(k) === 10) ? c.strong : c.line;
    ctx.lineWidth = (k === 0 || Math.abs(k) === 10) ? 2 : 1.25;
    ctx.beginPath(); ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(FIELD_DEPTH)); ctx.stroke();
  }
  // sidelines / end lines
  ctx.strokeStyle = c.strong; ctx.lineWidth = 2;
  ctx.strokeRect(...box(-END_X, 0, END_X, FIELD_DEPTH));

  // hashes: a tick every yard + a bold mark on each yard line
  const refs = refLines(field);
  ctx.strokeStyle = c.strong; ctx.lineWidth = 1.5; ctx.beginPath();
  for (const hy of [refs[1].y, refs[2].y]) {
    for (let x = -GOAL_X; x <= GOAL_X + 1e-6; x += 1.6) {
      const len = Math.abs(Math.round(x / 1.6)) % 5 === 0 ? 1.2 : 0.6;
      ctx.moveTo(sx(x), sy(hy - len / 2)); ctx.lineTo(sx(x), sy(hy + len / 2));
    }
  }
  for (let x = -GOAL_X; x <= GOAL_X + 1e-6; x += 1.6) { // sideline ticks
    ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(0.8));
    ctx.moveTo(sx(x), sy(FIELD_DEPTH)); ctx.lineTo(sx(x), sy(FIELD_DEPTH - 0.8));
  }
  ctx.stroke();

  // yard numbers
  ctx.fillStyle = c.line; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(9, 3.2 * s)}px system-ui, sans-serif`;
  for (let k = -8; k <= 8; k += 2) {
    const n = 50 - 5 * Math.abs(k);
    ctx.fillText(String(n), sx(k * 8), sy(19.2));
    ctx.fillText(String(n), sx(k * 8), sy(FIELD_DEPTH - 19.2));
  }
  // orientation labels
  ctx.fillStyle = c.muted; ctx.font = `600 ${Math.max(10, 1.8 * s)}px system-ui, sans-serif`;
  ctx.fillText('SIDE 1', sx(-GOAL_X / 2), sy(-5));
  ctx.fillText('SIDE 2', sx(GOAL_X / 2), sy(-5));
  ctx.fillText('FRONT · AUDIENCE', sx(0), sy(-8.5));
}

export function shapePath(ctx, family, x, y, r) {
  ctx.beginPath();
  if (family === 'battery' || family === 'pit') { ctx.rect(x - r, y - r, r * 2, r * 2); }
  else if (family === 'guard') { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.2, y + r * 0.85); ctx.lineTo(x - r * 1.2, y + r * 0.85); ctx.closePath(); }
  else if (family === 'dm') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.55 : r * 1.3; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
  else ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function propCorners(pp, prop) {
  const a = -(pp.rot || 0) * Math.PI / 180; // degrees, clockwise-positive on screen
  const cos = Math.cos(a), sin = Math.sin(a), hw = prop.w / 2, hh = prop.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => ({ x: pp.x + u * cos - v * sin, y: pp.y + u * sin + v * cos }));
}
