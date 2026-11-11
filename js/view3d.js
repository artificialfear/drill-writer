// Drill Writer — 3D view (watch-only). Loaded on demand the first time 3D is switched on.
// World units are steps, same as the 2D editor. Three.js mapping: X = x, Y = up, Z = FIELD_DEPTH/2 - y,
// so the front sideline (audience) is toward +Z.
import * as THREE from '../vendor/three-bundle.min.js';
import { FIELD_DEPTH, GOAL_X, END_X, refLines, sectionByKey, pathFrac, moveStep, lookFrame, facingByKey } from './model.js';
import { technique, bassFacing, legsFor } from './technique.js';

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

// Band uniform: black jacket with a teal yoke and shoulder pads, a silver diagonal band, black pants,
// teal shako with silver trim and a teal feather plume. Everyone wears the same uniform.
const COL = {
  teal: '#1fa3a6', tealDark: '#147b7e', tealLight: '#4cc4c4', black: '#121315', silver: '#c9ced3', silverDark: '#8e959b',
  pants: '#141518', shoe: '#0a0a0b', visor: '#0b0b0c', brass: '#d6ae48', bronze: '#c9a24a',
  flute: '#d3d8dc', white: '#f2f2f0', head: '#e9e9e4', wood: '#7a5233', stick: '#e4cfa4', chrome: '#c3c9ce',
  shell: '#16171a', felt: '#f3f3f0'
};
const METAL = new Set([COL.brass, COL.bronze, COL.chrome, COL.flute]); // these get the shiny metal material
const SKIN = ['#f1c9a8', '#e2ae86', '#c78d60', '#9b6943', '#6c4630'];
const HAIR = ['#2b1d14', '#4a3020', '#161616', '#6b4a2b', '#b8894f'];

