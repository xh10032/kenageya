'use strict';

/**
 * BB CHANNEL - 24-bit TrueColor Terminal Cinema Engine (Optimized 2x2 QUAD Edition)
 * =================================================================================
 * Self-contained zero-dependency Node.js procedural terminal art renderer
 * reproducing the 16.5-second "BB Channel" animation in 24-bit ANSI TrueColor
 * (with automatic 256-color fallback on Apple Terminal) using 2x2 Unicode quadrant
 * sub-pixel blocks.
 *
 * Performs terminal rendering and keyboard polling only (zero network, filesystem,
 * or external process calls).
 */

const QUAD_CHARS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';
const TOTAL_DURATION = 16.5;
const MIN_TERM_COLS = 44;
const MIN_TERM_ROWS = 14;

const WAVE_LUT_SIZE = 2048;
const WAVE_LUT_MASK = WAVE_LUT_SIZE - 1;
const WAVE_LUT_SCALE = WAVE_LUT_SIZE / Math.PI;
const WAVE_LUT = new Float64Array(WAVE_LUT_SIZE);
for (let i = 0; i < WAVE_LUT_SIZE; i += 1) {
  WAVE_LUT[i] = Math.pow(Math.abs(Math.sin(((i + 0.5) * Math.PI) / WAVE_LUT_SIZE)), 1.35);
}

const SIN_LUT_SIZE = 2048;
const SIN_LUT_MASK = SIN_LUT_SIZE - 1;
const SIN_LUT_SCALE = SIN_LUT_SIZE / (2.0 * Math.PI);
const SIN_LUT = new Float64Array(SIN_LUT_SIZE);
for (let i = 0; i < SIN_LUT_SIZE; i += 1) {
  SIN_LUT[i] = Math.sin(i * ((2.0 * Math.PI) / SIN_LUT_SIZE));
}

// Format: [kind, tau_ref, x_ref, y_ref, vx_tau, vy_tau, radius, rot_ref, vrot_tau]
const SCENE4_BLACK_FLORA = [
  // Early wave (10.00s - 10.75s, Lime Green phase)
  [0, 0.20, 0.728, 0.452, -0.96, -2.45, 0.105, 0.25, 1.85],
  [0, 0.33, 0.050, 0.690, -0.96, -2.45, 0.095, 1.10, -1.75],
  [1, 0.33, 0.309, 0.718, -0.96, -2.45, 0.068, 0.40, 2.10],
  [1, 0.33, 0.866, 0.387, -0.96, -2.45, 0.062, 2.20, -2.20],
  [0, 0.53, 0.581, 0.394, -1.44, -2.50, 0.098, 0.80, 1.90],
  [0, 0.53, 0.614, 0.746, -1.44, -2.50, 0.096, 1.75, -1.85],
  [0, 0.53, 0.062, 0.749, -1.10, -2.40, 0.148, 0.50, 1.40],
  [1, 0.53, 0.207, 0.112, -1.35, -2.45, 0.065, 1.50, 2.30],
  // Middle wave (10.70s - 11.35s, Electric Cyan Flash phase)
  [1, 0.80, 0.374, 0.185, +1.08, -2.30, 0.068, 2.60, -1.95],
  [1, 1.00, 0.199, 0.455, +2.10, -2.35, 0.095, 2.95, 1.65],
  [1, 1.00, 0.551, 0.737, +2.10, -2.35, 0.072, 2.40, -2.10],
  [1, 1.00, 0.852, 0.145, +1.08, -2.30, 0.066, 1.85, 2.00],
  [1, 1.00, 0.858, 0.384, +1.08, -2.30, 0.068, 3.05, -1.80],
  [1, 1.13, 0.486, 0.609, +2.10, -2.35, 0.092, 3.10, 1.75],
  [1, 1.13, 0.713, 0.698, +2.10, -2.35, 0.076, 2.75, -1.90],
  // Hot Pink & Slow-Motion Hero Wave (11.27s - 13.45s)
  [0, 1.27, 0.799, 0.768, +0.02, -3.00, 0.148, 0.45, -1.60],
  [1, 1.33, 0.088, 0.561, +0.00, -3.00, 0.072, 0.75, 1.90],
  [0, 1.47, 0.560, 0.765, +0.01, -2.85, 0.228, 0.30, 1.35],
  [0, 1.47, 0.275, 0.455, +0.01, -2.85, 0.142, 1.15, -1.55],
  [1, 1.53, 0.295, 0.766, +0.00, -3.00, 0.082, 0.90, 2.00],
  [0, 1.67, 0.665, 0.775, +0.01, -3.00, 0.132, 0.65, -1.65],
  [0, 1.73, 0.218, 0.763, +0.01, -2.95, 0.224, 0.85, 1.40],
  [0, 1.93, 0.273, 0.764, +0.01, -3.00, 0.205, 0.40, -1.45],
  [0, 1.93, 0.501, 0.384, +0.02, -3.00, 0.115, 1.25, 1.75],
  [1, 1.93, 0.055, 0.657, +0.00, -2.90, 0.092, 0.60, -1.80],
  [1, 1.93, 0.047, 0.462, +0.00, -2.90, 0.088, 1.10, 1.95],
  // Hero Cluster frozen in slow-motion across "Are you enjoying this"
  [0, 2.24, 0.300, 0.618, -0.18, -1.15, 0.252, 0.58, -0.95],
  [0, 2.24, 0.195, 0.915, -0.15, -1.15, 0.225, 1.22, 0.85],
  [0, 2.24, 0.035, 0.905, -0.10, -1.15, 0.145, 0.35, -1.10],
  [1, 2.24, 0.155, 0.075, +0.08, -1.35, 0.085, 2.35, -1.40],
  [1, 2.24, 0.108, 0.175, +0.06, -1.35, 0.078, 2.85, 1.50],
  [1, 2.24, 0.106, 0.495, +0.06, -1.35, 0.086, 1.95, -1.35],
  [1, 2.24, 0.728, 0.895, -0.04, -1.35, 0.052, 2.65, 1.60],
  [1, 2.40, 0.827, 0.670, +0.02, -1.85, 0.064, 1.45, -1.75],
];

// [cx, cy, radius, angle0, angular_speed]
const SCENE4_LACE_SPECS = [
  [0.068, 0.145, 0.535, 0.20, -0.52],
  [0.544, 1.105, 0.530, 1.05, +0.58],
  [0.960, 0.750, 0.715, 0.55, -0.68],
];

function scene4WarpedTau(t) {
  if (t <= 10.0) return 0.0;
  if (t <= 12.2) return t - 10.0;
  if (t <= 13.0) return 2.2 + (t - 12.2) * 0.095;
  return 2.276 + (t - 13.0) * 1.45;
}

function createRng(seed = 20261122) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    bits(k) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) & ((1 << k) - 1);
    },
  };
}

function clampU8(v) {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return (v + 0.5) | 0;
}

function packRgb(r, g, b) {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

function lerpPacked(c1, c2, t) {
  if (t <= 0) return c1;
  if (t >= 1) return c2;
  const inv = 1.0 - t;
  const r = (((c1 >> 16) & 255) * inv + ((c2 >> 16) & 255) * t + 0.5) | 0;
  const g = (((c1 >> 8) & 255) * inv + ((c2 >> 8) & 255) * t + 0.5) | 0;
  const b = ((c1 & 255) * inv + (c2 & 255) * t + 0.5) | 0;
  return (r << 16) | (g << 8) | b;
}

function supportsTruecolor(env = process.env) {
  const colorterm = String((env && env.COLORTERM) || '').toLowerCase();
  if (colorterm.includes('truecolor') || colorterm.includes('24bit')) {
    return true;
  }
  if (env && env.TERM_PROGRAM === 'Apple_Terminal') {
    return false;
  }
  return true;
}

function rgbToAnsi256(r, g, b) {
  if (Math.abs(r - g) <= 8 && Math.abs(g - b) <= 8) {
    const avg = ((r + g + b) / 3) | 0;
    if (avg < 8) return 16;
    if (avg > 248) return 231;
    return 232 + ((((avg - 8) / 247.0) * 24.0) | 0);
  }
  const ri = Math.round((r / 255.0) * 5.0);
  const gi = Math.round((g / 255.0) * 5.0);
  const bi = Math.round((b / 255.0) * 5.0);
  return 16 + 36 * ri + 6 * gi + bi;
}

function isWideCodePoint(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  );
}

function displayWidth(text) {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    w += isWideCodePoint(cp) ? 2 : 1;
  }
  return w;
}

function clipToColumns(text, maxCols) {
  if (maxCols <= 0) return '';
  let out = '';
  let used = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    const w = isWideCodePoint(cp) ? 2 : 1;
    if (used + w > maxCols) break;
    out += ch;
    used += w;
  }
  return out;
}

function evalQuadBezier(p0, p1, p2, steps = 12) {
  const pts = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const inv = 1.0 - t;
    const x = inv * inv * p0[0] + 2.0 * inv * t * p1[0] + t * t * p2[0];
    const y = inv * inv * p0[1] + 2.0 * inv * t * p1[1] + t * t * p2[1];
    pts.push([x, y]);
  }
  return pts;
}

function buildPath(segments) {
  const pts = [];
  let cur = [0.0, 0.0];
  for (const seg of segments) {
    const cmd = seg[0];
    if (cmd === 'M' || cmd === 'L') {
      cur = [seg[1], seg[2]];
      pts.push(cur);
    } else if (cmd === 'Q') {
      const ctrl = [seg[1], seg[2]];
      const end = [seg[3], seg[4]];
      const steps = seg.length > 5 ? seg[5] : 12;
      const curve = evalQuadBezier(cur, ctrl, end, steps);
      for (const p of curve) pts.push(p);
      cur = end;
    }
  }
  return pts;
}

function fillPolygonMask(mask, gw, gh, normPoly, val = 1, offsetX = 0.0, offsetY = 0.0) {
  const n = normPoly.length;
  if (n < 3) return;
  const polyX = new Float64Array(n);
  const polyY = new Float64Array(n);
  let minYVal = gh;
  let maxYVal = 0;
  for (let i = 0; i < n; i += 1) {
    const x = (normPoly[i][0] + offsetX) * gw;
    const y = (normPoly[i][1] + offsetY) * gh;
    polyX[i] = x;
    polyY[i] = y;
    if (y < minYVal) minYVal = y;
    if (y > maxYVal) maxYVal = y;
  }
  const minY = Math.max(0, Math.floor(minYVal));
  const maxY = Math.min(gh - 1, Math.floor(maxYVal));

  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    const nodes = [];
    let j = n - 1;
    for (let i = 0; i < n; i += 1) {
      const yi = polyY[i];
      const yj = polyY[j];
      if ((yi < py && py <= yj) || (yj < py && py <= yi)) {
        nodes.push(polyX[i] + ((py - yi) / (yj - yi)) * (polyX[j] - polyX[i]));
      }
      j = i;
    }
    nodes.sort((a, b) => a - b);
    const rowOff = y * gw;
    for (let k = 0; k + 1 < nodes.length; k += 2) {
      const xStart = Math.max(0, Math.floor(nodes[k] + 0.5));
      const xEnd = Math.min(gw, Math.floor(nodes[k + 1] + 0.5));
      if (xEnd > xStart) {
        mask.fill(val, rowOff + xStart, rowOff + xEnd);
      }
    }
  }
}

function strokePolylineMask(mask, gw, gh, normPts, radiusNormH, val = 1, closed = false) {
  if (normPts.length < 2) return;
  const aspect = 16.0 / 9.0;
  const rxPx = Math.max(0.75, (radiusNormH / aspect) * gw);
  const ryPx = Math.max(0.75, radiusNormH * gh);
  const rPhys2 = radiusNormH * radiusNormH;
  const invGwAspect = aspect / gw;
  const invGh = 1.0 / gh;
  const cnt = closed ? normPts.length : normPts.length - 1;

  for (let i = 0; i < cnt; i += 1) {
    const [nx1, ny1] = normPts[i];
    const [nx2, ny2] = normPts[(i + 1) % normPts.length];
    const x1Px = nx1 * gw;
    const y1Px = ny1 * gh;
    const x2Px = nx2 * gw;
    const y2Px = ny2 * gh;
    const minX = Math.max(0, Math.floor(Math.min(x1Px, x2Px) - rxPx - 1));
    const maxX = Math.min(gw - 1, Math.floor(Math.max(x1Px, x2Px) + rxPx + 1));
    const minY = Math.max(0, Math.floor(Math.min(y1Px, y2Px) - ryPx - 1));
    const maxY = Math.min(gh - 1, Math.floor(Math.max(y1Px, y2Px) + ryPx + 1));

    const ax1 = nx1 * aspect;
    const ay1 = ny1;
    const dx = nx2 * aspect - ax1;
    const dy = ny2 - ay1;
    const l2 = dx * dx + dy * dy;
    const invL2 = l2 > 1e-12 ? 1.0 / l2 : 0.0;

    for (let y = minY; y <= maxY; y += 1) {
      const py = (y + 0.5) * invGh;
      const rowOff = y * gw;
      const pyAy1 = py - ay1;
      for (let x = minX; x <= maxX; x += 1) {
        const px = (x + 0.5) * invGwAspect;
        const pxAx1 = px - ax1;
        let d2;
        if (invL2 === 0.0) {
          d2 = pxAx1 * pxAx1 + pyAy1 * pyAy1;
        } else {
          let t = (pxAx1 * dx + pyAy1 * dy) * invL2;
          if (t < 0.0) t = 0.0;
          else if (t > 1.0) t = 1.0;
          const rx = pxAx1 - t * dx;
          const ry = pyAy1 - t * dy;
          d2 = rx * rx + ry * ry;
        }
        if (d2 <= rPhys2) {
          mask[rowOff + x] = val;
        }
      }
    }
  }
}

