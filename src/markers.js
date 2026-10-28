// Bobiverse places, wormhole networks, Nemesis, globular clusters and neighbouring galaxies.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeGlowTexture, buildDwarfGalaxy } from './galaxy.js';
import { makeGalaxyTexture } from './skybox.js';

export const TAG_COLORS = {
  human: 0x5ad67d, colony: 0x5ad67d, bobs: 0x7ec8ff, tech: 0x7ec8ff, alien: 0xe0a4ff, megastructure: 0xe0a4ff,
  others: 0xff6b6b, battle: 0xff6b6b, pgf: 0xffd166, hub: 0xffd166, core: 0xffd166, threat: 0xff3b5c, blackhole: 0xff3b5c, region: 0x9aa4c8,
};
const TAG_PRIORITY = ['threat', 'others', 'human', 'alien', 'pgf', 'bobs', 'region'];

export function colorFor(sys) {
  for (const t of TAG_PRIORITY) if (sys.tags?.includes(t)) return TAG_COLORS[t];
  return 0x9aa4c8;
}

function ringTexture(dashed) {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
  if (dashed) ctx.setLineDash([12, 9]);
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2); ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeLabel(text, cls) {
  const el = document.createElement('div');
  el.className = 'label ' + cls;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.center.set(0, 0.5);          // anchor at the left edge so text sits beside the marker
  obj.element = el;
  return obj;
}

const glowTex = makeGlowTexture(128, 0, 3.0);
const dotTex = makeGlowTexture(64, 0, 0.6);
const ringTex = ringTexture(false);
const ringDashTex = ringTexture(true);

/** A screen-constant marker: glow + ring + label, scaled every frame by distance. */
export function buildSystemMarkers(systems) {
  const group = new THREE.Group();
  group.name = 'systems';
  const markers = [];
  for (const s of systems) {
    if (!s.p) continue;
    const color = colorFor(s);
    const m = new THREE.Group();
    m.position.set(s.p[0], s.p[1], s.p[2]);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: s.tier === 'galaxy' ? 0.5 : 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: s.approx ? ringDashTex : ringTex, color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
    glow.userData.px = s.tier === 'galaxy' ? 24 : 26;
    ring.userData.px = s.kind === 'hub' ? 16 : 12;
    glow.userData.sys = s; ring.userData.sys = s;
    m.add(glow, ring);
    const label = makeLabel(s.name, 'sys' + (s.approx ? ' approx' : '') + (s.tier === 'galaxy' ? ' big' : ''));
    label.element.style.color = '#' + new THREE.Color(color).getHexString();
    label.element.dataset.id = s.id;
    m.add(label);
    m.userData = { sys: s, glow, ring, label };
    group.add(m);
    markers.push(m);
  }
  return { group, markers };
}

export function buildSol(solSystem) {
  const g = new THREE.Group();
  g.position.set(...solSystem.p);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sun.userData.px = 30;
  sun.userData.sys = solSystem;
  g.add(sun);
  return { group: g, sprite: sun };
}