// colour every vertex of a geometry (merged meshes use vertex colours instead of separate materials).
// `color` can be a function of a triangle's centre (x, y, z) → colour, for patterned pieces like the jacket.
function paint(g, color) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.position.count, a = new Float32Array(n * 3), p = g.attributes.position.array;
  const fixed = typeof color === 'function' ? null : new THREE.Color(color), cache = new Map();
  for (let t = 0; t < n; t += 3) {
    let c = fixed;
    if (!c) {
      const cx = (p[t * 3] + p[t * 3 + 3] + p[t * 3 + 6]) / 3, cy = (p[t * 3 + 1] + p[t * 3 + 4] + p[t * 3 + 7]) / 3, cz = (p[t * 3 + 2] + p[t * 3 + 5] + p[t * 3 + 8]) / 3;
      const hex = color(cx, cy, cz);
      if (!cache.has(hex)) cache.set(hex, new THREE.Color(hex));
      c = cache.get(hex);
    }
    for (let k = 0; k < 3 && t + k < n; k++) { a[(t + k) * 3] = c.r; a[(t + k) * 3 + 1] = c.g; a[(t + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (typeof color === 'string' && METAL.has(color)) g.userData.metal = true;
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
// small balls (eyes, ears, stick tips…) use fewer facets — nobody can see the difference at that size
const ball = (p, r, col, sx = 1, sy = 1, sz = 1) => { const n = r < 0.05 ? [7, 5] : r < 0.1 ? [10, 7] : [14, 10]; return paint(new THREE.SphereGeometry(r, n[0], n[1]).scale(sx, sy, sz).translate(p.x, p.y, p.z), col); };
const box = (p, w, h, d, col) => paint(new THREE.BoxGeometry(w, h, d).translate(p.x, p.y, p.z), col);
// flared bell: narrow at `base`, opening `len` along `dir`
function bell(base, dir, len, rT, rM, col) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(rT + (rM - rT) * Math.pow(t, 3.2), len * t)); }
  const g = new THREE.LatheGeometry(pts, 16);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  return paint(g.translate(base.x, base.y, base.z), col);
}
// a drum: black shell, white heads, chrome hoops + lugs. axis 'y' = snare/tenor (heads up), 'x' = bass drum (heads to the sides)
function drum(c, r, h, axis = 'y', head = COL.head) {
  const turn = g => axis === 'x' ? g.rotateZ(Math.PI / 2) : g;
  const at = g => g.translate(c.x, c.y, c.z);
  const out = [
    paint(at(turn(new THREE.CylinderGeometry(r * 0.98, r * 0.98, h, 24))), head),
    paint(at(turn(new THREE.CylinderGeometry(r, r, h * 0.9, 24, 1, true))), COL.shell)
  ];
  for (const s of [-1, 1]) {
    const hoop = new THREE.TorusGeometry(r, 0.024, 4, 20).rotateX(Math.PI / 2).translate(0, s * h * 0.47, 0);
    out.push(paint(at(turn(hoop)), COL.chrome));
  }
  // tension rods down the shell
  const rods = Math.max(6, Math.round(r * 32));
  for (let k = 0; k < rods; k++) {
    const a = k / rods * Math.PI * 2;
    const rod = new THREE.CylinderGeometry(0.009, 0.009, h * 0.9, 4).translate(Math.cos(a) * (r + 0.012), 0, Math.sin(a) * (r + 0.012));
    out.push(paint(at(turn(rod)), COL.chrome));
  }
  return out;
}
// a stick held in the hand: a little of the butt end shows behind the hand, the tip points at `tip`
function stick(hand, tip, col = COL.stick, r = 0.013) {
  const d = tip.clone().sub(hand).normalize();
  const butt = hand.clone().addScaledVector(d, -0.13);
  return [tube(butt, tip, r, col, 6), ball(tip, r * 1.5, col)];
}

// Marcher's own right is −X (the front of a marcher faces +Z, toward the audience).
const SH = { L: V(-0.3, 2.43, 0), R: V(0.3, 2.43, 0) }; // L = the shoulder on −X (marcher's right), R = +X
const MOUTH = V(0, 2.7, 0.2);
const NECK_Y = 2.62; // the head turns about this point
const BASS_R = [0.4, 0.44, 0.49, 0.53, 0.58]; // bass 1–5: about 18", 20", 22", 24", 26"

// Instrument + where the hands go, per section.
function instrument(key, opts = {}) {
  const g = [];
  let hands, elbows = null;
  const brassHorn = (s, bellR, reach) => {
    const end = V(0, 2.74, 0.3 + reach);
    g.push(tube(MOUTH, end, 0.022 * s, COL.brass));
    g.push(tube(V(0, 2.6, 0.32), V(0, 2.6, 0.18 + reach * 0.9), 0.022 * s, COL.brass));
    g.push(box(V(0, 2.66, 0.44), 0.07 * s, 0.15 * s, 0.13 * s, COL.brass));
    g.push(bell(end, V(0, 0.06, 1), 0.28 * s, 0.03 * s, bellR, COL.brass));
    hands = { L: V(-0.06, 2.7, 0.42), R: V(0.07, 2.66, 0.47) };
  };
  const sax = (s, dx) => { // held on the marcher's right side
    const top = V(dx * 0.4, 2.55, 0.3), bot = V(dx, 2.55 - 0.62 * s, 0.3);
    g.push(tube(MOUTH, top, 0.018, COL.brass));
    g.push(paint(between(new THREE.CylinderGeometry(0.05 * s, 0.032 * s, top.distanceTo(bot), 10), top, bot), COL.brass));
    g.push(ball(bot.clone().add(V(-0.04 * s, -0.02, 0)), 0.065 * s, COL.brass));
    g.push(bell(bot.clone().add(V(-0.09 * s, 0, 0)), V(-0.25, 1, 0.3), 0.26 * s, 0.05 * s, 0.11 * s, COL.brass));
    hands = { L: V(dx * 0.85, 2.55 - 0.48 * s, 0.37), R: V(dx * 0.45, 2.36, 0.36) };
  };
  switch (key) {
    case 'trumpet': brassHorn(1, 0.1, 0.32); break;
    case 'mello': brassHorn(1.15, 0.15, 0.38); break;
    case 'baritone': brassHorn(1.45, 0.17, 0.36); hands.L = V(-0.08, 2.66, 0.44); break;
    case 'trombone': {
      g.push(tube(MOUTH, V(0.05, 2.76, 0.48), 0.022, COL.brass));
      g.push(bell(V(0.05, 2.76, 0.48), V(0, 0.04, 1), 0.32, 0.03, 0.13, COL.brass));
      for (const x of [-0.03, 0.03]) g.push(tube(V(x, 2.62, 0.22), V(x, 2.62, 1.25), 0.014, COL.brass, 6));
      g.push(tube(V(-0.04, 2.62, 1.25), V(0.04, 2.62, 1.25), 0.016, COL.brass, 6));
      hands = { L: V(-0.07, 2.6, 0.86), R: V(0.07, 2.7, 0.34) }; // right hand on the slide, left holds the bell section
      break;
    }
    case 'tuba': { // sousaphone: rests on the left shoulder, valves on the right, bell above the head
      g.push(paint(new THREE.TorusGeometry(0.5, 0.065, 8, 26).rotateX(Math.PI / 2).rotateZ(0.78).translate(-0.02, 2.02, 0), COL.brass));
      g.push(box(V(-0.17, 2.17, 0.36), 0.12, 0.2, 0.12, COL.brass));
      g.push(tube(MOUTH, V(-0.1, 2.5, 0.34), 0.02, COL.brass));
      g.push(tube(V(0.32, 2.52, -0.05), V(0.08, 3.52, -0.26), 0.08, COL.brass));
      g.push(bell(V(0.06, 3.55, -0.26), V(0, 0.2, 1), 0.48, 0.09, 0.47, COL.brass)); // clears the shako
      hands = { L: V(-0.18, 2.2, 0.42), R: V(0.36, 2.22, 0.22) };
      break;
    }
    case 'flute': case 'piccolo': { // played out to the marcher's right (−X), angled slightly down
      // real lengths: flute ≈ 26½" (1.18 steps), piccolo ≈ 12½" (0.56 steps); the closed end sticks out a little past the mouth
      const flute = key === 'flute', len = flute ? 1.18 : 0.56;
      const a = V(0.12, 2.71, 0.21), b = V(0.12 - len, flute ? 2.6 : 2.66, flute ? 0.26 : 0.23);
      const at = d => a.clone().lerp(b, d / len); // a point d steps along the flute from the closed end
      g.push(tube(a, b, flute ? 0.017 : 0.014, COL.flute));
      g.push(box(at(0.12).add(V(0, 0.016, 0)), 0.05, 0.006, 0.035, COL.flute)); // lip plate
      for (const d of (flute ? [0.42, 0.5, 0.58, 0.72, 0.8, 0.88] : [0.24, 0.29, 0.34, 0.42, 0.47])) g.push(ball(at(d).add(V(0, 0.017, 0)), 0.012, COL.flute)); // keys
      // left hand (+X) a few inches down from the lip plate, right hand (−X) further along on the lower keys
      hands = { L: at(flute ? 0.82 : 0.44).add(V(0, -0.03, 0.01)), R: at(flute ? 0.47 : 0.28).add(V(0, -0.035, 0.02)) };
      elbows = { L: V(-0.5, 2.3, 0.14), R: V(0.16, 2.28, 0.32) };
      break;
    }
    case 'clarinet': {
      const end = V(0, 1.98, 0.52);
      g.push(tube(MOUTH, end, 0.026, COL.black));
      g.push(bell(end, end.clone().sub(MOUTH), 0.1, 0.028, 0.06, COL.black));
      hands = { L: V(0, 2.18, 0.43), R: V(0, 2.44, 0.33) };
      break;
    }
    case 'altosax': sax(1, -0.06); break;
    case 'tenorsax': sax(1.22, -0.12); break;
    case 'barisax': sax(1.45, -0.2); break;
    case 'snare': { // 14" × 12" marching snare, top head at the belly; sticks in a V meeting near the middle of the head
      const r = 0.31, h = 0.53, top = 1.84, c = V(0, top - h / 2, 0.2 + r + 0.05);
      g.push(...drum(c, r, h));
      for (const s of [-1, 1]) g.push(tube(V(s * 0.13, 2.38, 0.17), V(s * 0.1, 2.02, 0.22), 0.022, COL.chrome, 6));
      g.push(box(V(0, 2.02, 0.22), 0.26, 0.04, 0.05, COL.chrome), tube(V(0, 2.02, 0.24), V(0, top + 0.02, c.z - r + 0.02), 0.024, COL.chrome, 6));
      if (opts.down) { // sticks in: hands at the rim, sticks pointing down along the sides of the drum
        hands = { L: V(-0.33, top + 0.02, 0.4), R: V(0.33, top + 0.02, 0.4) };
        for (const s of [-1, 1]) g.push(...stick(hands[s < 0 ? 'L' : 'R'], V(s * 0.37, top - 0.42, 0.52)));
      } else {
        hands = { L: V(-0.29, top + 0.15, 0.36), R: V(0.29, top + 0.15, 0.36) };
        for (const s of [-1, 1]) g.push(...stick(hands[s < 0 ? 'L' : 'R'], V(s * 0.04, top + 0.035, c.z + 0.06)));
      }
      break;
    }
    case 'tenors': { // quints (top-down like a real carrier): 13" and 14" out at the sides, 10" and 12" in front,
      // and the small 6" drum in the middle closest to the marcher
      const top = 1.7;
      const drums = [[-0.65, 0.66, 0.29, 0.46], [0.65, 0.64, 0.31, 0.47], [-0.27, 1.01, 0.22, 0.4], [0.23, 1.03, 0.25, 0.42], [0, 0.6, 0.15, 0.3]];
      for (const [x, z, r, h] of drums) g.push(...drum(V(x, top - h / 2, z), r, h, 'y', '#d9dadc'));
      for (const s of [-1, 1]) g.push(tube(V(s * 0.13, 2.38, 0.17), V(s * 0.12, 1.95, 0.24), 0.022, COL.chrome, 6));
      g.push(box(V(0, 1.95, 0.25), 0.32, 0.04, 0.05, COL.chrome), tube(V(0, 1.95, 0.27), V(0, top - 0.12, 0.4), 0.026, COL.chrome, 6));
      // bar the drums hang from: across the back, out to the side drums
      g.push(tube(V(-0.45, top - 0.12, 0.42), V(0.45, top - 0.12, 0.42), 0.02, COL.chrome, 6));
      for (const s of [-1, 1]) g.push(tube(V(s * 0.45, top - 0.12, 0.42), V(s * 0.5, top - 0.12, 0.62), 0.02, COL.chrome, 6));
      if (opts.down) {
        hands = { L: V(-0.3, top + 0.03, 0.34), R: V(0.3, top + 0.03, 0.34) };
        for (const s of [-1, 1]) g.push(...stick(hands[s < 0 ? 'L' : 'R'], V(s * 0.27, top + 0.06, 0.82)));
      } else {
        hands = { L: V(-0.34, top + 0.17, 0.48), R: V(0.34, top + 0.17, 0.48) };
        for (const s of [-1, 1]) g.push(...stick(hands[s < 0 ? 'L' : 'R'], V(s * 0.12, top + 0.05, 0.92)));
      }
      break;
    }
    case 'bass': { // heads face the sides, drum high on the chest; size from the bass number (1 smallest … 5 largest)
      const r = BASS_R[(opts.bass || 3) - 1], w = 0.56, c = V(0, 2.04, 0.2 + r + 0.06);
      g.push(...drum(c, r, w, 'x', COL.white));
      for (const s of [-1, 1]) g.push(tube(V(s * 0.16, 2.4, 0.17), V(s * 0.14, c.y + r * 0.35, c.z - r + 0.04), 0.022, COL.chrome, 6));
      const dy = opts.down ? -0.3 : -0.06; // mallets in: hands lower, mallet heads down by the bottom of the drum
      hands = { L: V(-(w / 2 + 0.14), c.y + dy, c.z), R: V(w / 2 + 0.14, c.y + dy, c.z) };
      for (const s of [-1, 1]) {
        const tip = opts.down ? V(s * (w / 2 + 0.12), c.y + dy - 0.32, c.z + 0.1) : V(s * (w / 2 + 0.07), c.y + 0.16, c.z + 0.05);
        g.push(...stick(hands[s < 0 ? 'L' : 'R'], tip, COL.stick, 0.014), ball(tip, 0.075, COL.felt, 0.8, 1, 1));
      }
      break;
    }
    case 'cymbal': {
      if (opts.down) { // plates down at the sides
        for (const s of [-1, 1]) g.push(paint(new THREE.CylinderGeometry(0.23, 0.23, 0.014, 22).rotateZ(Math.PI / 2).translate(s * 0.4, 1.66, 0.12), COL.bronze));
        hands = { L: V(-0.36, 1.66, 0.12), R: V(0.36, 1.66, 0.12) };
      } else {
        for (const s of [-1, 1]) g.push(paint(new THREE.CylinderGeometry(0.23, 0.23, 0.014, 22).rotateZ(Math.PI / 2).translate(s * 0.11, 2.08, 0.42), COL.bronze));
        hands = { L: V(-0.16, 2.08, 0.42), R: V(0.16, 2.08, 0.42) };
      }
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
    case 'guard': // the flag (pole + silk) and arms are posed every frame (see FLAG_POSES)
      hands = { L: V(-0.34, 1.66, 0.06), R: V(0.34, 1.66, 0.06) };
      break;
    case 'dm': // conducting
      hands = { L: V(-0.52, 2.92, 0.32), R: V(0.52, 2.92, 0.32) };
      elbows = { L: V(-0.6, 2.55, 0.12), R: V(0.6, 2.55, 0.12) };
      break;
    default:
      hands = { L: V(-0.34, 1.66, 0.06), R: V(0.34, 1.66, 0.06) };
  }
  return { geos: g, hands, elbows };
}

// Sequinned guard sash: each little facet catches the light a bit differently
const SEQUIN = ['#1fa3a6', '#2bbcbb', '#168486', '#62d8d2', '#127072', '#3fcac6'];
function sequins(x, y, z) {
  const h = Math.abs(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453) % 1;
  return SEQUIN[Math.floor(h * SEQUIN.length)];
}
// ---------- Band jacket (shared by every wind, battery, pit player and the drum major) ----------
// A lathe-turned torso with a real shape — chest, waist, and a hem that flares over the hips —
// wearing the uniform pattern as a texture, so the edges of the yoke and the silver band stay crisp.
// Front: teal yoke across the shoulders and down the marcher's left side, split from the black by a silver
// band running from the right shoulder down to the left hip (with thin silver piping). Back: teal yoke.
function jacketColor(x, y, z) {
  if (z < -0.03) return y > 2.28 ? COL.teal : Math.abs(y - 2.28) < 0.012 ? COL.silver : COL.black;
  const ax = -0.3, ay = 2.3, bx = 0.3, by = 1.62; // band: marcher's right shoulder → left hip
  const nx = -(by - ay), ny = bx - ax, len = Math.hypot(nx, ny);
  const d = ((x - ax) * nx + (y - ay) * ny) / len; // > 0 above the line
  if (Math.abs(d) < 0.034) return Math.abs(d) > 0.026 ? COL.silverDark : COL.silver;
  return d > 0 ? COL.teal : COL.black;
}
const JACKET_PROFILE = [ // [radius, height] from the hem up to the collar
  [0.2, 1.3], [0.278, 1.31], [0.272, 1.42], [0.255, 1.56], [0.24, 1.68], [0.245, 1.8], [0.272, 1.98],
  [0.296, 2.15], [0.302, 2.28], [0.292, 2.38], [0.25, 2.45], [0.17, 2.5], [0.1, 2.53]
];
const JACKET_DEPTH = 0.62; // the torso is flattened front to back
function profileAt(v) { // v in 0..1 along the profile (matches the lathe's own spacing once densified)
  const n = JACKET_DENSE.length - 1, f = v * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  return [JACKET_DENSE[i][0] + (JACKET_DENSE[i + 1][0] - JACKET_DENSE[i][0]) * t, JACKET_DENSE[i][1] + (JACKET_DENSE[i + 1][1] - JACKET_DENSE[i][1]) * t];
}
const JACKET_DENSE = (() => { // smooth the profile (Catmull-Rom) into evenly many points
  const pts = JACKET_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const c = new THREE.SplineCurve(pts);
  return c.getPoints(30).map(p => [p.x, p.y]);
})();
let jacketGeo = null, jacketMat = null;
function jacket() {
  if (jacketGeo) return { geo: jacketGeo, mat: jacketMat };
  const pts = JACKET_DENSE.map(([r, y]) => new THREE.Vector2(r, y));
  jacketGeo = new THREE.LatheGeometry(pts, 40).scale(1, 1, JACKET_DEPTH); // the pattern is a texture, so the mesh can be light
  jacketGeo.computeVertexNormals();
  // paint the texture: every pixel is a point on the jacket (u = around, v = up the profile)
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), rgb = {};
  for (const hex of [COL.teal, COL.black, COL.silver, COL.silverDark]) {
    const n = parseInt(hex.slice(1), 16); rgb[hex] = [n >> 16, (n >> 8) & 255, n & 255];
  }
  for (let py = 0; py < H; py++) {
    const [r, y] = profileAt(1 - (py + 0.5) / H);
    for (let px = 0; px < W; px++) {
      const phi = (px + 0.5) / W * Math.PI * 2;
      const c = rgb[jacketColor(r * Math.sin(phi), y, r * Math.cos(phi) * JACKET_DEPTH)];
      const o = (py * W + px) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  jacketMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.05, envMapIntensity: 0.7 }); // satin
  return { geo: jacketGeo, mat: jacketMat };
}

// A plume: dozens of thin, tapered, curving feathers rising from the front of the crown and leaning back.
function feather(base, tip, bend, r, col) {
  const curve = new THREE.QuadraticBezierCurve3(base, base.clone().lerp(tip, 0.5).add(bend), tip);
  const segs = 5, rad = 3, g = new THREE.TubeGeometry(curve, segs, r, rad, false), p = g.attributes.position;
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs), k = 1 - 0.8 * (i / segs);
    for (let j = 0; j <= rad; j++) {
      const v = i * (rad + 1) + j;
      p.setXYZ(v, c.x + (p.getX(v) - c.x) * k, c.y + (p.getY(v) - c.y) * k, c.z + (p.getZ(v) - c.z) * k);
    }
  }
  g.computeVertexNormals();
  return paint(g, col);
}
function plume(top, scale, seed) {
  let s = seed || 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out = [], base = V(0, top - 0.01, 0.1);
  out.push(paint(new THREE.CylinderGeometry(0.035, 0.05, 0.08, 8).translate(base.x, base.y + 0.02, base.z), COL.black)); // holder
  const shades = [COL.teal, COL.tealLight, COL.tealDark, COL.teal, '#2bb8b6'];
  // a soft, full core so it reads as one fluffy plume from a distance…
  out.push(ball(base.clone().add(V(0, 0.27 * scale, -0.06 * scale)), 0.12 * scale, COL.tealDark, 1, 2.1, 0.95));
  out.push(ball(base.clone().add(V(0, 0.4 * scale, -0.1 * scale)), 0.11 * scale, COL.teal, 1.05, 1.7, 1));
  // …and lots of feathers fanning out of it, curling outward and back
  for (let k = 0; k < 46; k++) {
    const a = rnd() * Math.PI * 2, spread = 0.45 + rnd() * 0.55, h = (0.3 + rnd() * 0.36) * scale;
    const tip = base.clone().add(V(Math.sin(a) * 0.22 * spread * scale, h, Math.cos(a) * 0.17 * spread * scale - 0.13 * scale));
    const bend = V(Math.sin(a) * 0.12 * spread, 0.03, Math.cos(a) * 0.08 - 0.06);
    const col = k < 6 ? COL.black : shades[Math.floor(rnd() * shades.length)]; // a little black at the base, like the real ones
    out.push(feather(base.clone().add(V(0, 0.04 + rnd() * 0.12 * scale, -0.02)), tip, bend, 0.042 * scale, col));
  }
  return out;
}