function downsample2x2Mask(hiMask, gw, gh) {
  const gw2 = gw * 2;
  const out = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y += 1) {
    const r0 = 2 * y * gw2;
    const r1 = r0 + gw2;
    const dstOff = y * gw;
    for (let x = 0; x < gw; x += 1) {
      const x2 = 2 * x;
      out[dstOff + x] =
        hiMask[r0 + x2] + hiMask[r0 + x2 + 1] + hiMask[r1 + x2] + hiMask[r1 + x2 + 1];
    }
  }
  return out;
}

const SECTOR_5 = (2.0 * Math.PI) / 5.0;
const HALF_SECTOR_5 = 0.5 * SECTOR_5;

function pyMod(a, m) {
  const r = a % m;
  return r < 0 ? r + m : r;
}

function sakuraHit(dx, dy, radius, invRadius, maxR2, hubR2, angleRad, minSeamHalfW) {
  const r2 = dx * dx + dy * dy;
  if (r2 > maxR2) return false;
  if (r2 <= hubR2) return true;
  const r = Math.sqrt(r2);
  const theta = Math.atan2(dy, dx) - angleRad;
  const localA = pyMod(theta + HALF_SECTOR_5, SECTOR_5) - HALF_SECTOR_5;
  const a = localA < 0 ? -localA : localA;
  if ((HALF_SECTOR_5 - a) * r < minSeamHalfW) return false;
  const rn = r * invRadius;
  const ly = rn * Math.cos(a);
  const ax = rn * Math.sin(a);
  if (-0.8 * ax + 0.6 * (ly - 0.02) < 0.0) return false;
  if (-0.96152 * (ax - 0.45) - 0.27472 * (ly - 0.62) < 0.0) return false;
  if (-0.44721 * (ax - 0.37) - 0.89443 * (ly - 0.90) < 0.0) return false;
  if (0.70711 * ax - 0.70711 * (ly - 0.83) < 0.0) return false;
  return true;
}

function singlePetalHit(dx, dy, invScale, cosNeg, sinNeg) {
  const lx = (dx * cosNeg - dy * sinNeg) * invScale;
  const ax = lx < 0 ? -lx : lx;
  if (ax > 0.52) return false;
  const ly = (dx * sinNeg + dy * cosNeg) * invScale + 0.52;
  if (ly < 0.0 || ly > 1.05) return false;
  return (
    -0.8 * ax + 0.6 * (ly - 0.02) >= 0.0 &&
    -0.96152 * (ax - 0.45) - 0.27472 * (ly - 0.62) >= 0.0 &&
    -0.44721 * (ax - 0.37) - 0.89443 * (ly - 0.90) >= 0.0 &&
    0.70711 * ax - 0.70711 * (ly - 0.83) >= 0.0
  );
}

function buildBbMainPolygon(isShadow = false) {
  const topY = isShadow ? 0.0 : 0.036;
  return buildPath([
    ['M', 0.308, topY],
    ['L', 0.538, topY],
    ['Q', 0.554, 0.072, 0.544, 0.118, 8],
    ['Q', 0.560, 0.195, 0.566, 0.355, 10],
    ['L', 0.584, 0.392],
    ['Q', 0.675, 0.448, 0.786, 0.565, 12],
    ['Q', 0.798, 0.618, 0.785, 0.688, 10],
    ['L', 0.752, 0.735],
    ['L', 0.858, 0.782],
    ['L', 0.715, 0.885],
    ['L', 0.515, 0.955],
    ['L', 0.180, 0.955],
    ['Q', 0.148, 0.910, 0.152, 0.855, 8],
    ['Q', 0.215, 0.745, 0.294, 0.642, 10],
    ['L', 0.286, 0.452],
    ['L', 0.205, 0.288],
    ['L', 0.304, 0.352],
    ['Q', 0.294, 0.195, 0.308, topY, 12],
  ]);
}

function buildBbRibbonBowPolygons() {
  const bowOuter = buildPath([
    ['M', 0.530, 0.112],
    ['Q', 0.552, 0.106, 0.562, 0.136, 6],
    ['L', 0.576, 0.124],
    ['L', 0.588, 0.174],
    ['Q', 0.616, 0.138, 0.646, 0.114, 10],
    ['Q', 0.628, 0.184, 0.598, 0.238, 10],
    ['Q', 0.572, 0.246, 0.542, 0.242, 8],
    ['L', 0.530, 0.112],
  ]);
  const bowInnerSlit = buildPath([
    ['M', 0.526, 0.142],
    ['Q', 0.548, 0.152, 0.546, 0.222, 8],
    ['Q', 0.538, 0.242, 0.525, 0.248, 8],
    ['Q', 0.520, 0.195, 0.526, 0.142, 8],
  ]);
  return [bowOuter, bowInnerSlit];
}

function buildBbCutoutPolygons() {
  return [
    [
      [0.344, 0.710],
      [0.376, 0.788],
      [0.348, 0.842],
      [0.280, 0.762],
    ],
    [
      [0.594, 0.618],
      [0.668, 0.636],
      [0.615, 0.742],
      [0.592, 0.688],
    ],
  ];
}

function buildGothicBPolygons() {
  const x0 = 0.014;
  const x1 = 0.292;
  const y0 = 0.228;
  const y1 = 0.768;
  const tx = (u, v) => [x0 + u * (x1 - x0), y0 + v * (y1 - y0)];

  const outerLocal = buildPath([
    ['M', 0.140, 0.000],
    ['Q', 0.275, 0.058, 0.435, 0.050, 8],
    ['Q', 0.560, 0.042, 0.665, 0.032, 8],
    ['Q', 0.948, 0.022, 0.948, 0.258, 14],
    ['Q', 0.948, 0.418, 0.795, 0.486, 12],
    ['Q', 0.996, 0.548, 0.996, 0.738, 14],
    ['Q', 0.996, 0.958, 0.680, 0.962, 14],
    ['Q', 0.520, 0.942, 0.422, 0.858, 10],
    ['Q', 0.358, 0.888, 0.278, 0.968, 10],
    ['Q', 0.160, 1.015, 0.062, 0.948, 10],
    ['Q', 0.002, 0.892, 0.000, 0.785, 10],
    ['Q', 0.072, 0.858, 0.172, 0.848, 8],
    ['Q', 0.272, 0.795, 0.285, 0.615, 10],
    ['L', 0.288, 0.185],
    ['Q', 0.275, 0.095, 0.140, 0.000, 10],
  ]);

  const upperHoleLocal = buildPath([
    ['M', 0.456, 0.118],
    ['Q', 0.468, 0.104, 0.595, 0.104, 8],
    ['Q', 0.818, 0.104, 0.818, 0.275, 12],
    ['Q', 0.818, 0.432, 0.685, 0.450, 10],
    ['Q', 0.605, 0.455, 0.548, 0.405, 8],
    ['L', 0.456, 0.466],
    ['L', 0.456, 0.118],
  ]);

  const lowerHoleLocal = buildPath([
    ['M', 0.456, 0.534],
    ['L', 0.548, 0.595],
    ['Q', 0.605, 0.545, 0.690, 0.542, 8],
    ['Q', 0.852, 0.540, 0.852, 0.708, 12],
    ['Q', 0.852, 0.872, 0.635, 0.876, 12],
    ['Q', 0.515, 0.874, 0.456, 0.805, 8],
    ['L', 0.456, 0.534],
  ]);

  const stemSpineLocal = buildPath([
    ['M', 0.295, 0.165],
    ['Q', 0.322, 0.210, 0.324, 0.320, 6],
    ['L', 0.324, 0.635],
    ['Q', 0.305, 0.840, 0.145, 0.920, 10],
    ['Q', 0.055, 0.910, 0.020, 0.805, 8],
  ]);

  return [
    outerLocal.map(([u, v]) => tx(u, v)),
    upperHoleLocal.map(([u, v]) => tx(u, v)),
    lowerHoleLocal.map(([u, v]) => tx(u, v)),
    stemSpineLocal.map(([u, v]) => tx(u, v)),
  ];
}

const CHANNEL_GLYPHS_HD = {
  C: [
    '......############......',
    '...##################...',
    '..######........######..',
    '.#####.............#####',
    '####................####',
    '####........###.....####',
    '####.......###......####',
    '####.......###....######',
    '####........##########..',
    '####....................',
    '####....................',
    '.#####..................',
    '..######..........###...',
    '...##################...',
    '......############......',
  ],
  h: [
    '..........',
    '##........',
    '##........',
    '##........',
    '##........',
    '##........',
    '########..',
    '##.....###',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
  ],
  a: [
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '.#######..',
    '.......###',
    '........##',
    '..########',
    '###.....##',
    '##......##',
    '##......##',
    '###.....##',
    '..########',
  ],
  n: [
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '########..',
    '##.....###',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
  ],
  e: [
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..######..',
    '###....###',
    '##......##',
    '##......##',
    '##########',
    '##........',
    '##........',
    '###....###',
    '..######..',
  ],
  l: ['..', '##', '##', '##', '##', '##', '##', '##', '##', '##', '##', '##', '##', '##', '##'],
};

const CHANNEL_GLYPHS_STD = {
  C: [
    '....##########....',
    '..##############..',
    '.####........####.',
    '####..........####',
    '####....###...####',
    '####...###....####',
    '####...###..######',
    '####....########..',
    '####..............',
    '.####.............',
    '..##############..',
    '....##########....',
  ],
  h: [
    '........',
    '##......',
    '##......',
    '##......',
    '######..',
    '##...###',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
  ],
  a: [
    '........',
    '........',
    '........',
    '........',
    '.#####..',
    '.....###',
    '..######',
    '###...##',
    '##....##',
    '##....##',
    '###...##',
    '..######',
  ],
  n: [
    '........',
    '........',
    '........',
    '........',
    '######..',
    '##...###',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
  ],
  e: [
    '........',
    '........',
    '........',
    '........',
    '..####..',
    '###..###',
    '##....##',
    '########',
    '##......',
    '##......',
    '###..###',
    '..####..',
  ],
  l: ['..', '##', '##', '##', '##', '##', '##', '##', '##', '##', '##', '##'],
};

const CHANNEL_GLYPHS_CMP = {
  C: [
    '...########...',
    '.############.',
    '####......####',
    '###...##...###',
    '###..##..#####',
    '###...######..',
    '###...........',
    '####..........',
    '.###########..',
    '...########...',
  ],
  h: [
    '......',
    '##....',
    '##....',
    '#####.',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
  ],
  a: [
    '......',
    '......',
    '......',
    '.####.',
    '....##',
    '.#####',
    '##..##',
    '##..##',
    '##..##',
    '.#####',
  ],
  n: [
    '......',
    '......',
    '......',
    '#####.',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
  ],
  e: [
    '......',
    '......',
    '......',
    '.####.',
    '##..##',
    '##..##',
    '######',
    '##....',
    '##..##',
    '.####.',
  ],
  l: ['..', '##', '##', '##', '##', '##', '##', '##', '##', '##'],
};

function assembleChannelBitmap(table, gapAfterC, gapLower) {
  const word = 'Channel';
  const h = table.C.length;
  const rows = new Array(h).fill('');
  for (let i = 0; i < word.length; i += 1) {
    const g = table[word[i]];
    const gap = i === 0 ? 0 : i === 1 ? gapAfterC : gapLower;
    const gapStr = gap > 0 ? '.'.repeat(gap) : '';
    for (let r = 0; r < h; r += 1) {
      rows[r] += gapStr + g[r];
    }
  }
  return rows;
}

const CHANNEL_BITMAP_HD = assembleChannelBitmap(CHANNEL_GLYPHS_HD, 4, 4);
const CHANNEL_BITMAP_HD_TIGHT = assembleChannelBitmap(CHANNEL_GLYPHS_HD, 2, 2);
const CHANNEL_BITMAP_STD = assembleChannelBitmap(CHANNEL_GLYPHS_STD, 4, 4);
const CHANNEL_BITMAP_STD_TIGHT = assembleChannelBitmap(CHANNEL_GLYPHS_STD, 2, 2);
const CHANNEL_BITMAP_CMP = assembleChannelBitmap(CHANNEL_GLYPHS_CMP, 4, 2);

const CHANNEL_QUAD_CANDIDATES = [
  CHANNEL_BITMAP_CMP,
  CHANNEL_BITMAP_STD_TIGHT,
  CHANNEL_BITMAP_STD,
  CHANNEL_BITMAP_HD_TIGHT,
  CHANNEL_BITMAP_HD,
];

