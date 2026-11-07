// Drill Writer — editor, field rendering and playback.
import {
  FIELD_DEPTH, GOAL_X, END_X, HASH_TYPES, refLines, snapPt, snapX, describeX, describeY, stepSize,
  SECTIONS, sectionByKey, PROP_KINDS, uid, newShow, normalizeShow, sampleShow,
  setStarts, totalCounts, locate, positionsAt
} from './model.js';
import { planDrop, applyDrop, planAdd, applyAdd } from './drop.js';

const $ = id => document.getElementById(id);
const canvas = $('field');
const ctx = canvas.getContext('2d');
const STORE_KEY = 'drillwriter.show.v1';
const THEME_KEY = 'drillwriter.theme';

// ---------------- State ----------------
const state = {
  show: null,
  count: 0,            // timeline position in counts
  cur: 0,              // index of the set being viewed/edited
  sel: new Set(),      // selected performer ids
  selProp: null,       // selected prop id
  tool: 'select',
  view: { scale: 5, ox: 0, oy: 0 },
  playing: false,
  undo: [], redo: [],
  pointer: null,       // current gesture
  hover: null,         // world point under cursor
  arcPts: []           // clicks so far for the arc tool
};
window.__dw = state; // handy for testing in the console

const opt = {
  get snap() { return parseFloat($('optSnap').value); },
  get interval() { return parseFloat($('optInterval').value); },
  get cols() { return Math.max(1, parseInt($('optCols').value, 10) || 1); },
  get ghost() { return $('optGhost').checked; },
  get labels() { return $('optLabels').checked; }
};

const curSet = () => state.show.sets[state.cur];
const prevSet = () => state.cur > 0 ? state.show.sets[state.cur - 1] : null;
const atSet = () => !state.playing && Math.abs(state.count - setStarts(state.show)[state.cur]) < 1e-6;
const r2 = v => Math.round(v * 100) / 100;

// ---------------- Persistence & undo ----------------
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.show)); } catch (e) { /* storage may be blocked */ }
  }, 300);
}
function snapshot() { return JSON.stringify({ show: state.show, cur: state.cur }); }
function pushUndo() {
  state.undo.push(snapshot());
  if (state.undo.length > 150) state.undo.shift();
  state.redo.length = 0;
}
function restore(snap) {
  const o = JSON.parse(snap);
  state.show = normalizeShow(o.show);
  state.cur = Math.min(o.cur, state.show.sets.length - 1);
  state.count = setStarts(state.show)[state.cur];
  for (const id of [...state.sel]) if (!state.show.performers.some(p => p.id === id)) state.sel.delete(id);
  if (state.selProp && !state.show.props.some(p => p.id === state.selProp)) state.selProp = null;
  changed(false);
}
function undo() { if (!state.undo.length) return; state.redo.push(snapshot()); restore(state.undo.pop()); }
function redo() { if (!state.redo.length) return; state.undo.push(snapshot()); restore(state.redo.pop()); }

function loadShow(show, keepUndo = false) {
  state.show = normalizeShow(show);
  state.cur = 0; state.count = 0; state.sel.clear(); state.selProp = null;
  if (!keepUndo) { state.undo = []; state.redo = []; }
  changed();
}

// Call after any edit. Re-renders panels + canvas and autosaves.
function changed(save = true) {
  $('showTitle').value = state.show.title;
  $('hashSelect').value = state.show.field.hash;
  $('bpm').value = state.show.tempo.bpm;
  renderSets(); renderPerformers(); renderProps(); renderDotInfo(); updateTransport();
  draw();
  if (save) autosave();
}

let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// Editing always happens on a set, never mid-transition.
function ensureAtSet() {
  if (state.playing) pause();
  const st = setStarts(state.show);
  if (Math.abs(state.count - st[state.cur]) > 1e-6) { state.count = st[state.cur]; updateTransport(); }
}
function goToSet(i) {
  if (state.playing) pause();
  state.cur = Math.max(0, Math.min(state.show.sets.length - 1, i));
  state.count = setStarts(state.show)[state.cur];
  state.arcPts = [];
  renderSets(); renderDotInfo(); updateTransport(); draw();
}

// ---------------- View transforms ----------------
let W = 0, H = 0, DPR = 1;
function resize() {
  const r = canvas.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  if (!state.userView) fitView();
  draw();
}
function fitView() {
  const pad = 14;
  const worldW = END_X * 2 + 8, worldH = FIELD_DEPTH + 20;
  const s = Math.min((W - pad * 2) / worldW, (H - pad * 2) / worldH);
  state.view.scale = Math.max(0.5, s);
  state.view.ox = W / 2;
  state.view.oy = H / 2 + (FIELD_DEPTH / 2 - 2) * state.view.scale;
}
const sx = x => state.view.ox + x * state.view.scale;
const sy = y => state.view.oy - y * state.view.scale;
const toWorld = (px, py) => ({ x: (px - state.view.ox) / state.view.scale, y: (state.view.oy - py) / state.view.scale });
function zoomAt(px, py, f) {
  state.userView = true;
  const w = toWorld(px, py);
  state.view.scale = Math.max(1, Math.min(60, state.view.scale * f));
  state.view.ox = px - w.x * state.view.scale;
  state.view.oy = py + w.y * state.view.scale;
  draw();
}

// ---------------- Drawing ----------------
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function drawField() {
  const c = { turf: css('--turf'), line: css('--turf-line'), strong: css('--turf-strong'), grid: css('--turf-grid'), bg: css('--bg'), muted: css('--muted') };
  const s = state.view.scale;
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
  // turf incl. end zones
  ctx.fillStyle = c.turf;
  ctx.fillRect(sx(-END_X), sy(FIELD_DEPTH), END_X * 2 * s, FIELD_DEPTH * s);
  ctx.fillStyle = c.grid;
  ctx.fillRect(sx(-END_X), sy(FIELD_DEPTH), (END_X - GOAL_X) * s, FIELD_DEPTH * s);
  ctx.fillRect(sx(GOAL_X), sy(FIELD_DEPTH), (END_X - GOAL_X) * s, FIELD_DEPTH * s);

  // 4-step grid: x from the 50, y measured out from each hash
  if (s >= 3) {
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = -GOAL_X; x <= GOAL_X; x += 4) { if (x % 8) { ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(FIELD_DEPTH)); } }
    const refs = refLines(state.show.field);
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
  ctx.strokeRect(sx(-END_X), sy(FIELD_DEPTH), END_X * 2 * s, FIELD_DEPTH * s);

  // hashes: a tick every yard + a bold mark on each yard line
  const refs = refLines(state.show.field);
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

function shapePath(family, x, y, r) {
  ctx.beginPath();
  if (family === 'battery' || family === 'pit') { ctx.rect(x - r, y - r, r * 2, r * 2); }
  else if (family === 'guard') { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.2, y + r * 0.85); ctx.lineTo(x - r * 1.2, y + r * 0.85); ctx.closePath(); }
  else if (family === 'dm') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.55 : r * 1.3; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
  else ctx.arc(x, y, r, 0, Math.PI * 2);
}

function propCorners(pp, prop) {
  const a = -(pp.rot || 0) * Math.PI / 180; // degrees, clockwise-positive on screen
  const cos = Math.cos(a), sin = Math.sin(a), hw = prop.w / 2, hh = prop.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => ({ x: pp.x + u * cos - v * sin, y: pp.y + u * sin + v * cos }));
}

