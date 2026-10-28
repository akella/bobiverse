// The real sky as seen from inside the disc: ESO's 360° Milky Way panorama
// (ESO/S. Brunier, CC BY 4.0, galactic coordinates, galactic centre in the middle).
// Mapped per-fragment from the view direction so there is no seam, and faded in only
// when the camera is within a few thousand light-years of the Sun.
import * as THREE from 'three';

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w * 0.999999; // always at the far plane
  }
`;
const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 d = normalize(vDir);
    // scene -> heliocentric galactic: gx = -z (toward centre), gy = -x (l = 90), gz = y (north)
    float gx = -d.z, gy = -d.x, gz = d.y;
    float l = atan(gy, gx);              // -PI..PI, increases toward l = 90
    float b = asin(clamp(gz, -1.0, 1.0));
    vec2 uv = vec2(0.5 - l / (2.0 * PI), 0.5 + b / PI);
    vec3 c = texture2D(uMap, uv).rgb;
    gl_FragColor = vec4(c * 1.15, uOpacity);
  }
`;

export function buildSkySphere(url) {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uMap: { value: tex }, uOpacity: { value: 0 } },
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.name = 'skysphere';
  return mesh;
}
