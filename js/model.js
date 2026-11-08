// Drill Writer — field geometry, coordinates and show data model.
// Units: 1 unit = one 8-to-5 step (22.5 in). x = steps from the 50 (negative = Side 1),
// y = steps from the FRONT sideline (0) toward the back sideline.

export const STEPS_PER_YARD = 1.6;              // 8 steps per 5 yards
export const FIELD_DEPTH = 160 / 3 * STEPS_PER_YARD; // 53.33 yd = 85.33 steps
export const GOAL_X = 50 * STEPS_PER_YARD;       // 80 steps from the 50
export const END_X = 60 * STEPS_PER_YARD;        // back of end zone, 96 steps

export const HASH_TYPES = {
  hs:      { name: 'High school (53′4″)', fromSideline: 160 / 9 * STEPS_PER_YARD },   // 28.44
  college: { name: 'College (60′)',        fromSideline: 20 * STEPS_PER_YARD },        // 32
  nfl:     { name: 'NFL (70′9″)',          fromSideline: (70.75 / 3) * STEPS_PER_YARD } // 37.73
};

export function refLines(field) {
  const h = HASH_TYPES[field.hash || 'hs'].fromSideline;
  return [
    { y: 0, key: 'FSL', name: 'Front Side Line' },
    { y: h, key: 'FH', name: 'Front Hash' },
    { y: FIELD_DEPTH - h, key: 'BH', name: 'Back Hash' },
    { y: FIELD_DEPTH, key: 'BSL', name: 'Back Side Line' }
  ];
}

const round = (v, d = 2) => { const p = 10 ** d; return Math.round(v * p) / p; };
export const fmt = v => { const r = round(Math.abs(v), 2); return Number.isInteger(r) ? String(r) : String(r); };

// Snap x to the grid of yard lines (every 8 steps from the 50 → plain multiples of inc).
export function snapX(x, inc) { return inc > 0 ? round(Math.round(x / inc) * inc, 4) : x; }

// Snap y relative to the nearest reference line, so "4 steps behind the front hash" is exact.
export function nearestRef(y, field) {
  let best = null;
  for (const r of refLines(field)) if (!best || Math.abs(y - r.y) < Math.abs(y - best.y)) best = r;
  return best;
}
export function snapY(y, inc, field) {
  if (!(inc > 0)) return y;
  const r = nearestRef(y, field);
  return round(r.y + Math.round((y - r.y) / inc) * inc, 4);
}
export function snapPt(p, inc, field) { return { x: snapX(p.x, inc), y: snapY(p.y, inc, field) }; }

// "Side 1: 2.5 steps outside 35 yd ln"
export function describeX(x) {
  x = round(x, 3);
  if (Math.abs(x) < 0.005) return 'On 50 yd ln';
  const side = x < 0 ? 'Side 1' : 'Side 2';
  const ax = Math.abs(x);
  // nearest yard line; on a tie (4 steps between) prefer the line nearer the 50 → "outside"
  let k = Math.round(ax / 8);
  if (Math.abs(ax - 8 * k) === 4 && ax - 8 * k < 0) k -= 1; // tie: pick inner line
  k = Math.max(0, Math.min(12, k));
  const off = round(ax - 8 * k, 2);
  let lineName;
  if (k <= 10) lineName = `${50 - 5 * k} yd ln`;
  else lineName = k === 11 ? 'end zone 5' : 'end line';
  if (k === 10) lineName = 'goal ln';
  if (Math.abs(off) < 0.005) return `${side}: On ${lineName}`;
  const dir = off > 0 ? 'outside' : 'inside';
  return `${side}: ${fmt(off)} step${Math.abs(off) === 1 ? '' : 's'} ${dir} ${lineName}`;
}

// "4 steps behind Front Hash"
export function describeY(y, field) {
  const r = nearestRef(y, field);
  const off = round(y - r.y, 2);
  if (Math.abs(off) < 0.005) return `On ${r.name}`;
  const dir = off > 0 ? 'behind' : 'in front of';
  return `${fmt(off)} step${Math.abs(off) === 1 ? '' : 's'} ${dir} ${r.name}`;
}

// Step size for a move: returns { steps per count, label like "8 to 5", big?: bigger than 6-to-5 }
export function stepSize(a, b, counts) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 0.01) return { dist: 0, label: 'Hold', n: Infinity, big: false };
  if (!counts) return { dist: d, label: 'Jump', n: 0, big: true };
  const per = d / counts;                 // 8-to-5 steps per count
  const n = 8 / per;                      // "n to 5"
  return { dist: d, per, n, label: `${round(n, 1)} to 5`, big: n < 6 - 1e-6 };
}

