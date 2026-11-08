// Drill Writer — student view. Read-only: one performer's dot, path, coordinates, playback and practice.
// Show source: ?show=<name> loads shows/<name>.json (published, session 3); otherwise the show saved by
// the editor on this device (used by "Preview as student", which also live-updates while the editor changes).
import {
  FIELD_DEPTH, normalizeShow, sectionByKey, SECTIONS, describeX, describeY, stepSize, setStarts, totalCounts, locate, positionsAt
} from './model.js';
import { css, drawField, shapePath, propCorners } from './fieldDraw.js';
import { technique } from './technique.js';
import { formOf } from './drop.js';
import { createRehearsal, DEFAULT_SETTINGS, COUNTOFF_PRESETS } from './rehearse.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview');
const STORE_KEY = 'drillwriter.show.v1';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const POV_KEY = 'drillwriter.pov';
let savedPov = 'performer'; try { savedPov = localStorage.getItem(POV_KEY) || 'performer'; } catch (e) {}
// pov: 'performer' = as the student sees it facing the audience (front at the top, Side 1 on the right);
//      'director'  = from the press box (front at the bottom, Side 1 on the left)
const st = { show: null, me: null, cur: 0, count: 0, playing: false, zoom: 'me', zf: 1, mode: '2d', v3: null, pov: savedPov === 'director' ? 'director' : 'performer' };
window.__sv = st;
st.view = null; // set below