// Horns down: the whole instrument (and the hands holding it) swings down in front of the body.
// Rotate about the point between the hands, then move that point down to the stomach.
function hornsDown(ins, key) {
  if (key === 'tuba') return; // the sousaphone stays on the shoulder
  const P = ins.hands.L.clone().add(ins.hands.R).multiplyScalar(0.5);
  let R, to;
  if (key === 'flute' || key === 'piccolo') { R = new THREE.Matrix4().makeRotationZ(1.25); to = V(-0.12, 1.98, 0.3); } // flute points down the right side
  else if (key === 'clarinet' || key.endsWith('sax')) { R = new THREE.Matrix4().makeRotationX(0.55); to = V(P.x, 1.86, 0.36); }
  else { R = new THREE.Matrix4().makeRotationX(1.15); to = V(P.x, 1.95, 0.38); } // bell swings from forward to down
  const M = new THREE.Matrix4().makeTranslation(to.x, to.y, to.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-P.x, -P.y, -P.z));
  for (const geo of ins.geos) geo.applyMatrix4(M);
  ins.hands = { L: ins.hands.L.clone().applyMatrix4(M), R: ins.hands.R.clone().applyMatrix4(M) };
  ins.elbows = null;
}

const upperCache = new Map();
function upperBody(sec, tone, opts = {}) {
  const key = `${sec.key}|${tone}|${opts.bass || ''}|${opts.down ? 'down' : 'up'}`;
  if (upperCache.has(key)) return upperCache.get(key);
  const skin = SKIN[tone], hair = HAIR[tone], guard = sec.family === 'guard', dm = sec.family === 'dm';
  const g = [];
  if (guard) {
    // guard: fitted black sleeveless mock-neck top, wide sparkly teal sash at the waist, bare arms
    g.push(paint(new THREE.CylinderGeometry(0.25, 0.215, 0.86, 32, 4).scale(1, 1, 0.62).translate(0, 2.0, 0), COL.black));
    g.push(limb(V(-0.19, 2.42, 0), V(0.19, 2.42, 0), 0.075, COL.black)); // top of the shoulders
    g.push(paint(new THREE.CylinderGeometry(0.085, 0.09, 0.11, 14).translate(0, 2.5, 0), COL.black)); // mock neck
    g.push(paint(new THREE.CylinderGeometry(0.245, 0.28, 0.22, 56, 7).scale(1, 1, 0.68).translate(0, 1.62, 0), sequins));
    for (const sd of ['L', 'R']) g.push(ball(SH[sd], 0.072, skin));
  } else {
    // the jacket itself is a shared, textured mesh (see jacket()); here: the draped teal yoke over each shoulder
    // with silver piping along its edge, and the teal stand-up collar
    for (const s of [-1, 1]) {
      const cap = new THREE.SphereGeometry(0.2, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(1.08, 0.8, 0.9).rotateZ(-s * 0.32).translate(s * 0.27, 2.34, 0);
      g.push(paint(cap, COL.teal));
      const rimY = 0.2 * Math.cos(Math.PI * 0.56) * 0.8, rimR = 0.2 * Math.sin(Math.PI * 0.56);
      g.push(paint(new THREE.TorusGeometry(rimR, 0.011, 4, 26).rotateX(Math.PI / 2).scale(1.08, 1, 0.9).translate(0, rimY, 0).rotateZ(-s * 0.32).translate(s * 0.27, 2.34, 0), COL.silver));
    }
    g.push(paint(new THREE.CylinderGeometry(0.098, 0.112, 0.11, 16).translate(0, 2.55, 0), COL.teal));
    g.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.016, 16).translate(0, 2.605, 0), COL.silver));
  }
  // neck
  g.push(paint(new THREE.CylinderGeometry(0.072, 0.078, 0.16, 10).translate(0, 2.6, 0), skin));
  // head (separate so it can turn — bass drums watch the drum major): face, ears, hair
  const hd = [];
  const HEAD = V(0, 2.79, 0.02);
  hd.push(ball(HEAD, 0.172, skin, 1, 1.13, 1.06));
  hd.push(ball(V(0, 2.775, 0.2), 0.026, skin, 0.9, 1.3, 1)); // nose
  for (const s of [-1, 1]) {
    hd.push(ball(V(s * 0.172, 2.79, 0.0), 0.042, skin, 0.45, 1, 0.75)); // ears
    hd.push(ball(V(s * 0.062, 2.818, 0.188), 0.02, '#f4f1ec', 1, 0.75, 0.5)); // eyes
    hd.push(ball(V(s * 0.062, 2.818, 0.196), 0.011, '#2a1c14'));
    hd.push(box(V(s * 0.064, 2.852, 0.18), 0.06, 0.012, 0.02, hair)); // eyebrows
  }
  hd.push(box(V(0, 2.715, 0.188), 0.065, 0.011, 0.02, '#8a4a44')); // mouth
  if (guard) { // long hair worn down: over the crown, down the back, a strand falling in front of each shoulder
    hd.push(paint(new THREE.SphereGeometry(0.185, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.58).scale(1.02, 1.12, 1.06).rotateX(-0.62).translate(0, 2.8, -0.01), hair));
    hd.push(ball(V(0, 2.58, -0.11), 0.17, hair, 1.08, 2.0, 0.55));
    for (const sd of [-1, 1]) hd.push(ball(V(sd * 0.17, 2.58, -0.03), 0.065, hair, 0.7, 2.6, 0.8));
  } else {
    // hair showing under the shako at the sides and back
    hd.push(paint(new THREE.SphereGeometry(0.178, 18, 6, Math.PI / 2 + Math.PI / 3, Math.PI * 2 - (2 * Math.PI) / 3, Math.PI * 0.3, Math.PI * 0.24)
      .scale(1.02, 1.13, 1.07).translate(HEAD.x, HEAD.y, HEAD.z), hair));
    // teal shako worn low — the visor sits at the eyebrows — with a silver band and top rim, black visor,
    // silver chin strap under the chin, a silver plate, and a big bushy teal plume (none for sousaphones)
    const tall = dm ? 0.44 : 0.38, bot = 2.86, top = bot + tall;
    hd.push(paint(new THREE.CylinderGeometry(0.205, 0.19, tall, 22).translate(0, bot + tall / 2, 0.0), COL.teal));
    hd.push(paint(new THREE.CylinderGeometry(0.207, 0.207, 0.02, 22).translate(0, top - 0.01, 0), COL.silver));
    hd.push(paint(new THREE.CylinderGeometry(0.193, 0.193, 0.045, 22).translate(0, bot + 0.035, 0), COL.silver));
    hd.push(paint(new THREE.CylinderGeometry(0.205, 0.205, 0.016, 22, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.95).rotateX(0.28).translate(0, bot + 0.005, 0.07), COL.visor));
    hd.push(paint(new THREE.TorusGeometry(0.175, 0.007, 4, 18, Math.PI).rotateZ(Math.PI).rotateX(-0.5).translate(0, 2.84, 0.04), COL.silver)); // chin strap
    hd.push(ball(V(0, bot + tall * 0.5, 0.2), 0.045, COL.silver, 1, 1.2, 0.35)); // plate
    if (sec.key !== 'tuba') hd.push(...plume(top, dm ? 1.3 : 1, 7 + tone));
  }
  // arms (fuller black sleeves) from shoulders to hands — not for the drum major, whose arms conduct (see dmArms)
  const ins = instrument(sec.key, opts);
  if (opts.down && sec.family === 'wind') hornsDown(ins, sec.key);
  if (!dm && !guard) for (const s of ['L', 'R']) {
    const sh = SH[s], hand = ins.hands[s], sign = s === 'L' ? -1 : 1;
    const el = ins.elbows ? ins.elbows[s] : sh.clone().add(hand).multiplyScalar(0.5).add(V(sign * 0.13, -0.14, -0.04));
    g.push(limb(sh, el, guard ? 0.064 : 0.09, guard ? skin : COL.black));
    // stop the sleeve just short of the hand so the hand shows
    const cuff = hand.clone().addScaledVector(hand.clone().sub(el).normalize(), guard ? 0 : -0.07);
    g.push(limb(el, cuff, guard ? 0.055 : 0.076, guard ? skin : COL.black));
    g.push(ball(hand, 0.064, skin, 1, 0.9, 1.15));
  }
  g.push(...ins.geos);
  // shiny parts (brass, silver, chrome) get a reflective metal material; the rest is cloth/skin/plastic
  const metal = g.filter(x => x.userData.metal), plain = g.filter(x => !x.userData.metal);
  const merged = THREE.mergeGeometries(plain), headGeo = THREE.mergeGeometries(hd).translate(0, -NECK_Y, 0);
  const metalGeo = metal.length ? THREE.mergeGeometries(metal) : null;
  [...g, ...hd].forEach(x => x.dispose());
  merged.computeBoundingSphere(); headGeo.computeBoundingSphere(); if (metalGeo) metalGeo.computeBoundingSphere();
  const out = { body: merged, head: headGeo, metal: metalGeo };
  upperCache.set(key, out);
  return out;
}