export function buildWormnet(pairs, byId, color = 0x6fe3ff) {
  const pts = [];
  for (const [a, b] of pairs) { const A = byId[a], B = byId[b]; if (A?.p && B?.p) pts.push(...A.p, ...B.p); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  lines.name = 'wormnet';
  return lines;
}

export function buildPGF(pgf, byId) {
  const group = new THREE.Group();
  group.name = 'pgf';
  const Y = 0xffd166;
  const key = (r, i) => `${r}:${i}`;
  const hubPos = Object.fromEntries(pgf.hubs.map(h => [key(h.ring, h.i), h.p]));
  // ring backbones and radial links between rings
  const explored = new Set(pgf.explored || pgf.rings);
  const bb = [], bbDim = [];
  for (const [a, b] of pgf.ringLinks) (explored.has(a[0]) ? bb : bbDim).push(...hubPos[key(...a)], ...hubPos[key(...b)]);
  const dimGeo = new THREE.BufferGeometry(); dimGeo.setAttribute('position', new THREE.Float32BufferAttribute(bbDim, 3));
  group.add(new THREE.LineSegments(dimGeo, new THREE.LineBasicMaterial({ color: Y, transparent: true, opacity: 0.3, depthWrite: false })));
  const rad = [];
  for (const [a, b] of pgf.radialLinks) rad.push(...hubPos[key(...a)], ...hubPos[key(...b)]);
  for (const [a, id] of pgf.coreLinks || []) { const B = byId[id]; if (B?.p) rad.push(...hubPos[key(...a)], ...B.p); }
  const bbGeo = new THREE.BufferGeometry(); bbGeo.setAttribute('position', new THREE.Float32BufferAttribute(bb, 3));
  group.add(new THREE.LineSegments(bbGeo, new THREE.LineBasicMaterial({ color: Y, transparent: true, opacity: 0.8, depthWrite: false })));
  const radGeo = new THREE.BufferGeometry(); radGeo.setAttribute('position', new THREE.Float32BufferAttribute(rad, 3));
  group.add(new THREE.LineSegments(radGeo, new THREE.LineBasicMaterial({ color: Y, transparent: true, opacity: 0.4, depthWrite: false })));
  // leaf chains
  const ch = [];
  const leafPts = [];
  for (const chain of pgf.chains) {
    for (let i = 0; i < chain.length - 1; i++) ch.push(...chain[i], ...chain[i + 1]);
    for (let i = 1; i < chain.length; i++) leafPts.push(...chain[i]);
  }
  const chGeo = new THREE.BufferGeometry(); chGeo.setAttribute('position', new THREE.Float32BufferAttribute(ch, 3));
  group.add(new THREE.LineSegments(chGeo, new THREE.LineBasicMaterial({ color: Y, transparent: true, opacity: 0.16, depthWrite: false })));
  const lpGeo = new THREE.BufferGeometry(); lpGeo.setAttribute('position', new THREE.Float32BufferAttribute(leafPts, 3));
  group.add(new THREE.Points(lpGeo, new THREE.PointsMaterial({ color: Y, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false, map: dotTex, alphaTest: 0.05 })));
  // hub nodes (Malacca and Hub Zero have their own system markers)
  const namedHubs = new Set();
  for (const s of Object.values(byId)) if (s.hub) namedHubs.add(key(s.hub.ring, s.hub.index));
  const hubs = [];
  for (const h of pgf.hubs) {
    if (namedHubs.has(key(h.ring, h.i))) continue;
    const dim = !explored.has(h.ring);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: Y, transparent: true, opacity: dim ? 0.35 : 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(...h.p); sp.userData.px = dim ? 7 : 10; sp.userData.hub = h;
    const label = makeLabel(h.name, 'hub dim');
    sp.add(label);
    sp.userData.label = label;
    group.add(sp); hubs.push(sp);
  }
  // ring captions
  for (const R of pgf.rings) {
    const l = makeLabel(`PGF ring ≈${Math.round(R / 1000)},000 ly${explored.has(R) ? '' : ' (unexplored)'}`, 'hub dim');
    const th = THREE.MathUtils.degToRad(3 - 7 * 9.5);
    l.position.set(-R * Math.sin(th), 0, R * Math.cos(th));
    group.add(l);
  }
  // Hub Zero -> sentry -> capital, and first system -> first hub
  const special = [];
  const addPath = (ids) => { for (let i = 0; i < ids.length - 1; i++) { const A = byId[ids[i]], B = byId[ids[i + 1]]; if (A?.p && B?.p) special.push(...A.p, ...B.p); } };
  addPath(pgf.capitalLink); addPath(pgf.firstLink);
  const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.Float32BufferAttribute(special, 3));
  const spMat = new THREE.LineDashedMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.9, dashSize: 900, gapSize: 500, depthWrite: false });
  const spLines = new THREE.LineSegments(spGeo, spMat); spLines.computeLineDistances();
  group.add(spLines);
  return { group, hubs };
}

export function buildNonPGF(pairs, byId) {
  const pts = [];
  for (const [a, b] of pairs) { const A = byId[a], B = byId[b]; if (A?.p && B?.p) pts.push(...A.p, ...B.p); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineDashedMaterial({ color: 0xff7bd5, transparent: true, opacity: 0.8, dashSize: 1200, gapSize: 700, depthWrite: false });
  const l = new THREE.LineSegments(geo, mat); l.computeLineDistances(); l.name = 'nonpgf';
  return l;
}

export function buildBlackHole(radius, discColor = 0xffb070) {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  // accretion disc: a flat ring with radial gradient texture
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(s / 2, s / 2, s * 0.17, s / 2, s / 2, s / 2);
  const col = '#' + new THREE.Color(discColor).getHexString();
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.12, col); grad.addColorStop(0.5, col + '88'); grad.addColorStop(1, col + '00');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.17, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(radius * 7, radius * 7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  disc.rotation.x = -Math.PI / 2;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: discColor, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(radius * 10);
  g.add(hole, disc, glow);
  g.userData.disc = disc;
  return g;
}

export function buildNemesis(sys) {
  const g = new THREE.Group();
  g.name = 'nemesis';
  g.position.set(...sys.p);
  const stars = buildDwarfGalaxy({ count: 18000, radius: 7000, color: 0xffd0a0 });
  g.add(stars);
  const bh = buildBlackHole(140, 0xff7a5c);
  g.add(bh);
  // trajectory toward Sgr A* (origin): dashed line + arrow head
  const dir = new THREE.Vector3(...sys.p).negate().normalize();
  const pts = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(new THREE.Vector3(...sys.p).length() - 2500)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.7, dashSize: 1600, gapSize: 900, depthWrite: false }));
  line.computeLineDistances();
  g.add(line);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(900, 2600, 12), new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.8 }));
  cone.position.copy(pts[1]);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(cone);
  const tl = makeLabel('Nemesis trajectory → Sgr A*, impact in ≈100,000 yr', 'sys dim');
  tl.element.style.color = '#ff8aa0';
  tl.position.copy(pts[1]);
  g.add(tl);
  g.userData.trajectoryLabel = tl;
  return g;
}