// ---------- loading ----------
async function loadShow() {
  const name = params.get('show');
  if (name) {
    const r = await fetch(`shows/${encodeURIComponent(name)}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('show not found');
    return normalizeShow(await r.json());
  }
  const raw = localStorage.getItem(STORE_KEY);
  return raw ? normalizeShow(JSON.parse(raw)) : null;
}
const meKey = () => `drillwriter.me.${st.show.title}`;

let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

// ---------- picker ----------
function showPicker() {
  document.body.classList.remove('has-main');
  $('mainScreen').hidden = true; $('pickScreen').hidden = false;
  $('pickTitle').textContent = `Find your drill ID — ${st.show.title}`;
  renderPick('');
  $('pickSearch').value = ''; $('pickSearch').focus();
}
function renderPick(q) {
  q = q.trim().toLowerCase();
  const box = $('pickList'); box.innerHTML = '';
  for (const sec of SECTIONS) {
    const ps = st.show.performers.filter(p => p.section === sec.key && (!q || p.label.toLowerCase().includes(q) || sec.name.toLowerCase().includes(q)));
    if (!ps.length) continue;
    const div = document.createElement('div'); div.className = 'sec';
    div.innerHTML = `<h3><span class="sw" style="background:${sec.color}"></span>${sec.name}</h3><div class="ids"></div>`;
    for (const p of ps.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))) {
      const b = document.createElement('button'); b.textContent = p.label;
      b.onclick = () => pickMe(p.id);
      div.querySelector('.ids').appendChild(b);
    }
    box.appendChild(div);
  }
  if (!box.children.length) box.innerHTML = '<p class="muted">No match.</p>';
}
function pickMe(id) {
  st.me = id;
  document.body.classList.add('has-main');
  // a tap is a user gesture: on phones that allow it, go full screen and lock sideways
  if (!PREVIEW && $('fsBtn') && !$('fsBtn').hidden && !document.fullscreenElement) lockLandscape(false);
  try { localStorage.setItem(meKey(), id); } catch (e) {}
  $('pickScreen').hidden = true; $('mainScreen').hidden = false;
  if (PREVIEW) $('pvWho').textContent = me().label;
  goSet(st.cur); resize();
}
const me = () => st.show.performers.find(p => p.id === st.me);

// ---------- per-set facts for me ----------
function myMove(i) { // move INTO set i: step size + technique
  if (i === 0) return null;
  const A = st.show.sets[i - 1].pos[st.me], B = st.show.sets[i].pos[st.me];
  const mv = stepSize(A, B, st.show.sets[i].counts);
  mv.tech = technique(sectionByKey(me().section).family, A, B);
  return mv;
}
function render() {
  const p = me(); if (!p) return;
  const sec = sectionByKey(p.section), sets = st.show.sets, set = sets[st.cur], q = set.pos[st.me];
  $('whoLabel').textContent = p.label; $('whoSection').textContent = sec.name;
  $('showName').textContent = st.show.title;
  $('setName').textContent = set.name; $('setOf').textContent = `of ${sets.length}`;
  $('cX').textContent = describeX(q.x); $('cY').textContent = describeY(q.y, st.show.field);
  const mv = myMove(st.cur);
  const chips = [];
  if (st.cur === 0) chips.push('<span class="chip">Opening set</span>');
  else {
    chips.push(`<span class="chip">${set.counts} counts from set ${esc(sets[st.cur - 1].name)}</span>`);
    if (mv.dist < 0.01) chips.push('<span class="chip hold">HOLD</span>');
    else {
      chips.push(`<span class="chip tech">${mv.tech.label}</span>`);
      chips.push(`<span class="chip${mv.big ? ' big' : ''}">${mv.label}${mv.big ? ' — big step!' : ''}</span>`);
    }
    if (set.bpm) chips.push(`<span class="chip">♩ = ${set.bpm}</span>`);
  }
  $('chips').innerHTML = chips.join('');
  $('setNote').hidden = !set.note; $('setNote').textContent = set.note || '';
  // what's next for me
  if (st.cur < sets.length - 1) {
    const n = sets[st.cur + 1], nm = myMove(st.cur + 1);
    $('nextInfo').innerHTML = nm.dist < 0.01
      ? `Next: <strong>hold ${n.counts}</strong> into set ${esc(n.name)}`
      : `Next: <strong>${n.counts} counts</strong> to set ${esc(n.name)} · <strong>${nm.tech.label}</strong> · ${nm.label}${nm.big ? ' ⚠' : ''}`;
  } else $('nextInfo').textContent = 'Last set of the show.';
  $('prevSet').disabled = st.cur === 0; $('nextSet').disabled = st.cur === sets.length - 1;
  renderSheet(); renderNear(); updateClock(); draw();
}
function renderSheet() {
  const p = me(), sets = st.show.sets;
  $('sheetTitle').textContent = `${p.label} · ${sectionByKey(p.section).name} — ${st.show.title}`;
  $('sheetBody').innerHTML = sets.map((s, i) => {
    const q = s.pos[st.me], mv = myMove(i);
    const step = !mv ? '' : mv.dist < 0.01 ? '<td class="hold">Hold</td>' : `<td class="${mv.big ? 'big' : ''}">${mv.label}<br><span class="tech-s">${mv.tech.label}</span></td>`;
    return `<tr class="${i === st.cur ? 'cur' : ''}"><td>${esc(s.name)}</td><td>${i ? s.counts : '—'}</td><td>${esc(describeX(q.x))}</td><td>${esc(describeY(q.y, st.show.field))}</td>${step || '<td></td>'}</tr>`;
  }).join('');
}
function neighbors(i) {
  const pos = st.show.sets[i].pos, M = pos[st.me];
  const perf = st.pov === 'performer';
  const dirs = perf ? [ // facing the audience: Side 1 is on your right
    { name: '◀ Your left (Side 2)', v: { x: 1, y: 0 } }, { name: 'Your right (Side 1) ▶', v: { x: -1, y: 0 } },
    { name: '▲ In front of you (toward audience)', v: { x: 0, y: -1 } }, { name: '▼ Behind you (toward back)', v: { x: 0, y: 1 } }
  ] : [
    { name: '◀ Toward Side 1', v: { x: -1, y: 0 } }, { name: 'Toward Side 2 ▶', v: { x: 1, y: 0 } },
    { name: '▼ In front (toward audience)', v: { x: 0, y: -1 } }, { name: '▲ Behind (toward back)', v: { x: 0, y: 1 } }
  ];
  return dirs.map(d => {
    let best = null, bd = Infinity;
    for (const p of st.show.performers) {
      if (p.id === st.me) continue;
      const q = pos[p.id], dx = q.x - M.x, dy = q.y - M.y, dist = Math.hypot(dx, dy);
      if (dist < 0.01 || dist > 10) continue;
      const cos = (dx * d.v.x + dy * d.v.y) / dist;
      if (cos < Math.cos(Math.PI / 4 + 1e-6)) continue; // within 45° of that direction
      if (dist < bd) { bd = dist; best = p; }
    }
    return { ...d, p: best, dist: bd };
  });
}
function renderNear() {
  $('nearSet').textContent = st.show.sets[st.cur].name;
  $('nearList').innerHTML = neighbors(st.cur).map(n => n.p
    ? `<li><span class="dir">${n.name}</span><span><strong>${esc(n.p.label)}</strong> · ${Math.round(n.dist * 10) / 10} steps</span></li>`
    : `<li><span class="dir">${n.name}</span><span class="muted">nobody within 10 steps</span></li>`).join('');
}

// ---------- drawing ----------
const canvas = $('fieldCanvas'), ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
const view = { scale: 4, ox: 0, oy: 0 };
st.view = view;
function resize() {
  const r = canvas.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1; W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  draw();
}
// "Me" view frames the student's form plus the nearest yard-line numbers and the yard lines on
// either side of them. During a move it frames both ends of the move so the picture doesn't jump.
const NUM_ROWS = [19.2, FIELD_DEPTH - 19.2]; // yard-number rows, steps from the front sideline
const boxCache = new Map();
function setBox(i) {
  const key = `${i}|${st.me}`;
  if (boxCache.has(key)) return boxCache.get(key);
  const pos = st.show.sets[i].pos, M = pos[st.me];
  const chain = formOf(st.show, i, st.me);
  // my form, plus whoever is close around me (a block's other rows, a neighboring form)
  const near = st.show.performers.filter(p => { const q = pos[p.id]; return Math.hypot(q.x - M.x, q.y - M.y) <= (chain ? 8 : 10); }).map(p => p.id);
  const ids = [...new Set([...(chain ? chain.ids : []), ...near])];
  let x0 = M.x - 9, x1 = M.x + 9, y0 = M.y - 4, y1 = M.y + 4; // ≥ one yard line each side
  for (const id of ids) { const q = pos[id]; if (!q) continue; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const row = NUM_ROWS.reduce((b, r) => Math.abs(r - M.y) < Math.abs(b - M.y) ? r : b);
  y0 = Math.min(y0, row - 2.5); y1 = Math.max(y1, row + 2.5);
  const box = { x0: x0 - 3, x1: x1 + 3, y0: y0 - 3, y1: y1 + 3 };
  boxCache.set(key, box);
  return box;
}
function targetBox() {
  const L = locate(st.show, st.count), a = setBox(L.i);
  if (!(L.frac > 0 || st.playing) || L.i >= st.show.sets.length - 1) return a;
  const b = setBox(L.i + 1);
  return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
}
let curBox = null;
function fitView(focus) {
  const f = st.pov === 'performer' ? -1 : 1;
  view.flip = f === -1;
  if (st.zoom === 'me' && focus) {
    const t = targetBox();
    // ease toward a new framing while playing; jump when stepping between sets
    if (!curBox || !st.playing) curBox = { ...t };
    else for (const k of ['x0', 'x1', 'y0', 'y1']) curBox[k] += (t[k] - curBox[k]) * 0.08;
    const top = 6, bottom = 98; // keep clear of the slider and buttons along the bottom
    const aw = W - 12, ah = Math.max(60, H - top - bottom);
    const bw = curBox.x1 - curBox.x0, bh = curBox.y1 - curBox.y0;
    view.scale = Math.min(aw / bw, ah / bh, 40) / st.zf;
    const cx = (curBox.x0 + curBox.x1) / 2, cy = (curBox.y0 + curBox.y1) / 2;
    view.ox = W / 2 - f * cx * view.scale;
    view.oy = top + ah / 2 + f * cy * view.scale;
  } else {
    view.scale = Math.min((W - 12) / 200, (H - 12) / 104);
    view.ox = W / 2; view.oy = H / 2 + f * 40.7 * view.scale;
  }
}
const sx = x => view.ox + (view.flip ? -1 : 1) * x * view.scale, sy = y => view.oy - (view.flip ? -1 : 1) * y * view.scale;
function arrow(a, b, color, width, dash) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
  const x0 = sx(a.x), y0 = sy(a.y), x1 = sx(b.x), y1 = sy(b.y);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
  const ang = Math.atan2(y1 - y0, x1 - x0), h = Math.max(7, 0.7 * view.scale);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(ang - 0.45), y1 - h * Math.sin(ang - 0.45)); ctx.lineTo(x1 - h * Math.cos(ang + 0.45), y1 - h * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function draw() {
  if (!st.show || !st.me || !W || st.mode === '3d') return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const frame = positionsAt(st.show, st.count);
  fitView(frame.pos[st.me]);
  drawField(ctx, view, st.show.field, W, H);
  const s = view.scale, sets = st.show.sets, atSet = !st.playing && Math.abs(st.count - setStarts(st.show)[st.cur]) < 1e-6;
  const ink = css('--ink'), meCol = css('--me'), muted = css('--muted');
  // props
  for (const prop of st.show.props) {
    const pp = frame.props[prop.id]; if (!pp) continue;
    const pts = propCorners(pp, prop);
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(sx(q.x), sy(q.y)) : ctx.moveTo(sx(q.x), sy(q.y))); ctx.closePath();
    ctx.fillStyle = prop.color || '#9aa5b1'; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
  }
  // my paths: where I came from (gray) and where I go next (orange)
  if (atSet) {
    if (st.cur > 0) { const a = sets[st.cur - 1].pos[st.me], b = sets[st.cur].pos[st.me]; if (Math.hypot(a.x - b.x, a.y - b.y) > 0.01) arrow(a, b, muted, 2, [5, 4]); }
    if (st.cur < sets.length - 1) { const a = sets[st.cur].pos[st.me], b = sets[st.cur + 1].pos[st.me]; if (Math.hypot(a.x - b.x, a.y - b.y) > 0.01) arrow(a, b, meCol, 3); }
  }
  // everyone else, dimmed
  const r = Math.max(3, 0.7 * s);
  const near = st.zoom === 'me' ? new Set(neighbors(locate(st.show, st.count).i).filter(n => n.p).map(n => n.p.id)) : new Set();
  for (const p of st.show.performers) {
    if (p.id === st.me) continue;
    const q = frame.pos[p.id], sec = sectionByKey(p.section);
    shapePath(ctx, sec.family, sx(q.x), sy(q.y), r);
    ctx.globalAlpha = near.has(p.id) ? 0.85 : 0.4; ctx.fillStyle = sec.color; ctx.fill(); ctx.globalAlpha = 1;
    if (near.has(p.id) && s >= 6) {
      ctx.fillStyle = ink; ctx.globalAlpha = 0.8; ctx.font = `600 ${Math.min(13, 1.0 * s)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.label, sx(q.x), sy(q.y) - r - 1); ctx.globalAlpha = 1;
    }
  }
  // me
  const m = frame.pos[st.me], X = sx(m.x), Y = sy(m.y), R = Math.max(6, 1.0 * s);
  ctx.beginPath(); ctx.arc(X, Y, R + 5, 0, Math.PI * 2); ctx.fillStyle = meCol; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
  shapePath(ctx, sectionByKey(me().section).family, X, Y, R);
  ctx.fillStyle = meCol; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ink; ctx.stroke();
  ctx.font = `800 ${Math.max(13, Math.min(18, 1.4 * s))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4; ctx.strokeStyle = css('--bg'); ctx.strokeText(me().label, X, Y - R - 6);
  ctx.fillStyle = ink; ctx.fillText(me().label, X, Y - R - 6);
}

// ---------- navigation ----------
function goSet(i) {
  stopAll();
  st.replay = false;
  st.cur = Math.max(0, Math.min(st.show.sets.length - 1, i));
  st.count = setStarts(st.show)[st.cur];
  $('bigCount').hidden = true;
  render();
}
// ---------- set slider ----------
let scrubKey = '';
function renderScrubber() {
  const total = Math.max(1, totalCounts(st.show)), starts = setStarts(st.show), sets = st.show.sets;
  const key = starts.join(',') + '|' + sets.map(x => x.name).join(',');
  if (key === scrubKey) return;
  scrubKey = key;
  const every = sets.length > 40 ? 5 : sets.length > 16 ? 2 : 1;   // thin out labels on long shows
  $('scrubber').querySelector('.sc-ticks').innerHTML = sets.map((x, i) => {
    const left = (starts[i] / total) * 100;
    return `<i style="left:${left}%"></i>` + (i % every === 0 || i === sets.length - 1 ? `<b style="left:${left}%">${esc(x.name)}</b>` : '');
  }).join('');
}
function updateScrubber() {
  if (!st.show) return;
  renderScrubber();
  const total = Math.max(1, totalCounts(st.show)), pct = Math.min(100, (st.count / total) * 100);
  const el = $('scrubber');
  el.querySelector('.sc-thumb').style.left = `${pct}%`;
  el.querySelector('.sc-fill').style.width = `${pct}%`;
  const L = locate(st.show, st.count), sets = st.show.sets;
  el.querySelector('.sc-bubble').textContent = L.frac ? `${sets[L.i].name} → ${sets[L.i + 1].name}` : `Set ${sets[L.i].name}`;
  el.setAttribute('aria-valuetext', el.querySelector('.sc-bubble').textContent);
}
function scrubToX(clientX) {
  const r = $('scrubber').querySelector('.sc-track').getBoundingClientRect();
  const total = totalCounts(st.show), starts = setStarts(st.show);
  let c = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * total;
  // stick to a set when you're close to it, so landing on one is easy
  const near = starts.reduce((b, v) => Math.abs(v - c) < Math.abs(b - c) ? v : b, starts[0]);
  if (Math.abs(near - c) <= Math.max(0.6, total * 0.008)) c = near;
  st.count = c; st.replay = false;
  const i = locate(st.show, c).i;
  if (i !== st.cur) { st.cur = i; render(); } else { updateClock(); draw(); }
}
function wireScrubber() {
  const el = $('scrubber');
  el.addEventListener('pointerdown', e => {
    e.stopPropagation(); el.setPointerCapture(e.pointerId);
    stopAll(); $('bigCount').hidden = true;
    el.classList.add('dragging'); scrubToX(e.clientX);
  });
  el.addEventListener('pointermove', e => { if (el.classList.contains('dragging')) scrubToX(e.clientX); });
  const end = () => el.classList.remove('dragging');
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

function updateClock() {
  updateScrubber();
  const L = locate(st.show, st.count), sets = st.show.sets;
  $('clock').textContent = L.frac ? `${sets[L.i].name}→${sets[L.i + 1].name}` : `Set ${sets[st.cur].name}`;
}

// ---------- big count (personal: HOLD when *I* don't move) ----------
function myHold(i) { const a = st.show.sets[i].pos[st.me], b = st.show.sets[i + 1].pos[st.me]; return Math.hypot(a.x - b.x, a.y - b.y) < 0.01; }
function renderBigCount({ phase, count, beatNum, run }) {
  const bc = $('bigCount'), sets = st.show.sets, starts = setStarts(st.show), el = c => bc.querySelector(c);
  const toIdx = run ? run.opts.to : sets.length - 1;
  bc.hidden = false;
  let n = '', of = '', sub = '', next = '', cls = 'big-count', bar = null;
  const nextLine = i => {
    if (i + 1 >= toIdx) return `Stop on set ${sets[toIdx].name}`;
    const c = sets[i + 2].counts;
    return myHold(i + 1) ? `Then hold ${c}` : `Then ${c} counts to set ${sets[i + 2].name}`;
  };
  if (phase === 'countoff') {
    const b = run.opts.beats; let lab = '';
    for (let i = 0; i <= Math.min(beatNum, b.length - 1); i++) if (b[i]) lab = String((i % 4) + 1);
    n = lab; cls += ' countoff';
    const f = run.opts.from;
    sub = `Ready · set ${sets[f].name}`;
    next = myHold(f) ? `First: hold ${sets[f + 1].counts}` : `First: ${sets[f + 1].counts} counts to set ${sets[f + 1].name}`;
  } else if (phase === 'run') {
    const L = locate(st.show, count), total = sets[L.i + 1].counts, into = count - starts[L.i], cur = Math.min(total, Math.floor(into) + 1);
    const rhs = settings();
    if (rhs.countMode === 'down') { n = String(total - cur + 1); of = 'left'; } else { n = String(cur); of = `/${total}`; }
    const hold = myHold(L.i);
    sub = hold ? 'HOLD' : `To set ${sets[L.i + 1].name}`;
    next = nextLine(L.i);
    if (hold) cls += ' hold';
    if (total >= 4 && cur > total - 4) cls += ' arriving';
    if (into < 0.3 && L.i > (run ? run.opts.from : -1)) cls += ' arrive';
    bar = { total, cur };
  } else { n = sets[toIdx].name; sub = 'Set'; next = 'Done'; }
  bc.className = cls;
  el('.bc-n').textContent = n; el('.bc-of').textContent = of; el('.bc-sub').textContent = sub; el('.bc-next').textContent = next;
  const barEl = el('.bc-bar');
  if (!bar) { barEl.innerHTML = ''; barEl.dataset.key = ''; return; }
  if (barEl.dataset.key !== String(bar.total)) {
    barEl.dataset.key = String(bar.total);
    barEl.innerHTML = bar.total <= 32 ? Array.from({ length: bar.total }, (_, i) => `<i class="${(i % 8 === 7 && i < bar.total - 1) ? 'eight' : ''}"></i>`).join('') : '<b></b>';
  }
  if (bar.total <= 32) barEl.querySelectorAll('i').forEach((sg, i) => sg.classList.toggle('on', i < bar.cur));
  else barEl.querySelector('b').style.width = `${(bar.cur / bar.total) * 100}%`;
}

// ---------- playback ----------
let raf = 0, lastT = 0;
function play() {
  if (st.show.sets.length < 2) return;
  // on set N, play the move into set N (start from set N-1); mid-move, continue
  const starts = setStarts(st.show);
  const at = starts.findIndex(c => Math.abs(c - st.count) < 1e-6);
  if (at > 0 && !st.replay) { st.count = starts[at - 1]; st.cur = at - 1; render(); }
  st.replay = false;
  st.playing = true; $('playBtn').textContent = '⏸ Pause'; lastT = performance.now();
  raf = requestAnimationFrame(tick);
}
function tick(t) {
  if (!st.playing) return;
  const dt = (t - lastT) / 1000; lastT = t;
  const L = locate(st.show, st.count), into = st.show.sets[Math.min(L.i + 1, st.show.sets.length - 1)];
  st.count += dt * (into.bpm || st.show.tempo.bpm || 144) / 60;
  const total = totalCounts(st.show);
  if (st.count >= total) { st.count = total; st.cur = st.show.sets.length - 1; stopAll(); render(); return; }
  const c = locate(st.show, st.count).i;
  st.lastMove = c;
  if (c !== st.cur) { st.cur = c; render(); }
  renderBigCount({ phase: 'run', count: st.count, run: null });
  updateClock(); draw();
  raf = requestAnimationFrame(tick);
}
function stopAll() {
  if (rehearsal && rehearsal.running) rehearsal.stop();
  st.playing = false; cancelAnimationFrame(raf);
  $('playBtn').textContent = '▶ Play';
}

// Stop = back to the start of the move that was playing; the next Play replays that move
let practiceFrom = null;
function stopToStart() {
  const practicing = rehearsal && rehearsal.running;
  const wasPlaying = st.playing;
  stopAll();
  const L = locate(st.show, st.count);
  let idx = practicing && practiceFrom != null ? practiceFrom : (L.frac > 0 ? L.i : (wasPlaying || st.lastMove != null ? (st.lastMove ?? st.cur) : st.cur));
  idx = Math.max(0, Math.min(st.show.sets.length - 1, idx));
  st.cur = idx; st.count = setStarts(st.show)[idx];
  st.replay = idx < st.show.sets.length - 1 && !practicing;
  st.lastMove = null;
  $('bigCount').hidden = true;
  render();
}

// ---------- practice (count-off + click) ----------
const settings = () => { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('drillwriter.rehearse') || '{}') }; } catch (e) { return { ...DEFAULT_SETTINGS }; } };
const rehearsal = createRehearsal({
  getShow: () => st.show,
  onFrame: f => {
    st.count = f.count;
    const c = locate(st.show, f.count).i;
    if (c !== st.cur) { st.cur = c; render(); }
    renderBigCount(f); updateClock(); draw();
  },
  onState: s => {
    if (s === 'running') { st.playing = true; $('playBtn').textContent = '■ Stop'; }
    if (s === 'stopped') { st.playing = false; $('playBtn').textContent = '▶ Play'; st.cur = locate(st.show, st.count).i; render(); setTimeout(() => { if (!st.playing) $('bigCount').hidden = true; }, 1500); }
  }
});
function openPractice() {
  stopAll();
  const sets = st.show.sets, opts = sets.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');
  $('pFrom').innerHTML = opts; $('pTo').innerHTML = opts;
  $('pFrom').value = Math.min(st.cur, sets.length - 2); $('pTo').value = Math.min(sets.length - 1, Math.max(st.cur + 1, Math.min(st.cur + 3, sets.length - 1)));
  const s = settings();
  $('pPct').value = s.tempoPct; $('pRepeat').checked = !!s.repeat;
  $('pPattern').textContent = (COUNTOFF_PRESETS[s.preset] || { name: 'custom' }).name.split(' (')[0];
  updatePct();
  $('practiceDlg').showModal();
}
function updatePct() {
  const from = +$('pFrom').value, s = st.show.sets[Math.min(from + 1, st.show.sets.length - 1)];
  $('pPctLabel').textContent = `${$('pPct').value}% · ♩=${Math.round((s.bpm || st.show.tempo.bpm) * $('pPct').value / 100)}`;
}
function goPractice() {
  const from = +$('pFrom').value, to = +$('pTo').value;
  if (!(to > from)) return toast('“To” has to be a later set.');
  const s = settings();
  st.cur = from; st.count = setStarts(st.show)[from]; practiceFrom = from;
  rehearsal.start({ from, to, beats: s.beats, countSound: s.countSound, clickOn: s.clickOn, clickSound: s.clickSound, accentSets: s.accentSets,
    volume: s.volume, tempoPct: +$('pPct').value, repeat: $('pRepeat').checked, repeatGap: s.repeatGap, delayMs: s.delayMs });
}

// ---------- 3D ----------
async function setMode(mode) {
  if (mode === st.mode) return;
  if (mode === '3d' && !st.v3) {
    try {
      const m = await import('./view3d.js');
      st.v3 = m.create3D($('view3d'), {
        getFrame: () => ({ show: st.show, frame: positionsAt(st.show, st.count), count: st.count, sel: new Set([st.me]), selProp: null, labels: false, follow: st.zoom === 'me' ? st.me : null, followFrom: st.pov,
          dark: document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches }),
        onPick: () => {}
      });
    } catch (e) { toast("3D isn't available on this device."); return; }
  }
  st.mode = mode;
  $('v2d').classList.toggle('on', mode === '2d'); $('v3d').classList.toggle('on', mode === '3d');
  canvas.style.visibility = mode === '3d' ? 'hidden' : '';

  if (mode === '3d') st.v3.show(); else { st.v3 && st.v3.hide(); draw(); }
}

// ---------- zoom ----------
function syncZoomBtns() {
  $('zoomMe').classList.toggle('on', st.zoom === 'me'); $('zoomAll').classList.toggle('on', st.zoom === 'all');
}
function setZoom(z, zf) {
  st.zoom = z; if (zf) st.zf = zf;
  syncZoomBtns();
  if (st.v3) st.v3.setCamera(z === 'me' ? null : (st.pov === 'performer' ? 'backfield' : 'press'));
  draw();
}
function zoomBy(k) {
  if (st.zoom === 'all') { if (k < 1) setZoom('me', 1.6); return; }
  st.zf = Math.max(0.3, Math.min(3, st.zf * k));
  if (st.zf >= 3 && k > 1) return setZoom('all');
  syncZoomBtns(); draw();
}

// ---------- landscape lock (Android/Chrome only: needs full screen; iPhones can't lock from a web page) ----------
async function lockLandscape(fromButton) {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation.lock('landscape');
  } catch (e) { if (fromButton) toast("This phone won't lock sideways from a web page — just turn it."); }
}

// ---------- point of view ----------
function setPov(pov, quiet) {
  st.pov = pov;
  try { localStorage.setItem(POV_KEY, pov); } catch (e) {}
  $('povPerf').classList.toggle('on', pov === 'performer'); $('povDir').classList.toggle('on', pov === 'director');
  if (st.v3) st.v3.setCamera(st.zoom === 'me' ? null : (pov === 'performer' ? 'backfield' : 'press'));
  if (!quiet) toast(pov === 'performer' ? 'Performer view: facing the audience' : 'Director view: from the press box');
  if (st.show && st.me) { renderNear(); draw(); }
}

// ---------- wiring ----------
function wire() {
  $('pickSearch').oninput = e => renderPick(e.target.value);
  $('whoBtn').onclick = () => { stopAll(); showPicker(); };
  $('prevSet').onclick = () => goSet(st.cur - 1);
  $('nextSet').onclick = () => goSet(st.cur + 1);
  $('playBtn').onclick = () => st.playing ? (stopAll(), render()) : play();
  $('practiceBtn').onclick = openPractice;
  wireScrubber();
  $('stopBtn').onclick = stopToStart;
  window.__svPick = id => { if (st.show && st.show.performers.some(p => p.id === id)) pickMe(id); };
  $('pFrom').onchange = updatePct; $('pPct').oninput = updatePct;
  $('practiceDlg').addEventListener('close', () => { if ($('practiceDlg').returnValue === 'go') goPractice(); });
  $('zoomMe').onclick = () => setZoom('me', 1);
  $('zoomAll').onclick = () => setZoom('all');
  $('zoomIn').onclick = () => zoomBy(1 / 1.4);
  $('zoomOut').onclick = () => zoomBy(1.4);
  $('povPerf').onclick = () => setPov('performer');
  $('povDir').onclick = () => setPov('director');
  setPov(st.pov, true);
  $('v2d').onclick = () => setMode('2d'); $('v3d').onclick = () => setMode('3d');
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.panel').forEach(pn => pn.classList.toggle('on', pn.id === `tab-${b.dataset.tab}`));
  });
  $('printBtn').onclick = () => window.print();
  // one finger: swipe left/right to change sets, double-tap to switch Me/Field; two fingers: pinch to zoom
  const pts = new Map(); let sx0 = null, pinch = null, lastTap = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) sx0 = e.clientX;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]; sx0 = null;
      if (st.zoom === 'all') { st.zoom = 'me'; st.zf = 2; syncZoomBtns(); }
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), zf0: st.zf };
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      st.zf = Math.max(0.3, Math.min(3, pinch.zf0 * pinch.d0 / Math.max(10, d)));
      draw();
    }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pinch) { if (pts.size === 0) { pinch = null; if (st.zf > 2.8) setZoom('all'); } return; }
    if (sx0 == null) return;
    const dx = e.clientX - sx0; sx0 = null;
    if (Math.abs(dx) > 50 && !st.playing) { goSet(st.cur + (dx < 0 ? 1 : -1)); return; }
    const now = performance.now();
    if (Math.abs(dx) < 8 && now - lastTap < 320) { setZoom(st.zoom === 'me' ? 'all' : 'me', 34); lastTap = 0; } else lastTap = now;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 / 1.15 : 1.15); }, { passive: false });
  // landscape: hint to turn the phone; full screen + orientation lock where the browser allows it (Android)
  $('keepPortrait').onclick = () => { document.body.classList.add('portrait-ok'); try { sessionStorage.setItem('drillwriter.portraitOk', '1'); } catch (e) {} setTimeout(resize, 50); };
  try { if (sessionStorage.getItem('drillwriter.portraitOk')) document.body.classList.add('portrait-ok'); } catch (e) {}
  const canLock = !!(document.documentElement.requestFullscreen && screen.orientation && screen.orientation.lock) && !params.has('embed');
  $('fsBtn').hidden = !canLock || !matchMedia('(pointer: coarse)').matches;
  $('fsBtn').onclick = () => lockLandscape(true);
  new ResizeObserver(resize).observe(canvas);
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') goSet(st.cur + 1);
    if (e.key === 'ArrowLeft') goSet(st.cur - 1);
    if (e.key === ' ') { e.preventDefault(); st.playing ? (stopAll(), render()) : play(); }
  });
  if (PREVIEW) {
    $('previewBanner').hidden = params.has('embed'); // inside the editor's Students mode the frame says enough
    $('pvClose').onclick = () => { if (window.opener) window.close(); else location.href = 'index.html'; };
    // live-update while the editor (another tab) changes the show
    window.addEventListener('storage', e => {
      if (e.key !== STORE_KEY || !e.newValue) return;
      const show = normalizeShow(JSON.parse(e.newValue));
      const keepCur = Math.min(st.cur, show.sets.length - 1);
      st.show = show; boxCache.clear(); curBox = null;
      if (!me()) return showPicker();
      if (!st.playing) { st.cur = keepCur; st.count = setStarts(st.show)[st.cur]; render(); }
    });
  }
  try { const th = localStorage.getItem('drillwriter.theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
}

async function init() {
  wire();
  try { st.show = await loadShow(); } catch (e) { st.show = null; $('emptyMsg').textContent = "This show couldn't be loaded. Check the link."; }
  if (!st.show || !st.show.performers.length) { $('emptyScreen').hidden = false; return; }
  const want = params.get('id');
  let saved = null; try { saved = localStorage.getItem(meKey()); } catch (e) {}
  const id = [want, saved].find(x => x && st.show.performers.some(p => p.id === x));
  const setParam = parseInt(params.get('set'), 10);
  st.cur = Number.isFinite(setParam) ? Math.max(0, Math.min(st.show.sets.length - 1, setParam)) : 0;
  if (id) pickMe(id); else showPicker();
}
init();
