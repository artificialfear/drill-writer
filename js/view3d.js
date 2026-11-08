// Drill Writer — 3D view (watch-only). Loaded on demand the first time 3D is switched on.
// World units are steps, same as the 2D editor. Three.js mapping: X = x, Y = up, Z = FIELD_DEPTH/2 - y,
// so the front sideline (audience) is toward +Z.
import * as THREE from '../vendor/three-bundle.min.js';
import { FIELD_DEPTH, GOAL_X, END_X, refLines, sectionByKey, pathFrac, moveStep } from './model.js';
import { technique } from './technique.js';

const HALF_D = FIELD_DEPTH / 2;
const toZ = y => HALF_D - y;

// Camera presets: [position, target]
const CAMERAS = {
  press:    { name: 'Press box',     pos: [0, 98, 128], target: [0, 0, 6] },
  field:    { name: 'Field level',   pos: [0, 5, 78],   target: [0, 3, 0] },
  overhead: { name: 'Overhead',      pos: [0, 175, 0.1], target: [0, 0, 0] },
  side1:    { name: 'Side 1 end zone', pos: [-135, 34, 22], target: [-10, 0, 0] },
  backfield:{ name: 'Backfield',     pos: [0, 40, -120], target: [0, 0, 0] }
};
export const CAMERA_PRESETS = Object.entries(CAMERAS).map(([k, v]) => ({ key: k, name: v.name }));

