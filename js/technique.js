// Drill Writer — marching technique for a move, from the marcher's point of view (horns to the box).
// Field: x toward Side 2, y toward the back. Facing the box means facing -y; the marcher's LEFT is +x (Side 2),
// their RIGHT is -x (Side 1).
// theta = travel angle from straight forward, positive toward the marcher's left.  0 = forward, ±90 = sideways, 180 = backward.

const DEG = 180 / Math.PI;

// Bass drums always face the 50 yard line (drum heads toward the audience's left/right), so their
// facing depends on which side of the 50 they're on: Side 1 (x < 0) faces Side 2 (+x) and vice versa.
// theta convention as above: +PI/2 = facing the marcher's left / Side 2.
export const bassFacing = x => (x < 0 ? Math.PI / 2 : -Math.PI / 2);
// legs for travel angle `theta` when the body faces `facing`
export function legsFor(theta, facing) {
  let rel = theta - facing;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  const abs = Math.abs(rel) * DEG;
  if (abs < 45) return { legs: 'forward', rel };
  if (abs > 135) return { legs: 'backward', rel };
  return { legs: 'crab', rel };
}

const FACE_NAME = y => { // nearest named facing for a yaw
  const d = ((y % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; // -PI..PI
  const a = Math.abs(d) * DEG;
  return a < 45 ? 'the front' : a > 135 ? 'backfield' : d > 0 ? 'Side 2' : 'Side 1';
};

// facing (optional): a yaw the marcher's upper body is set to face for this move (from the drill's Look settings).
// null/undefined = the section's usual facing (horns/drums to the box, guard toward travel, bass drums to the 50).
export function technique(family, a, b, section, facing) {
  const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
  const set = facing != null && family !== 'pit';
  if (dist < 0.01 || family === 'pit') return { kind: 'hold', label: set && Math.abs(facing) > 0.01 ? `Hold (facing ${FACE_NAME(facing)})` : 'Hold', hipYaw: 0, bodyYaw: set ? facing : 0, legs: 'still' };
  const theta = Math.atan2(dx, -dy);                 // radians
  const deg = theta * DEG, abs = Math.abs(deg);
  const side = dx > 0 ? 'left' : 'right';
  const sideName = dx > 0 ? 'Side 2' : 'Side 1';

  if (set) {
    // the body faces where the drill says; the legs work out how to travel from there
    const { legs, rel } = legsFor(theta, facing);
    const ra = Math.abs(rel) * DEG, sd = rel > 0 ? 'left' : 'right', tail = ` (facing ${FACE_NAME(facing)})`;
    if (family === 'battery' || section === 'bass') {
      const label = legs === 'forward' ? 'Forward march' : legs === 'backward' ? 'Backward march' : `Crab step ${sd}`;
      return { kind: legs === 'crab' ? 'crab' : legs, label: label + tail, hipYaw: 0, bodyYaw: facing, legs };
    }
    if (ra <= 100) {
      const label = ra < 20 ? 'Forward march' : ra >= 70 ? `Slide ${sd}` : `Forward slide ${sd}`;
      return { kind: ra < 20 ? 'forward' : 'slide', label: label + tail, hipYaw: ra < 20 ? 0 : rel, bodyYaw: facing, legs: 'forward' };
    }
    const back = rel > 0 ? rel - Math.PI : rel + Math.PI;
    const label = ra > 160 ? 'Backward march' : `Backward slide ${sd}`;
    return { kind: ra > 160 ? 'backward' : 'backslide', label: label + tail, hipYaw: ra > 160 ? 0 : back, bodyYaw: facing, legs: 'backward' };
  }

  if (family === 'guard' || family === 'dm') {
    // no horn to keep to the box: the whole body turns and marches toward the next spot
    let dir;
    if (abs < 20) dir = 'forward';
    else if (abs > 160) dir = 'to the back';
    else if (abs >= 70 && abs <= 110) dir = `toward ${sideName}`;
    else dir = abs < 90 ? `forward-${side}` : `back-${side}`;
    return { kind: 'travel', label: `Face & march ${dir}`, hipYaw: 0, bodyYaw: theta, legs: 'forward' };
  }

  if (section === 'bass') {
    // face the 50; spin (through facing the audience) when crossing it
    const facing = bassFacing(Math.abs(a.x) > 0.01 ? a.x : b.x);
    const crosses = (a.x < -0.01 && b.x > 0.01) || (a.x > 0.01 && b.x < -0.01);
    const { legs, rel } = legsFor(theta, facing);
    const toward = facing > 0 ? 'Side 2' : 'Side 1';
    const name = (lg, r) => lg === 'forward' ? 'March forward' : lg === 'backward' ? 'Backward march' : `Crab step ${r > 0 ? 'left' : 'right'}`;
    let label = `${name(legs, rel)} (facing the 50, toward ${toward})`;
    if (crosses) { // past the 50 they spin to face it again, which flips forward/backward and left/right
      const after = legsFor(theta, -facing);
      label += ` · spin at the 50, then ${name(after.legs, after.rel).toLowerCase()}`;
    }
    return { kind: legs === 'crab' ? 'crab' : legs, label, hipYaw: 0, bodyYaw: facing, legs };
  }

  if (family === 'battery') {
    // drums stay to the box; crab step for lateral moves
    if (abs < 45) return { kind: 'forward', label: 'Forward march', hipYaw: 0, bodyYaw: 0, legs: 'forward' };
    if (abs > 135) return { kind: 'backward', label: 'Backward march', hipYaw: 0, bodyYaw: 0, legs: 'backward' };
    return { kind: 'crab', label: `Crab step ${side}`, hipYaw: 0, bodyYaw: 0, legs: 'crab' };
  }

  // winds: upper body to the box, lower body turns toward travel (max ~90°); behind that, step backward
  if (abs <= 100) {
    let label;
    if (abs < 20) label = 'Forward march';
    else if (abs >= 70) label = `Slide ${side}`;
    else label = `Forward slide ${side}`;
    return { kind: abs < 20 ? 'forward' : 'slide', label, hipYaw: abs < 20 ? 0 : theta, bodyYaw: 0, legs: 'forward' };
  }
  // moving backward: hips face away from the travel direction and the marcher steps back
  const back = theta > 0 ? theta - Math.PI : theta + Math.PI;
  const label = abs > 160 ? 'Backward march' : `Backward slide ${side}`;
  return { kind: abs > 160 ? 'backward' : 'backslide', label, hipYaw: abs > 160 ? 0 : back, bodyYaw: 0, legs: 'backward' };
}