// ---------- Per-student timing inside a move ----------
// set.timing[id] = { pre, post } for the move INTO that set:
//   pre  = hold this many counts, then move   ("hold 4, then 12")
//   post = move first, arrive and hold the last this many counts   ("12, then hold 4")
export function moveTiming(show, i, id) {
  const st = show.sets[i], counts = (st && st.counts) || 0;
  const t = st && st.timing && st.timing[id];
  let pre = t ? Math.max(0, Math.round(t.pre || 0)) : 0, post = t ? Math.max(0, Math.round(t.post || 0)) : 0;
  if (counts && pre + post > counts - 1) { const k = (counts - 1) / (pre + post); pre = Math.floor(pre * k); post = Math.floor(post * k); }
  if (!counts) { pre = 0; post = 0; }
  return { pre, post, len: counts - pre - post, counts };
}
// how far along the path a student is at fraction f (0..1) of the move into set i
export function pathFrac(show, i, id, f) {
  const { pre, post, counts } = moveTiming(show, i, id);
  if (!counts || (!pre && !post)) return f;
  const c = f * counts;
  if (c <= pre) return 0;
  if (c >= counts - post) return 1;
  return (c - pre) / (counts - pre - post);
}
// step size for one student's move into set i, using only the counts they actually move
export function moveStep(show, i, id) {
  if (i <= 0) return null;
  const a = show.sets[i - 1].pos[id], b = show.sets[i].pos[id];
  if (!a || !b) return null;
  const t = moveTiming(show, i, id), ss = stepSize(a, b, t.len);
  return Object.assign(ss, { pre: t.pre, post: t.post, moveCounts: t.len });
}
// "Hold 4, then 12" / "12, then hold 4" / "" for a plain move
export function timingText(mv) {
  if (!mv || mv.dist < 0.01) return '';
  if (mv.pre && mv.post) return `Hold ${mv.pre}, move ${mv.moveCounts}, hold ${mv.post}`;
  if (mv.pre) return `Hold ${mv.pre}, then ${mv.moveCounts}`;
  if (mv.post) return `${mv.moveCounts}, then hold ${mv.post}`;
  return '';
}

// ---------- Sections ----------
export const SECTIONS = [
  { key: 'piccolo',  name: 'Piccolo',        prefix: 'P',  family: 'wind', color: '#7fc8f8' },
  { key: 'flute',    name: 'Flute',          prefix: 'F',  family: 'wind', color: '#5aa9e6' },
  { key: 'clarinet', name: 'Clarinet',       prefix: 'C',  family: 'wind', color: '#3d7dd8' },
  { key: 'altosax',  name: 'Alto Sax',       prefix: 'A',  family: 'wind', color: '#9b6bd6' },
  { key: 'tenorsax', name: 'Tenor Sax',      prefix: 'N',  family: 'wind', color: '#7a4fc0' },
  { key: 'barisax',  name: 'Bari Sax',       prefix: 'X',  family: 'wind', color: '#5c3a9e' },
  { key: 'trumpet',  name: 'Trumpet',        prefix: 'T',  family: 'wind', color: '#e8a33d' },
  { key: 'mello',    name: 'Mellophone',     prefix: 'M',  family: 'wind', color: '#e07b39' },
  { key: 'trombone', name: 'Trombone',       prefix: 'B',  family: 'wind', color: '#d1563a' },
  { key: 'baritone', name: 'Baritone',       prefix: 'E',  family: 'wind', color: '#b8413a' },
  { key: 'tuba',     name: 'Tuba / Sousa',   prefix: 'U',  family: 'wind', color: '#8f2f2f' },
  { key: 'snare',    name: 'Snare',          prefix: 'S',  family: 'battery', color: '#3aa676' },
  { key: 'tenors',   name: 'Tenors',         prefix: 'Q',  family: 'battery', color: '#2e8b62' },
  { key: 'bass',     name: 'Bass Drum',      prefix: 'D',  family: 'battery', color: '#22704e' },
  { key: 'cymbal',   name: 'Cymbals',        prefix: 'Y',  family: 'battery', color: '#6cbf96' },
  { key: 'pit',      name: 'Front Ensemble', prefix: 'K',  family: 'pit', color: '#8a9a5b' },
  { key: 'guard',    name: 'Color Guard',    prefix: 'G',  family: 'guard', color: '#e05a9b' },
  { key: 'dm',       name: 'Drum Major',     prefix: 'DM', family: 'dm', color: '#c9a227' }
];
export const sectionByKey = k => SECTIONS.find(s => s.key === k) || SECTIONS[0];