function selectChannelBitmap(gw, gh) {
  if (gh <= 88 && gw <= 316) {
    if (gh >= 74 && gw >= 264) return { bitmap: CHANNEL_BITMAP_HD, scale: 1 };
    if (gh >= 58 && gw >= 208) return { bitmap: CHANNEL_BITMAP_STD, scale: 1 };
    return { bitmap: CHANNEL_BITMAP_CMP, scale: 1 };
  }

  const targetW = gw * 0.352;
  const targetH = gh * 0.195;
  const maxW = gw * 0.382;
  const maxH = gh * 0.235;
  let bestBmp = CHANNEL_BITMAP_CMP;
  let bestScale = 1;
  let bestErr = 1e9;

  for (const bmp of CHANNEL_QUAD_CANDIDATES) {
    const bw = bmp[0].length;
    const bh = bmp.length;
    const maxS = Math.max(1, Math.floor(Math.min(Math.floor(maxW / bw), Math.floor(maxH / bh))));
    for (let s = 1; s < maxS + 2; s += 1) {
      const w = bw * s;
      const h = bh * s;
      if (w > maxW || h > maxH) continue;
      const err = Math.abs(w - targetW) / targetW + Math.abs(h - targetH) / targetH - bh / 180.0;
      if (err < bestErr) {
        bestErr = err;
        bestBmp = bmp;
        bestScale = s;
      }
    }
  }
  return { bitmap: bestBmp, scale: bestScale };
}

function rasterizePixelPerfectChannel(chMask, gw, gh) {
  const { bitmap, scale } = selectChannelBitmap(gw, gh);
  const baseH = bitmap.length;
  const baseW = bitmap[0].length;
  const artH = baseH * scale;
  const artW = baseW * scale;
  const startX = Math.floor((gw - artW) / 4) * 2;
  const startY = Math.floor((gh - artH) / 4) * 2;

  for (let r = 0; r < baseH; r += 1) {
    const rowStr = bitmap[r];
    const yBase = startY + r * scale;
    for (let dy = 0; dy < scale; dy += 1) {
      const y = yBase + dy;
      if (y < 0 || y >= gh) continue;
      const rowOff = y * gw;
      for (let c = 0; c < baseW; c += 1) {
        if (rowStr[c] === '#') {
          const xBase = startX + c * scale;
          for (let dx = 0; dx < scale; dx += 1) {
            const x = xBase + dx;
            if (x >= 0 && x < gw) {
              chMask[rowOff + x] = 4;
            }
          }
        }
      }
    }
  }
}

function snapBinaryMask(mask, threshold = 2) {
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = mask[i] >= threshold ? 4 : 0;
  }
  return mask;
}

function cleanBinaryMask(mask, gw, gh, minCompSize, maxHoleSize) {
  const n = gw * gh;
  if (minCompSize > 1) {
    const visited = new Uint8Array(n);
    const comp = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      if (mask[i] === 0 || visited[i]) continue;
      visited[i] = 1;
      let qh = 0;
      let qt = 0;
      comp[qt++] = i;
      while (qh < qt) {
        const cur = comp[qh++];
        const cx = cur % gw;
        const cy = (cur / gw) | 0;
        if (cx > 0 && mask[cur - 1] && !visited[cur - 1]) {
          visited[cur - 1] = 1;
          comp[qt++] = cur - 1;
        }
        if (cx + 1 < gw && mask[cur + 1] && !visited[cur + 1]) {
          visited[cur + 1] = 1;
          comp[qt++] = cur + 1;
        }
        if (cy > 0 && mask[cur - gw] && !visited[cur - gw]) {
          visited[cur - gw] = 1;
          comp[qt++] = cur - gw;
        }
        if (cy + 1 < gh && mask[cur + gw] && !visited[cur + gw]) {
          visited[cur + gw] = 1;
          comp[qt++] = cur + gw;
        }
      }
      if (qt < minCompSize) {
        for (let k = 0; k < qt; k += 1) {
          mask[comp[k]] = 0;
        }
      }
    }
  }

  if (maxHoleSize > 0) {
    const visited = new Uint8Array(n);
    const comp = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      if (mask[i] !== 0 || visited[i]) continue;
      visited[i] = 1;
      let qh = 0;
      let qt = 0;
      let touchesBorder = false;
      comp[qt++] = i;
      while (qh < qt) {
        const cur = comp[qh++];
        const cx = cur % gw;
        const cy = (cur / gw) | 0;
        if (cx === 0 || cx === gw - 1 || cy === 0 || cy === gh - 1) {
          touchesBorder = true;
        }
        if (cx > 0 && mask[cur - 1] === 0 && !visited[cur - 1]) {
          visited[cur - 1] = 1;
          comp[qt++] = cur - 1;
        }
        if (cx + 1 < gw && mask[cur + 1] === 0 && !visited[cur + 1]) {
          visited[cur + 1] = 1;
          comp[qt++] = cur + 1;
        }
        if (cy > 0 && mask[cur - gw] === 0 && !visited[cur - gw]) {
          visited[cur - gw] = 1;
          comp[qt++] = cur - gw;
        }
        if (cy + 1 < gh && mask[cur + gw] === 0 && !visited[cur + gw]) {
          visited[cur + gw] = 1;
          comp[qt++] = cur + gw;
        }
      }
      if (!touchesBorder && qt <= maxHoleSize) {
        for (let k = 0; k < qt; k += 1) {
          mask[comp[k]] = 4;
        }
      }
    }
  }

  return mask;
}

class FinaleCache {
  constructor(gw, gh) {
    this.gw = gw;
    this.gh = gh;
    const n = gw * gh;
    const gw2 = gw * 2;
    const gh2 = gh * 2;
    const n2 = gw2 * gh2;

    const hiBb = new Uint8Array(n2);
    const hiShadow = new Uint8Array(n2);

    const mainPoly = buildBbMainPolygon(false);
    const shadowMainPoly = buildBbMainPolygon(true);
    const [bowOuter, bowSlit] = buildBbRibbonBowPolygons();
    const cutouts = buildBbCutoutPolygons();

    const sx = 0.052;
    const sy = -0.018;
    fillPolygonMask(hiShadow, gw2, gh2, shadowMainPoly, 1, sx, sy);
    fillPolygonMask(hiShadow, gw2, gh2, bowOuter, 1, sx, sy);
    fillPolygonMask(hiShadow, gw2, gh2, bowSlit, 0, sx, sy);
    for (const cut of cutouts) fillPolygonMask(hiShadow, gw2, gh2, cut, 0, sx, sy);

    fillPolygonMask(hiBb, gw2, gh2, mainPoly, 1, 0, 0);
    fillPolygonMask(hiBb, gw2, gh2, bowOuter, 1, 0, 0);
    fillPolygonMask(hiBb, gw2, gh2, bowSlit, 0, 0, 0);
    for (const cut of cutouts) fillPolygonMask(hiBb, gw2, gh2, cut, 0, 0, 0);

    this.bbMask = cleanBinaryMask(snapBinaryMask(downsample2x2Mask(hiBb, gw, gh), 2), gw, gh, 12, 3);
    this.bbShadow = cleanBinaryMask(
      snapBinaryMask(downsample2x2Mask(hiShadow, gw, gh), 2),
      gw,
      gh,
      12,
      3
    );

    this.grayFrame = new Uint8Array(n);
    this.blackFrame = new Uint8Array(n);
    this._buildFrames(gw2, gh2);

    const hiBLeft = new Uint8Array(n2);
    const hiChiselDarkLeft = new Uint8Array(n2);
    const hiChiselLightLeft = new Uint8Array(n2);

    const [outer, h1, h2, spine] = buildGothicBPolygons();
    fillPolygonMask(hiBLeft, gw2, gh2, outer, 1);
    fillPolygonMask(hiBLeft, gw2, gh2, h1, 0);
    fillPolygonMask(hiBLeft, gw2, gh2, h2, 0);

    strokePolylineMask(hiChiselLightLeft, gw2, gh2, spine, 0.0038, 1);
    const spineDark = spine.map(([px, py]) => [px - 0.0042, py]);
    strokePolylineMask(hiChiselDarkLeft, gw2, gh2, spineDark, 0.0032, 1);

    const bClipW = Math.min(gw2, Math.floor(gw2 * 0.36) + 2);
    for (let y = 0; y < gh2; y += 1) {
      const rowOff = y * gw2;
      for (let x = 0; x < bClipW; x += 1) {
        const idx = rowOff + x;
        if (!hiBLeft[idx]) {
          hiChiselDarkLeft[idx] = 0;
          hiChiselLightLeft[idx] = 0;
        }
      }
    }

    const leftCore = cleanBinaryMask(
      snapBinaryMask(downsample2x2Mask(hiBLeft, gw, gh), 2),
      gw,
      gh,
      20,
      3
    );
    const leftDark = downsample2x2Mask(hiChiselDarkLeft, gw, gh);
    const leftLight = downsample2x2Mask(hiChiselLightLeft, gw, gh);

    this.bCore = new Uint8Array(n);
    this.bInnerBevel = new Uint8Array(n);
    this.bChiselDark = new Uint8Array(n);
    this.bChiselLight = new Uint8Array(n);

    const halfW = (gw / 2) | 0;
    for (let y = 0; y < gh; y += 1) {
      const rowOff = y * gw;
      for (let x = 0; x < halfW; x += 1) {
        const srcIdx = rowOff + x;
        if (!leftCore[srcIdx]) continue;
        const mirIdx = rowOff + (gw - 1 - x);
        this.bCore[srcIdx] = 4;
        this.bCore[mirIdx] = 4;
        this.bChiselDark[srcIdx] = leftDark[srcIdx];
        this.bChiselDark[mirIdx] = leftDark[srcIdx];
        this.bChiselLight[srcIdx] = leftLight[srcIdx];
        this.bChiselLight[mirIdx] = leftLight[srcIdx];

        const isEdge =
          x === 0 ||
          y === 0 ||
          y === gh - 1 ||
          !leftCore[srcIdx - 1] ||
          !leftCore[srcIdx + 1] ||
          !leftCore[srcIdx - gw] ||
          !leftCore[srcIdx + gw];
        if (isEdge) {
          this.bInnerBevel[srcIdx] = 2;
          this.bInnerBevel[mirIdx] = 2;
        }
      }
    }

    this.channelCore = new Uint8Array(n);
    rasterizePixelPerfectChannel(this.channelCore, gw, gh);

    this.logoGlow = new Uint8Array(n);
    this._buildNeonEffects();
    this._precomposeBuffers();
  }

  _buildFrames(gw2, gh2) {
    const aspect = 16.0 / 9.0;
    const angG = (15.5 * Math.PI) / 180.0;
    const cg = Math.cos(angG);
    const sg = Math.sin(angG);
    const invGw2 = 1.0 / gw2;
    const invGh2 = 1.0 / gh2;

    const hiBlack = new Uint8Array(gw2 * gh2);
    const hiGray = new Uint8Array(gw2 * gh2);

    const bxOut0 = Math.max(0, Math.floor((0.5 - 0.478) * gw2));
    const bxOut1 = Math.min(gw2, Math.floor((0.5 + 0.478) * gw2) + 1);
    const bxIn0 = Math.max(0, Math.floor((0.5 - 0.460) * gw2));
    const bxIn1 = Math.min(gw2, Math.floor((0.5 + 0.460) * gw2) + 1);
    const byOut0 = Math.max(0, Math.floor((0.5 - 0.466) * gh2));
    const byOut1 = Math.min(gh2, Math.floor((0.5 + 0.466) * gh2) + 1);

    for (let y = byOut0; y < byOut1; y += 1) {
      const ady = Math.abs((y + 0.5) * invGh2 - 0.5);
      if (ady > 0.466) continue;
      const rowOff = y * gw2;
      if (ady >= 0.440) {
        for (let x = bxOut0; x < bxOut1; x += 1) {
          if (Math.abs((x + 0.5) * invGw2 - 0.5) <= 0.478) {
            hiBlack[rowOff + x] = 1;
          }
        }
      } else {
        const leftEnd = Math.min(bxIn0 + 2, bxOut1);
        for (let x = bxOut0; x < leftEnd; x += 1) {
          const adx = Math.abs((x + 0.5) * invGw2 - 0.5);
          if (adx >= 0.460 && adx <= 0.478) hiBlack[rowOff + x] = 1;
        }
        const rightStart = Math.max(bxOut0, bxIn1 - 2);
        for (let x = rightStart; x < bxOut1; x += 1) {
          const adx = Math.abs((x + 0.5) * invGw2 - 0.5);
          if (adx >= 0.460 && adx <= 0.478) hiBlack[rowOff + x] = 1;
        }
      }
    }

    const gxStep = aspect * cg * invGw2;
    const gyStep = aspect * sg * invGw2;
    for (let y = 0; y < gh2; y += 1) {
      const dy = (y + 0.5) * invGh2 - 0.5;
      const rowOff = y * gw2;
      let gx = (-0.5 + 0.5 * invGw2) * aspect * cg - dy * sg;
      let gy = (-0.5 + 0.5 * invGw2) * aspect * sg + dy * cg;
      for (let x = 0; x < gw2; x += 1) {
        const agx = gx < 0 ? -gx : gx;
        const agy = gy < 0 ? -gy : gy;
        if (
          (agx >= 0.715 && agx <= 0.748 && agy <= 0.485) ||
          (agy >= 0.450 && agy <= 0.482 && agx <= 0.748)
        ) {
          hiGray[rowOff + x] = 1;
        }
        gx += gxStep;
        gy += gyStep;
      }
    }

    this.blackFrame.set(snapBinaryMask(downsample2x2Mask(hiBlack, this.gw, this.gh), 2));
    this.grayFrame.set(
      cleanBinaryMask(snapBinaryMask(downsample2x2Mask(hiGray, this.gw, this.gh), 2), this.gw, this.gh, 6, 2)
    );
  }

