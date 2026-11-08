// Drill Writer — marching technique for a move, from the marcher's point of view (horns to the box).
// Field: x toward Side 2, y toward the back. Facing the box means facing -y; the marcher's LEFT is +x (Side 2),
// their RIGHT is -x (Side 1).
// theta = travel angle from straight forward, positive toward the marcher's left.  0 = forward, ±90 = sideways, 180 = backward.

const DEG = 180 / Math.PI;

export function technique(family, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
  if (dist < 0.01 || family === 'pit') return { kind: 'hold', label: 'Hold', hipYaw: 0, bodyYaw: 0, legs: 'still' };
  const theta = Math.atan2(dx, -dy);                 // radians
  const deg = theta * DEG, abs = Math.abs(deg);
  const side = dx > 0 ? 'left' : 'right';
  const sideName = dx > 0 ? 'Side 2' : 'Side 1';

  if (family === 'guard' || family === 'dm') {
    // no horn to keep to the box: the whole body turns and marches toward the next spot
    let dir;
    if (abs < 20) dir = 'forward';
    else if (abs > 160) dir = 'to the back';
    else if (abs >= 70 && abs <= 110) dir = `toward ${sideName}`;
    else dir = abs < 90 ? `forward-${side}` : `back-${side}`;
    return { kind: 'travel', label: `Face & march ${dir}`, hipYaw: 0, bodyYaw: theta, legs: 'forward' };
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