export const PROP_KINDS = [
  { key: 'panel',  name: 'Panel / backdrop', w: 6.5, h: 1, color: '#9aa5b1' },
  { key: 'riser',  name: 'Riser / platform', w: 6.5, h: 6.5, color: '#a1887f' },
  { key: 'equip',  name: 'Guard equipment',  w: 2,   h: 1, color: '#e05a9b' },
  { key: 'other',  name: 'Other',            w: 3,   h: 3, color: '#90a4ae' }
];

// ---------- Show ----------
let _uid = 0;
export const uid = p => `${p}${Date.now().toString(36)}${(_uid++).toString(36)}`;

export function newShow(title = 'Untitled Show') {
  return {
    app: 'drill-writer', version: 1, title,
    field: { hash: 'hs' },
    performers: [],   // {id, label, section}
    props: [],        // {id, label, kind, w, h, color}
    sets: [{ id: uid('s'), name: '1', counts: 0, note: '', pos: {}, props: {}, forms: [] }],
    tempo: { bpm: 144 }
  };
}

// Normalise anything loaded from disk so missing fields can't crash the editor.
export function normalizeShow(s) {
  const base = newShow();
  const show = Object.assign(base, s || {});
  show.field = Object.assign({ hash: 'hs' }, show.field || {});
  show.tempo = Object.assign({ bpm: 144 }, show.tempo || {});
  show.ok = show.ok && typeof show.ok === 'object' ? show.ok : {}; // problems marked OK on purpose
  show.performers = (show.performers || []).filter(p => p && p.id);
  show.props = (show.props || []).filter(p => p && p.id);
  if (!Array.isArray(show.sets) || !show.sets.length) show.sets = newShow().sets;
  show.sets.forEach((st, i) => {
    st.id = st.id || uid('s'); st.name = st.name ?? String(i + 1);
    st.counts = i === 0 ? 0 : Math.max(0, Number(st.counts) || 0);
    st.bpm = Number(st.bpm) > 0 ? Math.max(30, Math.min(300, Number(st.bpm))) : null; // tempo into this set; null = show tempo
    st.pos = st.pos || {}; st.props = st.props || {}; st.note = st.note || '';
    st.holes = Array.isArray(st.holes) ? st.holes.filter(h => h && isFinite(h.x) && isFinite(h.y)) : [];
    st.timing = st.timing && typeof st.timing === 'object' ? st.timing : {};
    st.forms = Array.isArray(st.forms) ? st.forms.filter(f => f && Array.isArray(f.ids)) : [];
  });
  // every performer/prop needs a position in every set
  for (const p of show.performers) fillMissing(show, p.id, 'pos', { x: 0, y: 10 });
  for (const p of show.props) fillMissing(show, p.id, 'props', { x: 0, y: -4, rot: 0 });
  return show;
}
function fillMissing(show, id, key, dflt) {
  let last = null;
  for (const st of show.sets) {
    if (!st[key][id]) st[key][id] = last ? { ...last } : { ...dflt };
    last = st[key][id];
  }
}

// ---------- Timeline ----------
export function setStarts(show) {
  const out = []; let c = 0;
  show.sets.forEach((st, i) => { if (i > 0) c += st.counts; out.push(c); });
  return out;
}
export const totalCounts = show => setStarts(show).at(-1);

// Which transition a count falls in: { i (from-set index), frac 0..1 }
export function locate(show, count) {
  const st = setStarts(show);
  const n = show.sets.length;
  if (n === 1 || count <= 0) return { i: 0, frac: 0, at: 0 };
  if (count >= st[n - 1]) return { i: n - 1, frac: 0, at: n - 1 };
  for (let i = 0; i < n - 1; i++) {
    if (count < st[i + 1]) {
      const len = st[i + 1] - st[i];
      const frac = len ? (count - st[i]) / len : 1;
      return { i, frac, at: frac === 0 ? i : null };
    }
  }
  return { i: n - 1, frac: 0, at: n - 1 };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return a + d * t; };

export function positionsAt(show, count) {
  const { i, frac } = locate(show, count);
  const A = show.sets[i], B = show.sets[Math.min(i + 1, show.sets.length - 1)];
  const pos = {}, props = {};
  for (const p of show.performers) {
    const a = A.pos[p.id], b = B.pos[p.id];
    const f = frac ? pathFrac(show, i + 1, p.id, frac) : 0;
    pos[p.id] = f ? { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) } : { ...a };
  }
  for (const p of show.props) {
    const a = A.props[p.id], b = B.props[p.id];
    props[p.id] = frac ? { x: lerp(a.x, b.x, frac), y: lerp(a.y, b.y, frac), rot: lerpAngle(a.rot || 0, b.rot || 0, frac) } : { ...a };
  }
  return { pos, props, i, frac };
}