  _buildNeonEffects() {
    const { gw, gh, bCore } = this;
    const rGlow = Math.max(2, Math.floor(gh * 0.022 + 0.5));
    const rGlow2 = rGlow * rGlow;
    const invRGlow = 1.0 / (rGlow + 0.5);

    const horiz = new Uint8Array(gw * gh);
    horiz.fill(255);
    const activeRows = [];

    for (let y = 0; y < gh; y += 1) {
      const rowOff = y * gw;
      let last = -9999;
      let hasAny = false;
      for (let x = 0; x < gw; x += 1) {
        if (bCore[rowOff + x] >= 2) {
          last = x;
          hasAny = true;
        }
        const d = x - last;
        if (d <= rGlow) horiz[rowOff + x] = d;
      }
      if (!hasAny) continue;
      activeRows.push(y);
      last = 9999;
      for (let x = gw - 1; x >= 0; x -= 1) {
        if (bCore[rowOff + x] >= 2) last = x;
        const d = last - x;
        if (d < horiz[rowOff + x]) horiz[rowOff + x] = d;
      }
    }

    if (activeRows.length === 0) return;
    const yMin = Math.max(0, activeRows[0] - rGlow);
    const yMax = Math.min(gh - 1, activeRows[activeRows.length - 1] + rGlow);

    for (let y = yMin; y <= yMax; y += 1) {
      const y0 = Math.max(0, y - rGlow);
      const y1 = Math.min(gh - 1, y + rGlow);
      const rowOff = y * gw;
      for (let x = 0; x < gw; x += 1) {
        let minD2 = 999999;
        for (let yy = y0; yy <= y1; yy += 1) {
          const hd = horiz[yy * gw + x];
          if (hd <= rGlow) {
            const dy = y - yy;
            const d2 = hd * hd + dy * dy;
            if (d2 < minD2) minD2 = d2;
          }
        }
        if (minD2 <= rGlow2) {
          const t = Math.max(0.0, 1.0 - Math.sqrt(minD2) * invRGlow);
          this.logoGlow[rowOff + x] = (t * 255) | 0;
        }
      }
    }
  }

  _precomposeBuffers() {
    const { gw, gh } = this;
    const n = gw * gh;
    const WHITE = packRgb(255, 255, 255);
    const SHADOW_GRAY = packRgb(214, 214, 214);
    const FRAME_GRAY = packRgb(150, 150, 150);
    const PURE_BLACK = packRgb(10, 10, 12);
    const PINK_B1 = packRgb(248, 16, 162);
    const PINK_B2 = packRgb(254, 108, 196);
    const PINK_SHEEN = packRgb(255, 234, 249);
    const PINK_C1 = packRgb(250, 38, 174);
    const PINK_C2 = packRgb(254, 122, 204);
    const BEVEL_LIGHT = packRgb(255, 236, 250);
    const CHISEL_DARK = packRgb(204, 10, 132);
    const GLOW_DARK = packRgb(226, 24, 152);
    const GLOW_LIGHT = packRgb(246, 132, 204);

    const baseRgb = new Int32Array(n);
    const finalRgb = new Int32Array(n);
    baseRgb.fill(WHITE);
    finalRgb.fill(WHITE);

    const silNonwhite = [];
    const logoEntries = [];

    for (let y = 0; y < gh; y += 1) {
      const ny = (y + 0.5) / gh;
      const rowOff = y * gw;

      const sheenB = Math.exp(-Math.pow((ny - 0.588) / 0.031, 2));
      const lowerTintB = Math.min(1.0, Math.max(0.0, (ny - 0.602) / 0.16));
      const bBase = lerpPacked(PINK_B1, PINK_B2, lowerTintB * 0.58);
      const bFill = lerpPacked(bBase, PINK_SHEEN, Math.min(1.0, sheenB * 0.94));

      const sheenC = Math.exp(-Math.pow((ny - 0.548) / 0.028, 2));
      const lowerTintC = Math.min(1.0, Math.max(0.0, (ny - 0.55) / 0.055));
      const chBase = lerpPacked(PINK_C1, PINK_C2, lowerTintC * 0.55);
      const chFill = lerpPacked(chBase, PINK_SHEEN, Math.min(1.0, sheenC * 0.88));

      for (let x = 0; x < gw; x += 1) {
        const idx = rowOff + x;
        let col = WHITE;

        const shCov = this.bbShadow[idx];
        if (shCov) col = lerpPacked(col, SHADOW_GRAY, shCov * 0.25);
        const grCov = this.grayFrame[idx];
        if (grCov) col = lerpPacked(col, FRAME_GRAY, grCov * 0.25);
        const bbCov = this.bbMask[idx];
        if (bbCov) col = lerpPacked(col, PURE_BLACK, bbCov * 0.25);
        const bkCov = this.blackFrame[idx];
        if (bkCov) col = lerpPacked(col, PURE_BLACK, bkCov * 0.25);

        baseRgb[idx] = col;
        if (col !== WHITE) silNonwhite.push([idx, col]);

        const glowV = this.logoGlow[idx];
        const bCov = this.bCore[idx];
        const chCov = this.channelCore[idx];

        if (glowV > 0 || bCov > 0 || chCov > 0) {
          const isOverDark = bbCov >= 2 || bkCov >= 2;
          const glowBase =
            glowV > 0
              ? Math.pow(glowV / 255.0, isOverDark ? 1.55 : 2.2) * (isOverDark ? 0.48 : 0.14)
              : 0.0;
          let bPx = bFill;
          if (bCov > 0) {
            const bevelCov = this.bInnerBevel[idx];
            if (bevelCov > 0) bPx = lerpPacked(bPx, BEVEL_LIGHT, bevelCov * 0.18);
            const chDark = this.bChiselDark[idx];
            if (chDark > 0) bPx = lerpPacked(bPx, CHISEL_DARK, chDark * 0.14);
            const chLight = this.bChiselLight[idx];
            if (chLight > 0) bPx = lerpPacked(bPx, BEVEL_LIGHT, Math.min(1.0, chLight * 0.25));
          }

          let logoCol = col;
          if (glowBase > 0.0) {
            logoCol = lerpPacked(logoCol, isOverDark ? GLOW_DARK : GLOW_LIGHT, glowBase);
          }
          if (bCov > 0) logoCol = lerpPacked(logoCol, bPx, bCov * 0.25);
          if (chCov > 0) logoCol = lerpPacked(logoCol, chFill, chCov * 0.25);

          finalRgb[idx] = logoCol;
          logoEntries.push([idx, isOverDark, glowBase, bCov, bPx, chCov, chFill]);
        } else {
          finalRgb[idx] = col;
        }
      }
    }

    this.baseRgb = baseRgb;
    this.finalRgb = finalRgb;
    this.silNonwhite = silNonwhite;
    this.logoEntries = logoEntries;
  }
}

const TECH_GLYPHS_2X = {
  A: ['..##..', '##..##', '##..##', '######', '##..##', '##..##', '##..##', '......', '......'],
  r: ['......', '......', '######', '##....', '##....', '##....', '##....', '......', '......'],
  e: ['......', '......', '######', '##..##', '######', '##....', '######', '......', '......'],
  y: ['......', '......', '##..##', '##..##', '##..##', '######', '....##', '....##', '######'],
  u: ['......', '......', '##..##', '##..##', '##..##', '##..##', '######', '......', '......'],
  j: ['..##', '....', '..##', '..##', '..##', '..##', '..##', '..##', '####'],
  t: ['..##..', '..##..', '######', '..##..', '..##..', '..##..', '..####', '......', '......'],
  s: ['......', '......', '######', '##....', '######', '....##', '######', '......', '......'],
  n: ['......', '......', '######', '##..##', '##..##', '##..##', '##..##', '......', '......'],
  o: ['......', '......', '######', '##..##', '##..##', '##..##', '######', '......', '......'],
  w: ['..........', '..........', '##..##..##', '##..##..##', '##..##..##', '##..##..##', '##########', '..........', '..........'],
  ' ': ['......', '......', '......', '......', '......', '......', '......', '......', '......'],
  h: ['##....', '##....', '######', '##..##', '##..##', '##..##', '##..##', '......', '......'],
  a: ['......', '......', '######', '....##', '######', '##..##', '######', '......', '......'],
  c: ['......', '......', '######', '##....', '##....', '##....', '######', '......', '......'],
  k: ['##....', '##....', '##..##', '####..', '####..', '##..##', '##..##', '......', '......'],
  i: ['##', '..', '##', '##', '##', '##', '##', '..', '..'],
  g: ['......', '......', '######', '##..##', '##..##', '######', '....##', '....##', '######'],
  '.': ['..', '..', '..', '..', '..', '..', '##', '..', '..'],
};

const TECH_GLYPHS_1X = {
  A: ['.#.', '#.#', '#.#', '###', '#.#', '#.#', '#.#', '...', '...'],
  r: ['...', '...', '###', '#..', '#..', '#..', '#..', '...', '...'],
  e: ['...', '...', '###', '#.#', '###', '#..', '###', '...', '...'],
  y: ['...', '...', '#.#', '#.#', '#.#', '###', '..#', '..#', '###'],
  u: ['...', '...', '#.#', '#.#', '#.#', '#.#', '###', '...', '...'],
  j: ['.#', '..', '.#', '.#', '.#', '.#', '.#', '.#', '##'],
  t: ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '.##', '...', '...'],
  s: ['...', '...', '###', '#..', '###', '..#', '###', '...', '...'],
  n: ['...', '...', '###', '#.#', '#.#', '#.#', '#.#', '...', '...'],
  o: ['...', '...', '###', '#.#', '#.#', '#.#', '###', '...', '...'],
  w: ['.....', '.....', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####', '.....', '.....'],
  ' ': ['...', '...', '...', '...', '...', '...', '...', '...', '...'],
  h: ['#..', '#..', '###', '#.#', '#.#', '#.#', '#.#', '...', '...'],
  a: ['...', '...', '###', '..#', '###', '#.#', '###', '...', '...'],
  c: ['...', '...', '###', '#..', '#..', '#..', '###', '...', '...'],
  k: ['#..', '#..', '#.#', '##.', '##.', '#.#', '#.#', '...', '...'],
  i: ['#', '.', '#', '#', '#', '#', '#', '.', '.'],
  g: ['...', '...', '###', '#.#', '#.#', '###', '..#', '..#', '###'],
  '.': ['.', '.', '.', '.', '.', '.', '#', '.', '.'],
};

function assembleBannerRows(text, table, gapCols, mirrorX = false) {
  const rows = new Array(9).fill('');
  const gapStr = '.'.repeat(gapCols);
  for (let idx = 0; idx < text.length; idx += 1) {
    const ch = text[idx];
    const glyph = table[ch];
    if (!glyph) continue;
    const prevCh = idx > 0 ? text[idx - 1] : '';
    const needGap = idx > 0 && ch !== ' ' && prevCh !== ' ' && ch !== 'j';
    for (let r = 0; r < 9; r += 1) {
      if (needGap) rows[r] += gapStr;
      rows[r] += glyph[r];
    }
  }
  return mirrorX ? rows.map((row) => row.split('').reverse().join('')) : rows;
}

const HACKING_ROWS_2X = assembleBannerRows('now hacking...', TECH_GLYPHS_2X, 2, false);
const HACKING_ROWS_1X = assembleBannerRows('now hacking...', TECH_GLYPHS_1X, 1, false);
const ENJOYING_MIRROR_ROWS_2X = assembleBannerRows('Are you enjoying this', TECH_GLYPHS_2X, 2, true);
const ENJOYING_MIRROR_ROWS_1X = assembleBannerRows('Are you enjoying this', TECH_GLYPHS_1X, 1, true);

