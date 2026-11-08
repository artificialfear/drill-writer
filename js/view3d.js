// Drill Writer — 3D view (watch-only). Loaded on demand the first time 3D is switched on.
// World units are steps, same as the 2D editor. Three.js mapping: X = x, Y = up, Z = FIELD_DEPTH/2 - y,
// so the front sideline (audience) is toward +Z.
import * as THREE from '../vendor/three-bundle.min.js';
import { FIELD_DEPTH, GOAL_X, END_X, refLines, sectionByKey } from './model.js';
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
const GEO = {
  leg: new THREE.BoxGeometry(0.28, 1.4, 0.3).translate(0, -0.7, 0),
  foot: new THREE.BoxGeometry(0.26, 0.13, 0.52).translate(0, -1.36, 0.13), // toes point the way the hips face
  pelvis: new THREE.BoxGeometry(0.62, 0.28, 0.34),
  torso: new THREE.CylinderGeometry(0.33, 0.27, 1.05, 12),
  head: new THREE.SphereGeometry(0.26, 14, 10),
  shako: new THREE.CylinderGeometry(0.22, 0.24, 0.42, 12),
  plume: new THREE.ConeGeometry(0.08, 0.35, 8),
  horn: new THREE.CylinderGeometry(0.07, 0.16, 0.85, 10).rotateX(Math.PI / 2),
  bell: new THREE.CylinderGeometry(0.42, 0.42, 0.06, 18).rotateX(Math.PI / 2), // sousaphone bell
  drum: new THREE.CylinderGeometry(0.36, 0.36, 0.32, 16),
  bass: new THREE.CylinderGeometry(0.62, 0.62, 0.42, 20).rotateZ(Math.PI / 2),
  keys: new THREE.BoxGeometry(1.8, 0.14, 0.6),
  pole: new THREE.CylinderGeometry(0.035, 0.035, 3.6, 6),
  flag: new THREE.PlaneGeometry(1.25, 0.95),
  shadow: new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.72, 0.9, 28).rotateX(-Math.PI / 2)
};
const MAT = {
  pants: new THREE.MeshLambertMaterial({ color: 0x23262d }),
  skin: new THREE.MeshLambertMaterial({ color: 0xc9a98a }),
  shako: new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  brass: new THREE.MeshLambertMaterial({ color: 0xd9b44a }),
  silver: new THREE.MeshLambertMaterial({ color: 0xcfd6dc }),
  drumShell: new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
  pole: new THREE.MeshLambertMaterial({ color: 0xdddddd }),
  keys: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  ring: new THREE.MeshBasicMaterial({ color: 0x8ab4f8, side: THREE.DoubleSide, depthWrite: false })
};
const sectionMats = new Map();
function secMat(sec) {
  if (!sectionMats.has(sec.key)) {
    sectionMats.set(sec.key, {
      body: new THREE.MeshLambertMaterial({ color: new THREE.Color(sec.color) }),
      flag: new THREE.MeshLambertMaterial({ color: new THREE.Color(sec.color), side: THREE.DoubleSide })
    });
  }
  return sectionMats.get(sec.key);
}
const SILVER_HORNS = new Set(['flute', 'piccolo', 'clarinet', 'mello']);

function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 56;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,24,22,.78)';
  g.beginPath(); g.roundRect(4, 6, 120, 44, 12); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 29);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(2.2, 0.96, 1); sp.position.y = 4.0;
  return sp;
}