// ---------- Sample show (for trying the editor) ----------
export function sampleShow() {
  const show = newShow('Sample Show');
  const add = (section, n) => {
    const s = sectionByKey(section);
    for (let k = 1; k <= n; k++) show.performers.push({ id: uid('p'), label: `${s.prefix}${k}`, section });
  };
  add('flute', 4); add('clarinet', 4); add('altosax', 4); add('tenorsax', 2);
  add('trumpet', 6); add('mello', 4); add('trombone', 4); add('baritone', 2); add('tuba', 3);
  add('snare', 4); add('tenors', 2); add('bass', 4); add('cymbal', 2);
  add('guard', 6); add('dm', 1);
  const winds = show.performers.filter(p => sectionByKey(p.section).family === 'wind');
  const batt = show.performers.filter(p => sectionByKey(p.section).family === 'battery');
  const guard = show.performers.filter(p => p.section === 'guard');
  const dm = show.performers.find(p => p.section === 'dm');
  show.props.push({ id: uid('r'), label: 'Panel 1', kind: 'panel', w: 6.5, h: 1, color: '#9aa5b1' });
  show.props.push({ id: uid('r'), label: 'Panel 2', kind: 'panel', w: 6.5, h: 1, color: '#9aa5b1' });

  const [, FHr, BHr] = refLines(show.field);
  const FH = FHr.y, BH = BHr.y;
  const s1 = show.sets[0];
  // Set 1: winds in a block, battery behind, guard front, DM on the front sideline
  winds.forEach((p, k) => { const c = k % 8, r = Math.floor(k / 8); s1.pos[p.id] = { x: -14 + c * 4, y: FH + 12 + r * 4 }; });
  batt.forEach((p, k) => { s1.pos[p.id] = { x: -11 + k * 2, y: BH + 4 }; });
  guard.forEach((p, k) => { s1.pos[p.id] = { x: -20 + k * 8, y: FH + 6 }; });
  s1.pos[dm.id] = { x: 0, y: -4 };
  s1.props[show.props[0].id] = { x: -24, y: 72, rot: 0 };
  s1.props[show.props[1].id] = { x: 24, y: 72, rot: 0 };

  // Set 2: winds arc, battery line, guard spread wider
  // spots are handed out left-to-right in the same order people stood in the last set, so paths don't cross
  const assign = (st, from, spots) => {
    const order = [...winds].sort((a, b) => (from.pos[a.id].x - from.pos[b.id].x) || (from.pos[a.id].y - from.pos[b.id].y));
    spots.sort((a, b) => a.x - b.x).forEach((q, k) => { st.pos[order[k].id] = { x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }; });
  };
  const s2 = { id: uid('s'), name: '2', counts: 24, note: '', pos: {}, props: {} };
  assign(s2, s1, winds.map((p, k) => {
    const a = Math.PI * (0.2 + 0.6 * k / (winds.length - 1));
    return { x: -Math.cos(a) * 30, y: FH + 2 + Math.sin(a) * 16 };
  }));
  batt.forEach((p, k) => { s2.pos[p.id] = { x: -11 + k * 2, y: BH + 4 }; });
  guard.forEach((p, k) => { s2.pos[p.id] = { x: -30 + k * 12, y: FH - 4 }; });
  s2.pos[dm.id] = { x: 0, y: -4 };
  s2.props[show.props[0].id] = { x: -40, y: 72, rot: 30 };
  s2.props[show.props[1].id] = { x: 40, y: 72, rot: -30 };

  // Set 3: winds two diagonal lines (company front feel), guard in front
  const s3 = { id: uid('s'), name: '3', counts: 24, note: '', pos: {}, props: {} };
  assign(s3, s2, winds.map((p, k) => {
    const half = Math.ceil(winds.length / 2), side = k < half ? -1 : 1, j = k < half ? k : k - half;
    return { x: side * (2 + j * 2), y: FH + 4 + j };
  }));
  batt.forEach((p, k) => { s3.pos[p.id] = { x: -11 + k * 2, y: BH }; });
  guard.forEach((p, k) => { s3.pos[p.id] = { x: -20 + k * 8, y: FH - 8 }; });
  s3.pos[dm.id] = { x: 0, y: -4 };
  s3.props[show.props[0].id] = { x: -40, y: 72, rot: 30 };
  s3.props[show.props[1].id] = { x: 40, y: 72, rot: -30 };
  show.sets.push(s2, s3);
  return normalizeShow(show);
}