class Scene2Cache {
  constructor(gw, gh, seed = 20261122) {
    this.gw = gw;
    this.gh = gh;
    const rng = createRng(seed);
    const variants = 4;
    this.variants = variants;

    const invGw = 1.0 / gw;
    const invGh = 1.0 / gh;
    const nxArr = new Float64Array(gw);
    const sideVig = new Float64Array(gw);
    for (let x = 0; x < gw; x += 1) {
      const nx = (x + 0.5) * invGw;
      nxArr[x] = nx;
      sideVig[x] = Math.max(0.0, Math.min(1.0, (0.48 - Math.abs(nx - 0.5)) / 0.14));
    }
    this.nxArr = nxArr;
    this.sideVig = sideVig;

    const tiers = [
      [30, 18, 32],
      [96, 72, 100],
      [176, 138, 180],
    ];
    const jitters = [-12, 0, 12];
    const shadePalette = [];
    for (let bIdx = 0; bIdx < 16; bIdx += 1) {
      const v = 0.34 + (bIdx / 15.0) * 0.72;
      const bucketCols = [];
      for (const [br, bg, bb] of tiers) {
        for (const jit of jitters) {
          const rC = (clampU8((br + jit) * v) + 4) & ~7;
          const gC = (clampU8((bg + jit) * v) + 4) & ~7;
          const bC = (clampU8((bb + jit) * v) + 4) & ~7;
          bucketCols.push(packRgb(rC > 255 ? 255 : rC, gC > 255 ? 255 : gC, bC > 255 ? 255 : bC));
        }
      }
      const weighted = new Int32Array(32);
      let wi = 0;
      for (let k = 0; k < 4; k += 1) {
        weighted[wi++] = bucketCols[0];
        weighted[wi++] = bucketCols[1];
        weighted[wi++] = bucketCols[2];
      }
      for (let k = 0; k < 4; k += 1) {
        weighted[wi++] = bucketCols[3];
        weighted[wi++] = bucketCols[4];
        weighted[wi++] = bucketCols[5];
      }
      weighted[wi++] = bucketCols[4];
      for (let k = 0; k < 2; k += 1) {
        weighted[wi++] = bucketCols[6];
        weighted[wi++] = bucketCols[7];
        weighted[wi++] = bucketCols[8];
      }
      weighted[wi++] = bucketCols[7];
      shadePalette.push(weighted);
    }

    const rowPools = [];
    for (let y = 0; y < gh; y += 1) {
      const ny = (y + 0.5) * invGh;
      const vy2 = (ny - 0.5) * (ny - 0.5);
      const scanDim = y & 1 ? 0.9 : 1.04;
      const rowBuckets = new Array(gw);
      for (let x = 0; x < gw; x += 1) {
        const nx = nxArr[x];
        const vig = Math.max(0.38, 1.0 - 0.6 * ((nx - 0.5) * (nx - 0.5) + vy2)) * scanDim;
        const b = Math.max(0, Math.min(15, Math.floor(((vig - 0.34) / 0.72) * 15.0 + 0.5)));
        rowBuckets[x] = shadePalette[b];
      }
      const poolY = [];
      for (let v = 0; v < variants; v += 1) {
        const strip = new Int32Array(gw);
        for (let x = 0; x < gw; x += 1) {
          strip[x] = rowBuckets[x][rng.bits(5)];
        }
        poolY.push(strip);
      }
      rowPools.push(poolY);
    }
    this.rowPools = rowPools;

    const use2x = gh > 0 ? gw / gh >= 2.4 : gw >= 160;
    const rows = use2x ? HACKING_ROWS_2X : HACKING_ROWS_1X;
    const baseW = rows[0].length;
    let scale = Math.max(1, Math.floor((gh + 32) / 64));
    while (scale > 1 && baseW * scale > Math.floor(gw * 0.90)) {
      scale -= 1;
    }
    const bannerW = baseW * scale;
    const bannerH = 9 * scale;
    const startX = use2x ? Math.floor((gw - bannerW) / 4) * 2 : Math.floor((gw - bannerW) / 2);
    const startY = Math.floor(Math.floor(gh * 0.563) / 2) * 2;

    const isHit = (px, py) => {
      const dxP = px - startX;
      const dyP = py - startY;
      if (dxP < 0 || dxP >= bannerW || dyP < 0 || dyP >= bannerH) return false;
      return rows[Math.floor(dyP / scale)][Math.floor(dxP / scale)] === '#';
    };

    const hitIndices = [];
    const haloIndices = [];
    const pad = scale + 1;
    const x0 = Math.max(0, startX - pad);
    const x1 = Math.min(gw, startX + bannerW + pad);
    const y0 = Math.max(0, startY - pad);
    const y1 = Math.min(gh, startY + bannerH + pad);
    const haloSteps = [-scale, 0, scale];

    for (let y = y0; y < y1; y += 1) {
      const rowOff = y * gw;
      const cellY0 = y & ~1;
      for (let x = x0; x < x1; x += 1) {
        if (isHit(x, y)) {
          hitIndices.push(rowOff + x);
          continue;
        }
        const cellX0 = use2x ? x & ~1 : x;
        if (
          isHit(cellX0, cellY0) ||
          isHit(cellX0 + 1, cellY0) ||
          isHit(cellX0, cellY0 + 1) ||
          isHit(cellX0 + 1, cellY0 + 1)
        ) {
          haloIndices.push(rowOff + x);
          continue;
        }
        let found = false;
        for (let di = 0; di < haloSteps.length && !found; di += 1) {
          const dy = haloSteps[di];
          for (let dj = 0; dj < haloSteps.length; dj += 1) {
            const dx = haloSteps[dj];
            if ((dx !== 0 || dy !== 0) && isHit(x + dx, y + dy)) {
              found = true;
              break;
            }
          }
        }
        if (found) haloIndices.push(rowOff + x);
      }
    }

    this.hitIndices = Int32Array.from(hitIndices);
    this.haloIndices = Int32Array.from(haloIndices);
  }
}

class Scene4Cache {
  constructor(gw, gh) {
    this.gw = gw;
    this.gh = gh;
    const aspect = 16.0 / 9.0;
    const subOy = 0.25 / gh;
    const subOx = 0.25 / gw;

    const ringParams = [];
    for (const [lcx, lcy, lrad, lang0, lspeed] of SCENE4_LACE_SPECS) {
      const nComp = lrad >= 0.62 ? 15 : 12;
      const pxU = 1.0 / (gh * lrad);
      const trackW = Math.max(0.022, pxU * 0.96);
      const inOuter = 0.684;
      const inInner = inOuter - trackW;
      const outInner = 0.896;
      const outOuter = outInner + trackW;
      const inAmp = Math.max(0.034, pxU * 1.35);
      const outAmp = Math.max(0.038, pxU * 1.45);
      const sec = (2.0 * Math.PI) / nComp;
      const halfSec = 0.5 * sec;
      const halfW = halfSec * 0.79;
      const pillarHalfW = Math.max(0.010, pxU * 0.48);
      const beadR2 = Math.pow(Math.max(0.021, pxU * 0.88), 2);
      const hubR2 = Math.pow(Math.max(0.017, pxU * 0.74), 2);
      const spokeHalfW = Math.max(0.0095, pxU * 0.47);
      ringParams.push([
        lcx,
        lcy,
        lrad,
        lang0,
        lspeed,
        nComp,
        inInner,
        inOuter,
        outInner,
        outOuter,
        inAmp,
        outAmp,
        sec,
        halfSec,
        halfW,
        pillarHalfW,
        beadR2,
        hubR2,
        spokeHalfW,
      ]);
    }
    this.ringParams = ringParams;

    const permanentHits = [];
    const dynamicPixels = [];
    const subOffsets = [
      [-subOx, -subOy],
      [subOx, -subOy],
      [-subOx, subOy],
      [subOx, subOy],
    ];

    for (let y = 0; y < gh; y += 1) {
      const ny = (y + 0.5) / gh;
      const rowOff = y * gw;
      for (let x = 0; x < gw; x += 1) {
        const nx = (x + 0.5) / gw;
        let nearAny = false;
        for (let r = 0; r < ringParams.length; r += 1) {
          const rp = ringParams[r];
          const lim = rp[2] * 1.04;
          if (Math.abs((nx - rp[0]) * aspect) <= lim && Math.abs(ny - rp[1]) <= lim) {
            nearAny = true;
            break;
          }
        }
        if (!nearAny) continue;

        let alwaysHits = 0;
        const dynSubs = [];
        for (const [ox, oy] of subOffsets) {
          const snx = nx + ox;
          const sny = ny + oy;
          let subAlways = false;
          const ringChecks = [];
          for (let rId = 0; rId < ringParams.length; rId += 1) {
            const rp = ringParams[rId];
            const ldx = (snx - rp[0]) * aspect;
            const ldy = sny - rp[1];
            const lrad = rp[2];
            const r2 = ldx * ldx + ldy * ldy;
            if (r2 > Math.pow(lrad * 1.03, 2) || r2 < Math.pow(lrad * 0.58, 2)) continue;
            const u = Math.sqrt(r2) / lrad;
            const inInner = rp[6];
            const inOuter = rp[7];
            const outInner = rp[8];
            const outOuter = rp[9];
            if ((u >= inInner && u <= inOuter) || (u >= outInner && u <= outOuter)) {
              subAlways = true;
              break;
            }
            const baseTheta = Math.atan2(ldy, ldx);
            if (u < inInner) {
              const thresh = (inInner - u) / rp[10];
              if (thresh <= 1.0) ringChecks.push([rId, 0, baseTheta, thresh]);
            } else if (u < outInner) {
              ringChecks.push([rId, 1, baseTheta, u - 0.79]);
            } else {
              const thresh = (u - outOuter) / rp[11];
              if (thresh <= 1.0) ringChecks.push([rId, 2, baseTheta, thresh]);
            }
          }
          if (subAlways) alwaysHits += 1;
          else if (ringChecks.length > 0) dynSubs.push(ringChecks);
        }

        if (alwaysHits >= 2) {
          permanentHits.push(rowOff + x);
        } else if (alwaysHits + dynSubs.length >= 2) {
          dynamicPixels.push([rowOff + x, 2 - alwaysHits, dynSubs]);
        }
      }
    }

    this.permanentHits = Int32Array.from(permanentHits);
    this.dynamicPixels = dynamicPixels;
    this.laceMask = new Uint8Array(gw * gh);

    const use2x = gh > 0 ? gw / gh >= 2.4 : gw >= 160;
    const rows = use2x ? ENJOYING_MIRROR_ROWS_2X : ENJOYING_MIRROR_ROWS_1X;
    const baseW = rows[0].length;
    let scale = Math.max(1, Math.floor((gh + 32) / 64));
    while (scale > 1 && baseW * scale > Math.floor(gw * 0.90)) {
      scale -= 1;
    }
    const bannerW = baseW * scale;
    const bannerH = 9 * scale;
    const startX = use2x ? Math.floor((gw - bannerW) / 4) * 2 : Math.floor((gw - bannerW) / 2);
    const startY = Math.floor(Math.floor(gh * 0.442) / 2) * 2;

    const enjoyIndices = [];
    for (let ry = 0; ry < bannerH; ry += 1) {
      const y = startY + ry;
      if (y >= 0 && y < gh) {
        const rowStr = rows[Math.floor(ry / scale)];
        const rowOff = y * gw;
        for (let cx = 0; cx < baseW; cx += 1) {
          if (rowStr[cx] === '#') {
            const xBase = startX + cx * scale;
            for (let dx = 0; dx < scale; dx += 1) {
              const x = xBase + dx;
              if (x >= 0 && x < gw) enjoyIndices.push(rowOff + x);
            }
          }
        }
      }
    }
    this.enjoyIndices = Int32Array.from(enjoyIndices);
  }
}

class CinemaCaches {
  constructor(gw, gh) {
    this.gw = gw;
    this.gh = gh;
    this._scene2 = null;
    this._scene4 = null;
    this._finale = null;
  }

  get scene2() {
    if (!this._scene2) this._scene2 = new Scene2Cache(this.gw, this.gh);
    return this._scene2;
  }

  get scene4() {
    if (!this._scene4) this._scene4 = new Scene4Cache(this.gw, this.gh);
    return this._scene4;
  }

  get finale() {
    if (!this._finale) this._finale = new FinaleCache(this.gw, this.gh);
    return this._finale;
  }
}

function renderScene1Black(buf) {
  buf.fill(0);
}

