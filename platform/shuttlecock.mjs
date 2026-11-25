const radians = Math.PI / 180;
const turn = 2 * Math.PI;
const restPitch = -12 * radians;
const openPitch = -34 * radians;
const cosRoll = Math.cos(-24 * radians);
const sinRoll = Math.sin(-24 * radians);

// The blades flare from the cork and circle the axis in individual planes.
const featherProfile = [
  [-6.95, -30.8], [-6.5, -33.5], [-5.0, -35.55], [-2.5, -36.95], [0, -37.35],
  [2.6, -37.05], [4.85, -35.75], [6.45, -33.75], [7.0, -31.0], [6.8, -26.3],
  [5.8, -20.6], [2.4, -13.1], [1.2, -8], [1, 15], [-1, 15], [-1.24, -8.2],
  [-2.55, -13.4], [-5.9, -20.9], [-6.95, -26.6],
];
const feathers = Array.from({ length: 16 }, (_, index) => {
  const angle = index * turn / 16;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return featherProfile.map(([width, height]) => {
    const radius = 9.8 + (15 - height) * .442;
    return [width * cos + radius * sin, height, radius * cos - width * sin];
  });
});

// A single solid cork keeps the joining quills inside its contour throughout the turn.
const corkProfile = [[10.4, 10.8], [11.55, 12.2], [11.6, 18.9], [10.95, 22.4], [9.3, 25.6], [6.4, 28.05], [3.4, 29.65]];
const cork = corkProfile.flatMap(([radius, height]) => Array.from({ length: 24 }, (_, index) => {
  const angle = index * turn / 24;
  return [radius * Math.cos(angle), height, radius * Math.sin(angle)];
}));
cork.push([0, 30.2, 0]);

const round = value => Math.round(value * 10) / 10;
const pair = ([x, y]) => `${round(x)} ${round(y)}`;

function projector(yaw, pitch) {
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  return ([x, y, z]) => {
    const rolledX = x * cosRoll - y * sinRoll;
    const rolledY = x * sinRoll + y * cosRoll;
    const turnedX = rolledX * cosYaw + z * sinYaw;
    const turnedZ = z * cosYaw - rolledX * sinYaw;
    const depth = rolledY * sinPitch + turnedZ * cosPitch;
    const scale = 280 / (280 - depth);
    return [60 + scale * turnedX, 56 + scale * (rolledY * cosPitch - turnedZ * sinPitch)];
  };
}

const cross = ([ax, ay], [bx, by], [cx, cy]) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

function hull(points) {
  const sorted = points.sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  const side = ordered => {
    const edge = [];
    for (const point of ordered) {
      while (edge.length > 1 && cross(edge.at(-2), edge.at(-1), point) <= 0) edge.pop();
      edge.push(point);
    }
    return edge.slice(0, -1);
  };
  return [...side(sorted), ...side(sorted.reverse())];
}

const tween = ([ax, ay], [bx, by], fraction) => [ax + (bx - ax) * fraction, ay + (by - ay) * fraction];

function roundedPath(points, radius) {
  const toward = (from, to) => tween(from, to, Math.min(.36, radius / Math.hypot(to[0] - from[0], to[1] - from[1])));
  const corners = points.map((point, index) => [
    toward(point, points.at(index - 1)),
    point,
    toward(point, points[(index + 1) % points.length]),
  ]);
  return `M${pair(corners.at(-1)[2])}${corners.map(([entry, corner, exit]) => `L${pair(entry)}Q${pair(corner)} ${pair(exit)}`).join('')}Z`;
}

function featherPath(points) {
  const winding = points.reduce((area, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return area + x * nextY - y * nextX;
  }, 0);
  // Consistent winding merges overlapping blades without re-antialiasing their internal edges.
  return roundedPath(winding < 0 ? points.reverse() : points, .63);
}

export function shuttlecockPath(yaw = 0, pitch = restPitch) {
  const project = projector(yaw, pitch);
  return feathers.map(feather => featherPath(feather.map(project))).join('') + roundedPath(hull(cork.map(project)), .55);
}

function activateShuttlecock(label) {
  const control = label.querySelector('.shuttlecock-toggle');
  const outline = label.querySelector('path');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = matchMedia('(hover: hover)');
  const restingPath = outline.getAttribute('d');
  let hovered = false;
  let yaw = 0;
  let pitch = restPitch;
  let request = 0;
  let lastFrame = 0;

  function tick(time) {
    const elapsed = Math.max(0, Math.min(50, time - lastFrame));
    lastFrame = time;
    const active = hovered || control.checked;
    const ease = 1 - Math.exp(-elapsed / 100);
    const targetYaw = yaw > Math.PI ? turn : 0;
    pitch += ((active ? openPitch : restPitch) - pitch) * ease;
    yaw = active ? (yaw + elapsed * turn / 3000) % turn : yaw + (targetYaw - yaw) * ease;
    if (!active && Math.abs(pitch - restPitch) < .001 && Math.abs(yaw - targetYaw) < .002) {
      yaw = 0;
      pitch = restPitch;
      request = 0;
      outline.setAttribute('d', restingPath);
      return;
    }
    outline.setAttribute('d', shuttlecockPath(yaw, pitch));
    request = requestAnimationFrame(tick);
  }

  function update() {
    if (reduced.matches) {
      cancelAnimationFrame(request);
      request = 0;
      yaw = 0;
      pitch = restPitch;
      outline.setAttribute('d', restingPath);
    } else if (!request && (hovered || control.checked)) {
      lastFrame = performance.now();
      request = requestAnimationFrame(tick);
    }
  }

  label.addEventListener('pointerenter', event => {
    hovered = canHover.matches && event.pointerType !== 'touch';
    update();
  });
  label.addEventListener('pointerleave', () => {
    hovered = false;
    update();
  });
  control.addEventListener('change', update);
  reduced.addEventListener('change', update);
  control.disabled = false;
  update();
}

const mark = typeof document === 'undefined' ? null : document.querySelector('.shuttlecock');
if (mark) activateShuttlecock(mark);