// ---------- Field texture ----------
function fieldTexture(field, dark) {
  const pxPerStep = 12;
  const W = Math.round(END_X * 2 * pxPerStep), H = Math.round(FIELD_DEPTH * pxPerStep);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const X = x => (x + END_X) * pxPerStep;
  const Y = y => (FIELD_DEPTH - y) * pxPerStep; // canvas top = back sideline
  // mowing stripes every 5 yards
  for (let k = -12; k < 12; k++) {
    g.fillStyle = (k & 1) ? (dark ? '#25502f' : '#3f8a4a') : (dark ? '#2a5835' : '#45944f');
    g.fillRect(X(k * 8), 0, 8 * pxPerStep + 1, H);
  }
  // grass grain: thousands of tiny light/dark flecks (seeded, so the field looks the same every time)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 70000; k++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.05 + rnd() * 0.07})` : `rgba(190,230,140,${0.03 + rnd() * 0.05})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 2 + rnd() * 3);
  }
  g.fillStyle = dark ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.12)';
  g.fillRect(X(-END_X), 0, (END_X - GOAL_X) * pxPerStep, H);
  g.fillRect(X(GOAL_X), 0, (END_X - GOAL_X) * pxPerStep, H);
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.fillStyle = 'rgba(255,255,255,.92)';
  // yard lines
  for (let k = -10; k <= 10; k++) {
    g.lineWidth = (k === 0 || Math.abs(k) === 10) ? 6 : 4;
    g.beginPath(); g.moveTo(X(k * 8), Y(0)); g.lineTo(X(k * 8), Y(FIELD_DEPTH)); g.stroke();
  }
  // boundary
  g.lineWidth = 8; g.strokeRect(X(-END_X) + 4, 4, W - 8, H - 8);
  // hashes + sideline ticks every yard
  const refs = refLines(field);
  g.lineWidth = 3;
  for (let x = -GOAL_X; x <= GOAL_X + 1e-6; x += 1.6) {
    for (const hy of [refs[1].y, refs[2].y]) { g.beginPath(); g.moveTo(X(x), Y(hy - 0.4)); g.lineTo(X(x), Y(hy + 0.4)); g.stroke(); }
    g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), Y(0.9)); g.moveTo(X(x), Y(FIELD_DEPTH)); g.lineTo(X(x), Y(FIELD_DEPTH - 0.9)); g.stroke();
  }
  // numbers: front ones read from the audience, back ones upside-down like a real field
  g.font = `bold ${Math.round(3.4 * pxPerStep)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = -8; k <= 8; k += 2) {
    const n = String(50 - 5 * Math.abs(k));
    g.fillText(n, X(k * 8), Y(19.2));
    g.save(); g.translate(X(k * 8), Y(FIELD_DEPTH - 19.2)); g.rotate(Math.PI); g.fillText(n, 0, 0); g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------- People ----------
// Each marcher is built from simple shapes. Everything above the waist (jacket, arms, head, shako, instrument)
// is merged into ONE vertex-coloured mesh per instrument + skin tone, so 60+ marchers stay cheap to draw.
// The legs are separate pieces with hip, knee and ankle joints so the step can be animated.
// Sizes are in steps (1 step = 22.5"): a marcher is about 3 steps tall, hips at 1.5.
const HIP = 1.45, THIGH = 0.71, SHIN = 0.66, ANKLE = 0.08, LEG = THIGH + SHIN;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

const COL = {
  pants: '#1c1e24', shoe: '#0c0c0e', glove: '#f4f4f2', shako: '#17181c', gold: '#d4ad45', brass: '#d6ae48',
  silver: '#cfd5da', black: '#141414', white: '#f2f2f0', wood: '#7a5233', stick: '#e4cfa4', chrome: '#b9c0c6'
};
const SKIN = ['#f1c9a8', '#e2ae86', '#c78d60', '#9b6943', '#6c4630'];
const HAIR = ['#2b1d14', '#4a3020', '#161616', '#6b4a2b', '#b8894f'];

// colour every vertex of a geometry (merged meshes use vertex colours instead of separate materials)
function paint(g, color) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// put a geometry built along +Y (centred on the origin) between points a and b
function between(g, a, b) {
  const d = b.clone().sub(a);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}
const tube = (a, b, r, col, seg = 8) => paint(between(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), a, b), col);
const limb = (a, b, r, col) => paint(between(new THREE.CapsuleGeometry(r, Math.max(0.01, a.distanceTo(b)), 3, 8), a, b), col);
const ball = (p, r, col, sx = 1, sy = 1, sz = 1) => paint(new THREE.SphereGeometry(r, 12, 9).scale(sx, sy, sz).translate(p.x, p.y, p.z), col);
const box = (p, w, h, d, col) => paint(new THREE.BoxGeometry(w, h, d).translate(p.x, p.y, p.z), col);
// flared bell: narrow at `base`, opening `len` along `dir`
function bell(base, dir, len, rT, rM, col) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(rT + (rM - rT) * Math.pow(t, 3.2), len * t)); }
  const g = new THREE.LatheGeometry(pts, 16);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  return paint(g.translate(base.x, base.y, base.z), col);
}
// a drum: shell (open band) + white heads + hoops. axis 'y' = snare/tenor, 'x' = bass drum
function drum(c, r, h, shell, axis = 'y') {
  const turn = g => axis === 'x' ? g.rotateZ(Math.PI / 2) : g;
  const at = g => g.translate(c.x, c.y, c.z);
  const out = [
    paint(at(turn(new THREE.CylinderGeometry(r * 0.985, r * 0.985, h * 1.02, 20))), COL.white),
    paint(at(turn(new THREE.CylinderGeometry(r, r, h * 0.8, 20, 1, true))), shell)
  ];
  for (const s of [-1, 1]) {
    const hoop = new THREE.TorusGeometry(r, 0.022, 5, 22).rotateX(Math.PI / 2).translate(0, s * h / 2, 0);
    out.push(paint(at(turn(hoop)), COL.chrome));
  }
  return out;
}

const SH = { L: V(-0.3, 2.43, 0), R: V(0.3, 2.43, 0) };
const MOUTH = V(0, 2.7, 0.2);

// Instrument + where the hands go, per section. Front of the marcher is +Z.
function instrument(key, shell) {
  const g = [];
  let hands, elbows = null;
  const brassHorn = (s, bellR, reach, col = COL.brass) => {
    const end = V(0, 2.74, 0.3 + reach);
    g.push(tube(MOUTH, end, 0.022 * s, col));
    g.push(tube(V(0, 2.6, 0.32), V(0, 2.6, 0.18 + reach * 0.9), 0.022 * s, col));
    g.push(box(V(0, 2.66, 0.44), 0.07 * s, 0.15 * s, 0.13 * s, col));
    g.push(bell(end, V(0, 0.06, 1), 0.28 * s, 0.03 * s, bellR, col));
    hands = { L: V(-0.07, 2.66, 0.47), R: V(0.06, 2.7, 0.42) };
  };
  const sax = (s, dx) => {
    const top = V(dx * 0.4, 2.55, 0.3), bot = V(dx, 2.55 - 0.62 * s, 0.3);
    g.push(tube(MOUTH, top, 0.018, COL.brass));
    g.push(paint(between(new THREE.CylinderGeometry(0.05 * s, 0.032 * s, top.distanceTo(bot), 10), top, bot), COL.brass));
    g.push(ball(bot.clone().add(V(0.04 * s, -0.02, 0)), 0.065 * s, COL.brass));
    g.push(bell(bot.clone().add(V(0.09 * s, 0, 0)), V(0.25, 1, 0.3), 0.26 * s, 0.05 * s, 0.11 * s, COL.brass));
    hands = { L: V(dx * 0.45, 2.36, 0.36), R: V(dx * 0.85, 2.55 - 0.48 * s, 0.37) };
  };
  switch (key) {
    case 'trumpet': brassHorn(1, 0.1, 0.32); break;
    case 'mello': brassHorn(1.15, 0.15, 0.38); break;
    case 'baritone': brassHorn(1.45, 0.17, 0.36); hands.R = V(0.08, 2.66, 0.44); break;
    case 'trombone': {
      g.push(tube(MOUTH, V(-0.05, 2.76, 0.48), 0.022, COL.brass));
      g.push(bell(V(-0.05, 2.76, 0.48), V(0, 0.04, 1), 0.32, 0.03, 0.13, COL.brass));
      for (const x of [-0.03, 0.03]) g.push(tube(V(x, 2.62, 0.22), V(x, 2.62, 1.25), 0.014, COL.brass, 6));
      g.push(tube(V(-0.04, 2.62, 1.25), V(0.04, 2.62, 1.25), 0.016, COL.brass, 6));
      hands = { L: V(-0.07, 2.7, 0.34), R: V(0.07, 2.6, 0.86) };
      break;
    }
    case 'tuba': { // sousaphone: wraps over the left shoulder, bell above the head
      g.push(paint(new THREE.TorusGeometry(0.5, 0.065, 8, 26).rotateX(Math.PI / 2).rotateZ(-0.78).translate(0.02, 2.02, 0), COL.brass));
      g.push(box(V(0.17, 2.17, 0.36), 0.12, 0.2, 0.12, COL.brass));
      g.push(tube(MOUTH, V(0.1, 2.5, 0.34), 0.02, COL.brass));
      g.push(tube(V(-0.32, 2.52, -0.05), V(-0.08, 3.38, -0.24), 0.08, COL.brass));
      g.push(bell(V(-0.06, 3.4, -0.24), V(0, 0.2, 1), 0.48, 0.09, 0.47, COL.brass));
      hands = { L: V(-0.36, 2.22, 0.22), R: V(0.18, 2.2, 0.42) };
      break;
    }
    case 'flute': case 'piccolo': {
      const len = key === 'flute' ? 0.66 : 0.32;
      g.push(tube(V(-0.12, 2.71, 0.21), V(-0.12 + len, 2.67, 0.24), 0.016, COL.silver));
      hands = { L: V(0.0, 2.67, 0.25), R: V(-0.12 + len * 0.72, 2.66, 0.26) };
      elbows = { L: V(-0.2, 2.35, 0.32), R: V(0.42, 2.38, 0.08) };
      break;
    }
    case 'clarinet': {
      const end = V(0, 1.98, 0.52);
      g.push(tube(MOUTH, end, 0.026, COL.black));
      g.push(bell(end, end.clone().sub(MOUTH), 0.1, 0.028, 0.06, COL.black));
      hands = { L: V(0, 2.44, 0.33), R: V(0, 2.18, 0.43) };
      break;
    }
    case 'altosax': sax(1, 0.06); break;
    case 'tenorsax': sax(1.22, 0.12); break;
    case 'barisax': sax(1.45, 0.2); break;
    case 'snare': {
      g.push(...drum(V(0, 1.68, 0.44), 0.3, 0.26, shell));
      for (const s of [-1, 1]) {
        g.push(tube(V(s * 0.2, 2.32, 0.16), V(s * 0.16, 1.86, 0.3), 0.022, COL.chrome, 6));
        g.push(tube(V(s * 0.15, 1.96, 0.33), V(s * 0.05, 1.86, 0.62), 0.012, COL.stick, 5));
      }
      hands = { L: V(-0.15, 1.96, 0.33), R: V(0.15, 1.96, 0.33) };
      break;
    }
    case 'tenors': {
      for (const [x, z, r] of [[-0.33, 0.36, 0.17], [-0.12, 0.56, 0.15], [0.12, 0.56, 0.15], [0.33, 0.36, 0.17], [0, 0.78, 0.09]])
        g.push(...drum(V(x, 1.68, z), r, 0.22, shell));
      for (const s of [-1, 1]) {
        g.push(tube(V(s * 0.2, 2.32, 0.16), V(s * 0.2, 1.84, 0.26), 0.022, COL.chrome, 6));
        g.push(tube(V(s * 0.17, 1.94, 0.3), V(s * 0.1, 1.86, 0.58), 0.012, COL.stick, 5));
      }
      hands = { L: V(-0.17, 1.94, 0.3), R: V(0.17, 1.94, 0.3) };
      break;
    }
    case 'bass': {
      g.push(...drum(V(0, 1.72, 0.44), 0.44, 0.3, shell, 'x'));
      for (const s of [-1, 1]) {
        g.push(tube(V(s * 0.2, 2.32, 0.16), V(s * 0.1, 2.0, 0.3), 0.022, COL.chrome, 6));
        g.push(tube(V(s * 0.32, 1.8, 0.46), V(s * 0.24, 1.76, 0.52), 0.012, COL.stick, 5));
        g.push(ball(V(s * 0.22, 1.76, 0.53), 0.05, COL.white));
      }
      hands = { L: V(-0.33, 1.82, 0.45), R: V(0.33, 1.82, 0.45) };
      break;
    }
    case 'cymbal': {
      for (const s of [-1, 1]) g.push(paint(new THREE.CylinderGeometry(0.23, 0.23, 0.014, 22).rotateZ(Math.PI / 2).translate(s * 0.11, 2.08, 0.42), COL.gold));
      hands = { L: V(-0.16, 2.08, 0.42), R: V(0.16, 2.08, 0.42) };
      break;
    }
    case 'pit': {
      g.push(box(V(0, 1.42, 0.62), 1.8, 0.06, 0.5, COL.wood));
      for (let k = 0; k < 18; k++) g.push(box(V(-0.85 + k * 0.1, 1.46, 0.62), 0.07, 0.03, 0.42, '#9b6b44'));
      for (const x of [-0.85, 0.85]) for (const z of [0.42, 0.82]) g.push(tube(V(x, 0, z), V(x, 1.4, z), 0.025, COL.chrome, 6));
      for (const s of [-1, 1]) g.push(tube(V(s * 0.22, 1.58, 0.4), V(s * 0.16, 1.5, 0.66), 0.01, COL.stick, 5), ball(V(s * 0.16, 1.5, 0.67), 0.035, '#3a6ea5'));
      hands = { L: V(-0.22, 1.6, 0.4), R: V(0.22, 1.6, 0.4) };
      break;
    }
    case 'guard': { // the silk is a separate mesh so it can wave
      g.push(tube(V(0.36, 0.5, 0.28), V(0.36, 3.75, 0.28), 0.024, COL.chrome, 6));
      g.push(ball(V(0.36, 3.77, 0.28), 0.04, COL.chrome), ball(V(0.36, 0.48, 0.28), 0.04, COL.chrome));
      hands = { L: V(0.33, 2.32, 0.27), R: V(0.33, 1.72, 0.27) };
      elbows = { L: V(-0.08, 2.12, 0.28), R: V(0.42, 1.98, 0.08) };
      break;
    }
    case 'dm': // conducting
      hands = { L: V(-0.52, 2.92, 0.32), R: V(0.52, 2.92, 0.32) };
      elbows = { L: V(-0.6, 2.55, 0.12), R: V(0.6, 2.55, 0.12) };
      break;
    default:
      hands = { L: V(-0.34, 1.66, 0.06), R: V(0.34, 1.66, 0.06) };
  }
  return { geos: g, hands, elbows };
}

const upperCache = new Map();
function upperBody(sec, tone) {
  const key = `${sec.key}|${tone}`;
  if (upperCache.has(key)) return upperCache.get(key);
  const jacket = sec.color, trim = new THREE.Color(sec.color).multiplyScalar(0.62).getStyle();
  const skin = SKIN[tone], guard = sec.family === 'guard';
  const g = [];
  // jacket: tapered, flattened torso + shoulders + collar; belt; white cross-belt
  g.push(paint(new THREE.CylinderGeometry(0.3, 0.25, 0.92, 16).scale(1, 1, 0.62).translate(0, 2.0, 0), jacket));
  g.push(limb(V(-0.24, 2.4, 0), V(0.24, 2.4, 0), 0.11, jacket));
  g.push(paint(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 12).translate(0, 2.5, 0), trim));
  g.push(paint(new THREE.CylinderGeometry(0.262, 0.262, 0.07, 16).scale(1, 1, 0.64).translate(0, 1.6, 0), guard ? trim : COL.black));
  if (!guard) g.push(paint(new THREE.BoxGeometry(0.075, 0.95, 0.02).rotateZ(-0.62).translate(0, 2.02, 0.18), COL.white));
  // neck + head
  g.push(paint(new THREE.CylinderGeometry(0.075, 0.08, 0.16, 10).translate(0, 2.58, 0), skin));
  g.push(ball(V(0, 2.79, 0.02), 0.175, skin, 1, 1.12, 1.05));
  g.push(ball(V(0, 2.73, 0.2), 0.03, skin, 1, 1.2, 0.9)); // nose
  if (sec.family === 'guard') { // hair + bun instead of a shako
    g.push(paint(new THREE.SphereGeometry(0.185, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.12, 1.05).rotateX(-0.25).translate(0, 2.8, 0.0), HAIR[tone]));
    g.push(ball(V(0, 2.92, -0.16), 0.08, HAIR[tone]));
  } else { // shako, band, visor, chin strap, plume
    const dm = sec.family === 'dm';
    const tall = dm ? 0.42 : 0.34;
    g.push(paint(new THREE.CylinderGeometry(0.19, 0.17, tall, 16).translate(0, 2.92 + tall / 2, -0.01), dm ? COL.white : COL.shako));
    g.push(paint(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 16).translate(0, 2.96, -0.01), COL.gold));
    g.push(paint(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.9).rotateX(0.18).translate(0, 2.93, 0.06), COL.black));
    g.push(paint(new THREE.TorusGeometry(0.17, 0.008, 4, 16, Math.PI).rotateZ(Math.PI).translate(0, 2.82, 0.03), COL.gold));
    g.push(paint(new THREE.ConeGeometry(0.06, dm ? 0.55 : 0.38, 8).translate(0, 2.92 + tall + (dm ? 0.25 : 0.17), -0.02), dm ? COL.white : jacket));
    g.push(ball(V(0, 2.95 + tall * 0.6, 0.18), 0.04, COL.gold)); // shako plate
  }
  // arms from shoulders to hands, white gloves
  const ins = instrument(sec.key, trim);
  for (const s of ['L', 'R']) {
    const sh = SH[s], hd = ins.hands[s], sign = s === 'L' ? -1 : 1;
    const el = ins.elbows ? ins.elbows[s] : sh.clone().add(hd).multiplyScalar(0.5).add(V(sign * 0.13, -0.14, -0.04));
    g.push(limb(sh, el, 0.078, jacket));
    g.push(limb(el, hd, 0.066, jacket));
    g.push(ball(hd, 0.068, COL.glove, 1, 0.9, 1.15));
  }
  g.push(...ins.geos);
  const merged = THREE.mergeGeometries(g);
  g.forEach(x => x.dispose());
  merged.computeBoundingSphere();
  upperCache.set(key, merged);
  return merged;
}

const GEO = {
  pelvis: new THREE.CylinderGeometry(0.262, 0.25, 0.3, 14).scale(1, 1, 0.64).translate(0, 0.02, 0),
  thigh: new THREE.CapsuleGeometry(0.118, THIGH - 0.14, 3, 10).translate(0, -THIGH / 2, 0),
  shin: new THREE.CapsuleGeometry(0.092, SHIN - 0.1, 3, 10).translate(0, -SHIN / 2, 0),
  shoe: (() => { const g = new THREE.CapsuleGeometry(0.075, 0.24, 3, 8).rotateX(Math.PI / 2).scale(1, 0.75, 1).translate(0, -0.03, 0.07); return g; })(),
  shadow: new THREE.CircleGeometry(0.8, 24).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.72, 0.9, 28).rotateX(-Math.PI / 2)
};
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const MAT = {
  upper: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  pants: new THREE.MeshLambertMaterial({ color: COL.pants }),
  shoe: new THREE.MeshPhongMaterial({ color: COL.shoe, shininess: 60, specular: 0x444444 }),
  shadow: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  ring: new THREE.MeshBasicMaterial({ color: 0x8ab4f8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
};
const silkMats = new Map();
const silkMat = sec => {
  if (!silkMats.has(sec.key)) silkMats.set(sec.key, new THREE.MeshLambertMaterial({ color: new THREE.Color(sec.color), side: THREE.DoubleSide }));
  return silkMats.get(sec.key);
};

function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 56;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,24,22,.78)';
  g.beginPath(); g.roundRect(4, 6, 120, 44, 12); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 29);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }));
  sp.scale.set(2.2, 0.96, 1); sp.position.y = 4.35;
  return sp;
}
// stable "random" per performer (skin tone etc.)
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

function makeLeg(side) {
  const thigh = new THREE.Group(); thigh.position.set(side * 0.125, 0, 0);
  thigh.add(new THREE.Mesh(GEO.thigh, MAT.pants));
  const knee = new THREE.Group(); knee.position.y = -THIGH; thigh.add(knee);
  knee.add(new THREE.Mesh(GEO.shin, MAT.pants));
  const ankle = new THREE.Group(); ankle.position.y = -SHIN; knee.add(ankle);
  ankle.add(new THREE.Mesh(GEO.shoe, MAT.shoe));
  return { thigh, knee, ankle };
}

function buildPerson(p) {
  const sec = sectionByKey(p.section);
  const root = new THREE.Group(); root.userData.id = p.id;
  // body (whole marcher: turns for guard/DM, dips with the step) → hips (lower body: turns for slides) + upper body
  const body = new THREE.Group(); root.add(body);
  body.add(new THREE.Mesh(upperBody(sec, hash(p.id) % SKIN.length), MAT.upper));
  const hips = new THREE.Group(); hips.position.y = HIP; body.add(hips);
  hips.add(new THREE.Mesh(GEO.pelvis, MAT.pants));
  const L = makeLeg(-1), R = makeLeg(1);
  hips.add(L.thigh, R.thigh);
  if (sec.family === 'guard') {
    const geo = new THREE.PlaneGeometry(1.3, 0.85, 10, 3).translate(0.65, 0, 0);
    const silk = new THREE.Mesh(geo, silkMat(sec)); silk.position.set(0.37, 3.3, 0.28);
    silk.userData.base = Float32Array.from(geo.attributes.position.array);
    body.add(silk); root.userData.silk = silk;
  }
  const shadow = new THREE.Mesh(GEO.shadow, MAT.shadow); shadow.position.y = 0.03; shadow.renderOrder = 1; shadow.userData.noPick = true;
  const ring = new THREE.Mesh(GEO.ring, MAT.ring); ring.position.y = 0.05; ring.visible = false; ring.renderOrder = 2;
  const label = labelSprite(p.label);
  root.add(shadow, ring, label);
  root.userData.parts = { body, hips, L, R, ring, label };
  root.userData.family = sec.family;
  root.userData.yaw = { hips: 0, body: 0 };
  root.userData.pose = { tL: 0, kL: 0, fL: 0, zL: 0, tR: 0, kR: 0, fR: 0, zR: 0, y: 0 };
  root.userData.seed = (hash(p.id) % 1000) / 159;
  root.traverse(o => { o.userData.pid = p.id; });
  return root;
}

// ---------- Stepping ----------
// One step per count, left foot first. u = where one leg is in its 2-count cycle:
// 0 = heel lands (toe up, leg forward) → 0.5 = toe leaves the ground (leg back) → swings through → 1.
// Glide step: straight legs, toes high on the heel strike, roll through the foot.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function footAngle(u) { // angle of the foot to the ground: negative = toe up, positive = heel up
  if (u < 0.14) return lerp(-0.6, 0, u / 0.14);
  if (u < 0.36) return 0;
  if (u < 0.5) return lerp(0, 0.55, (u - 0.36) / 0.14);
  if (u < 0.68) return lerp(0.55, 0.1, (u - 0.5) / 0.18);
  return lerp(0.1, -0.6, (u - 0.68) / 0.32);
}
function legPose(u, A, back) {
  if (back) u = (1 - u) % 1; // backward march = the forward cycle run in reverse
  const th = A * Math.cos(2 * Math.PI * u); // hip angle, + = leg forward
  const kn = u > 0.5 ? (back ? 0.5 : 0.85) * A * Math.sin(2 * Math.PI * (u - 0.5)) : 0;
  const fa = back ? 0.45 : footAngle(u); // backward: up on the toes
  return { th, kn, ft: fa + th - kn, stance: u <= 0.5 };
}
// steps = counts stepped so far in this move; per = steps (8-to-5) covered each count
function gait(kind, steps, per) {
  const A = Math.asin(clamp(per / (2 * LEG), 0.06, 0.62));
  const uL = (((steps - 1) % 2) + 2) % 2 / 2, uR = (((steps) % 2) + 2) % 2 / 2;
  if (kind === 'crab') { // battery crab step: legs swing side to side, the trailing leg crosses in front
    const s = Math.sin(Math.PI * steps);
    const z = A * 0.9 * s;
    return { tL: 0.1 * Math.max(0, s), kL: 0.05, fL: -0.1 * Math.max(0, s), zL: z, tR: 0.1 * Math.max(0, -s), kR: 0.05, fR: -0.1 * Math.max(0, -s), zR: z,
      y: -LEG * (1 - Math.cos(z)) };
  }
  const back = kind === 'backward';
  const l = legPose(uL, A, back), r = legPose(uR, A, back);
  const stanceTh = l.stance && r.stance ? Math.max(Math.abs(l.th), Math.abs(r.th)) : l.stance ? Math.abs(l.th) : Math.abs(r.th);
  return { tL: l.th, kL: l.kn, fL: l.ft, zL: 0, tR: r.th, kR: r.kn, fR: r.ft, zR: 0, y: -LEG * (1 - Math.cos(stanceTh)) + (back ? 0.07 : 0) };
}
const REST = { tL: 0, kL: 0, fL: 0, zL: 0, tR: 0, kR: 0, fR: 0, zR: 0, y: 0 };
function applyPose(g, target, snap) {
  const p = g.userData.pose;
  for (const k in p) p[k] = snap ? target[k] : lerp(p[k], target[k], 0.3);
  const { body, L, R } = g.userData.parts;
  // three.js: +rotation.x swings a hanging leg backward, so forward = negative
  L.thigh.rotation.set(-p.tL, 0, p.zL); L.knee.rotation.x = p.kL; L.ankle.rotation.x = p.fL;
  R.thigh.rotation.set(-p.tR, 0, p.zR); R.knee.rotation.x = p.kR; R.ankle.rotation.x = p.fR;
  body.position.y = p.y;
}
function waveSilk(silk, t) {
  const pos = silk.geometry.attributes.position, base = silk.userData.base;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const w = x / 1.3;
    pos.array[i * 3 + 2] = Math.sin(t * 3.2 - x * 4.2 + y * 1.5) * 0.17 * w;
    pos.array[i * 3 + 1] = y - w * w * 0.08;
  }
  pos.needsUpdate = true;
  silk.geometry.computeVertexNormals();
}

const PROP_HEIGHT = { panel: 3.6, riser: 1.2, equip: 0.25, other: 2 };
function buildProp(prop) {
  const h = PROP_HEIGHT[prop.kind] ?? 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(prop.w, h, prop.h).translate(0, h / 2, 0),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(prop.color || '#9aa5b1') })
  );
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x222222 }));
  mesh.add(edges);
  return mesh;
}

// ease a rotation toward its target along the shortest way round
function turnToward(cur, target) {
  let d = target - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) < 0.01 ? target : cur + d * 0.25;
}

// ---------- View ----------
export function create3D(container, { getFrame, onPick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  let followLast = null, followSide = null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 6; controls.maxDistance = 400;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-60, 120, 80); scene.add(sun);

  // ground apron + field
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(END_X * 2 + 400, FIELD_DEPTH + 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2f5a36 }));
  apron.position.y = -0.02; scene.add(apron);
  const track = new THREE.Mesh(new THREE.PlaneGeometry(END_X * 2 + 30, FIELD_DEPTH + 30).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8c4a3a }));
  track.position.y = -0.01; scene.add(track);
  const fieldMesh = new THREE.Mesh(new THREE.PlaneGeometry(END_X * 2, FIELD_DEPTH).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial());
  scene.add(fieldMesh);
  let fieldKey = '';

  const people = new Map(); let peopleKey = '';
  const props = new Map(); let propsKey = '';
  const peopleGroup = new THREE.Group(), propGroup = new THREE.Group();
  // "this is you" marker for the student view
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 16).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xff8a00, toneMapped: false }));
  pointer.visible = false; scene.add(pointer);
  scene.add(peopleGroup, propGroup);

  function setCamera(key) {
    followLast = null;
    if (!key) return; // re-aim the follow camera on the next frame
    const c = CAMERAS[key] || CAMERAS.press;
    camera.position.set(...c.pos); controls.target.set(...c.target); controls.update();
  }
  setCamera('press');

  function syncField(show, dark) {
    const key = `${show.field.hash}|${dark}`;
    if (key === fieldKey) return;
    fieldKey = key;
    if (fieldMesh.material.map) fieldMesh.material.map.dispose();
    fieldMesh.material.map = fieldTexture(show.field, dark); fieldMesh.material.needsUpdate = true;
    scene.background = new THREE.Color(dark ? 0x10151c : 0xbcd3e6);
    apron.material.color.set(dark ? 0x16261a : 0x2f5a36);
    track.material.color.set(dark ? 0x4a2a22 : 0x8c4a3a);
  }
  function syncPeople(show) {
    const key = show.performers.map(p => `${p.id}:${p.section}:${p.label}`).join('|');
    if (key === peopleKey) return;
    peopleKey = key;
    for (const g of people.values()) { peopleGroup.remove(g); g.userData.parts.label.material.map.dispose(); g.userData.parts.label.material.dispose(); }
    people.clear();
    for (const p of show.performers) { const g = buildPerson(p); people.set(p.id, g); peopleGroup.add(g); }
  }
  function syncProps(show) {
    const key = show.props.map(p => `${p.id}:${p.kind}:${p.w}:${p.h}:${p.color}`).join('|');
    if (key === propsKey) return;
    propsKey = key;
    for (const m of props.values()) { propGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
    props.clear();
    for (const p of show.props) { const m = buildProp(p); props.set(p.id, m); propGroup.add(m); }
  }

  function update() {
    const f = getFrame(); if (!f) return;
    const { show, frame, count, sel, selProp, labels, dark, follow, followFrom } = f;
    syncField(show, dark); syncPeople(show); syncProps(show);
    const A = show.sets[frame.i], B = show.sets[Math.min(frame.i + 1, show.sets.length - 1)];
    const inMotion = frame.frac > 0;
    const local = inMotion ? frame.frac * (B.counts || 0) : 0; // counts into this move
    const now = performance.now() / 1000;
    for (const p of show.performers) {
      const g = people.get(p.id); if (!g) continue;
      const q = frame.pos[p.id];
      g.position.set(q.x, 0, toZ(q.y));
      const { body, hips, ring, label } = g.userData.parts;
      // stepping only while actually moving (not during a hold before or after)
      const pf = inMotion ? pathFrac(show, frame.i + 1, p.id, frame.frac) : 0;
      const moving = inMotion && pf > 0 && pf < 1 && Math.hypot(B.pos[p.id].x - A.pos[p.id].x, B.pos[p.id].y - A.pos[p.id].y) > 0.05;
      // technique for this move: winds slide (hips toward travel, torso to the box), battery crab step,
      // guard/DM turn their whole body; moving backward = hips away from travel, stepping back
      const t = moving ? technique(g.userData.family, A.pos[p.id], B.pos[p.id]) : null;
      const yaw = g.userData.yaw;
      yaw.hips = turnToward(yaw.hips, t ? t.hipYaw : 0);
      yaw.body = turnToward(yaw.body, t ? t.bodyYaw : 0);
      hips.rotation.y = yaw.hips; body.rotation.y = yaw.body;
      if (t && t.legs !== 'still') {
        const mv = moveStep(show, frame.i + 1, p.id);
        applyPose(g, gait(t.legs, local - (mv ? mv.pre : 0), mv && mv.per ? mv.per : 1), true);
      } else applyPose(g, REST, false);
      ring.visible = sel.has(p.id);
      label.visible = labels || sel.has(p.id);
      if (g.userData.silk) waveSilk(g.userData.silk, now + g.userData.seed);
    }
    // follow one performer (student view): move camera + orbit target along with them
    if (follow && frame.pos[follow]) {
      const q = frame.pos[follow], tgt = new THREE.Vector3(q.x, 1.6, toZ(q.y));
      pointer.visible = true; pointer.position.set(q.x, 5.2 + Math.sin(performance.now() / 300) * 0.15, toZ(q.y));
      if (!followLast || followFrom !== followSide) {
        // performer: just behind and above the marcher, looking toward the audience; director: from the front
        followSide = followFrom;
        controls.target.copy(tgt);
        if (followFrom === "performer") camera.position.set(tgt.x, 15, tgt.z - 12);
        else camera.position.set(tgt.x, 24, tgt.z + 38);
      }
      else { const d = tgt.clone().sub(followLast); camera.position.add(d); controls.target.add(d); }
      followLast = tgt;
    } else { followLast = null; pointer.visible = false; }
    for (const prop of show.props) {
      const m = props.get(prop.id), pp = frame.props[prop.id]; if (!m || !pp) continue;
      m.position.set(pp.x, 0, toZ(pp.y));
      m.rotation.y = -(pp.rot || 0) * Math.PI / 180;
      m.children[0].material.color.set(selProp === prop.id ? 0x1a73e8 : 0x222222);
    }
  }

  let visible = false;
  function loop() { controls.update(); update(); renderer.render(scene, camera); }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    // keep the whole field in frame on narrow screens
    camera.fov = w / h < 1.2 ? 55 : 40;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  // click (not drag) on a person → select them
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(peopleGroup.children, true).filter(h => h.object.isMesh && h.object.userData.pid && !h.object.userData.noPick);
    onPick(hits.length ? hits[0].object.userData.pid : null, e.shiftKey || e.ctrlKey || e.metaKey);
  });

  return {
    show() { visible = true; container.hidden = false; resize(); renderer.setAnimationLoop(loop); },
    hide() { visible = false; container.hidden = true; renderer.setAnimationLoop(null); },
    setCamera,
    lookFrom(pos, target) { followLast = null; camera.position.set(...pos); controls.target.set(...target); controls.update(); },
    get visible() { return visible; }
  };
}