const GEO = {
  pelvis: new THREE.CylinderGeometry(0.262, 0.25, 0.3, 14).scale(1, 1, 0.64).translate(0, 0.02, 0),
  thigh: new THREE.CapsuleGeometry(0.134, THIGH - 0.14, 3, 12).translate(0, -THIGH / 2, 0), // loose, straight-leg uniform pants
  shin: new THREE.CylinderGeometry(0.124, 0.13, SHIN + 0.04, 12).translate(0, -SHIN / 2 + 0.02, 0),
  shinFlare: new THREE.CylinderGeometry(0.085, 0.135, SHIN + 0.02, 14).translate(0, -SHIN / 2 - 0.01, 0), // guard: flared pants
  shoe: (() => { const g = new THREE.CapsuleGeometry(0.082, 0.25, 3, 8).rotateX(Math.PI / 2).scale(1, 0.72, 1).translate(0, -0.03, 0.07); return g; })(),
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
  upper: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, envMapIntensity: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.26, metalness: 0.9, envMapIntensity: 1.2 }),
  pants: new THREE.MeshStandardMaterial({ color: COL.pants, roughness: 0.55, envMapIntensity: 0.6 }),
  shoe: new THREE.MeshStandardMaterial({ color: COL.shoe, roughness: 0.18, metalness: 0.1 }), // polished
  shadow: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  ring: new THREE.MeshBasicMaterial({ color: 0x8ab4f8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
};
const silkMats = new Map();
const silkMat = sec => {
  if (!silkMats.has(sec.key)) silkMats.set(sec.key, new THREE.MeshLambertMaterial({ color: new THREE.Color(COL.teal), side: THREE.DoubleSide }));
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

function makeLeg(side, flare) {
  const thigh = new THREE.Group(); thigh.position.set(side * 0.125, 0, 0);
  thigh.add(new THREE.Mesh(GEO.thigh, MAT.pants));
  const knee = new THREE.Group(); knee.position.y = -THIGH; thigh.add(knee);
  knee.add(new THREE.Mesh(flare ? GEO.shinFlare : GEO.shin, MAT.pants));
  const ankle = new THREE.Group(); ankle.position.y = -SHIN; knee.add(ankle);
  ankle.add(new THREE.Mesh(GEO.shoe, MAT.shoe));
  return { thigh, knee, ankle };
}

function buildPerson(p) {
  const sec = sectionByKey(p.section);
  const root = new THREE.Group(); root.userData.id = p.id;
  // body (whole marcher: turns for guard/DM, dips with the step) → hips (lower body: turns for slides) + upper body
  const body = new THREE.Group(); root.add(body);
  // bass drums are sized by the bass number in the label (D1 = smallest … D5 = largest)
  const opts = sec.key === 'bass' ? { bass: Math.min(5, Math.max(1, parseInt(String(p.label).replace(/\D+/g, ''), 10) || 3)) } : {};
  const tone = hash(p.id) % SKIN.length;
  const up = upperBody(sec, tone, opts);
  const hornUp = [new THREE.Mesh(up.body, MAT.upper)];
  if (up.metal) hornUp.push(new THREE.Mesh(up.metal, MAT.metal));
  body.add(...hornUp);
  // horns down / sticks in: a second version of the arms + instrument, swapped in on the count (it's a snap)
  let hornDown = null;
  if ((sec.family === 'wind' && sec.key !== 'tuba') || sec.family === 'battery') {
    const dn = upperBody(sec, tone, { ...opts, down: true });
    hornDown = [new THREE.Mesh(dn.body, MAT.upper)];
    if (dn.metal) hornDown.push(new THREE.Mesh(dn.metal, MAT.metal));
    hornDown.forEach(m => { m.visible = false; body.add(m); });
  }
  if (sec.family !== 'guard') { const j = jacket(); body.add(new THREE.Mesh(j.geo, j.mat)); }
  const head = new THREE.Group(); head.position.y = NECK_Y; body.add(head);
  head.add(new THREE.Mesh(up.head, MAT.upper));
  const hips = new THREE.Group(); hips.position.y = HIP; body.add(hips);
  hips.add(new THREE.Mesh(GEO.pelvis, MAT.pants));
  const L = makeLeg(1, sec.family === 'guard'), R = makeLeg(-1, sec.family === 'guard'); // marcher's left leg is on +X
  hips.add(L.thigh, R.thigh);
  if (sec.family === 'guard') { // posable flag + arms
    const { flag, silk } = buildFlag(sec);
    body.add(flag); root.userData.flag = flag; root.userData.silk = silk;
    root.userData.arms = dmArms(body, tone, true);
  }
  const shadow = new THREE.Mesh(GEO.shadow, MAT.shadow); shadow.position.y = 0.03; shadow.renderOrder = 1; shadow.userData.noPick = true;
  const ring = new THREE.Mesh(GEO.ring, MAT.ring); ring.position.y = 0.05; ring.visible = false; ring.renderOrder = 2;
  const label = labelSprite(p.label);
  root.add(shadow, ring, label);
  if (sec.family === 'dm') { // drum major stands on a podium and conducts
    const podium = new THREE.Mesh(PODIUM, MAT.upper); root.add(podium);
    root.userData.podium = podium; root.userData.lift = PODIUM_H;
    root.userData.arms = dmArms(body, tone);
    root.userData.conduct = 0;
    label.position.y += PODIUM_H;
  }
  root.userData.parts = { body, hips, head, L, R, ring, label };
  root.userData.horns = { up: hornUp, down: hornDown, state: 'up' };
  root.userData.bass = sec.key === 'bass';
  root.userData.family = sec.family;
  root.userData.yaw = { hips: 0, body: 0, head: 0 };
  root.userData.pose = { tL: 0, kL: 0, fL: 0, zL: 0, tR: 0, kR: 0, fR: 0, zR: 0, y: 0 };
  root.userData.seed = (hash(p.id) % 1000) / 159;
  root.traverse(o => { o.userData.pid = p.id; });
  return root;
}

// ---------- Drum major: podium + conducting ----------
const PODIUM_H = 1.6; // about 3 ft
const PODIUM = (() => {
  const g = [];
  g.push(box(V(0, PODIUM_H / 2, 0), 1.9, PODIUM_H, 1.9, '#1d1e22'));
  g.push(box(V(0, PODIUM_H - 0.03, 0), 1.98, 0.06, 1.98, COL.silver));       // top edge
  g.push(box(V(0, PODIUM_H * 0.5, 0.955), 1.6, 0.18, 0.02, COL.teal));      // teal band on the band-facing side
  for (let k = 0; k < 3; k++) {                                              // steps up the back (away from the band)
    const h = PODIUM_H * (k + 1) / 4;
    g.push(box(V(0, h / 2, -0.95 - 0.3 * (3 - k) + 0.15), 0.9, h, 0.3, '#2a2b30'));
  }
  return THREE.mergeGeometries(g);
})();
const ARM = { up: new THREE.CylinderGeometry(0.09, 0.08, 1, 10).translate(0, 0.5, 0), fore: new THREE.CylinderGeometry(0.076, 0.064, 1, 10).translate(0, 0.5, 0),
  joint: new THREE.SphereGeometry(0.086, 10, 8), hand: new THREE.SphereGeometry(0.066, 10, 8).scale(1, 0.9, 1.15) };
const SLEEVE = new THREE.MeshLambertMaterial({ color: COL.black });
const skinMats = new Map();
const skinMat = tone => { if (!skinMats.has(tone)) skinMats.set(tone, new THREE.MeshLambertMaterial({ color: SKIN[tone] })); return skinMats.get(tone); };
const GUARD_ARM = { up: new THREE.CylinderGeometry(0.064, 0.058, 1, 10).translate(0, 0.5, 0), fore: new THREE.CylinderGeometry(0.056, 0.048, 1, 10).translate(0, 0.5, 0),
  joint: new THREE.SphereGeometry(0.062, 10, 8), hand: ARM.hand };
function dmArms(body, tone, bare) { // bare = skin-coloured arms (guard), otherwise black sleeves
  const arms = {}, G = bare ? GUARD_ARM : ARM, M = bare ? skinMat(tone) : SLEEVE;
  for (const sd of ['L', 'R']) {
    const up = new THREE.Mesh(G.up, M), fore = new THREE.Mesh(G.fore, M);
    const sh = new THREE.Mesh(G.joint, M), el = new THREE.Mesh(G.joint, M), hand = new THREE.Mesh(G.hand, skinMat(tone));
    sh.position.copy(SH[sd]);
    body.add(up, fore, sh, el, hand);
    arms[sd] = { up, fore, el, hand };
  }
  return arms;
}
const _q = new THREE.Quaternion(), _d = new THREE.Vector3();
function segment(mesh, a, b) {
  _d.subVectors(b, a); const len = _d.length();
  mesh.position.copy(a); mesh.quaternion.copy(_q.setFromUnitVectors(UP, _d.divideScalar(len || 1))); mesh.scale.set(1, len, 1);
}
// 4-beat conducting pattern for the right hand, as the drum major sees it (x = toward their own right):
// 1 down, 2 in, 3 out, 4 up. Between beats the hand rebounds up in an arc and falls into the next beat.
const ICTUS = { 1: [0.32, 2.28], 2: [-0.02, 2.55], 3: [0.82, 2.58], 4: [0.42, 2.84] };
const REBOUND = { 1: 0.3, 2: 0.18, 3: 0.2, 4: 0.48 }; // height of the arc leaving each beat
const READY = [0.34, 2.98];                              // "ready" — arms up, before the downbeat
function conductHand(count) {
  const k = Math.floor(count), u = count - k;
  const b = ((((k - 1) % 4) + 4) % 4) + 1, nb = (b % 4) + 1; // count 1 = beat 1; count 0 → beat 4 (the prep)
  const [x0, y0] = ICTUS[b], [x1, y1] = ICTUS[nb];
  const t = Math.pow(u, 0.75); // peak of the rebound comes early, then the hand accelerates into the beat
  return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * t + REBOUND[b] * Math.sin(Math.PI * t), 0.5 + 0.08 * Math.sin(Math.PI * u)];
}
function setArm(a, sd, hand, elbowOut = 0.16) {
  const sign = sd === 'L' ? -1 : 1, sh = SH[sd];
  const el = sh.clone().lerp(hand, 0.5).add(V(sign * elbowOut, -0.15, -0.05));
  segment(a.up, sh, el); segment(a.fore, el, hand);
  a.el.position.copy(el); a.hand.position.copy(hand);
}
function poseArms(g, count, w) {
  const c = conductHand(count);
  for (const sd of ['L', 'R']) { // the right hand (−X) leads; the left mirrors it
    const sign = sd === 'L' ? -1 : 1, a = g.userData.arms[sd];
    const xr = READY[0] + (c[0] - READY[0]) * w, y = READY[1] + (c[1] - READY[1]) * w, z = 0.36 + (c[2] - 0.36) * w;
    const hand = V(sign * xr, y, z), sh = SH[sd];
    const el = sh.clone().lerp(hand, 0.5).add(V(sign * 0.18, -0.16, -0.06));
    segment(a.up, sh, el); segment(a.fore, el, hand);
    a.el.position.copy(el); a.hand.position.copy(hand);
  }
}

// ---------- Color guard flag work ----------
// A pose = where the pole's bottom end is (B), which way the pole points (D, bottom → top), which way the silk
// hangs off the top of the pole (S), and where the two hands go (as distances up the pole, or a fixed point).
// Body coordinates: the marcher faces +Z, their right is −X.
const POLE = 3.25, SILK_W = 1.3, SILK_H = 0.85;
const n3 = (x, y, z) => V(x, y, z).normalize();
const FLAG_POSES = {
  attention: { B: V(-0.4, 0.06, 0.28), D: n3(0, 1, 0), S: n3(-1, 0, 0.2), hR: 1.7, hL: 2.25 },
  rshoulder: { B: V(-0.3, 1.85, 0.88), D: n3(0, 0.62, -0.78), S: n3(0, -1, 0), hR: 0.35, hL: 0.8 },
  lshoulder: { B: V(0.3, 1.85, 0.88), D: n3(0, 0.62, -0.78), S: n3(0, -1, 0), hR: 0.8, hL: 0.35 },
  present:   { B: V(0, 0.3, 0.5), D: n3(0, 1, 0.05), S: n3(1, 0, 0), hR: 1.45, hL: 2.05 },
  angleR:    { B: V(0.35, 1.25, 0.5), D: n3(-1, 1, 0.1), S: n3(0, -1, 0), hR: 0.25, hL: 0.75 },
  angleL:    { B: V(-0.35, 1.25, 0.5), D: n3(1, 1, 0.1), S: n3(0, -1, 0), hR: 0.75, hL: 0.25 },
  flat:      { B: V(0.62, 2.05, 0.48), D: n3(-1, 0, 0), S: n3(0, -1, 0), hR: 0.95, hL: 0.35 },
  overhead:  { B: V(0.62, 3.2, 0.12), D: n3(-1, 0, 0), S: n3(0, 0, -1), hR: 0.95, hL: 0.35 }
};
// a pose for any flag key; drop spins are a pose that changes with the count (one turn every 2 counts)
function flagPose(key, count) {
  if (key === 'none') return null;
  if (key === 'spin') {
    const phi = (count / 2) * Math.PI * 2, G = V(-0.5, 2.0, 0.3), grip = 1.05;
    const D = V(0, Math.cos(phi), Math.sin(phi)), S = V(0, Math.sin(phi), -Math.cos(phi)); // silk trails the turn
    return { B: G.clone().addScaledVector(D, -grip), D, S, hR: grip, hL: null, handL: V(0.34, 1.7, 0.16) };
  }
  return FLAG_POSES[key] || FLAG_POSES.attention;
}
const REST_HANDS = { L: V(-0.34, 1.66, 0.06), R: V(0.34, 1.66, 0.06) };
function poseHands(p) { // world-of-the-body positions of both hands for a pose (L = marcher's right hand, on −X)
  if (!p) return { L: REST_HANDS.L.clone(), R: REST_HANDS.R.clone() };
  return {
    L: p.B.clone().addScaledVector(p.D, p.hR),
    R: p.handL ? p.handL.clone() : p.B.clone().addScaledVector(p.D, p.hL)
  };
}
const _m = new THREE.Matrix4();
function poseFlag(g, fl, count) {
  const a = flagPose(fl.a, count), b = flagPose(fl.b, count);
  const w = fl.w * fl.w * (3 - 2 * fl.w); // ease
  const ha = poseHands(a), hb = poseHands(b);
  for (const sd of ['L', 'R']) setArm(g.userData.arms[sd], sd, ha[sd].clone().lerp(hb[sd], w), 0.14);
  const flag = g.userData.flag;
  let p = null;
  if (a && b) p = { B: a.B.clone().lerp(b.B, w), D: a.D.clone().lerp(b.D, w).normalize(), S: a.S.clone().lerp(b.S, w) };
  else p = w < 0.5 ? a : b; // to / from "no flag": it simply appears / goes away halfway through
  flag.visible = !!p;
  if (!p) return;
  const D = p.D, S = p.S.clone().addScaledVector(D, -p.S.dot(D)).normalize(), N = S.clone().cross(D);
  flag.position.copy(p.B);
  flag.quaternion.setFromRotationMatrix(_m.makeBasis(S, D, N));
}
function buildFlag(sec) {
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, POLE, 6).translate(0, POLE / 2, 0), MAT.metal);
  const geo = new THREE.PlaneGeometry(SILK_W, SILK_H, 10, 3).translate(SILK_W / 2, POLE - SILK_H / 2, 0);
  const silk = new THREE.Mesh(geo, silkMat(sec));
  silk.userData.base = Float32Array.from(geo.attributes.position.array);
  flag.add(pole, silk);
  return { flag, silk };
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
  body.position.y = p.y + (g.userData.lift || 0);
}
function waveSilk(silk, t) {
  const pos = silk.geometry.attributes.position, base = silk.userData.base;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const w = x / SILK_W;
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
  // first-person ("Eyes") view: camera in one performer's head, looking where they look.
  // Drag to glance around; the view drifts back to straight ahead a moment after letting go.
  let fpId = null;
  let virtualDm = null, lastCount = null, lastCountAt = 0;
  const VIRTUAL_DM_SPOT = { x: 0, y: -4 };
  const look = { yaw: 0, pitch: 0, drag: null, released: 0 };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 6; controls.maxDistance = 400;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5a3a, 1.6));
  { // reflections: sky above, bright horizon, grass below
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, '#7fa9d6'); gr.addColorStop(0.46, '#eef2f4'); gr.addColorStop(0.54, '#9bb38f'); gr.addColorStop(1, '#2f5a36');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 32);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(t).texture; t.dispose(); pm.dispose();
  }
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
    // no drum major in the drill? put one on a podium at the 50, 4 steps in front of the front sideline,
    // so the band (and students in 3D / Eyes) always have someone to watch
    if (virtualDm) { peopleGroup.remove(virtualDm); virtualDm = null; }
    if (!show.performers.some(p => p.section === 'dm')) {
      virtualDm = buildPerson({ id: '__dm', label: 'DM', section: 'dm' });
      virtualDm.traverse(o => { o.userData.noPick = true; delete o.userData.pid; });
      peopleGroup.add(virtualDm);
    }
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
    const { show, frame, count, sel, selProp, labels, dark, follow, followFrom, firstPerson } = f;
    syncField(show, dark); syncPeople(show); syncProps(show);
    const A = show.sets[frame.i], B = show.sets[Math.min(frame.i + 1, show.sets.length - 1)];
    const inMotion = frame.frac > 0;
    const local = inMotion ? frame.frac * (B.counts || 0) : 0; // counts into this move
    const now = performance.now() / 1000;
    const dmId = (show.performers.find(p => p.section === 'dm') || {}).id;
    const dmSpot = dmId ? frame.pos[dmId] : VIRTUAL_DM_SPOT;
    // conducting while the counts are moving (playing / practicing / scrubbing); arms up and ready when stopped
    if (count !== lastCount) { lastCount = count; lastCountAt = performance.now(); }
    const conducting = performance.now() - lastCountAt < 250;
    // the band's centre, for the drum major to face
    let bx = 0, by = 0, bn = 0;
    for (const p of show.performers) if (p.section !== 'dm' && frame.pos[p.id]) { bx += frame.pos[p.id].x; by += frame.pos[p.id].y; bn++; }
    const bandC = bn ? { x: bx / bn, y: by / bn } : { x: 0, y: 30 };
    const poseDm = (g, q) => {
      g.position.set(q.x, 0, toZ(q.y));
      const yaw = g.userData.yaw, want = Math.atan2(bandC.x - q.x, q.y - bandC.y);
      yaw.body = turnToward(yaw.body, want);
      g.userData.parts.body.rotation.y = yaw.body; g.userData.podium.rotation.y = yaw.body;
      g.userData.parts.hips.rotation.y = 0;
      applyPose(g, REST, false);
      g.userData.conduct += ((conducting ? 1 : 0) - g.userData.conduct) * 0.15;
      poseArms(g, count, g.userData.conduct);
    };
    if (virtualDm) { poseDm(virtualDm, VIRTUAL_DM_SPOT); virtualDm.userData.parts.label.visible = labels || !!(follow || firstPerson); }
    for (const p of show.performers) {
      const g = people.get(p.id); if (!g) continue;
      const q = frame.pos[p.id];
      if (g.userData.podium) { // drum major: on the podium, facing the band, conducting
        poseDm(g, q);
        g.userData.parts.ring.visible = sel.has(p.id);
        g.userData.parts.label.visible = labels || sel.has(p.id) || !!(follow || firstPerson); // students can always find the DM
        continue;
      }
      g.position.set(q.x, 0, toZ(q.y));
      const { body, hips, ring, label } = g.userData.parts;
      // stepping only while actually moving (not during a hold before or after)
      const pf = inMotion ? pathFrac(show, frame.i + 1, p.id, frame.frac) : 0;
      const moving = inMotion && pf > 0 && pf < 1 && Math.hypot(B.pos[p.id].x - A.pos[p.id].x, B.pos[p.id].y - A.pos[p.id].y) > 0.05;
      // technique for this move: winds slide (hips toward travel, torso to the box), battery crab step,
      // guard/DM turn their whole body; moving backward = hips away from travel, stepping back
      // the drill's Look settings: facing, horns up/down, flag position — part-way through any change on its count
      const lf = lookFrame(show, frame.i, frame.frac, p.id);
      const faceKey = lf.face.w > 0 ? lf.face.b : lf.face.a; // turning (or turned) toward the new facing
      const setYaw = facingByKey(faceKey).yaw;                 // null = the section's usual facing
      let t = moving ? technique(g.userData.family, A.pos[p.id], B.pos[p.id], p.section, setYaw) : null;
      const yaw = g.userData.yaw;
      if (g.userData.bass) {
        // bass drums face the 50 from wherever they are (unless the drill sets a facing); crossing it, they spin
        // (through facing the audience). A small dead zone on the 50 stops them flickering while standing on it.
        if (g.userData.side == null || Math.abs(q.x) > 0.3) g.userData.side = q.x < 0 ? -1 : 1;
        const facing = setYaw != null ? setYaw : bassFacing(g.userData.side);
        if (t && setYaw == null) {
          const dx = B.pos[p.id].x - A.pos[p.id].x, dy = B.pos[p.id].y - A.pos[p.id].y;
          t = { ...t, hipYaw: 0, bodyYaw: facing, legs: legsFor(Math.atan2(dx, -dy), facing).legs };
        }
        yaw.body = turnToward(yaw.body, facing);
        // head watches the drum major (or the press box if there isn't one), within what a neck can do
        const dmQ = dmSpot;
        const want = dmQ ? Math.atan2(dmQ.x - q.x, q.y - dmQ.y) : 0;
        let rel = want - yaw.body;
        while (rel > Math.PI) rel -= 2 * Math.PI;
        while (rel < -Math.PI) rel += 2 * Math.PI;
        yaw.head = turnToward(yaw.head, Math.max(-1.6, Math.min(1.6, rel)));
        g.userData.parts.head.rotation.y = yaw.head;
      } else yaw.body = turnToward(yaw.body, t ? t.bodyYaw : setYaw != null ? setYaw : 0);
      // horns up / down (sticks out / in): a snap on the count
      const hz = g.userData.horns;
      if (hz.down) {
        const want = lf.horns.w >= 0.5 ? lf.horns.b : lf.horns.a;
        if (want !== hz.state) { hz.state = want; hz.up.forEach(m => { m.visible = want !== 'down'; }); hz.down.forEach(m => { m.visible = want === 'down'; }); }
      }
      if (g.userData.flag) poseFlag(g, lf.flag, count);
      yaw.hips = turnToward(yaw.hips, t ? t.hipYaw : 0);
      hips.rotation.y = yaw.hips; body.rotation.y = yaw.body;
      if (t && t.legs !== 'still') {
        const mv = moveStep(show, frame.i + 1, p.id);
        applyPose(g, gait(t.legs, local - (mv ? mv.pre : 0), mv && mv.per ? mv.per : 1), true);
      } else applyPose(g, REST, false);
      ring.visible = sel.has(p.id);
      label.visible = labels || sel.has(p.id);
      if (g.userData.silk) waveSilk(g.userData.silk, now + g.userData.seed);
    }
    // first person: hide your own body (your arms and horn would block the view), put the camera at your eyes
    const fpNow = firstPerson && people.get(firstPerson) && frame.pos[firstPerson] ? firstPerson : null;
    if (fpNow !== fpId) {
      if (fpId && people.get(fpId)) people.get(fpId).visible = true;
      fpId = fpNow;
      look.yaw = look.pitch = 0; look.drag = null;
      controls.enabled = !fpId;
      camera.near = fpId ? 0.05 : 0.5;
      followLast = null; resize(); // resize resets the field of view
    }
    if (fpId) {
      const g = people.get(fpId), { head } = g.userData.parts;
      g.visible = false; pointer.visible = false;
      if (!look.drag && performance.now() - look.released > 1200) { look.yaw *= 0.93; look.pitch *= 0.93; }
      g.updateMatrixWorld(true);
      const eye = head.localToWorld(new THREE.Vector3(0, 0.2, 0.16));
      const yawW = g.userData.yaw.body + head.rotation.y + look.yaw, pitch = -0.09 + look.pitch;
      camera.position.copy(eye);
      camera.lookAt(eye.x + Math.sin(yawW) * Math.cos(pitch), eye.y + Math.sin(pitch), eye.z + Math.cos(yawW) * Math.cos(pitch));
    }
    // follow one performer (student view): move camera + orbit target along with them
    else if (follow && frame.pos[follow]) {
      const q = frame.pos[follow], tgt = new THREE.Vector3(q.x, 1.6, toZ(q.y));
      pointer.visible = true; pointer.position.set(q.x, 5.2 + ((people.get(follow) || {}).userData?.lift || 0) + Math.sin(performance.now() / 300) * 0.15, toZ(q.y));
      if (!followLast || followFrom !== followSide) {
        // performer: just behind and above the marcher, looking toward the audience; director: from the front
        followSide = followFrom;
        controls.target.copy(tgt);
        if (followFrom === "performer") { // behind you, looking toward the front — low enough to see the drum major
          camera.position.set(tgt.x, 8, tgt.z - 16);
          controls.target.set(tgt.x, 2, tgt.z + 6);
        }
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
    camera.fov = fpId ? (w / h < 1.2 ? 80 : 68) : w / h < 1.2 ? 55 : 40; // first person: wider, like your own eyes
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  // click (not drag) on a person → select them
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY };
    if (fpId) { look.drag = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch }; renderer.domElement.setPointerCapture(e.pointerId); }
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!fpId || !look.drag) return;
    const k = 2.2 / Math.max(300, renderer.domElement.clientWidth); // a full-width drag turns about 125°
    look.yaw = Math.max(-2.6, Math.min(2.6, look.drag.yaw + (e.clientX - look.drag.x) * k));
    look.pitch = Math.max(-0.9, Math.min(0.6, look.drag.pitch + (e.clientY - look.drag.y) * k));
  });
  const endLook = () => { if (look.drag) { look.drag = null; look.released = performance.now(); } };
  renderer.domElement.addEventListener('pointercancel', endLook);
  renderer.domElement.addEventListener('pointerup', e => {
    endLook();
    if (fpId) { down = null; return; }
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
    get visible() { return visible; },
    stats() { const r = renderer.info.render; return { calls: r.calls, triangles: r.triangles }; } // for checking phone load
  };
}