function renderScene2Hacking(buf, gw, gh, t, rng, cache) {
  const n = gw * gh;
  if (t >= 4.30 && t < 4.38) {
    buf.fill(0xffffff);
    return;
  }

  const aspect = 16.0 / 9.0;
  const aa = 1.05 / gh;
  const angleCw = (t - 0.80) * 2.25;
  const sakuraR = 0.095;
  const cx = 0.50;
  const cy = 0.422;
  const isGlitchMode = (t >= 3.12 && t < 3.26) || (t >= 4.38 && t < 6.00);

  let fgCol;
  if (t < 2.67) {
    fgCol = packRgb(254, 254, 255);
  } else if (t < 4.30) {
    const p = Math.min(1.0, (t - 2.67) / 0.25);
    fgCol = lerpPacked(packRgb(254, 254, 255), packRgb(242, 114, 118), p);
  } else if (t < 6.00) {
    const cycle = Math.sin((t - 4.38) * 18.5);
    if (cycle > 0.45) fgCol = packRgb(255, 253, 255);
    else if (cycle > -0.25) fgCol = packRgb(248, 182, 132);
    else fgCol = packRgb(242, 134, 58);
  } else if (t < 6.24) {
    fgCol = packRgb(255, 252, 252);
  } else {
    const p = Math.min(1.0, (t - 6.24) / 0.35);
    fgCol = lerpPacked(packRgb(255, 252, 252), packRgb(242, 158, 96), p);
  }

  if (!isGlitchMode && t < 6.00) {
    const { rowPools } = cache;
    for (let y = 0; y < gh; y += 1) {
      buf.set(rowPools[y][rng.bits(2)], y * gw);
    }
    if (t >= 0.78 && t <= 1.06) {
      const flashK = Math.max(0.0, 1.0 - (t - 0.78) / 0.28) * 0.85;
      if (flashK > 0.0) {
        const invK = 1.0 - flashK;
        const fr = 235.0 * flashK + 0.5;
        const fgF = 232.0 * flashK + 0.5;
        const fb = 238.0 * flashK + 0.5;
        for (let i = 0; i < n; i += 1) {
          const c = buf[i];
          const r = (((c >> 16) & 255) * invK + fr) | 0;
          const g = (((c >> 8) & 255) * invK + fgF) | 0;
          const b = ((c & 255) * invK + fb) | 0;
          buf[i] = (r << 16) | (g << 8) | b;
        }
      }
    }
  } else if (isGlitchMode) {
    const palette = [
      [12, 4, 16],
      [28, 10, 36],
      [68, 28, 78],
      [128, 62, 142],
      [188, 114, 202],
      [238, 196, 244],
    ];
    let curCol = palette[0];
    let curShift = 0.0;
    const bandMod = Math.max(1, (gh / 42) | 0);
    const { nxArr, sideVig } = cache;

    for (let y = 0; y < gh; y += 1) {
      if (y % bandMod === 0 || rng.next() < 0.38) {
        curCol = palette[Math.min(5, Math.floor(Math.pow(rng.next(), 1.3) * 6))];
        curShift = (rng.next() - 0.5) * 0.05;
      }
      const [baseR, baseG, baseB] = curCol;
      const rowOff = y * gw;
      const phaseY = y * 0.6;
      for (let x = 0; x < gw; x += 1) {
        const sv = sideVig[x];
        if (sv <= 0.0) {
          buf[rowOff + x] = 0;
          continue;
        }
        const ang = (nxArr[x] + curShift) * 26.0 + phaseY;
        const streak = SIN_LUT[Math.floor(ang * SIN_LUT_SCALE) & SIN_LUT_MASK] * 22.0;
        let rV = Math.floor((baseR + streak) * sv + 0.5);
        let gV = Math.floor((baseG + streak * 0.6) * sv + 0.5);
        let bV = Math.floor((baseB + streak) * sv + 0.5);
        rV = rV < 0 ? 0 : rV > 255 ? 255 : rV;
        gV = gV < 0 ? 0 : gV > 255 ? 255 : gV;
        bV = bV < 0 ? 0 : bV > 255 ? 255 : bV;
        buf[rowOff + x] = (rV << 16) | (gV << 8) | bV;
      }
    }

    const overlayCol = packRgb(228, 175, 238);
    for (let r = 0; r < 3; r += 1) {
      const rx0 = 0.22 + rng.next() * 0.52;
      const ry0 = 0.15 + rng.next() * 0.65;
      const rx1 = rx0 + 0.04 + rng.next() * 0.09;
      const ry1 = ry0 + 0.06 + rng.next() * 0.14;
      const rAlpha = 0.35 + rng.next() * 0.30;
      const ix0 = Math.max(0, Math.floor(rx0 * gw));
      const ix1 = Math.min(gw, Math.floor(rx1 * gw) + 1);
      const iy0 = Math.max(0, Math.floor(ry0 * gh));
      const iy1 = Math.min(gh, Math.floor(ry1 * gh) + 1);
      for (let y = iy0; y < iy1; y += 1) {
        const rowOff = y * gw;
        for (let x = ix0; x < ix1; x += 1) {
          const k = rAlpha * sideVig[x];
          if (k > 0.0) {
            buf[rowOff + x] = lerpPacked(buf[rowOff + x], overlayCol, k);
          }
        }
      }
    }
  } else {
    const p = Math.min(1.0, Math.max(0.0, (t - 6.00) / 0.95));
    const bgCol = lerpPacked(packRgb(235, 117, 114), 0xffffff, Math.pow(p, 0.85));
    buf.fill(bgCol);
  }

  if (t < 0.80) return;

  const fadeOut = t < 6.75 ? 1.0 : Math.max(0.0, 1.0 - (t - 6.75) / 0.30);

  if (t < 6.00 && fadeOut > 0.0) {
    const haloDark = packRgb(22, 12, 26);
    const haloK = 0.88 * fadeOut;
    const { haloIndices } = cache;
    for (let i = 0; i < haloIndices.length; i += 1) {
      const idx = haloIndices[i];
      buf[idx] = lerpPacked(buf[idx], haloDark, haloK);
    }
  }

  const invR = 1.0 / sakuraR;
  const maxR2 = Math.pow(sakuraR * 1.05, 2);
  const hubR2 = Math.pow(sakuraR * 0.095, 2);
  const minSeamHalfW = Math.max(sakuraR * 0.015, aa * 0.44);
  const rxNorm = (sakuraR * 1.06) / aspect;
  const ryNorm = sakuraR * 1.06;
  const bx0 = Math.max(0, Math.floor((cx - rxNorm) * gw));
  const bx1 = Math.min(gw, Math.floor((cx + rxNorm) * gw) + 1);
  const by0 = Math.max(0, Math.floor((cy - ryNorm) * gh));
  const by1 = Math.min(gh, Math.floor((cy + ryNorm) * gh) + 1);
  const invGw = 1.0 / gw;
  const invGh = 1.0 / gh;

  for (let y = by0; y < by1; y += 1) {
    const dy = (y + 0.5) * invGh - cy;
    const rowOff = y * gw;
    for (let x = bx0; x < bx1; x += 1) {
      const dx = ((x + 0.5) * invGw - cx) * aspect;
      if (sakuraHit(dx, dy, sakuraR, invR, maxR2, hubR2, angleCw, minSeamHalfW)) {
        const idx = rowOff + x;
        buf[idx] = fadeOut >= 1.0 ? fgCol : lerpPacked(buf[idx], fgCol, fadeOut);
      }
    }
  }

  const { hitIndices } = cache;
  if (fadeOut >= 1.0) {
    for (let i = 0; i < hitIndices.length; i += 1) {
      buf[hitIndices[i]] = fgCol;
    }
  } else if (fadeOut > 0.0) {
    for (let i = 0; i < hitIndices.length; i += 1) {
      const idx = hitIndices[i];
      buf[idx] = lerpPacked(buf[idx], fgCol, fadeOut);
    }
  }
}

function renderScene3Ok(buf, gw, gh, t) {
  if (t < 7.55) {
    buf.fill(0xffffff);
    return;
  }
  if (t >= 9.45) {
    buf.fill(0);
    return;
  }

  const fade = t <= 8.65 ? 1.0 : Math.max(0.0, 1.0 - (t - 8.65) / 0.80);
  const isQuad = gh > 0 ? gw / gh >= 2.4 : gw >= 160;
  const baseX = isQuad ? 2 : 1;
  let yScale = Math.max(1, Math.floor((gh + 32) / 64));
  let ghLog = Math.floor(gh / yScale);
  let hOk = 8;
  let xStep = baseX * yScale;
  let thX = 2 * xStep;
  let armW = 3 * xStep;
  let half = 4;
  let wK = 0;
  let totalW = 0;
  while (true) {
    ghLog = Math.floor(gh / yScale);
    hOk = Math.max(8, Math.floor((ghLog * 0.155) / 2.0 + 0.5) * 2);
    xStep = baseX * yScale;
    thX = 2 * xStep;
    armW = 3 * xStep;
    half = hOk >> 1;
    wK = thX + (half - 1) * xStep + armW;
    totalW = wK * 2 + 4 * xStep + thX;
    if (yScale === 1 || totalW <= Math.floor(gw * 0.85)) {
      break;
    }
    yScale -= 1;
  }

  const shakeX =
    t >= 7.55 && t <= 7.72 ? Math.round(Math.sin((t - 7.55) * 55.0)) * xStep : 0;

  const bgCol = packRgb(clampU8(255.0 * fade), clampU8(255.0 * fade), clampU8(255.0 * fade));
  const okCol = packRgb(clampU8(236.0 * fade), clampU8(78.0 * fade), clampU8(103.0 * fade));
  buf.fill(bgCol);

  const yTop = Math.floor((ghLog - hOk) / 4) * 2;
  const yBot = yTop + hOk;

  const thY = 2;
  const wO = wK;
  const gapOk = 2 * xStep;
  const gapKEx = 2 * xStep;
  const wEx = thX;
  const xStart = Math.floor((gw - totalW) / (2 * xStep)) * xStep + shakeX;
  const xK = wO + gapOk;
  const xEx = xK + wK + gapKEx;

  const pyStart = Math.max(0, yTop * yScale);
  const pyEnd = Math.min(gh, yBot * yScale);
  const pxStart = Math.max(0, xStart);
  const pxEnd = Math.min(gw, xStart + totalW);

  for (let y = pyStart; y < pyEnd; y += 1) {
    const ly = Math.floor(y / yScale) - yTop;
    const dMid = ly < half ? half - 1 - ly : ly - half;
    const armLeft = thX + dMid * xStep;
    const armRight = armLeft + armW;
    const oHoriz = ly < thY || ly >= hOk - thY;
    const exOn = ly < hOk - 4 || ly >= hOk - 2;
    const rowOff = y * gw;

    for (let x = pxStart; x < pxEnd; x += 1) {
      const lx = x - xStart;
      if (lx < wO) {
        if (oHoriz || lx < thX || lx >= wO - thX) buf[rowOff + x] = okCol;
      } else if (lx >= xK && lx < xK + wK) {
        const kx = lx - xK;
        if (kx < thX || (kx >= armLeft && kx < armRight)) buf[rowOff + x] = okCol;
      } else if (lx >= xEx && lx < xEx + wEx) {
        if (exOn) buf[rowOff + x] = okCol;
      }
    }
  }
}