export function buildGlobulars(globs) {
  const group = new THREE.Group(); group.name = 'globulars';
  const pos = [];
  for (const g of globs) pos.push(...g.p);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8d9b8, size: 9, sizeAttenuation: false, map: glowTex, transparent: true, opacity: 0.85, depthWrite: false, alphaTest: 0.02, blending: THREE.AdditiveBlending }));
  group.add(pts);
  const labels = [];
  for (const g of globs) {
    const text = g.name ? `${g.id} (${g.name})` : g.id;
    const l = makeLabel(text, 'glob');
    l.position.set(...g.p);
    l.userData.glob = g;
    group.add(l); labels.push(l);
  }
  return { group, labels, points: pts };
}

export function buildGalaxies(galaxies) {
  const group = new THREE.Group(); group.name = 'galaxies';
  const items = [];
  for (const g of galaxies) {
    const tex = makeGalaxyTexture(g.kind, g.id.length * 7 + 3);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(...g.p);
    sp.scale.set(g.size, g.size, 1);
    sp.material.rotation = (g.id.length * 1.3) % Math.PI;
    const label = makeLabel(g.name, 'gal');
    sp.add(label);
    sp.userData = { galaxy: g, label };
    group.add(sp); items.push(sp);
  }
  return { group, items };
}

export function buildGrid() {
  const g = new THREE.Group(); g.name = 'grid';
  const mat = new THREE.LineBasicMaterial({ color: 0x4a5a8a, transparent: true, opacity: 0.35, depthWrite: false });
  const pts = [];
  for (let r = 10000; r <= 70000; r += 10000) {
    const seg = 180;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      pts.push(r * Math.sin(a0), 0, r * Math.cos(a0), r * Math.sin(a1), 0, r * Math.cos(a1));
    }
  }
  for (let a = 0; a < 360; a += 30) { const t = THREE.MathUtils.degToRad(a); pts.push(0, 0, 0, 70000 * Math.sin(t), 0, 70000 * Math.cos(t)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo, mat));
  for (let r = 10000; r <= 70000; r += 20000) { const l = makeLabel(`${(r / 1000) | 0},000 ly`, 'star dim'); l.position.set(0, 0, r); g.add(l); }
  // local grid around the Sun, 10 ly rings to 50 ly
  const loc = [];
  for (let r = 10; r <= 50; r += 10) {
    const seg = 96;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      loc.push(r * Math.sin(a0), 0, 26000 + r * Math.cos(a0), r * Math.sin(a1), 0, 26000 + r * Math.cos(a1));
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(loc, 3));
  const local = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x4a5a8a, transparent: true, opacity: 0.4, depthWrite: false }));
  local.name = 'localGrid';
  g.add(local);
  for (let r = 10; r <= 50; r += 20) { const l = makeLabel(`${r} ly`, 'star dim'); l.position.set(0, 0, 26000 + r); l.userData.local = true; g.add(l); }
  g.userData.local = local;
  return g;
}

/** Narrator paths: one lifted arc per move, coloured per Bob. */
export function bobColor(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const FIXED = { Bob: 0.58, Bill: 0.52, Riker: 0.0, Will: 0.0, Howard: 0.33, Icarus: 0.12, Calvin: 0.08, Mario: 0.9, Milo: 0.75, Herschel: 0.45, Jacques: 0.83, Marcus: 0.28 };
  const hue = FIXED[name] ?? (h % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.75, 0.62);
}
export function buildTravels(travels, byId) {
  const group = new THREE.Group(); group.name = 'travels';
  const items = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of travels) {
    const A = byId[t.frm], B = byId[t.to]; if (!A?.p || !B?.p) continue;
    const a = new THREE.Vector3(...A.p), b = new THREE.Vector3(...B.p);
    const len = a.distanceTo(b);
    const mid = a.clone().lerp(b, 0.5).addScaledVector(up, len * 0.18);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const pts = curve.getPoints(32);
    const color = bobColor(t.bob);
    const worm = t.mode === 'wormhole';
    const mat = worm ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, dashSize: len * 0.03, gapSize: len * 0.02 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    if (worm) line.computeLineDistances();
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    dot.userData.px = 16;
    const label = makeLabel(t.bob, 'star');
    label.element.style.color = '#' + color.getHexString();
    dot.add(label);
    group.add(line, dot);
    items.push({ t, line, dot, label, curve, color });
  }
  return { group, items };
}
