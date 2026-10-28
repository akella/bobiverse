// Milky Way particle model.
// Density, colour and arm structure are sampled from the ESO/NASA/JPL-Caltech/R. Hurt
// artist's impression (public domain); the vertical structure is modelled:
//   thin disc   scale height ~ 300 ly (sech^2), flaring with radius
//   thick disc  scale height ~ 1,000 ly at lower weight
//   bulge/bar   triaxial, ~ 3,000 ly tall
import * as THREE from 'three';

export const IMAGE_SPAN_LY = 136000;     // the picture is 136,000 ly across (Sun 26,000 ly from centre at v = 0.691)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadImageData(url, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
      resolve({ data: ctx.getImageData(0, 0, size, size).data, size, image: img });
    };
    img.onerror = reject;
    img.src = url;
  });
}

const vert = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  attribute float layer;        // 0 = fine stars, 1 = soft dust/cloud sprites
  varying vec3 vColor;
  varying float vLayer;
  varying float vFade;
  varying float vFar;
  uniform float uPixelRatio;
  uniform float uOpacity;
  void main() {
    vColor = color;
    vLayer = layer;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    // particles very close to the camera dissolve so the inside of the disc never looks like confetti
    vFade = smoothstep(80.0, 900.0, dist);
    vFar = smoothstep(15000.0, 90000.0, dist);
    float px = size * uPixelRatio * (layer > 0.5 ? 9000.0 : 2600.0) / dist;
    gl_PointSize = clamp(px, layer > 0.5 ? 2.0 : 1.4 * uPixelRatio, layer > 0.5 ? 160.0 : 5.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vLayer;
  varying float vFade;
  varying float vFar;
  uniform float uOpacity;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float a;
    if (vLayer > 0.5) {
      a = exp(-r2 * 14.0) * 0.075;
    } else {
      a = smoothstep(0.25, 0.0, r2) * mix(1.0, 0.45, vFar);
    }
    gl_FragColor = vec4(vColor, a * uOpacity * vFade);
  }
`;

export async function buildGalaxy(textureUrl, { starCount = 220000, cloudCount = 26000 } = {}) {
  const { data, size } = await loadImageData(textureUrl, 1024);
  const rand = mulberry32(1337);

  // importance sampling: cumulative distribution of luminance^gamma over pixels
  const n = size * size;
  const weights = new Float32Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const w = Math.pow(Math.max(0, lum - 0.02), 1.35);
    weights[i] = w; total += w;
  }
  const cdf = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += weights[i] / total; cdf[i] = acc; }
  const pick = () => {
    const u = rand();
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const gauss = () => { // Box-Muller
    const u = Math.max(rand(), 1e-9), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const count = starCount + cloudCount;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sz = new Float32Array(count);
  const layer = new Float32Array(count);
  const scale = IMAGE_SPAN_LY / size;
  const color = new THREE.Color();

  for (let k = 0; k < count; k++) {
    const isCloud = k >= starCount;
    const i = pick();
    const px = i % size, py = (i / size) | 0;
    const x = (px + rand() - size / 2) * scale;
    const z = (py + rand() - size / 2) * scale;
    const R = Math.hypot(x, z);
    // vertical structure
    const thin = 260 + 0.012 * R;                 // flaring thin disc
    let y;
    const u = rand();
    if (R < 9000) {
      const bulgeFrac = Math.exp(-R / 4500);
      if (u < bulgeFrac) {
        const h = 2600 * (1 - R / 9000) + 400;
        y = gauss() * h * 0.6;
      } else y = gauss() * thin * (u < 0.85 ? 1 : 3.2);
    } else {
      y = gauss() * (u < 0.86 ? thin : thin * 3.4);
    }
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    color.setRGB(r, g, b);
    if (isCloud) {
      // soften and slightly saturate for the glow layer
      color.offsetHSL(0, 0.12, 0.05);
    } else {
      // sprinkle in stellar colours: mostly white-blue in arms, warmer in the bulge
      const warm = Math.exp(-R / 7000);
      color.lerp(new THREE.Color().setHSL(warm > rand() ? 0.09 : 0.6, 0.35, 0.75), 0.45);
    }
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    col[k * 3] = color.r; col[k * 3 + 1] = color.g; col[k * 3 + 2] = color.b;
    sz[k] = isCloud ? 0.9 + rand() * 1.4 : 0.35 + Math.pow(rand(), 3) * 1.6 + lum * 0.3;
    layer[k] = isCloud ? 1 : 0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  geo.setAttribute('layer', new THREE.BufferAttribute(layer, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), IMAGE_SPAN_LY);

  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'galaxy';
  points.frustumCulled = false;
  return points;
}

// Soft sprite texture shared by glows, clusters and galaxies
export function makeGlowTexture(size = 128, inner = 0.0, power = 2.2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
    const r = Math.min(1, Math.hypot(dx, dy) * 2);
    const a = Math.pow(Math.max(0, 1 - r), power) * (r < inner ? 1 : 1);
    const o = (y * size + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Procedural dwarf galaxy for Nemesis: a fuzzy elliptical of stars with a black hole in the middle
export function buildDwarfGalaxy({ count = 16000, radius = 6000, color = 0xffd9a8 } = {}) {
  const rand = mulberry32(777);
  const gauss = () => { const u = Math.max(rand(), 1e-9), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sz = new Float32Array(count);
  const layer = new Float32Array(count);
  const base = new THREE.Color(color);
  const c = new THREE.Color();
  for (let k = 0; k < count; k++) {
    const r = Math.abs(gauss()) * radius * 0.45;
    const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
    pos[k * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[k * 3 + 1] = r * Math.cos(ph) * 0.55;
    pos[k * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    c.copy(base).offsetHSL((rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.25);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    const cloud = k % 9 === 0;
    sz[k] = cloud ? 1.2 + rand() : 0.4 + rand() * 1.2;
    layer[k] = cloud ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  geo.setAttribute('layer', new THREE.BufferAttribute(layer, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/** The artist's impression itself as a flat, additively blended disc: gives crisp arm
 *  structure from above; faded out when the camera dives into the disc. */
export function buildGalaxyPlane(textureUrl) {
  const tex = new THREE.TextureLoader().load(textureUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(IMAGE_SPAN_LY, IMAGE_SPAN_LY);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  // image u (right) -> +x, image v (down) -> +z  (Sun at the bottom of the picture = +z)
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'galaxyPlane';
  return mesh;
}