function renderScene4Pop(buf, gw, gh, t, cache) {
  const dt = Math.max(0.0, t - 10.03);
  const tau = scene4WarpedTau(t);
  const aspect = 16.0 / 9.0;
  const aa = 1.05 / gh;

  const bgBase =
    t < 10.63
      ? packRgb(130, 249, 42)
      : t < 11.23
        ? packRgb(32, 247, 247)
        : packRgb(236, 56, 174);

  buf.fill(bgBase);

  const { ringParams, laceMask, permanentHits, dynamicPixels } = cache;
  const ringAngs = [
    ringParams[0][3] + dt * ringParams[0][4],
    ringParams[1][3] + dt * ringParams[1][4],
    ringParams[2][3] + dt * ringParams[2][4],
  ];

  const hitList = [];
  for (let i = 0; i < permanentHits.length; i += 1) {
    const idx = permanentHits[i];
    laceMask[idx] = 1;
    hitList.push(idx);
  }

  for (let p = 0; p < dynamicPixels.length; p += 1) {
    const [idx, needed, dynSubs] = dynamicPixels[p];
    let hits = 0;
    let rem = dynSubs.length;
    for (let s = 0; s < dynSubs.length; s += 1) {
      const subChecks = dynSubs[s];
      let subHit = false;
      for (let c = 0; c < subChecks.length; c += 1) {
        const [rId, zone, baseTheta, aux] = subChecks[c];
        const rp = ringParams[rId];
        const theta = baseTheta - ringAngs[rId];
        if (zone !== 1) {
          const wave = WAVE_LUT[Math.floor(theta * rp[5] * WAVE_LUT_SCALE) & WAVE_LUT_MASK];
          if (wave >= aux) {
            subHit = true;
            break;
          }
        } else {
          const sec = rp[12];
          const halfSec = rp[13];
          const localA = pyMod(theta + halfSec, sec) - halfSec;
          const lx = localA * 0.79;
          const alx = lx < 0 ? -lx : lx;
          const distPillar = rp[14] - alx;
          if (distPillar <= rp[15]) {
            subHit = true;
            break;
          }
          if (distPillar * distPillar + aux * aux <= rp[16]) {
            subHit = true;
            break;
          }
          const rosR2 = lx * lx + aux * aux;
          if (rosR2 <= rp[17]) {
            subHit = true;
            break;
          }
          if (rosR2 <= 0.009604) {
            const sw = rp[18];
            const absAux = aux < 0 ? -aux : aux;
            if (
              absAux <= sw ||
              Math.abs(lx * 0.8660254 - aux * 0.5) <= sw ||
              Math.abs(lx * 0.8660254 + aux * 0.5) <= sw
            ) {
              subHit = true;
              break;
            }
          }
        }
      }
      if (subHit) {
        hits += 1;
        if (hits >= needed) {
          laceMask[idx] = 1;
          hitList.push(idx);
          break;
        }
      }
      rem -= 1;
      if (hits + rem < needed) break;
    }
  }

  const maxInterior = (gh - 1) * gw;
  for (let i = 0; i < hitList.length; i += 1) {
    const idx = hitList[i];
    if (idx >= gw && idx < maxInterior) {
      const x = idx % gw;
      if (x > 0 && x < gw - 1) {
        if (
          laceMask[idx - 1] + laceMask[idx + 1] + laceMask[idx - gw] + laceMask[idx + gw] === 0 &&
          laceMask[idx - gw - 1] +
            laceMask[idx - gw + 1] +
            laceMask[idx + gw - 1] +
            laceMask[idx + gw + 1] <=
            1
        ) {
          continue;
        }
      }
    }
    buf[idx] = 0xffffff;
  }

  for (let i = 0; i < hitList.length; i += 1) {
    laceMask[hitList[i]] = 0;
  }

  const invGw = 1.0 / gw;
  const invGh = 1.0 / gh;
  for (let f = 0; f < SCENE4_BLACK_FLORA.length; f += 1) {
    const [kind, tauRef, xRef, yRef, vx, vy, frad, rot0, vrot] = SCENE4_BLACK_FLORA[f];
    const dtau = tau - tauRef;
    if (Math.abs(dtau) > 0.75) continue;
    const fx = xRef + vx * dtau;
    const fy = yRef + vy * dtau;
    const lim = frad * 1.25;
    if (fy < -lim || fy > 1.0 + lim || fx < -lim || fx > 1.0 + lim) continue;

    const fang = rot0 + vrot * dtau;
    const rxNorm = (frad * 1.12) / aspect;
    const ryNorm = frad * 1.12;
    const bx0 = Math.max(0, Math.floor((fx - rxNorm) * gw));
    const bx1 = Math.min(gw, Math.floor((fx + rxNorm) * gw) + 1);
    const by0 = Math.max(0, Math.floor((fy - ryNorm) * gh));
    const by1 = Math.min(gh, Math.floor((fy + ryNorm) * gh) + 1);
    if (bx0 >= bx1 || by0 >= by1) continue;

    if (kind === 0) {
      const invR = 1.0 / frad;
      const maxR2 = Math.pow(frad * 1.05, 2);
      const hubR2 = Math.pow(frad * 0.045, 2);
      const minSeamHalfW = Math.max(frad * 0.015, aa * 0.44);
      for (let y = by0; y < by1; y += 1) {
        const fdy = (y + 0.5) * invGh - fy;
        const rowOff = y * gw;
        for (let x = bx0; x < bx1; x += 1) {
          const fdx = ((x + 0.5) * invGw - fx) * aspect;
          if (sakuraHit(fdx, fdy, frad, invR, maxR2, hubR2, fang, minSeamHalfW)) {
            buf[rowOff + x] = 0;
          }
        }
      }
    } else {
      const invS = 1.0 / (frad * 1.15);
      const cAng = Math.cos(-fang);
      const sAng = Math.sin(-fang);
      for (let y = by0; y < by1; y += 1) {
        const fdy = (y + 0.5) * invGh - fy;
        const rowOff = y * gw;
        for (let x = bx0; x < bx1; x += 1) {
          const fdx = ((x + 0.5) * invGw - fx) * aspect;
          if (singlePetalHit(fdx, fdy, invS, cAng, sAng)) {
            buf[rowOff + x] = 0;
          }
        }
      }
    }
  }

  if (t >= 12.20) {
    const { enjoyIndices } = cache;
    for (let i = 0; i < enjoyIndices.length; i += 1) {
      buf[enjoyIndices[i]] = 0xffffff;
    }
  }

  if (t >= 13.10) {
    const p = Math.min(1.0, (t - 13.10) / 0.58);
    const wipeR = 0.04 + Math.pow(p, 1.35) * 1.28;
    const wipeR2 = wipeR * wipeR;
    const wxNorm = wipeR / aspect;
    const bx0 = Math.max(0, Math.floor((0.495 - wxNorm) * gw));
    const bx1 = Math.min(gw, Math.floor((0.495 + wxNorm) * gw) + 1);
    const by0 = Math.max(0, Math.floor((0.700 - wipeR) * gh));
    const by1 = Math.min(gh, Math.floor((0.700 + wipeR) * gh) + 1);
    for (let y = by0; y < by1; y += 1) {
      const wdy = (y + 0.5) * invGh - 0.700;
      const wdy2 = wdy * wdy;
      const rowOff = y * gw;
      for (let x = bx0; x < bx1; x += 1) {
        const wdx = ((x + 0.5) * invGw - 0.495) * aspect;
        if (wdx * wdx + wdy2 <= wipeR2) {
          buf[rowOff + x] = 0xffffff;
        }
      }
    }
  }
}

function renderScene5Finale(buf, gw, gh, t, cache) {
  const silAlpha = Math.min(1.0, Math.max(0.0, (t - 13.80) / 0.45));
  const bAlpha = Math.min(1.0, Math.max(0.0, (t - 14.28) / 0.25));
  const chAlpha = Math.min(1.0, Math.max(0.0, (t - 14.44) / 0.24));

  if (silAlpha >= 1.0 && bAlpha >= 1.0 && chAlpha >= 1.0) {
    buf.set(cache.finalRgb);
    return;
  }

  if (silAlpha >= 1.0) {
    buf.set(cache.baseRgb);
  } else {
    buf.fill(0xffffff);
    if (silAlpha > 0.0) {
      const { silNonwhite } = cache;
      for (let i = 0; i < silNonwhite.length; i += 1) {
        const [idx, baseCol] = silNonwhite[i];
        buf[idx] = lerpPacked(0xffffff, baseCol, silAlpha);
      }
    }
  }

  if (bAlpha > 0.0) {
    const GLOW_DARK = packRgb(226, 24, 152);
    const GLOW_LIGHT = packRgb(246, 132, 204);
    const { logoEntries } = cache;
    for (let i = 0; i < logoEntries.length; i += 1) {
      const [idx, isOverDark, glowBase, bCov, bPx, chCov, chFill] = logoEntries[i];
      let logoCol = buf[idx];
      if (glowBase > 0.0) {
        logoCol = lerpPacked(logoCol, isOverDark ? GLOW_DARK : GLOW_LIGHT, glowBase * bAlpha);
      }
      if (bCov > 0) logoCol = lerpPacked(logoCol, bPx, bCov * 0.25 * bAlpha);
      if (chAlpha > 0.0 && chCov > 0) logoCol = lerpPacked(logoCol, chFill, chCov * 0.25 * chAlpha);
      buf[idx] = logoCol;
    }
  }
}

class AnsiFrameEncoder {
  constructor(truecolor = true) {
    this.truecolor = truecolor;
    this._fgCache = new Map();
    this._bgCache = new Map();
    this._prevRows = [];
    this._lastCols = 0;
    this._lastRows = 0;
  }

  reset() {
    this._prevRows = [];
    this._lastCols = 0;
    this._lastRows = 0;
  }

