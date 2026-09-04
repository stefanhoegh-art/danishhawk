/* Procedural oak for Tandhjulet.
 *
 * Draws a flat-sawn oak face: growth rings arcing into cathedral figure, open
 * pores running with the grain, and the ray fleck that gives oak away. Solid
 * tops are drawn as glued-up staves with visible joints and a fresh grain
 * centre per stave; veneer is drawn as one continuous crown-cut sheet.
 *
 * One canvas serves both the plan drawing (as an SVG pattern) and the 3D view
 * (as a texture map), so a finish looks the same in both.
 */

/* --- deterministic value noise ------------------------------------------ */
function hash(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
const fade = (t) => t * t * (3 - 2 * t);

function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y, seed, octaves) {
  let sum = 0, amp = 0.5, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(fx, fy, seed + i * 17) * amp;
    fx *= 2; fy *= 2; amp *= 0.5;
  }
  return sum;
}

/* --- finishes ------------------------------------------------------------ */
/* The colour only. Oil and lacquer are a separate choice, so the two are named
   separately too and the page puts them together. Each is the treated colour of
   European oak, sampled to sit sensibly against the page's warm background
   rather than to be technically exact. */
export const FINISHES = {
  natur:  { da: 'Natur', en: 'Natural', rgb: [201, 169, 120], plan: '#b99a6d' },
  hvid:   { da: 'Hvid',  en: 'White',   rgb: [219, 210, 192], plan: '#cbc2ae' },
  moerk:  { da: 'Mørk',  en: 'Dark',    rgb: [124,  92,  60], plan: '#6f5236' },
  roeget: { da: 'Røget', en: 'Smoked',  rgb: [ 78,  56,  38], plan: '#463222' },
};

const clamp255 = (n) => (n < 0 ? 0 : n > 255 ? 255 : n);

/**
 * @param {object} opts
 * @param {string} opts.finish   key of FINISHES
 * @param {string} opts.material 'solid' (staves + joints) or 'veneer' (one sheet)
 * @param {number} opts.size     square canvas edge in pixels
 * @param {number} opts.staveW   stave width in pixels, solid only
 */
export function makeOakCanvas({ finish = 'moerk', material = 'solid', size = 1024, staveW = 150 } = {}) {
  const base = (FINISHES[finish] || FINISHES.moerk).rgb;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const px = img.data;

  // Lay out the staves. Veneer is one continuous crown-cut sheet; solid oak is
  // boards glued up, each with its own grain so no two staves repeat.
  const staves = [];
  if (material === 'veneer') {
    staves.push({ x0: -size, x1: size * 2, seed: 11, cx: size * 0.52,
                  spacing: size / 46, drift: size * 0.30, tint: 1 });
  } else {
    let x = 0, i = 0;
    while (x < size) {
      const w = staveW * (0.80 + hash(i, 7, 3) * 0.40);
      staves.push({
        x0: x, x1: x + w, seed: 100 + i * 31,
        // Where the pith sits relative to this board. Inside gives a cathedral,
        // outside gives the long arcs of a plain-sawn board.
        cx: x + w * (hash(i, 21, 5) < 0.35 ? 0.2 + hash(i, 26, 5) * 0.6 : -1.4 - hash(i, 22, 5) * 1.6),
        spacing: size / (52 + hash(i, 24, 5) * 46),
        drift: size * (0.10 + hash(i, 27, 5) * 0.26),
        tint: 0.94 + hash(i, 25, 5) * 0.12,
      });
      x += w; i++;
    }
  }

  const staveAt = (x) => {
    for (let i = 0; i < staves.length; i++) if (x < staves[i].x1) return staves[i];
    return staves[staves.length - 1];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = staveAt(x);

      // Growth rings are cylinders around the pith, and the pith is never quite
      // parallel to the board — so let its position wander slowly along the
      // grain. Where it wanders through the board you get a cathedral; where it
      // stays outside you get the long arcs of a plain-sawn face.
      const t = y / size;
      const pith = s.cx
        + Math.sin(t * 3.1 + s.seed) * s.drift
        + (fbm(s.seed * 0.7, y * 0.0042, s.seed + 2, 3) - 0.5) * s.drift * 1.5;

      let r = Math.abs(x - pith) / s.spacing;
      r += (fbm(x * 0.055, y * 0.011, s.seed, 3) - 0.5) * 1.1;   // fine wander

      const f = ((r % 1) + 1) % 1;                // position across one ring
      const ringSeed = hash(Math.floor(r), s.seed, 41);          // per-ring variation

      // Latewood: a narrow dark line closing each ring, its weight varying
      // from ring to ring the way real growth years do.
      let shade = 1 - Math.pow(Math.max(0, 1 - Math.abs(f - 0.82) / 0.11), 2) * (0.20 + ringSeed * 0.22);

      // Oak is ring-porous: a band of coarse open pores opens each year's
      // growth, just inside the latewood line.
      const poreBand = Math.exp(-Math.pow((f - 0.10) / 0.13, 2));
      const pore = fbm(x * 0.30, y * 0.014, s.seed + 3, 2);
      if (pore > 0.52) shade -= (pore - 0.52) * 2.6 * poreBand;

      // Finer pores running the length of the grain.
      const pore2 = fbm(x * 0.46, y * 0.030, s.seed + 5, 2);
      if (pore2 > 0.60) shade -= (pore2 - 0.60) * 0.60;

      // Ray fleck: short bright marks lying along the grain. This is the detail
      // that reads as oak rather than as generic brown wood.
      const ray = fbm(x * 0.34, y * 0.055, s.seed + 9, 2);
      if (ray > 0.66) shade += (ray - 0.66) * 1.45;

      // Broad mottling so no large area is ever flat.
      shade += (fbm(x * 0.0026, y * 0.0026, s.seed + 15, 3) - 0.5) * 0.13;
      shade *= s.tint;

      // Glue joints between staves.
      if (material === 'solid') {
        const edge = Math.min(x - s.x0, s.x1 - x);
        if (edge < 1.3) shade *= 0.74;
      }

      const i4 = (y * size + x) * 4;
      px[i4]     = clamp255(base[0] * shade);
      px[i4 + 1] = clamp255(base[1] * shade);
      px[i4 + 2] = clamp255(base[2] * shade);
      px[i4 + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return cv;
}

/* Cache: regenerating on every slider nudge would be wasteful. */
const cache = new Map();
export function oakCanvas(opts) {
  const key = [opts.finish, opts.material, opts.size || 1024].join('|');
  if (!cache.has(key)) cache.set(key, makeOakCanvas(opts));
  return cache.get(key);
}

export function oakDataURL(opts) {
  return oakCanvas(opts).toDataURL('image/jpeg', 0.86);
}