function draw() {
  if (!state.show || !W || state.mode === '3d') return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawField();
  const s = state.view.scale;
  const show = state.show;
  const snap = positionsAt(show, state.count);
  const editing = atSet();
  const prev = prevSet();
  const counts = curSet().counts;
  const sel = css('--select'), warn = css('--warn'), ink = css('--ink');

  // paths from the previous set (only while sitting on a set)
  if (editing && opt.ghost && prev) {
    for (const p of show.performers) {
      const a = prev.pos[p.id], b = curSet().pos[p.id];
      const st = stepSize(a, b, counts);
      if (!st.dist) continue;
      ctx.strokeStyle = st.big ? warn : css('--muted'); ctx.globalAlpha = st.big ? 0.9 : 0.45;
      ctx.lineWidth = st.big ? 1.5 : 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(sx(a.x), sy(a.y), Math.max(2, 0.4 * s), 0, Math.PI * 2);
      ctx.fillStyle = css('--muted'); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // empty spots left by earlier drops
  if (editing && opt.ghost) {
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.5;
    for (const h of curSet().holes || []) { ctx.beginPath(); ctx.arc(sx(h.x), sy(h.y), Math.max(4, 0.75 * s), 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  // props
  for (const prop of show.props) {
    const pp = snap.props[prop.id]; if (!pp) continue;
    const pts = propCorners(pp, prop);
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(sx(q.x), sy(q.y)) : ctx.moveTo(sx(q.x), sy(q.y))); ctx.closePath();
    ctx.fillStyle = prop.color || '#9aa5b1'; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = state.selProp === prop.id ? 2.5 : 1; ctx.strokeStyle = state.selProp === prop.id ? sel : ink; ctx.stroke();
    if (opt.labels && s >= 3) {
      ctx.fillStyle = ink; ctx.font = `${Math.max(9, 1.1 * s)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(prop.label, sx(pp.x), sy(pp.y));
    }
  }

  // performers
  const r = Math.max(3.5, 0.75 * s);
  const nextSt = state.show.sets[Math.min(snap.i + 1, show.sets.length - 1)];
  for (const p of show.performers) {
    const q = snap.pos[p.id];
    const sec = sectionByKey(p.section);
    const X = sx(q.x), Y = sy(q.y);
    shapePath(sec.family, X, Y, r);
    ctx.fillStyle = sec.color; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    // step-size warning ring
    let big = false;
    if (editing && prev) big = stepSize(prev.pos[p.id], curSet().pos[p.id], counts).big;
    else if (!editing && snap.frac) big = stepSize(show.sets[snap.i].pos[p.id], nextSt.pos[p.id], nextSt.counts).big;
    if (big) { ctx.beginPath(); ctx.arc(X, Y, r + 3, 0, Math.PI * 2); ctx.strokeStyle = warn; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (state.sel.has(p.id)) { ctx.beginPath(); ctx.arc(X, Y, r + (big ? 6 : 3.5), 0, Math.PI * 2); ctx.strokeStyle = sel; ctx.lineWidth = 2.5; ctx.stroke(); }
    if (opt.labels && (s >= 4 || state.sel.has(p.id))) {
      ctx.fillStyle = ink; ctx.font = `600 ${Math.max(9, Math.min(13, 1.15 * s))}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.label, X, Y - r - 2);
    }
  }

  drawDropPreview(editing);
  drawToolPreview();
}

function drawToolPreview() {
  const g = state.pointer, sel = css('--select');
  ctx.save();
  ctx.strokeStyle = sel; ctx.fillStyle = sel; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  if (g && g.kind === 'marquee') {
    const x0 = Math.min(g.sx0, g.sx1), y0 = Math.min(g.sy0, g.sy1);
    ctx.globalAlpha = 0.12; ctx.fillRect(x0, y0, Math.abs(g.sx1 - g.sx0), Math.abs(g.sy1 - g.sy0));
    ctx.globalAlpha = 1; ctx.strokeRect(x0, y0, Math.abs(g.sx1 - g.sx0), Math.abs(g.sy1 - g.sy0));
  }
  let preview = null;
  if (g && g.kind === 'line') preview = lineTargets(g.a, g.b, g.free);
  if (state.tool === 'arc' && state.arcPts.length && state.hover) {
    const pts = [...state.arcPts, snapW(state.hover)];
    if (pts.length === 2) { ctx.beginPath(); ctx.moveTo(sx(pts[0].x), sy(pts[0].y)); ctx.lineTo(sx(pts[1].x), sy(pts[1].y)); ctx.stroke(); }
    if (pts.length === 3) preview = arcTargets(pts[0], pts[1], pts[2]);
  }
  if (state.tool === 'block' && state.hover && state.sel.size) preview = blockTargets(snapW(state.hover));
  if (state.tool === 'circle' && state.hover && state.sel.size) preview = circleTargets(snapW(state.hover));
  if (preview) {
    ctx.setLineDash([]); ctx.globalAlpha = 0.85;
    const pts = Object.values(preview);
    for (const q of pts) { ctx.beginPath(); ctx.arc(sx(q.x), sy(q.y), Math.max(3, 0.6 * state.view.scale), 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

// ---------------- Hit testing ----------------
function hitPerformer(w) {
  const snap = positionsAt(state.show, state.count);
  const rad = Math.max(1.2, 10 / state.view.scale);
  let best = null, bd = Infinity;
  for (const p of state.show.performers) {
    const q = snap.pos[p.id], d = Math.hypot(q.x - w.x, q.y - w.y);
    if (d < rad && d < bd) { best = p.id; bd = d; }
  }
  return best;
}
function hitProp(w) {
  const snap = positionsAt(state.show, state.count);
  for (let i = state.show.props.length - 1; i >= 0; i--) {
    const prop = state.show.props[i], pp = snap.props[prop.id];
    const a = (pp.rot || 0) * Math.PI / 180; // inverse rotate point into prop space
    const dx = w.x - pp.x, dy = w.y - pp.y;
    const u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(u) <= prop.w / 2 + 0.3 && Math.abs(v) <= prop.h / 2 + 0.3) return prop.id;
  }
  return null;
}

// ---------------- Form tools ----------------
const snapW = w => snapPt(w, opt.snap, state.show.field);
const selIds = () => state.show.performers.filter(p => state.sel.has(p.id)).map(p => p.id);
const posOf = id => curSet().pos[id];
function centroid(ids) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const id of ids) { const q = posOf(id); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (state.selProp) { const q = curSet().props[state.selProp]; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
function sortAlong(ids, dir) {
  return [...ids].sort((a, b) => {
    const pa = posOf(a), pb = posOf(b);
    return (pa.x * dir.x + pa.y * dir.y) - (pb.x * dir.x + pb.y * dir.y) || (pa.x - pb.x) || (pa.y - pb.y);
  });
}
function snapAngle(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (len < 1e-9) return b;
  const step = Math.PI / 4, ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}
function lineTargets(a, bRaw, free) {
  const ids = selIds(); if (!ids.length) return null;
  const b = free ? bRaw : snapAngle(a, bRaw);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const dir = len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  const order = sortAlong(ids, dir), n = order.length, iv = opt.interval, out = {};
  order.forEach((id, i) => {
    const t = iv > 0 ? i * iv : (n > 1 ? len * i / (n - 1) : 0);
    out[id] = { x: r2(a.x + dir.x * t), y: r2(a.y + dir.y * t) };
  });
  return out;
}
function arcTargets(p0, p1, pb) {
  const ids = selIds(); if (!ids.length) return null;
  const chord = { x: p1.x - p0.x, y: p1.y - p0.y }, cl = Math.hypot(chord.x, chord.y) || 1;
  const order = sortAlong(ids, { x: chord.x / cl, y: chord.y / cl }), n = order.length;
  // circle through 3 points
  const ax = p0.x, ay = p0.y, bx = pb.x, by = pb.y, cx = p1.x, cy = p1.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const out = {};
  if (Math.abs(d) < 1e-6) { // straight: fall back to an even line
    order.forEach((id, i) => { const t = n > 1 ? i / (n - 1) : 0; out[id] = { x: r2(p0.x + chord.x * t), y: r2(p0.y + chord.y * t) }; });
    return out;
  }
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const R = Math.hypot(ax - ux, ay - uy);
  const a0 = Math.atan2(ay - uy, ax - ux), ab = Math.atan2(by - uy, bx - ux), a1 = Math.atan2(cy - uy, cx - ux);
  const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let sweep = norm(a1 - a0);                 // counter-clockwise sweep from p0 to p1
  if (norm(ab - a0) > sweep) sweep -= 2 * Math.PI; // bulge isn't on the ccw path → go clockwise
  order.forEach((id, i) => {
    const t = n > 1 ? i / (n - 1) : 0, a = a0 + sweep * t;
    out[id] = { x: r2(ux + Math.cos(a) * R), y: r2(uy + Math.sin(a) * R) };
  });
  return out;
}
function blockTargets(corner) {
  const ids = selIds(); if (!ids.length) return null;
  const iv = opt.interval || 2, cols = opt.cols;
  const order = [...ids].sort((a, b) => (posOf(a).y - posOf(b).y) || (posOf(a).x - posOf(b).x));
  const out = {};
  order.forEach((id, i) => { out[id] = { x: r2(corner.x + (i % cols) * iv), y: r2(corner.y + Math.floor(i / cols) * iv) }; });
  return out;
}
function circleTargets(center) {
  const ids = selIds(); if (!ids.length) return null;
  const n = ids.length, iv = opt.interval || 2;
  const R = Math.max(iv, n * iv / (2 * Math.PI));
  const c0 = centroid(ids);
  const order = [...ids].sort((a, b) => {
    const A = Math.atan2(posOf(a).y - c0.y, posOf(a).x - c0.x), B = Math.atan2(posOf(b).y - c0.y, posOf(b).x - c0.x);
    return ((A + 2.5 * Math.PI) % (2 * Math.PI)) - ((B + 2.5 * Math.PI) % (2 * Math.PI));
  });
  const out = {};
  order.forEach((id, i) => { const a = -Math.PI / 2 - i * 2 * Math.PI / n; out[id] = { x: r2(center.x + Math.cos(a) * R), y: r2(center.y + Math.sin(a) * R) }; });
  return out;
}
// Place performers and remember the form (type + member order) so a later drop can rebuild it cleanly.
function applyTargets(t, type, extra = {}) {
  if (!t) return;
  pushUndo();
  for (const [id, q] of Object.entries(t)) curSet().pos[id] = q;
  if (type) {
    const ids = Object.keys(t), st = curSet();
    st.forms = (st.forms || []).map(f => ({ ...f, ids: f.ids.filter(id => !t[id]) })).filter(f => f.ids.length > 1);
    if (ids.length > 1) st.forms.push({ id: uid('f'), type, ids, ...extra });
  }
  changed();
}
function needSelection() {
  if (state.sel.size) return true;
  toast('Select performers first (drag a box around them, or click a section name).');
  return false;
}

// ---------------- Selection transforms ----------------
function transform(act) {
  if (dropLocked()) return toast('Finish or cancel the drop first.');
  if (!state.show) return;
  ensureAtSet();
  const ids = selIds();
  if (act === 'prevSet') {
    if (!prevSet()) return toast('This is the first set.');
    if (!ids.length && !state.selProp) return needSelection();
    pushUndo();
    for (const id of ids) curSet().pos[id] = { ...prevSet().pos[id] };
    if (state.selProp) curSet().props[state.selProp] = { ...prevSet().props[state.selProp] };
    return changed();
  }
  if (!ids.length && !state.selProp) return needSelection();
  const c = centroid(ids);
  const sc = snapW(c);
  pushUndo();
  const apply = fn => {
    for (const id of ids) curSet().pos[id] = fn(posOf(id));
    if (state.selProp) { const pp = curSet().props[state.selProp]; const q = fn(pp); curSet().props[state.selProp] = { ...pp, x: q.x, y: q.y, rot: q.rot ?? pp.rot }; }
  };
  const rot = deg => {
    const a = -deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    apply(q => ({ x: r2(sc.x + (q.x - sc.x) * cos - (q.y - sc.y) * sin), y: r2(sc.y + (q.x - sc.x) * sin + (q.y - sc.y) * cos), rot: ((q.rot || 0) + deg + 360) % 360 }));
  };
  const scale = f => apply(q => ({ x: r2(sc.x + (q.x - sc.x) * f), y: r2(sc.y + (q.y - sc.y) * f) }));
  switch (act) {
    case 'rotL': rot(-15); break;
    case 'rotR': rot(15); break;
    case 'rot90': rot(90); break;
    case 'expand': scale(1.25); break;
    case 'contract': scale(0.8); break;
    case 'flipH': apply(q => ({ x: r2(2 * c.x - q.x), y: q.y, rot: -(q.rot || 0) })); break;
    case 'flipV': apply(q => ({ x: q.x, y: r2(2 * c.y - q.y), rot: -(q.rot || 0) })); break;
    case 'mirror50': apply(q => ({ x: r2(-q.x), y: q.y, rot: -(q.rot || 0) })); break;
    case 'reverse': {
      // swap spots end-to-end along the selection's longest direction
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const id of ids) { const q = posOf(id); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const order = sortAlong(ids, (x1 - x0) >= (y1 - y0) ? { x: 1, y: 0 } : { x: 0, y: 1 });
      const spots = order.map(id => ({ ...posOf(id) }));
      order.forEach((id, i) => { curSet().pos[id] = spots[spots.length - 1 - i]; });
      break;
    }
  }
  changed();
}

function nudge(dx, dy) {
  if (dropLocked()) return;
  ensureAtSet();
  const ids = selIds();
  if (!ids.length && !state.selProp) return;
  pushUndo();
  for (const id of ids) { const q = posOf(id); curSet().pos[id] = { x: r2(q.x + dx), y: r2(q.y + dy) }; }
  if (state.selProp) { const q = curSet().props[state.selProp]; curSet().props[state.selProp] = { ...q, x: r2(q.x + dx), y: r2(q.y + dy) }; }
  changed();
}

// ---------------- Pointer handling ----------------
function evPos(e) { const r = canvas.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }

const toolHints = {
  select: 'Click or drag a box to select · drag dots to move · arrow keys nudge 1 step (Shift = 4)',
  line: 'Drag to draw a line · selected performers fill it in order · Shift = any angle',
  arc: 'Click the start, click the end, then click where the arc should bulge',
  block: 'Click where the FRONT-LEFT corner of the block goes',
  circle: 'Click the center of the circle',
  pan: 'Drag to pan · scroll to zoom'
};
function setTool(t) {
  state.tool = t; state.arcPts = [];
  if (state.mode === '3d' && t !== 'select') setMode('2d'); // drawing tools only work top-down
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  $('hudHint').textContent = state.mode === '3d' ? HINT_3D : (toolHints[t] || '');
  canvas.style.cursor = t === 'pan' ? 'grab' : (t === 'select' ? 'default' : 'crosshair');
  draw();
}

// ---------------- 3D view ----------------
const VIEW_KEY = 'drillwriter.view';
const HINT_3D = '3D is for watching — drag to orbit, scroll to zoom, right-drag to pan · click a body to select · switch to 2D to edit';
const isDark = () => document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches;
let view3dMod = null;
async function setMode(mode) {
  if (mode === state.mode) return;
  if (mode === '3d' && !state.v3) {
    try {
      view3dMod = view3dMod || await import('./view3d.js');
      $('camSelect').innerHTML = view3dMod.CAMERA_PRESETS.map(c => `<option value="${c.key}">${c.name}</option>`).join('');
      state.v3 = view3dMod.create3D($('view3d'), {
        getFrame: () => ({
          show: state.show, frame: positionsAt(state.show, state.count), count: state.count,
          sel: state.sel, selProp: state.selProp, labels: opt.labels, dark: isDark()
        }),
        onPick: (id, multi) => {
          if (!id) { if (!multi) { state.sel.clear(); state.selProp = null; } }
          else if (multi) state.sel.has(id) ? state.sel.delete(id) : state.sel.add(id);
          else { state.sel.clear(); state.selProp = null; state.sel.add(id); }
          selectionChanged();
        }
      });
    } catch (e) {
      console.warn(e);
      toast("3D view couldn't start on this device (it needs WebGL).");
      return;
    }
  }
  state.mode = mode;
  const on3 = mode === '3d';
  $('view2dBtn').classList.toggle('on', !on3); $('view3dBtn').classList.toggle('on', on3);
  $('camSelect').hidden = !on3;
  document.querySelector('.zoom2d').hidden = on3;
  canvas.style.visibility = on3 ? 'hidden' : '';
  $('hudCoord').textContent = '';
  if (on3) { if (state.tool !== 'select') setTool('select'); state.v3.show(); }
  else if (state.v3) state.v3.hide();
  $('hudHint').textContent = on3 ? HINT_3D : (toolHints[state.tool] || '');
  try { localStorage.setItem(VIEW_KEY, mode); } catch (e) {}
  draw();
}

const pointers = new Map();
canvas.addEventListener('pointerdown', e => {
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const { px, py } = evPos(e);
  pointers.set(e.pointerId, { px, py });
  if (pointers.size === 2) { // two-finger pinch/pan on touch screens
    const [a, b] = [...pointers.values()];
    state.pointer = { kind: 'pinch', d0: Math.hypot(a.px - b.px, a.py - b.py), mx: (a.px + b.px) / 2, my: (a.py + b.py) / 2 };
    return;
  }
  const w = toWorld(px, py);
  if (state.tool === 'pan' || e.button === 1 || e.button === 2) {
    state.pointer = { kind: 'pan', px, py, ox: state.view.ox, oy: state.view.oy };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (dropLocked()) { toast('Finish or cancel the drop first.'); return; }
  if (state.tool !== 'select') {
    if (!needSelection()) return;
    ensureAtSet();
    const sw = snapW(w);
    if (state.tool === 'line') state.pointer = { kind: 'line', a: sw, b: sw, free: e.shiftKey };
    else if (state.tool === 'arc') {
      state.arcPts.push(sw);
      if (state.arcPts.length === 3) { const [p0, p1, pb] = state.arcPts; state.arcPts = []; applyTargets(arcTargets(p0, p1, pb), 'arc'); }
      draw();
    }
    else if (state.tool === 'block') applyTargets(blockTargets(sw), 'block', { cols: opt.cols });
    else if (state.tool === 'circle') applyTargets(circleTargets(sw), 'circle');
    return;
  }
  // select tool
  const hp = hitPerformer(w);
  const hpr = hp ? null : hitProp(w);
  const multi = e.shiftKey || e.ctrlKey || e.metaKey;
  if (hp || hpr) {
    if (hp) {
      if (multi) { state.sel.has(hp) ? state.sel.delete(hp) : state.sel.add(hp); }
      else if (!state.sel.has(hp)) { state.sel.clear(); state.sel.add(hp); state.selProp = null; }
    } else {
      if (!multi) state.sel.clear();
      state.selProp = hpr;
      switchTabIfIdle('props');
    }
    selectionChanged();
    if (multi && hp && !state.sel.has(hp)) return;
    ensureAtSet();
    const anchor = hp ? { ...posOf(hp) } : { ...curSet().props[hpr] };
    const start = {};
    for (const id of selIds()) start[id] = { ...posOf(id) };
    const propStart = state.selProp ? { ...curSet().props[state.selProp] } : null;
    state.pointer = { kind: 'drag', w0: w, anchor, start, propStart, moved: false };
  } else {
    if (!multi) { state.sel.clear(); state.selProp = null; selectionChanged(); }
    state.pointer = { kind: 'marquee', sx0: px, sy0: py, sx1: px, sy1: py, add: multi };
  }
});

canvas.addEventListener('pointermove', e => {
  const { px, py } = evPos(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { px, py });
  const w = toWorld(px, py);
  state.hover = w;
  const sw = snapW(w);
  $('hudCoord').textContent = `${describeX(sw.x)}  ·  ${describeY(sw.y, state.show.field)}`;
  const g = state.pointer;
  if (!g) { if (state.tool !== 'select' && state.tool !== 'pan') draw(); return; }
  if (g.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.px - b.px, a.py - b.py), mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
    state.view.ox += mx - g.mx; state.view.oy += my - g.my;
    zoomAt(mx, my, d / g.d0);
    g.d0 = d; g.mx = mx; g.my = my;
    return;
  }
  if (g.kind === 'pan') { state.userView = true; state.view.ox = g.ox + px - g.px; state.view.oy = g.oy + py - g.py; draw(); return; }
  if (g.kind === 'marquee') { g.sx1 = px; g.sy1 = py; draw(); return; }
  if (g.kind === 'line') { g.b = e.shiftKey ? w : sw; g.free = e.shiftKey; draw(); return; }
  if (g.kind === 'drag') {
    const raw = { x: g.anchor.x + (w.x - g.w0.x), y: g.anchor.y + (w.y - g.w0.y) };
    const tgt = snapW(raw);
    const dx = tgt.x - g.anchor.x, dy = tgt.y - g.anchor.y;
    if (!g.moved && Math.hypot(w.x - g.w0.x, w.y - g.w0.y) * state.view.scale < 3) return;
    if (!g.moved) { pushUndo(); g.moved = true; }
    for (const [id, q] of Object.entries(g.start)) curSet().pos[id] = { x: r2(q.x + dx), y: r2(q.y + dy) };
    if (g.propStart) curSet().props[state.selProp] = { ...g.propStart, x: r2(g.propStart.x + dx), y: r2(g.propStart.y + dy) };
    $('hudCoord').textContent = `${describeX(tgt.x)}  ·  ${describeY(tgt.y, state.show.field)}`;
    draw();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  const g = state.pointer;
  if (!g) return;
  if (g.kind === 'pinch') { if (pointers.size === 0) state.pointer = null; return; }
  state.pointer = null;
  if (g.kind === 'pan') { canvas.style.cursor = state.tool === 'pan' ? 'grab' : ''; return; }
  if (g.kind === 'marquee') {
    const a = toWorld(Math.min(g.sx0, g.sx1), Math.max(g.sy0, g.sy1)), b = toWorld(Math.max(g.sx0, g.sx1), Math.min(g.sy0, g.sy1));
    if (Math.abs(g.sx1 - g.sx0) > 3 || Math.abs(g.sy1 - g.sy0) > 3) {
      const snap = positionsAt(state.show, state.count);
      for (const p of state.show.performers) {
        const q = snap.pos[p.id];
        if (q.x >= a.x && q.x <= b.x && q.y >= a.y && q.y <= b.y) state.sel.add(p.id);
      }
      selectionChanged();
    }
    draw(); return;
  }
  if (g.kind === 'line') { applyTargets(lineTargets(g.a, g.b, g.free), 'line'); return; }
  if (g.kind === 'drag') { if (g.moved) changed(); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!state.pointer) { state.hover = null; $('hudCoord').textContent = ''; draw(); } });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); const { px, py } = evPos(e); zoomAt(px, py, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });

function selectionChanged() { renderPerformers(); renderProps(); renderDotInfo(); draw(); }
function switchTabIfIdle(tab) { if (window.innerWidth > 1000) showTab(tab); }

// ---------------- Panels ----------------
function showTab(tab) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
}

function transitionWarnings(i) {
  if (i === 0) return 0;
  const A = state.show.sets[i - 1], B = state.show.sets[i];
  return state.show.performers.filter(p => stepSize(A.pos[p.id], B.pos[p.id], B.counts).big).length;
}

function renderSets() {
  const list = $('setList'); list.innerHTML = '';
  const starts = setStarts(state.show);
  state.show.sets.forEach((st, i) => {
    const li = document.createElement('li');
    const warns = transitionWarnings(i);
    li.className = (i === state.cur ? 'current' : '') + (warns ? ' warn' : '');
    li.title = warns ? `${warns} performer(s) need a step bigger than 6 to 5` : `Starts at count ${starts[i]}`;
    li.innerHTML = `<span class="set-name">Set <input value="${escapeHtml(st.name)}" aria-label="Set name"></span>
      <span class="counts">${i === 0 ? '<span>start</span>' : `<input type="number" min="0" value="${st.counts}" aria-label="Counts"> cts`}</span>`;
    li.addEventListener('click', ev => { if (ev.target.tagName !== 'INPUT') goToSet(i); });
    li.querySelector('.set-name input').addEventListener('focus', () => { if (state.cur !== i) goToSet(i); });
    li.querySelector('.set-name input').addEventListener('change', ev => { pushUndo(); st.name = ev.target.value.trim() || String(i + 1); changed(); });
    const ci = li.querySelector('.counts input');
    if (ci) ci.addEventListener('change', ev => { pushUndo(); st.counts = Math.max(0, parseInt(ev.target.value, 10) || 0); state.count = setStarts(state.show)[state.cur]; changed(); });
    list.appendChild(li);
  });
  $('setNote').value = curSet().note || '';
  $('btnDelSet').disabled = state.show.sets.length < 2;
}

function renderPerformers() {
  const box = $('perfList'); box.innerHTML = '';
  for (const sec of SECTIONS) {
    const ps = state.show.performers.filter(p => p.section === sec.key);
    if (!ps.length) continue;
    const div = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'sec-head';
    head.innerHTML = `<span class="swatch" style="background:${sec.color}"></span>${sec.name} (${ps.length})`;
    head.title = 'Select this whole section (Shift adds to the selection)';
    head.addEventListener('click', ev => {
      if (!(ev.shiftKey || ev.ctrlKey || ev.metaKey)) { state.sel.clear(); state.selProp = null; }
      ps.forEach(p => state.sel.add(p.id)); selectionChanged();
    });
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const p of ps) {
      const ch = document.createElement('button');
      ch.className = 'chip' + (state.sel.has(p.id) ? ' sel' : '');
      ch.textContent = p.label; ch.title = 'Click to select · double-click to rename';
      ch.addEventListener('click', ev => {
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) state.sel.has(p.id) ? state.sel.delete(p.id) : state.sel.add(p.id);
        else { state.sel.clear(); state.selProp = null; state.sel.add(p.id); }
        selectionChanged();
      });
      ch.addEventListener('dblclick', () => {
        const v = prompt('Drill ID for this performer', p.label);
        if (v && v.trim()) { pushUndo(); p.label = v.trim(); changed(); }
      });
      chips.appendChild(ch);
    }
    div.append(head, chips); box.appendChild(div);
  }
  if (!state.show.performers.length) box.innerHTML = '<p class="help">No performers yet. Pick a section above and add them.</p>';
  $('btnDelPerf').disabled = !state.sel.size;
  $('btnDropPerf').disabled = state.sel.size !== 1;
}

function renderProps() {
  const box = $('propList'); box.innerHTML = '';
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const prop of state.show.props) {
    const ch = document.createElement('button');
    ch.className = 'chip' + (state.selProp === prop.id ? ' sel' : '');
    ch.textContent = prop.label;
    ch.addEventListener('click', () => { state.selProp = prop.id; state.sel.clear(); selectionChanged(); });
    chips.appendChild(ch);
  }
  box.appendChild(chips);
  if (!state.show.props.length) box.innerHTML = '<p class="help">No props yet.</p>';
  const prop = state.show.props.find(p => p.id === state.selProp);
  $('propEdit').hidden = !prop;
  if (prop) {
    const pp = curSet().props[prop.id];
    $('propLabel').value = prop.label; $('propW').value = prop.w; $('propH').value = prop.h;
    $('propRot').value = Math.round(pp.rot || 0); $('propColor').value = prop.color || '#9aa5b1';
  }
}

function renderDotInfo() {
  const box = $('dotInfo');
  const ids = selIds();
  if (ids.length !== 1) {
    box.innerHTML = ids.length
      ? `<p class="help">${ids.length} performers selected. Select just one to see their coordinates.</p>`
      : '<p class="help">Select one performer to see their coordinates for every set.</p>';
    return;
  }
  const p = state.show.performers.find(q => q.id === ids[0]);
  const sec = sectionByKey(p.section);
  let rows = '';
  state.show.sets.forEach((st, i) => {
    const q = st.pos[p.id];
    const ss = i ? stepSize(state.show.sets[i - 1].pos[p.id], q, st.counts) : null;
    rows += `<tr class="${i === state.cur ? 'current' : ''}"><td>${escapeHtml(st.name)}</td><td>${i ? st.counts : '—'}</td>
      <td>${escapeHtml(describeX(q.x))}</td><td>${escapeHtml(describeY(q.y, state.show.field))}</td>
      <td class="${ss && ss.big ? 'big' : ''}">${ss ? ss.label : ''}</td></tr>`;
  });
  box.innerHTML = `<h3 style="margin:0 0 6px">${escapeHtml(p.label)} <span class="help">${sec.name}</span></h3>
    <table class="dot-table"><thead><tr><th>Set</th><th>Cts</th><th>Side to side</th><th>Front to back</th><th>Step</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row" style="margin-top:10px;align-items:center">
      <label class="help">Instrument <select id="dotSection">${SECTIONS.map(x => `<option value="${x.key}"${x.key === p.section ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>
      <button id="dotDrop">Drop student…</button>
    </div>
    <p class="help">An alternate taking over this dot? Nothing needs to change — they learn ${escapeHtml(p.label)}'s dot sheet. Change the instrument above if they play something different.</p>`;
  $('dotSection').onchange = ev => { if (dropLocked()) return; pushUndo(); p.section = ev.target.value; changed(); };
  $('dotDrop').onclick = startDrop;
}

// ---------------- Drop a student ----------------
const FIX_NAMES = { close: 'Close the gap', stretch: 'Stretch to fill', hole: 'Leave the hole' };
const KIND_NAMES = { line: 'Line', arc: 'Arc', block: 'Block row', circle: 'Circle' };
const dropLocked = () => !!(state.drop && !state.drop.report);

function startDrop() {
  const ids = selIds();
  if (ids.length !== 1) return toast('Select the one student who is dropping.');
  if (state.mode === '3d') setMode('2d');
  ensureAtSet();
  state.drop = { pid: ids[0], plans: planDrop(state.show, ids[0]), report: null };
  state.drop.choices = state.drop.plans.map(p => p.def);
  document.querySelector('.tabs').classList.add('locked');
  showTab('drop');
  renderDrop(); draw();
}
function endDrop(tab = 'perf') {
  state.drop = null;
  document.querySelector('.tabs').classList.remove('locked');
  showTab(tab); draw();
}
function dropMovers() {
  const movers = new Set(); let setsTouched = 0;
  state.drop.plans.forEach((pl, i) => {
    const m = Object.keys(pl.options[state.drop.choices[i]] || {});
    if (m.length) setsTouched++;
    m.forEach(id => movers.add(id));
  });
  return { movers, setsTouched };
}
function renderDrop() {
  const box = $('dropBody'), d = state.drop;
  if (!d) { box.innerHTML = ''; return; }
  if (d.mode === 'add') return d.report ? renderAddReport() : renderAdd();
  if (d.report) return renderDropReport();
  const p = state.show.performers.find(q => q.id === d.pid);
  const items = d.plans.map((pl, i) => {
    const st = state.show.sets[i];
    const what = pl.chain
      ? `${KIND_NAMES[pl.chain.kind] || 'Form'} of ${pl.chain.ids.length} · ${pl.chain.source === 'saved' ? 'drawn with a form tool' : 'found by spacing'}`
      : 'Not in an evenly spaced form — the spot stays empty';
    const opts = ['close', 'stretch', 'hole'].filter(k => pl.options[k]).map(k => {
      const n = Object.keys(pl.options[k]).length;
      return `<option value="${k}"${d.choices[i] === k ? ' selected' : ''}>${FIX_NAMES[k]}${k === 'hole' ? '' : ` — ${n} move${n === 1 ? '' : 's'}`}</option>`;
    }).join('');
    return `<li data-i="${i}" class="${i === state.cur ? 'current' : ''}"><strong>Set ${escapeHtml(st.name)}</strong>
      <select aria-label="Fix for set ${escapeHtml(st.name)}">${opts}</select><span class="what">${what}</span></li>`;
  }).join('');
  const { movers, setsTouched } = dropMovers();
  box.innerHTML = `<div class="drop-head"><h3>Drop ${escapeHtml(p.label)}</h3>
      <p class="help">Choose how each set covers ${escapeHtml(p.label)}'s spot. Click a set to preview it on the field: the red ✕ is the empty spot, arrows show who moves. Nobody outside the form moves.</p></div>
    <ol class="drop-sets">${items}</ol>
    <div class="drop-foot">
      <span class="drop-summary">${movers.size} student${movers.size === 1 ? '' : 's'} get new dots in ${setsTouched} set${setsTouched === 1 ? '' : 's'}</span>
      <div class="row"><button id="dropApply" class="primary">Drop ${escapeHtml(p.label)}</button><button id="dropCancel">Cancel</button></div>
      <p class="help">An alternate taking this exact spot? Cancel — no one needs to move.</p>
    </div>`;
  box.querySelectorAll('.drop-sets li').forEach(li => {
    const i = +li.dataset.i;
    li.addEventListener('click', ev => { if (ev.target.tagName !== 'SELECT') { goToSet(i); renderDrop(); } });
    li.querySelector('select').addEventListener('change', ev => { d.choices[i] = ev.target.value; if (state.cur !== i) goToSet(i); renderDrop(); draw(); });
  });
  $('dropApply').onclick = applyDropNow;
  $('dropCancel').onclick = () => endDrop();
}
function applyDropNow() {
  const d = state.drop;
  pushUndo();
  d.report = applyDrop(state.show, d.pid, d.plans, d.choices, stepSize);
  state.sel = new Set(d.report.changed.map(c => c.id)); state.selProp = null;
  document.querySelector('.tabs').classList.remove('locked');
  changed();
  renderDrop();
}
function renderDropReport() {
  const r = state.drop.report;
  const list = r.changed.map(c => `<li><strong>${escapeHtml(c.label)}</strong> — set${c.sets.length > 1 ? 's' : ''} ${c.sets.map(escapeHtml).join(', ')}</li>`).join('');
  const warns = r.newBig.map(w => `<li class="warn">${escapeHtml(w.label)}: ${escapeHtml(w.step)} into set ${escapeHtml(w.set)}</li>`).join('');
  $('dropBody').innerHTML = `<div class="drop-head"><h3>${escapeHtml(r.dropped.label)} dropped</h3>
    <p class="help">${r.changed.length ? `Only these ${r.changed.length} students have new dots — reprint just their dot sheets. They're selected on the field.` : 'Nobody else moved.'}</p></div>
    ${list ? `<ul class="report-list">${list}</ul>` : ''}
    ${warns ? `<p class="help" style="margin-top:8px"><strong>New big steps to check:</strong></p><ul class="report-list">${warns}</ul>` : ''}
    <div class="row" style="margin-top:10px"><button id="dropCopy">Copy list</button><button id="dropDone" class="primary">Done</button></div>
    <p class="help">Changed your mind? Undo (↶ or Ctrl+Z) brings ${escapeHtml(r.dropped.label)} back exactly as before.</p>`;
  $('dropCopy').onclick = async () => {
    const text = [`${r.dropped.label} dropped — new dots for:`, ...r.changed.map(c => `${c.label}: set ${c.sets.join(', ')}`),
      ...(r.newBig.length ? ['', 'Check step size:', ...r.newBig.map(w => `${w.label}: ${w.step} into set ${w.set}`)] : [])].join('\n');
    try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch (e) { toast("Couldn't copy on this device."); }
  };
  $('dropDone').onclick = () => endDrop('perf');
}
function drawDropPreview(editing) {
  const d = state.drop;
  if (!d || d.report || !editing) return;
  if (d.mode === 'add') return drawAddPreview();
  const pl = d.plans[state.cur]; if (!pl) return;
  const st = curSet(), s = state.view.scale, warn = css('--warn'), sel = css('--select');
  ctx.save();
  if (pl.chain) { // outline the form
    ctx.strokeStyle = sel; ctx.globalAlpha = 0.35; ctx.lineWidth = Math.max(4, 1.2 * s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    pl.chain.ids.forEach((id, i) => { const q = st.pos[id]; i ? ctx.lineTo(sx(q.x), sy(q.y)) : ctx.moveTo(sx(q.x), sy(q.y)); });
    if (pl.chain.closed) ctx.closePath();
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  const moves = pl.options[d.choices[state.cur]] || {};
  ctx.strokeStyle = sel; ctx.fillStyle = sel; ctx.lineWidth = 2;
  for (const [id, q] of Object.entries(moves)) {
    const a = st.pos[id], x0 = sx(a.x), y0 = sy(a.y), x1 = sx(q.x), y1 = sy(q.y);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0), h = Math.max(5, 0.5 * s);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(ang - 0.45), y1 - h * Math.sin(ang - 0.45)); ctx.lineTo(x1 - h * Math.cos(ang + 0.45), y1 - h * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
  }
  const D = st.pos[d.pid], X = sx(D.x), Y = sy(D.y), r = Math.max(6, 0.9 * s);
  ctx.strokeStyle = warn; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(X - r, Y - r); ctx.lineTo(X + r, Y + r); ctx.moveTo(X + r, Y - r); ctx.lineTo(X - r, Y + r); ctx.stroke();
  ctx.restore();
}

// ---------------- Add a student to finished drill ----------------
const ADD_NAMES = { hole: 'Fill empty spot', end: 'Add at end', insert: 'Insert next to', stretch: 'Stretch to fit', beside: 'Spot beside' };
function nextLabel(sectionKey) {
  const sec = sectionByKey(sectionKey);
  let max = 0;
  for (const p of state.show.performers) { const m = p.label.match(new RegExp(`^${sec.prefix}(\\d+)$`)); if (m) max = Math.max(max, +m[1]); }
  return `${sec.prefix}${max + 1}`;
}
function startAdd() {
  if (!state.show.performers.length) return toast('Use Add for the first performers — this is for adding someone to drill that is already written.');
  if (state.mode === '3d') setMode('2d');
  ensureAtSet();
  const section = $('addSection').value;
  const ids = selIds();
  const anchor = ids.length === 1 ? ids[0]
    : (state.show.performers.find(p => p.section === section) || state.show.performers[0]).id;
  state.drop = { mode: 'add', perf: { id: uid('p'), label: nextLabel(section), section }, anchor, report: null };
  replanAdd();
  document.querySelector('.tabs').classList.add('locked');
  showTab('drop'); renderDrop(); draw();
}
function replanAdd() {
  const d = state.drop;
  d.plans = planAdd(state.show, d.anchor);
  d.choices = d.plans.map(p => p.def);
}
function addMovers() {
  const movers = new Set(); let setsTouched = 0;
  state.drop.plans.forEach((pl, i) => {
    const m = Object.keys((pl.options[state.drop.choices[i]] || {}).moves || {});
    if (m.length) setsTouched++;
    m.forEach(id => movers.add(id));
  });
  return { movers, setsTouched };
}
function renderAdd() {
  const d = state.drop, box = $('dropBody');
  const anchorLabel = (state.show.performers.find(p => p.id === d.anchor) || {}).label || '';
  const perfOpts = [...state.show.performers].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map(p => `<option value="${p.id}"${p.id === d.anchor ? ' selected' : ''}>${escapeHtml(p.label)}</option>`).join('');
  const items = d.plans.map((pl, i) => {
    const st = state.show.sets[i];
    const what = pl.chain
      ? `${escapeHtml(anchorLabel)} is in ${/^[aeiou]/i.test(KIND_NAMES[pl.chain.kind] || 'form') ? 'an' : 'a'} ${(KIND_NAMES[pl.chain.kind] || 'form').toLowerCase()} of ${pl.chain.ids.length}`
      : `${escapeHtml(anchorLabel)} isn't in an evenly spaced form here`;
    const opts = ['hole', 'end', 'insert', 'stretch', 'beside'].filter(k => pl.options[k]).map(k => {
      const n = Object.keys(pl.options[k].moves).length;
      return `<option value="${k}"${d.choices[i] === k ? ' selected' : ''}>${ADD_NAMES[k]} · ${n ? `${n} move${n === 1 ? '' : 's'}` : 'no moves'}</option>`;
    }).join('');
    const o = pl.options[d.choices[i]];
    const A = st.pos[d.anchor];
    const far = o && A ? Math.round(Math.hypot(o.spot.x - A.x, o.spot.y - A.y)) : 0;
    const where = o ? `${o.note ? escapeHtml(o.note) + ' · ' : ''}${far} step${far === 1 ? '' : 's'} from ${escapeHtml(anchorLabel)}` : '';
    const note = (o && o.warn ? `<span class="what" style="color:var(--warn)">⚠ New spot is ${escapeHtml(o.warn)}</span>` : '')
      + (where ? `<span class="what">New dot: ${where}</span>` : '');
    return `<li data-i="${i}" class="${i === state.cur ? 'current' : ''}"><strong>Set ${escapeHtml(st.name)}</strong>
      <select aria-label="Placement for set ${escapeHtml(st.name)}">${opts}</select><span class="what">${what}</span>${note}</li>`;
  }).join('');
  const { movers, setsTouched } = addMovers();
  box.innerHTML = `<div class="drop-head"><h3>Add a student</h3>
      <p class="help">The new student is placed relative to someone already in the drill, in every set. Click a set to preview it: the green ＋ is the new dot, arrows show who moves.</p></div>
    <div class="prop-edit" style="border:0;padding:0">
      <label>Instrument <select id="addSec">${SECTIONS.map(x => `<option value="${x.key}"${x.key === d.perf.section ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>
      <label>Drill ID <input id="addLabel" value="${escapeHtml(d.perf.label)}"></label>
      <label>Place next to <select id="addAnchor">${perfOpts}</select></label>
    </div>
    <ol class="drop-sets">${items}</ol>
    <div class="drop-foot">
      <span class="drop-summary">${movers.size ? `${movers.size} student${movers.size === 1 ? '' : 's'} get new dots in ${setsTouched} set${setsTouched === 1 ? '' : 's'}` : 'Nobody else moves'}</span>
      <div class="row"><button id="addApply" class="primary">Add ${escapeHtml(d.perf.label)}</button><button id="addCancel">Cancel</button></div>
    </div>`;
  $('addSec').onchange = ev => {
    const auto = d.perf.label === nextLabel(d.perf.section);
    d.perf.section = ev.target.value;
    if (auto) d.perf.label = nextLabel(d.perf.section);
    renderDrop();
  };
  $('addLabel').onchange = ev => { d.perf.label = ev.target.value.trim() || nextLabel(d.perf.section); renderDrop(); };
  $('addAnchor').onchange = ev => { d.anchor = ev.target.value; replanAdd(); renderDrop(); draw(); };
  box.querySelectorAll('.drop-sets li').forEach(li => {
    const i = +li.dataset.i;
    li.addEventListener('click', ev => { if (ev.target.tagName !== 'SELECT') { goToSet(i); renderDrop(); } });
    li.querySelector('select').addEventListener('change', ev => { d.choices[i] = ev.target.value; if (state.cur !== i) goToSet(i); renderDrop(); draw(); });
  });
  $('addApply').onclick = () => {
    if (state.show.performers.some(p => p.label === d.perf.label)) return toast(`${d.perf.label} is already taken — change the Drill ID.`);
    pushUndo();
    d.report = applyAdd(state.show, { ...d.perf }, d.plans, d.choices, stepSize);
    state.sel = new Set([d.perf.id, ...d.report.changed.map(c => c.id)]); state.selProp = null;
    document.querySelector('.tabs').classList.remove('locked');
    changed(); renderDrop();
  };
  $('addCancel').onclick = () => endDrop();
}
function renderAddReport() {
  const d = state.drop, r = d.report;
  const list = r.changed.map(c => `<li><strong>${escapeHtml(c.label)}</strong> — set${c.sets.length > 1 ? 's' : ''} ${c.sets.map(escapeHtml).join(', ')}</li>`).join('');
  const warns = r.newBig.map(w => `<li class="warn">${escapeHtml(w.label)}: ${escapeHtml(w.step)} into set ${escapeHtml(w.set)}</li>`).join('');
  $('dropBody').innerHTML = `<div class="drop-head"><h3>${escapeHtml(d.perf.label)} added</h3>
    <p class="help">Print ${escapeHtml(d.perf.label)}'s dot sheet${r.changed.length ? `, plus new sheets for these ${r.changed.length} students` : '. Nobody else moved'}.</p></div>
    ${list ? `<ul class="report-list">${list}</ul>` : ''}
    ${warns ? `<p class="help" style="margin-top:8px"><strong>Big steps to check:</strong></p><ul class="report-list">${warns}</ul>` : ''}
    <div class="row" style="margin-top:10px"><button id="addCopy">Copy list</button><button id="addDone" class="primary">Done</button></div>
    <p class="help">Play the show to check ${escapeHtml(d.perf.label)}'s paths — moves between sets with different placements can cross other people. Undo removes the new student.</p>`;
  $('addCopy').onclick = async () => {
    const text = [`${d.perf.label} added.`, ...(r.changed.length ? ['New dots for:', ...r.changed.map(c => `${c.label}: set ${c.sets.join(', ')}`)] : ['Nobody else moved.']),
      ...(r.newBig.length ? ['', 'Check step size:', ...r.newBig.map(w => `${w.label}: ${w.step} into set ${w.set}`)] : [])].join('\n');
    try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch (e) { toast("Couldn't copy on this device."); }
  };
  $('addDone').onclick = () => endDrop('perf');
}
function drawAddPreview() {
  const d = state.drop, pl = d.plans[state.cur]; if (!pl) return;
  const st = curSet(), s = state.view.scale, sel = css('--select'), ok = css('--accent');
  const o = pl.options[d.choices[state.cur]]; if (!o) return;
  ctx.save();
  if (pl.chain) {
    ctx.strokeStyle = sel; ctx.globalAlpha = 0.3; ctx.lineWidth = Math.max(4, 1.2 * s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pl.chain.ids.forEach((id, i) => { const q = st.pos[id]; i ? ctx.lineTo(sx(q.x), sy(q.y)) : ctx.moveTo(sx(q.x), sy(q.y)); });
    if (pl.chain.closed) ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = sel; ctx.fillStyle = sel; ctx.lineWidth = 2;
  for (const [id, q] of Object.entries(o.moves)) {
    const a = st.pos[id], x0 = sx(a.x), y0 = sy(a.y), x1 = sx(q.x), y1 = sy(q.y);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0), h = Math.max(5, 0.5 * s);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(ang - 0.45), y1 - h * Math.sin(ang - 0.45)); ctx.lineTo(x1 - h * Math.cos(ang + 0.45), y1 - h * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
  }
  const X = sx(o.spot.x), Y = sy(o.spot.y), r = Math.max(7, 1 * s);
  ctx.strokeStyle = o.warn ? css('--warn') : ok; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(X - r, Y); ctx.lineTo(X + r, Y); ctx.moveTo(X, Y - r); ctx.lineTo(X, Y + r); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle; ctx.font = `600 ${Math.max(10, Math.min(13, 1.15 * s))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(d.perf.label, X, Y - r - 2);
  ctx.restore();
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Show-level actions ----------------
function addSet() {
  ensureAtSet();
  pushUndo();
  const src = curSet();
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid('s'); copy.note = '';
  copy.counts = src.counts > 0 ? src.counts : 16;
  state.show.sets.splice(state.cur + 1, 0, copy);
  renumberSetNames();
  state.cur += 1; state.count = setStarts(state.show)[state.cur];
  changed();
}
function renumberSetNames() {
  // sets with plain-number names keep counting 1, 2, 3…; custom names like "3A" are left alone
  state.show.sets.forEach((st, i) => { if (/^\d+$/.test(String(st.name))) st.name = String(i + 1); });
}
function deleteSet() {
  if (state.show.sets.length < 2) return;
  if (!confirm(`Delete set ${curSet().name}? Everyone's spots for this set are removed.`)) return;
  pushUndo();
  state.show.sets.splice(state.cur, 1);
  state.show.sets[0].counts = 0;
  renumberSetNames();
  state.cur = Math.min(state.cur, state.show.sets.length - 1);
  state.count = setStarts(state.show)[state.cur];
  changed();
}

function addPerformers(sectionKey, n) {
  ensureAtSet();
  const sec = sectionByKey(sectionKey);
  pushUndo();
  // continue numbering after the highest existing number for this prefix
  let max = 0;
  for (const p of state.show.performers) {
    const m = p.label.match(new RegExp(`^${sec.prefix}(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let offField = state.show.performers.filter(p => curSet().pos[p.id].y < 0).length;
  const added = [];
  for (let k = 0; k < n; k++) {
    const id = uid('p');
    state.show.performers.push({ id, label: `${sec.prefix}${max + k + 1}`, section: sec.key });
    const idx = offField++, row = Math.floor(idx / 36), col = idx % 36;
    const q = { x: -52.5 + col * 3, y: -2 - row * 2.5 };
    for (const st of state.show.sets) st.pos[id] = { ...q };
    added.push(id);
  }
  state.sel = new Set(added); state.selProp = null;
  changed();
  toast(`Added ${n} ${sec.name}. They're selected — use a form tool to place them.`);
}
function removeSelected() {
  const ids = selIds(); if (!ids.length) return;
  if (!confirm(`Remove ${ids.length} performer(s) from the whole show?`)) return;
  pushUndo();
  state.show.performers = state.show.performers.filter(p => !state.sel.has(p.id));
  for (const st of state.show.sets) {
    for (const id of ids) delete st.pos[id];
    st.forms = (st.forms || []).map(f => ({ ...f, ids: f.ids.filter(id => !state.sel.has(id)) })).filter(f => f.ids.length > 1);
  }
  state.sel.clear();
  changed();
}
function renumber() {
  if (!confirm('Renumber every section 1, 2, 3… from Side 1 to Side 2 using the current set? Drill IDs will change.')) return;
  pushUndo();
  for (const sec of SECTIONS) {
    const ps = state.show.performers.filter(p => p.section === sec.key);
    ps.sort((a, b) => (posOf(a.id).x - posOf(b.id).x) || (posOf(b.id).y - posOf(a.id).y));
    ps.forEach((p, i) => { p.label = `${sec.prefix}${i + 1}`; });
  }
  changed();
}
function addProp(kindKey) {
  ensureAtSet();
  const kind = PROP_KINDS.find(k => k.key === kindKey) || PROP_KINDS[0];
  pushUndo();
  const id = uid('r');
  const n = state.show.props.filter(p => p.kind === kind.key).length + 1;
  state.show.props.push({ id, label: `${kind.name.split(' ')[0]} ${n}`, kind: kind.key, w: kind.w, h: kind.h, color: kind.color });
  for (const st of state.show.sets) st.props[id] = { x: -40 + (state.show.props.length - 1) * 8, y: -6, rot: 0 };
  state.selProp = id; state.sel.clear();
  changed();
}

// ---------------- Playback ----------------
let lastT = 0, raf = 0;
function play() {
  if (state.show.sets.length < 2) return toast('Add a second set to play a transition.');
  if (state.count >= totalCounts(state.show) - 1e-6) state.count = 0;
  state.playing = true; lastT = performance.now();
  $('btnPlay').textContent = '⏸';
  raf = requestAnimationFrame(tick);
}
function pause() {
  state.playing = false; cancelAnimationFrame(raf);
  $('btnPlay').textContent = '▶';
  updateTransport(); renderSets(); renderDotInfo(); draw();
}
function tick(t) {
  if (!state.playing) return;
  const dt = (t - lastT) / 1000; lastT = t;
  state.count += dt * (state.show.tempo.bpm || 144) / 60;
  const total = totalCounts(state.show);
  if (state.count >= total) { state.count = total; state.cur = state.show.sets.length - 1; pause(); return; }
  state.cur = locate(state.show, state.count).i;
  updateTransport(); draw();
  raf = requestAnimationFrame(tick);
}
function updateTransport() {
  const total = totalCounts(state.show);
  const scrub = $('scrub');
  scrub.max = total; scrub.value = state.count;
  const L = locate(state.show, state.count), sets = state.show.sets;
  let txt;
  if (atSet() || (L.frac === 0)) txt = `Set ${sets[state.cur].name} · count ${Math.round(setStarts(state.show)[state.cur])} of ${total}`;
  else {
    const into = state.count - setStarts(state.show)[L.i];
    txt = `Set ${sets[L.i].name} → ${sets[L.i + 1].name} · ${Math.floor(into) + 1} of ${sets[L.i + 1].counts}`;
  }
  $('countReadout').textContent = txt;
  $('btnUndo').disabled = !state.undo.length; $('btnRedo').disabled = !state.redo.length;
}

// ---------------- Wiring ----------------
function init() {
  $('hashSelect').innerHTML = Object.entries(HASH_TYPES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  $('addSection').innerHTML = SECTIONS.map(s => `<option value="${s.key}">${s.name} (${s.prefix})</option>`).join('');
  $('addPropKind').innerHTML = PROP_KINDS.map(k => `<option value="${k.key}">${k.name}</option>`).join('');

  try { const th = localStorage.getItem(THEME_KEY); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
  $('btnTheme').onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, document.documentElement.dataset.theme); } catch (e) {}
    draw();
  };

  document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => transform(b.dataset.act));
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('zoomIn').onclick = () => zoomAt(W / 2, H / 2, 1.25);
  $('zoomOut').onclick = () => zoomAt(W / 2, H / 2, 0.8);
  $('zoomFit').onclick = () => { state.userView = false; fitView(); draw(); };
  $('view2dBtn').onclick = () => setMode('2d');
  $('view3dBtn').onclick = () => setMode('3d');
  $('camSelect').onchange = ev => state.v3 && state.v3.setCamera(ev.target.value);

  $('btnNew').onclick = () => { if (confirm('Start a new, empty show? Save this one first if you want to keep it.')) loadShow(newShow()); };
  $('btnSample').onclick = () => { if (!state.show.performers.length || confirm('Replace the current show with the sample show?')) loadShow(sampleShow()); };
  $('btnSave').onclick = () => {
    const blob = new Blob([JSON.stringify(state.show, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.show.title || 'show').replace(/[^\w\- ]+/g, '').trim() || 'show'}.drill.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('btnOpen').onclick = () => $('fileInput').click();
  $('fileInput').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'drill-writer') throw new Error('not a drill file');
      loadShow(data); toast(`Opened “${state.show.title}”.`);
    } catch (e) { toast("That file couldn't be opened as a Drill Writer show."); }
    ev.target.value = '';
  };
  $('showTitle').onchange = ev => { state.show.title = ev.target.value.trim() || 'Untitled Show'; autosave(); };
  $('hashSelect').onchange = ev => { pushUndo(); state.show.field.hash = ev.target.value; changed(); };
  $('bpm').onchange = ev => { state.show.tempo.bpm = Math.max(40, Math.min(240, parseInt(ev.target.value, 10) || 144)); changed(); };
  $('setNote').onchange = ev => { pushUndo(); curSet().note = ev.target.value; autosave(); };

  $('btnAddSet').onclick = addSet;
  $('btnDelSet').onclick = deleteSet;
  $('btnAddPerf').onclick = () => addPerformers($('addSection').value, Math.max(1, Math.min(60, parseInt($('addCount').value, 10) || 1)));
  $('btnDelPerf').onclick = removeSelected;
  $('btnDropPerf').onclick = startDrop;
  $('btnAddStudent').onclick = startAdd;
  $('btnRenumber').onclick = renumber;
  $('btnAddProp').onclick = () => addProp($('addPropKind').value);

  const propField = (id, fn) => $(id).onchange = ev => {
    const prop = state.show.props.find(p => p.id === state.selProp); if (!prop) return;
    ensureAtSet(); pushUndo(); fn(prop, ev.target.value); changed();
  };
  propField('propLabel', (p, v) => { p.label = v.trim() || p.label; });
  propField('propW', (p, v) => { p.w = Math.max(0.5, parseFloat(v) || p.w); });
  propField('propH', (p, v) => { p.h = Math.max(0.5, parseFloat(v) || p.h); });
  propField('propRot', (p, v) => { curSet().props[p.id].rot = ((parseFloat(v) || 0) % 360 + 360) % 360; });
  propField('propColor', (p, v) => { p.color = v; });
  $('btnDelProp').onclick = () => {
    const id = state.selProp; if (!id) return;
    pushUndo();
    state.show.props = state.show.props.filter(p => p.id !== id);
    for (const st of state.show.sets) delete st.props[id];
    state.selProp = null; changed();
  };

  $('btnPlay').onclick = () => state.playing ? pause() : play();
  $('btnPrevSet').onclick = () => goToSet(atSet() ? state.cur - 1 : state.cur);
  $('btnNextSet').onclick = () => goToSet(state.cur + 1);
  $('scrub').oninput = ev => {
    state.count = parseFloat(ev.target.value);
    const L = locate(state.show, state.count);
    state.cur = L.i;
    // snap to a set when the scrubber is within a quarter count of it
    const st = setStarts(state.show);
    st.forEach((c, i) => { if (Math.abs(state.count - c) < 0.25) { state.count = c; state.cur = i; } });
    updateTransport(); renderSets(); renderDotInfo(); draw();
  };
  $('optGhost').onchange = draw; $('optLabels').onchange = draw;
  $('btnUndo').onclick = undo; $('btnRedo').onclick = redo;

  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && dropLocked() && 'zya'.includes(k.toLowerCase())) { e.preventDefault(); return; }
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); state.show.performers.forEach(p => state.sel.add(p.id)); selectionChanged(); return; }
    if (mod) return;
    if (k === ' ') { e.preventDefault(); state.playing ? pause() : play(); return; }
    if (k === 'Escape') { state.arcPts = []; state.sel.clear(); state.selProp = null; setTool('select'); selectionChanged(); return; }
    const step = e.shiftKey ? 4 : 1;
    if (k === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); return; }
    if (k === 'ArrowRight') { e.preventDefault(); nudge(step, 0); return; }
    if (k === 'ArrowUp') { e.preventDefault(); nudge(0, step); return; }
    if (k === 'ArrowDown') { e.preventDefault(); nudge(0, -step); return; }
    if (k === ',') { $('btnPrevSet').click(); return; }
    if (k === '.') { $('btnNextSet').click(); return; }
    const toolKeys = { v: 'select', l: 'line', a: 'arc', b: 'block', c: 'circle', h: 'pan' };
    if (toolKeys[k.toLowerCase()]) setTool(toolKeys[k.toLowerCase()]);
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  new ResizeObserver(resize).observe(canvas);

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
  loadShow(saved && saved.app === 'drill-writer' ? saved : newShow());
  state.mode = '2d';
  setTool('select');
  resize();
  try { if (localStorage.getItem(VIEW_KEY) === '3d') setMode('3d'); } catch (e) {}
}
init();