  _sgrFg(c) {
    let s = this._fgCache.get(c);
    if (s === undefined) {
      const r = (c >> 16) & 255;
      const g = (c >> 8) & 255;
      const b = c & 255;
      s = this.truecolor ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${rgbToAnsi256(r, g, b)}m`;
      this._fgCache.set(c, s);
    }
    return s;
  }

  _sgrBg(c) {
    let s = this._bgCache.get(c);
    if (s === undefined) {
      const r = (c >> 16) & 255;
      const g = (c >> 8) & 255;
      const b = c & 255;
      s = this.truecolor ? `\x1b[48;2;${r};${g};${b}m` : `\x1b[48;5;${rgbToAnsi256(r, g, b)}m`;
      this._bgCache.set(c, s);
    }
    return s;
  }

  _sgrFgBg(fg, bg) {
    const fr = (fg >> 16) & 255;
    const fgG = (fg >> 8) & 255;
    const fb = fg & 255;
    const br = (bg >> 16) & 255;
    const bgG = (bg >> 8) & 255;
    const bb = bg & 255;
    if (this.truecolor) {
      return `\x1b[38;2;${fr};${fgG};${fb};48;2;${br};${bgG};${bb}m`;
    }
    return `\x1b[38;5;${rgbToAnsi256(fr, fgG, fb)};48;5;${rgbToAnsi256(br, bgG, bb)}m`;
  }

  encode(buf, vpCols, vpRows, padX, padY, fullRedraw = false) {
    if (vpCols !== this._lastCols || vpRows !== this._lastRows || fullRedraw) {
      this._prevRows = new Array(vpRows).fill('');
      this._lastCols = vpCols;
      this._lastRows = vpRows;
    }

    if (this._fgCache.size > 4096) this._fgCache.clear();
    if (this._bgCache.size > 4096) this._bgCache.clear();

    const gw = vpCols * 2;
    const out = [];
    const colPos = padX + 1;
    const pts = [0, 0, 0, 0];

    for (let r = 0; r < vpRows; r += 1) {
      const rowParts = [];
      let curFg = -1;
      let curBg = -1;
      const row0 = r * 2 * gw;
      const row1 = row0 + gw;

      for (let c = 0; c < vpCols; c += 1) {
        const x2 = c * 2;
        const p0 = buf[row0 + x2];
        const p1 = buf[row0 + x2 + 1];
        const p2 = buf[row1 + x2];
        const p3 = buf[row1 + x2 + 1];

        if (p0 === p1 && p1 === p2 && p2 === p3) {
          if (p0 !== curBg) {
            rowParts.push(this._sgrBg(p0));
            curBg = p0;
          }
          rowParts.push(' ');
          continue;
        }

        const other = p1 !== p0 ? p1 : p2 !== p0 ? p2 : p3;
        let fg;
        let bg;
        let ch;

        if (
          (p1 === p0 || p1 === other) &&
          (p2 === p0 || p2 === other) &&
          (p3 === p0 || p3 === other)
        ) {
          let mask = (p1 === other ? 2 : 0) | (p2 === other ? 4 : 0) | (p3 === other ? 8 : 0);
          if (p0 === curBg || other === curFg) {
            bg = p0;
            fg = other;
          } else if (other === curBg || p0 === curFg) {
            bg = other;
            fg = p0;
            mask ^= 15;
          } else {
            bg = p0;
            fg = other;
          }
          ch = QUAD_CHARS[mask];
        } else {
          const l0 = ((p0 >> 16) & 255) * 77 + ((p0 >> 8) & 255) * 150 + (p0 & 255) * 29;
          const l1 = ((p1 >> 16) & 255) * 77 + ((p1 >> 8) & 255) * 150 + (p1 & 255) * 29;
          const l2 = ((p2 >> 16) & 255) * 77 + ((p2 >> 8) & 255) * 150 + (p2 & 255) * 29;
          const l3 = ((p3 >> 16) & 255) * 77 + ((p3 >> 8) & 255) * 150 + (p3 & 255) * 29;

          let minL = l0;
          let cMin = p0;
          let maxL = l0;
          let cMax = p0;
          if (l1 < minL) {
            minL = l1;
            cMin = p1;
          } else if (l1 > maxL) {
            maxL = l1;
            cMax = p1;
          }
          if (l2 < minL) {
            minL = l2;
            cMin = p2;
          } else if (l2 > maxL) {
            maxL = l2;
            cMax = p2;
          }
          if (l3 < minL) {
            minL = l3;
            cMin = p3;
          } else if (l3 > maxL) {
            maxL = l3;
            cMax = p3;
          }

          if (maxL - minL < 600) {
            pts[0] = p0;
            pts[1] = p1;
            pts[2] = p2;
            pts[3] = p3;
            let maxD2 = -1;
            for (let i = 0; i < 4; i += 1) {
              const ca = pts[i];
              const ra = (ca >> 16) & 255;
              const ga = (ca >> 8) & 255;
              const ba = ca & 255;
              for (let j = i + 1; j < 4; j += 1) {
                const cb = pts[j];
                const dr = ra - ((cb >> 16) & 255);
                const dg = ga - ((cb >> 8) & 255);
                const db = ba - (cb & 255);
                const d2 = dr * dr + dg * dg + db * db;
                if (d2 > maxD2) {
                  maxD2 = d2;
                  cMin = ca;
                  cMax = cb;
                }
              }
            }
            if (maxD2 <= 36) {
              if (p0 !== curBg) {
                rowParts.push(this._sgrBg(p0));
                curBg = p0;
              }
              rowParts.push(' ');
              continue;
            }
          }

          const r0 = (cMin >> 16) & 255;
          const g0 = (cMin >> 8) & 255;
          const b0 = cMin & 255;
          const r1 = (cMax >> 16) & 255;
          const g1 = (cMax >> 8) & 255;
          const b1 = cMax & 255;

          let mask = 0;
          let fgR = 0;
          let fgG = 0;
          let fgB = 0;
          let fgCnt = 0;
          let bgR = 0;
          let bgG = 0;
          let bgB = 0;
          let bgCnt = 0;

          pts[0] = p0;
          pts[1] = p1;
          pts[2] = p2;
          pts[3] = p3;
          for (let bi = 0; bi < 4; bi += 1) {
            const p = pts[bi];
            const pr = (p >> 16) & 255;
            const pg = (p >> 8) & 255;
            const pb = p & 255;
            const d0 = (pr - r0) * (pr - r0) + (pg - g0) * (pg - g0) + (pb - b0) * (pb - b0);
            const d1 = (pr - r1) * (pr - r1) + (pg - g1) * (pg - g1) + (pb - b1) * (pb - b1);
            if (d1 < d0) {
              mask |= 1 << bi;
              fgR += pr;
              fgG += pg;
              fgB += pb;
              fgCnt += 1;
            } else {
              bgR += pr;
              bgG += pg;
              bgB += pb;
              bgCnt += 1;
            }
          }

          if (fgCnt === 0 || bgCnt === 0) {
            if (p0 !== curBg) {
              rowParts.push(this._sgrBg(p0));
              curBg = p0;
            }
            rowParts.push(' ');
            continue;
          }

          fg = packRgb((fgR / fgCnt) | 0, (fgG / fgCnt) | 0, (fgB / fgCnt) | 0);
          bg = packRgb((bgR / bgCnt) | 0, (bgG / bgCnt) | 0, (bgB / bgCnt) | 0);
          if ((fg === curBg && bg !== curBg) || (bg === curFg && fg !== curFg)) {
            const tmp = fg;
            fg = bg;
            bg = tmp;
            mask ^= 15;
          }
          ch = QUAD_CHARS[mask];
        }

        const needFg = fg !== curFg;
        const needBg = bg !== curBg;
        if (needFg && needBg) {
          rowParts.push(this._sgrFgBg(fg, bg));
          curFg = fg;
          curBg = bg;
        } else if (needFg) {
          rowParts.push(this._sgrFg(fg));
          curFg = fg;
        } else if (needBg) {
          rowParts.push(this._sgrBg(bg));
          curBg = bg;
        }
        rowParts.push(ch);
      }

      rowParts.push('\x1b[0m');
      const rowStr = rowParts.join('');
      if (rowStr !== this._prevRows[r]) {
        this._prevRows[r] = rowStr;
        out.push(`\x1b[${padY + r + 1};${colPos}H`, rowStr);
      }
    }

    return out.join('');
  }
}

function computeViewport(termCols, termRows) {
  const availCols = Math.max(16, termCols >= 24 ? termCols - 4 : termCols - 2);
  const availRows = Math.max(8, termRows >= 14 ? termRows - 3 : termRows - 2);
  const targetRatio = 32.0 / 9.0;

  let vpCols;
  let vpRows;
  if (availCols / availRows > targetRatio) {
    vpRows = availRows;
    vpCols = Math.min(availCols, Math.floor(vpRows * targetRatio + 0.5));
  } else {
    vpCols = availCols;
    vpRows = Math.min(availRows, Math.max(8, Math.floor(vpCols / targetRatio + 0.5)));
  }

  vpCols = Math.max(8, Math.min(vpCols, Math.max(8, termCols - 2)));
  vpRows = Math.max(6, Math.min(vpRows, Math.max(6, termRows - 2)));
  let padX = Math.max(1, Math.floor((termCols - vpCols) / 2));
  if (padX + vpCols >= termCols) {
    padX = Math.max(0, termCols - vpCols - 1);
  }
  const padY = Math.max(0, Math.floor((termRows - 1 - vpRows) / 2));
  return { vpCols, vpRows, padX, padY };
}

function buildHudLine(termCols, termRows, t, totalDuration, cutscene = true, truecolor = true) {
  const maxW = Math.max(1, termCols - 1);
  const tFixed = t.toFixed(2).padStart(5, '0');
  const candidates = cutscene
    ? [
        ' ★ BB CHANNEL · ON AIR  |  按 [Space / Enter / Esc / q] 跳过片头 ',
        ' ★ BB CHANNEL · ON AIR | [Space / Enter / Esc] 跳过 ',
        ' BB CHANNEL | [Space/Esc] 跳过 ',
        ' BB CHANNEL [Esc]',
      ]
    : [
        ` ★ BB CHANNEL · ON AIR  ${tFixed}s/${totalDuration.toFixed(2)}s  |  [Enter] 重播  [5] 定格  [q] 退出 `,
        ` BB CHANNEL ${tFixed}s | [Enter] 重播 [5] 定格 [q] 退出 `,
        ` BB ${t.toFixed(1).padStart(4, '0')}s [Enter/5/q]`,
      ];

  let text = clipToColumns(candidates[candidates.length - 1], maxW);
  for (const cand of candidates) {
    if (displayWidth(cand) <= maxW) {
      text = cand;
      break;
    }
  }

  const style = truecolor
    ? '\x1b[38;2;216;180;226;48;2;16;10;22m'
    : '\x1b[38;5;182;48;5;233m';
  return `\x1b[${termRows};1H\x1b[2K${style}${text}\x1b[0m`;
}

function renderTimelineFrame(t, buf, gw, gh, rng, caches) {
  if (t < 0.73) {
    renderScene1Black(buf);
  } else if (t < 7.05) {
    renderScene2Hacking(buf, gw, gh, t, rng, caches.scene2);
  } else if (t < 10.03) {
    renderScene3Ok(buf, gw, gh, t);
  } else if (t < 13.80) {
    renderScene4Pop(buf, gw, gh, t, caches.scene4);
  } else {
    renderScene5Finale(buf, gw, gh, t, caches.finale);
  }
}

function canPlayCinema({
  winVtEnabled = true,
  env = process.env,
  termSize = null,
  isTty = null,
} = {}) {
  if ((env && env.NO_COLOR) || (env && env.TERM === 'dumb')) {
    return { ok: false, reason: 'no_color' };
  }
  if (process.platform === 'win32' && !winVtEnabled) {
    return { ok: false, reason: 'win_vt_disabled' };
  }
  const ttyOk =
    isTty !== null
      ? Boolean(isTty)
      : Boolean(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
  if (!ttyOk) {
    return { ok: false, reason: 'non_tty' };
  }
  const cols = termSize ? termSize[0] : (process.stdout.columns || 120);
  const rows = termSize ? termSize[1] : (process.stdout.rows || 36);
  if (cols < MIN_TERM_COLS || rows < MIN_TERM_ROWS) {
    return { ok: false, reason: 'terminal_too_small' };
  }
  return { ok: true, reason: null };
}

function playBbChannelCinema({
  cutscene = true,
  fps = 20.0,
  winVtEnabled = true,
  freezeFinale = false,
} = {}) {
  const check = canPlayCinema({ winVtEnabled });
  if (!check.ok) {
    return Promise.resolve({
      played: false,
      skipped: false,
      skipTimestamp: null,
      fallbackReason: check.reason,
    });
  }

  const safeFps = Number.isFinite(fps) ? Math.max(5.0, Math.min(60.0, fps)) : 20.0;
  const frameIntervalMs = 1000.0 / safeFps;
  const totalDuration = TOTAL_DURATION;
  const useTruecolor = supportsTruecolor();

  const rng = createRng(20261122);
  let lastCols = 0;
  let lastRows = 0;
  let buf = new Int32Array(0);
  let caches = null;
  const encoder = new AnsiFrameEncoder(useTruecolor);
  let lastStaticKey = '';
  let lastHud = '';

  let done = false;
  let skipped = false;
  let skipTimestamp = null;
  let pausedAt = !cutscene && freezeFinale ? 15.6 : null;
  let startMs = Date.now();
  let timer = null;

  const stdin = process.stdin;
  const stdout = process.stdout;
  const wasRaw = Boolean(stdin.isRaw);

  return new Promise((resolve) => {
    let enteredAltScreen = false;
    const finish = (didPlay = enteredAltScreen, failReason = null) => {
      if (done) return;
      done = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      stdin.removeListener('data', onData);
      try {
        if (typeof stdin.setRawMode === 'function') {
          stdin.setRawMode(wasRaw);
        }
      } catch (_err) {
        // ignore terminal mode restore error
      }
      try {
        stdin.pause();
      } catch (_err) {
        // ignore
      }
      if (enteredAltScreen) {
        try {
          stdout.write('\x1b[?2026l\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l');
        } catch (_err) {
          // ignore closed stdout restore error
        }
      }
      resolve({
        played: Boolean(didPlay),
        skipped: Boolean(didPlay) && skipped,
        skipTimestamp: Boolean(didPlay) ? skipTimestamp : null,
        fallbackReason: didPlay ? null : failReason || 'playback_error',
      });
    };

    const currentTimeSec = () => {
      if (pausedAt !== null) return pausedAt;
      return (Date.now() - startMs) / 1000.0;
    };

    const onData = (chunk) => {
      if (done) return;
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (!str) return;
      const key = str[0];
      const tNow = currentTimeSec();

      if (cutscene) {
        // Ignore accidental double-Enter in the first 120ms, while Space/Esc/q skip immediately
        if ((key === '\r' || key === '\n') && tNow < 0.12) {
          return;
        }
        if (
          key === ' ' ||
          key === '\r' ||
          key === '\n' ||
          key === '\x1b' ||
          key === 'q' ||
          key === 'Q' ||
          key === 's' ||
          key === 'S' ||
          key === '\x03'
        ) {
          skipped = true;
          skipTimestamp = Math.round(Math.min(tNow, totalDuration) * 100) / 100;
          finish();
        }
      } else {
        if (key === 'q' || key === 'Q' || key === '\x03' || key === '\x1b') {
          if (tNow < totalDuration && pausedAt === null) {
            skipped = true;
            skipTimestamp = Math.round(tNow * 100) / 100;
          }
          finish();
        } else if (key === '\r' || key === '\n') {
          startMs = Date.now();
          pausedAt = null;
          lastStaticKey = '';
        } else if (key === '5') {
          lastStaticKey = '';
          if (pausedAt === null) {
            pausedAt = 15.6;
          } else {
            pausedAt = null;
            startMs = Date.now() - 13800;
          }
        }
      }
    };

    try {
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(true);
      }
      try {
        while (stdin.read() !== null) {
          // discard stray keystrokes buffered during prelude/hijack
        }
      } catch (_drainErr) {
        // ignore drain errors
      }
      stdin.on('data', onData);
      stdin.resume();
    } catch (_err) {
      finish(false, 'raw_mode_error');
      return;
    }

    try {
      stdout.write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[2J');
      enteredAltScreen = true;
    } catch (_err) {
      finish(false, 'io_error');
      return;
    }
    startMs = Date.now();

    const tick = () => {
      if (done) return;
      try {
        const frameStart = Date.now();
        let t = currentTimeSec();
        if (pausedAt === null && t >= totalDuration) {
          if (cutscene) {
            finish();
            return;
          }
          pausedAt = totalDuration;
          t = totalDuration;
        }

        const termCols = stdout.columns || 120;
        const termRows = stdout.rows || 36;
        const { vpCols, vpRows, padX, padY } = computeViewport(termCols, termRows);
        const gw = vpCols * 2;
        const gh = vpRows * 2;

        const resized = termCols !== lastCols || termRows !== lastRows || !caches;
        if (resized) {
          lastCols = termCols;
          lastRows = termRows;
          buf = new Int32Array(gw * gh);
          caches = new CinemaCaches(gw, gh);
          encoder.reset();
          lastStaticKey = '';
          lastHud = '';
          stdout.write('\x1b[2J');
        }

        const hud = buildHudLine(termCols, termRows, t, totalDuration, cutscene, useTruecolor);

        let staticKey = '';
        if (pausedAt !== null) staticKey = `paused:${pausedAt.toFixed(3)}:${termCols}x${termRows}`;
        else if (t < 0.73) staticKey = `s1:${termCols}x${termRows}`;
        else if (t >= 4.30 && t < 4.38) staticKey = `s2_flash:${termCols}x${termRows}`;
        else if (t >= 7.05 && t < 7.55) staticKey = `s3_white:${termCols}x${termRows}`;
        else if (t >= 9.45 && t < 10.03) staticKey = `s3_black:${termCols}x${termRows}`;
        else if (t >= 14.68) staticKey = `s5_full:${termCols}x${termRows}`;

        let ansiFrame = '';
        if (!staticKey || staticKey !== lastStaticKey) {
          renderTimelineFrame(t, buf, gw, gh, rng, caches);
          ansiFrame = encoder.encode(buf, vpCols, vpRows, padX, padY, resized);
          lastStaticKey = staticKey;
        }

        const hudDelta = hud !== lastHud ? hud : '';
        if (ansiFrame || hudDelta) {
          stdout.write('\x1b[?2026h' + ansiFrame + hudDelta + '\x1b[?2026l');
          lastHud = hud;
        }

        // Incrementally pre-warm heavy caches during solid-color hold frames
        if (caches) {
          if (t < 0.65 && !caches._scene2) {
            void caches.scene2;
          } else if (t >= 7.08 && t < 7.48 && !caches._scene4) {
            void caches.scene4;
          } else if (t >= 9.48 && t < 9.95 && !caches._finale) {
            void caches.finale;
          }
        }

        const elapsed = Date.now() - frameStart;
        const delay = Math.max(1, Math.round(frameIntervalMs - elapsed));
        timer = setTimeout(tick, delay);
      } catch (_tickErr) {
        finish();
      }
    };

    tick();
  });
}

module.exports = {
  QUAD_CHARS,
  TOTAL_DURATION,
  MIN_TERM_COLS,
  MIN_TERM_ROWS,
  TECH_GLYPHS_2X,
  TECH_GLYPHS_1X,
  HACKING_ROWS_2X,
  HACKING_ROWS_1X,
  SCENE4_BLACK_FLORA,
  SCENE4_LACE_SPECS,
  selectChannelBitmap,
  scene4WarpedTau,
  createRng,
  packRgb,
  lerpPacked,
  supportsTruecolor,
  rgbToAnsi256,
  displayWidth,
  clipToColumns,
  CinemaCaches,
  AnsiFrameEncoder,
  computeViewport,
  buildHudLine,
  renderTimelineFrame,
  canPlayCinema,
  playBbChannelCinema,
};
