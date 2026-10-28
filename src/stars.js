// Real stars from the HYG catalog, packed as Float32 [x, y, z, mag, ci].
import * as THREE from 'three';

// B-V colour index -> approximate RGB (Ballesteros' formula for temperature, then a simple blackbody fit)
export function bvToColor(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const x = t / 1000;
  let r, g, b;
  if (x <= 6.6) r = 1; else r = Math.min(1, 1.292 * Math.pow(x - 6, -0.1332));
  if (x <= 6.6) g = Math.max(0, Math.min(1, 0.39 * Math.log(x) - 0.63)); else g = Math.min(1, 1.13 * Math.pow(x - 6, -0.0755));
  if (x >= 6.6) b = 1; else if (x <= 1.9) b = 0; else b = Math.max(0, Math.min(1, 0.543 * Math.log(x - 1) - 0.4));
  return [r, g, b];
}

const vert = /* glsl */ `
  attribute float mag;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;
  uniform float uFar;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    // apparent size from magnitude; stays readable from 1 ly to 1000 ly
    float base = clamp(7.5 - mag, 1.2, 9.0);
    float px = base * uPixelRatio * (0.55 + 60.0 / max(dist, 1.0));
    gl_PointSize = clamp(px, 1.5 * uPixelRatio, 14.0 * uPixelRatio) * (1.0 - 0.35 * uFar);
    vAlpha = clamp(0.35 + (7.0 - mag) * 0.12, 0.25, 1.0) * (1.0 - 0.45 * uFar);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float core = smoothstep(0.08, 0.0, r2);
    float halo = smoothstep(0.25, 0.0, r2) * 0.45;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.6), (core + halo) * vAlpha);
  }
`;

export async function buildStars(binUrl, meta, { count = meta.count, far = false } = {}) {
  const buf = await (await fetch(binUrl)).arrayBuffer();
  const f = new Float32Array(buf);
  const n = count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = f[i * 5]; pos[i * 3 + 1] = f[i * 5 + 1]; pos[i * 3 + 2] = f[i * 5 + 2];
    mag[i] = f[i * 5 + 3];
    const c = bvToColor(f[i * 5 + 4]);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uFar: { value: far ? 1 : 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'stars';
  return pts;
}