function buildPerson(p) {
  const sec = sectionByKey(p.section);
  const m = secMat(sec);
  const root = new THREE.Group(); root.userData.id = p.id;
  // body (whole marcher: turns for guard/DM, bobs while stepping) → hips (lower body: turns for slides) + upper body
  const body = new THREE.Group(); root.add(body);
  const hip = 1.45;
  const hips = new THREE.Group(); hips.position.y = hip; body.add(hips);
  const legL = new THREE.Mesh(GEO.leg, MAT.pants); legL.position.set(-0.16, 0, 0);
  const legR = new THREE.Mesh(GEO.leg, MAT.pants); legR.position.set(0.16, 0, 0);
  legL.add(new THREE.Mesh(GEO.foot, MAT.pants)); legR.add(new THREE.Mesh(GEO.foot, MAT.pants));
  const pelvis = new THREE.Mesh(GEO.pelvis, MAT.pants); pelvis.position.y = 0.02;
  hips.add(legL, legR, pelvis);
  const torso = new THREE.Mesh(GEO.torso, m.body); torso.position.y = hip + 0.52;
  const head = new THREE.Mesh(GEO.head, MAT.skin); head.position.y = hip + 1.32;
  body.add(torso, head);
  if (sec.family !== 'guard') {
    const shako = new THREE.Mesh(GEO.shako, sec.family === 'dm' ? m.body : MAT.shako); shako.position.y = hip + 1.62;
    const plume = new THREE.Mesh(GEO.plume, m.body); plume.position.y = hip + 1.98;
    body.add(shako, plume);
  }
  if (sec.family === 'wind') {
    const mat = SILVER_HORNS.has(sec.key) ? MAT.silver : MAT.brass;
    if (sec.key === 'tuba') {
      const bell = new THREE.Mesh(GEO.bell, mat); bell.position.set(0, hip + 1.7, 0.25); bell.scale.set(1, 1, 1);
      body.add(bell);
    } else {
      const horn = new THREE.Mesh(GEO.horn, mat); horn.position.set(0, hip + 1.05, 0.55);
      body.add(horn);
    }
  } else if (sec.family === 'battery') {
    const drum = new THREE.Mesh(sec.key === 'bass' ? GEO.bass : GEO.drum, MAT.drumShell);
    drum.position.set(0, hip + 0.1, 0.55);
    if (sec.key === 'tenors') drum.scale.set(1.5, 0.8, 1.2);
    body.add(drum);
  } else if (sec.family === 'pit') {
    const keys = new THREE.Mesh(GEO.keys, MAT.keys); keys.position.set(0, hip - 0.05, 0.75);
    body.add(keys);
  } else if (sec.family === 'guard') {
    const pole = new THREE.Mesh(GEO.pole, MAT.pole); pole.position.set(0.42, hip + 0.9, 0.2);
    const flag = new THREE.Mesh(GEO.flag, m.flag); flag.position.set(0.42 + 0.63, hip + 2.2, 0.2);
    body.add(pole, flag);
    root.userData.flag = flag;
  }
  const shadow = new THREE.Mesh(GEO.shadow, MAT.shadow); shadow.position.y = 0.03; shadow.renderOrder = 1;
  const ring = new THREE.Mesh(GEO.ring, MAT.ring); ring.position.y = 0.05; ring.visible = false; ring.renderOrder = 2;
  const label = labelSprite(p.label);
  root.add(shadow, ring, label);
  root.userData.parts = { body, hips, legL, legR, ring, label };
  root.userData.family = sec.family;
  root.userData.yaw = { hips: 0, body: 0 };
  root.traverse(o => { o.userData.pid = p.id; });
  return root;
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
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 16).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xff8a00 }));
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
    // one step per count: legs swing through a full stride every 2 counts
    const phase = Math.sin(Math.PI * count);
    for (const p of show.performers) {
      const g = people.get(p.id); if (!g) continue;
      const q = frame.pos[p.id];
      g.position.set(q.x, 0, toZ(q.y));
      const { body, hips, legL, legR, ring, label } = g.userData.parts;
      const moving = inMotion && Math.hypot(B.pos[p.id].x - A.pos[p.id].x, B.pos[p.id].y - A.pos[p.id].y) > 0.05;
      // technique for this move: winds slide (hips toward travel, torso to the box), battery crab step,
      // guard/DM turn their whole body; moving backward = hips away from travel, stepping back
      const t = moving ? technique(g.userData.family, A.pos[p.id], B.pos[p.id]) : null;
      const yaw = g.userData.yaw;
      yaw.hips = turnToward(yaw.hips, t ? t.hipYaw : 0);
      yaw.body = turnToward(yaw.body, t ? t.bodyYaw : 0);
      hips.rotation.y = yaw.hips; body.rotation.y = yaw.body;
      const swing = moving ? phase * 0.42 : 0;
      if (t && t.legs === 'crab') { legL.rotation.set(0, 0, swing * 0.5); legR.rotation.set(0, 0, swing * 0.5); }
      else { legL.rotation.set(swing, 0, 0); legR.rotation.set(-swing, 0, 0); }
      body.position.y = moving ? Math.abs(phase) * 0.06 : 0;
      ring.visible = sel.has(p.id);
      label.visible = labels || sel.has(p.id);
      if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(performance.now() / 380 + q.x) * 0.25;
    }
    // follow one performer (student view): move camera + orbit target along with them
    if (follow && frame.pos[follow]) {
      const q = frame.pos[follow], tgt = new THREE.Vector3(q.x, 1.6, toZ(q.y));
      pointer.visible = true; pointer.position.set(q.x, 4.9 + Math.sin(performance.now() / 300) * 0.15, toZ(q.y));
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
    const hits = ray.intersectObjects(peopleGroup.children, true).filter(h => h.object.isMesh && h.object.userData.pid && h.object.geometry !== GEO.shadow);
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
