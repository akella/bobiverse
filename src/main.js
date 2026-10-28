import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildGalaxy, buildGalaxyPlane } from './galaxy.js';
import { buildSkybox } from './skybox.js';
import { buildSkySphere } from './skysphere.js';
import { buildStars } from './stars.js';
import { buildSystemMarkers, buildSol, buildWormnet, buildPGF, buildNonPGF, buildNemesis, buildGlobulars, buildGalaxies, buildGrid, buildBlackHole, buildTravels, bobColor, makeLabel } from './markers.js';
import { setupUI, fmtLy } from './ui.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 2e7);
camera.position.set(28000, 62000, 100000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.zoomSpeed = 1.4; controls.rotateSpeed = 0.7;
controls.minDistance = 0.4; controls.maxDistance = 6e6;
controls.zoomToCursor = true;

const SUN = new THREE.Vector3(0, 0, 26000);
const layers = {};
const ui = {};
let selected = null;
let hovered = null;

async function loadJSON(url) { return (await fetch(url)).json(); }

async function init() {
  const base = import.meta.env.BASE_URL + 'data/';
  const [sysData, events, starsMeta, globs, gals, travelData] = await Promise.all([
    loadJSON(base + 'systems.json'), loadJSON(base + 'events.json'), loadJSON(base + 'stars.json'), loadJSON(base + 'globulars.json'), loadJSON(base + 'galaxies.json'), loadJSON(base + 'travels.json'),
  ]);
  const systems = sysData.systems;
  const byId = Object.fromEntries(systems.map(s => [s.id, s]));

  scene.background = buildSkybox(1024);
  const sky = buildSkySphere(import.meta.env.BASE_URL + 'textures/milkyway_panorama_eso0932a.jpg');
  scene.add(sky);

  document.getElementById('loading-text').textContent = 'Sampling the Milky Way…';
  layers.galaxy = new THREE.Group();
  const galaxyPts = await buildGalaxy(import.meta.env.BASE_URL + 'textures/milkyway_eso1339g_2048.jpg');
  const galaxyPlane = buildGalaxyPlane(import.meta.env.BASE_URL + 'textures/milkyway_eso1339g_2048.jpg');
  layers.galaxy.add(galaxyPts, galaxyPlane);
  scene.add(layers.galaxy);

  document.getElementById('loading-text').textContent = 'Placing 24,000 stars…';
  layers.stars = await buildStars(base + 'stars.bin', starsMeta);
  scene.add(layers.stars);

  // star name labels
  layers.starLabels = new THREE.Group();
  const starLabelObjs = [];
  for (const n of starsMeta.named) {
    const l = makeLabel(n.n, 'star'); l.position.set(...n.p); l.userData.star = n; layers.starLabels.add(l); starLabelObjs.push(l);
  }
  scene.add(layers.starLabels);

  const gl = buildGlobulars(globs); layers.globulars = gl.group; scene.add(gl.group);
  const ga = buildGalaxies(gals); layers.galaxies = ga.group; scene.add(ga.group);

  const sm = buildSystemMarkers(systems.filter(s => s.id !== 'sol'));
  layers.systems = sm.group; scene.add(sm.group);
  const sol = buildSol(byId.sol); sm.group.add(sol.group);
  const solLabel = makeLabel('Sol', 'sys big'); solLabel.element.style.color = '#fff1b0'; solLabel.element.dataset.id = 'sol'; sol.group.add(solLabel);
  sol.group.userData = { sys: byId.sol, glow: sol.sprite, ring: null, label: solLabel };
  sm.markers.push(sol.group);

  layers.wormnet = buildWormnet(sysData.wormnet, byId); scene.add(layers.wormnet);
  const pgf = buildPGF(sysData.pgf, byId); layers.pgf = pgf.group; scene.add(pgf.group);
  layers.nonpgf = buildNonPGF(sysData.nonPgf, byId); scene.add(layers.nonpgf);
  layers.nemesis = buildNemesis(byId.nemesis); scene.add(layers.nemesis);
  layers.grid = buildGrid(); layers.grid.visible = false; scene.add(layers.grid);

  // Bob paths (narrator chapter locations joined in order) with a year scrubber
  const tr = buildTravels(travelData.travels, byId);
  layers.travels = tr.group; layers.travels.visible = false; scene.add(tr.group);
  const travelState = { year: 2349, playing: false, bobs: new Set(Object.keys(travelData.bobs)) };
  const byBob = {};
  for (const it of tr.items) (byBob[it.t.bob] ||= []).push(it);
  for (const list of Object.values(byBob)) list.sort((a, b) => a.t.depart - b.t.depart);

  // Sol-lock mode: orbit stays centred on Sol; stems drop every human-space system onto the plane
  const stems = new THREE.Group(); stems.name = 'stems'; stems.visible = false; scene.add(stems);
  {
    const pts = [], dots = [];
    for (const s of systems) {
      if (s.tier !== 'core' || !s.p || s.id === 'sol') continue;
      pts.push(s.p[0], s.p[1], s.p[2], s.p[0], 0, s.p[2]);
      dots.push(s.p[0], 0, s.p[2]);
      const l = makeLabel(`${s.p[1] >= 0 ? '+' : ''}${s.p[1].toFixed(0)} ly`, 'stem'); l.position.set(s.p[0], s.p[1] / 2, s.p[2]); stems.add(l);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    stems.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x5a6a9a, transparent: true, opacity: 0.55, depthWrite: false })));
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
    stems.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x8a97c4, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false })));
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.5, 60, 96), new THREE.MeshBasicMaterial({ color: 0x3a4a7a, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.copy(SUN); stems.add(disc);
  }
  let locked = false;
  const lockBtn = document.getElementById('btn-lock');
  function setLocked(on) {
    locked = on;
    lockBtn.classList.toggle('active', on);
    stems.visible = on;
    layers.grid.userData.local.visible = on || layers.grid.visible;
    controls.enablePan = !on;
    controls.minDistance = on ? 4 : 0.4;
    controls.maxDistance = on ? 900 : 6e6;
    if (on) {
      const far = camera.position.distanceTo(SUN) > 900;
      const d = far ? 120 : Math.min(Math.max(camera.position.distanceTo(SUN), 40), 700);
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.y < 0.25) dir.y = 0.45;
      flight = { t0: performance.now(), dur: 1200, startT: controls.target.clone(), target: SUN.clone(), dirStart: dir.clone(), dirEnd: dir.normalize(), lenStart: camera.position.distanceTo(controls.target), lenEnd: d };
    }
  }
  lockBtn.addEventListener('click', () => setLocked(!locked));

  // Sagittarius A*: a tiny black hole with accretion glow at the origin
  const sgr = buildBlackHole(0.6, 0xffc48a); sgr.position.set(0, 0, 0); scene.add(sgr);

  // ---------------- interaction
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables = sm.markers.map(m => m.userData.glow).concat(pgf.hubs, ga.items);

  const clickables = () => pickables.filter(o => o.visible && o.parent?.visible !== false);
  let downPos = null;
  canvas.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 4) return;
    const hit = pick(e);
    const lab = hit ? null : hitLabel(e.clientX, e.clientY);
    const sys = hit?.userData.sys || lab?.sys;
    if (sys) { select(sys); if (!locked) flyTo(sys.p, sys.tier === 'galaxy' ? 1200 : 10, sys); }
    else if (hit?.userData.hub || lab?.hub) { if (!locked) flyTo((hit?.userData.hub || lab.hub).p, 2500, null); }
    else if (lab?.star) { showStar(lab.star); if (!locked) flyTo(lab.star.p, 6, null); }
    else if (lab?.glob) { showGlob(lab.glob); if (!locked) flyTo(lab.glob.p, 1500, null); }
    else if (hit?.userData.galaxy || lab?.gal) { const g = hit?.userData.galaxy || lab.gal; showGalaxy(g); if (!locked) flyTo(g.p, g.size * 2.2, null); }
    else { select(null); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const hit = pick(e);
    const lab = hit ? null : hitLabel(e.clientX, e.clientY);
    canvas.style.cursor = hit || lab ? 'pointer' : '';
    const sys = hit?.userData.sys || lab?.sys;
    const el = sys ? labelFor(sys) : null;
    if (hovered && hovered !== el) hovered.classList.remove('selected');
    hovered = el; if (el) el.classList.add('selected');
  });
  function pick(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickables(), false);
    return hits[0]?.object || null;
  }
  const labelFor = (s) => document.querySelector(`.label[data-id="${s.id}"]`);

  const galToLB = (p) => { const gx = -(p[2] - 26000), gy = -p[0], gz = p[1]; const d = Math.hypot(gx, gy, gz); return [((Math.atan2(gy, gx) * 180 / Math.PI) + 360) % 360, Math.asin(gz / d) * 180 / Math.PI, d]; };
  function showGalaxy(g) {
    select(null);
    ui.api.showInfo({ kind: `${g.kind} galaxy · real`, name: g.name, facts: [['distance', fmtLy(g.d)], ['diameter', fmtLy(g.size)], ['galactic l / b', `${g.l.toFixed(1)}° / ${g.b.toFixed(1)}°`]], summary: g.desc });
  }
  function showGlob(g) {
    select(null);
    const [l, b] = galToLB(g.p);
    ui.api.showInfo({ kind: 'globular cluster · Harris catalog', name: g.name ? `${g.id} (${g.name})` : g.id, facts: [['from Sol', fmtLy(g.rsun)], ['from the core', fmtLy(Math.hypot(...g.p))], ['galactic l / b', `${l.toFixed(1)}° / ${b.toFixed(1)}°`]],
      summary: g.id === 'NGC 6934' ? 'The cluster reached through a PGF wormhole in book 6, being consumed by a black hole. In reality it is an ordinary globular in Delphinus, 52,000 ly away.' : 'One of about 160 ancient, dense balls of a few hundred thousand stars that orbit in the Milky Way\'s halo. Most are 10 to 13 billion years old, older than the disc itself.' });
  }
  function showStar(n) {
    select(null);
    ui.api.showInfo({ kind: 'star · HYG catalog', name: n.n, facts: [['from Sol', fmtLy(n.d)], ['apparent mag', n.m.toFixed(2)]], summary: 'A real star from the HYG catalog with no Bobiverse chapter set there. Click a coloured marker for the story locations.' });
  }

  function select(s) {
    document.querySelectorAll('.label.selected').forEach(el => el.classList.remove('selected'));
    selected = s;
    if (s) labelFor(s)?.classList.add('selected');
    ui.api.showSystem(s);
  }

  // ---------------- camera flights
  let flight = null;
  function flyTo(p, distance, sys) {
    if (locked && !(sys && sys.id === 'sol')) setLocked(false);
    const target = new THREE.Vector3(...p);
    const startT = controls.target.clone(), startP = camera.position.clone();
    const dirStart = startP.clone().sub(startT), lenStart = Math.max(dirStart.length(), 0.01); dirStart.normalize();
    // approach from slightly above the galactic plane, keeping the current viewing azimuth
    let dirEnd = dirStart.clone();
    if (sys?.tier === 'galaxy' || distance > 500) dirEnd = new THREE.Vector3(dirStart.x, Math.max(dirStart.y, 0.35), dirStart.z).normalize();
    flight = { t0: performance.now(), dur: 1800, startT, target, dirStart, dirEnd, lenStart, lenEnd: distance };
  }
  function stepFlight(now) {
    if (!flight) return;
    let u = Math.min(1, (now - flight.t0) / flight.dur);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const t = flight.startT.clone().lerp(flight.target, e);
    const dir = flight.dirStart.clone().lerp(flight.dirEnd, e).normalize();
    const len = Math.exp(THREE.MathUtils.lerp(Math.log(flight.lenStart), Math.log(flight.lenEnd), e));
    controls.target.copy(t);
    camera.position.copy(t).addScaledVector(dir, len);
    if (u >= 1) flight = null;
  }
  controls.addEventListener('start', () => { flight = null; });

  const VIEWS = {
    _unlock: () => { if (locked) setLocked(false); },
    galaxy: () => { flight = { t0: performance.now(), dur: 2000, startT: controls.target.clone(), target: new THREE.Vector3(0, 0, 4000), dirStart: camera.position.clone().sub(controls.target).normalize(), dirEnd: new THREE.Vector3(0.25, 0.55, 0.8).normalize(), lenStart: camera.position.distanceTo(controls.target), lenEnd: 150000 }; },
    core: () => flyTo([0, 0, 0], 40, byId['sgr-a']),
    neighbourhood: () => { flight = { t0: performance.now(), dur: 2000, startT: controls.target.clone(), target: SUN.clone(), dirStart: camera.position.clone().sub(controls.target).normalize(), dirEnd: new THREE.Vector3(0.3, 0.7, 0.65).normalize(), lenStart: camera.position.distanceTo(controls.target), lenEnd: 110 }; },
    nemesis: () => flyTo(byId.nemesis.p, 22000, byId.nemesis),
  };

  // ---------------- UI
  const PLACES = [
    { title: 'Human space', items: [
      ['sol', 'Earth: launch, war, evacuation, the Battle of Terra and the 2347 recolonisation'],
      ['eps-eri', "Bill's Skunk Works, Ultima Thule, Ragnarök. The Bobiverse's workshop"],
      ['omi2-eri', 'Vulcan and Romulus, the first and largest human colonies'],
      ['82-eri', 'Four battles with Medeiros; Asgard, Valhalla, Takamagahara'],
      ['eta-cas', 'Poseidon, the water world and its aerial-city revolution'],
    ] },
    { title: 'Aliens', items: [
      ['delta-eri', 'Eden: the Deltans, Archimedes and Bawbe'],
      ['gl877', "The Others' home system, destroyed by Icarus and Daedalus in 2257"],
      ['delta-pav', 'Old Pav: the Pav homeworld, stripped by the Others'],
      ['hip84051', 'New Pav: the resettled Pav, the Pav Navy'],
      ['eta-lep', "Heaven's River topopolis, the Quinlans, ANEC and the Quiniverse"],
      ['hip14101', 'Odin, the living gas giant where Bridget returned'],
    ] },
    { title: 'PGF and the core', items: [
      ['alien-system', 'Where Ick and Dae first found the wormhole network (2320)'],
      ['malacca', 'The first hub: 342 wormholes'],
      ['hub-zero', '1,000 wormholes and the far gate'],
      ['centaurvania', "Gunther's home, the Centaurs"],
      ['roanoke', 'The orderly abandoned world and its library'],
      ['fed-capital', 'The Archivist, the PGF capital (Abydos)'],
      ['antimatter-fountain', 'The Central Antimatter Works'],
      ['sgr-a', 'Sagittarius A*, the supermassive black hole at the centre'],
      ['creator-system', "Where the network's builder downloaded human history"],
    ] },
    { title: 'Beyond', items: [
      ['nemesis', 'The rogue dwarf galaxy and its black hole, due at the core in ~100,000 years'],
      ['george', "George's lookout high above the plane"],
      ['ngc6934', 'The globular cluster being eaten by a black hole'],
      ['edge', 'Where the derelict Dutchman and its FTL drive were found'],
      ['outer-reaches', 'The scrapyard of a hundred dead megastructures'],
      ['alien-network', 'The non-PGF wormhole 5,000 ly from Nemesis'],
      ['perseus-transit', "Starfleet's territory"],
      ['lmc', 'Where the PGF fled'],
    ] },
  ];
  ui.api = setupUI({
    systems, events, named: starsMeta.named, globulars: globs, galaxies: gals, places: PLACES,
    onSelect: select,
    onFlyTo: (p, d, s) => flyTo(p, d, s),
    onLayer: async (name, on) => {
      if (name === 'starsFar' && on && !layers.starsFar) {
        ui.api.setHud('Loading 95,000 more stars…');
        layers.starsFar = await buildStars(base + 'stars_far.bin', starsMeta, { count: starsMeta.farCount, far: true });
        scene.add(layers.starsFar);
      }
      if (layers[name]) layers[name].visible = on; if (name === 'travels') document.getElementById('travel-controls').hidden = !on; if (name === 'grid') layers.grid.userData.local.visible = on || locked; },
    onBook: (book) => {
      for (const m of sm.markers) {
        const s = m.userData.sys; const ok = !s.books?.length || Math.min(...s.books) <= book;
        if (m.userData.glow) m.userData.glow.visible = ok;
        if (m.userData.ring) m.userData.ring.visible = ok;
        m.userData.label.visible = ok;
        m.userData.hiddenByBook = !ok;
      }
      if (layers.nemesis) layers.nemesis.visible = book >= 5 && document.querySelector('[data-layer=nemesis]').checked;
      if (layers.pgf) layers.pgf.visible = book >= 5 && document.querySelector('[data-layer=pgf]').checked;
      if (layers.nonpgf) layers.nonpgf.visible = book >= 6 && document.querySelector('[data-layer=nonpgf]').checked;
      if (layers.wormnet) layers.wormnet.visible = book >= 5 && document.querySelector('[data-layer=wormnet]').checked;
      if (selected) ui.api.showSystem(selected);
    },
    onView: (v) => { VIEWS._unlock(); VIEWS[v]?.(); },
    onYear: (y) => { travelState.year = y; },
    onBobToggle: (name, on) => { if (on) travelState.bobs.add(name); else travelState.bobs.delete(name); },
    bobs: Object.keys(travelData.bobs).sort(), bobColor,
  });
  ui.api.setView('galaxy');

  // ---------------- per-frame label / marker management
  // Every label gets a priority and a visibility rule; then a greedy screen-space pass
  // hides anything that would overlap a more important label.
  const KEY = { sol: 100, 'sgr-a': 96, nemesis: 92, 'hub-zero': 88, ngc6934: 84, lmc: 80, 'eps-eri': 78, 'fed-capital': 70, edge: 66, 'outer-reaches': 64, malacca: 62, 'alien-network': 60 };
  const labelEntries = [];
  const wp = new THREE.Vector3();
  for (const m of sm.markers) {
    const s = m.userData.sys;
    const prio = KEY[s.id] ?? (s.tier === 'galaxy' ? 50 : 40 + (s.books?.length || 0));
    labelEntries.push({
      obj: m.userData.label, host: m, prio, width: s.name.length * 7.2 + 12, sys: s,
      rule: (c) => {
        if (m.userData.hiddenByBook) return false;
        if (s.tier === 'core') return s.id === 'sol' ? c.camToSun < 3e6 : c.camToSun < 900;
        const d = c.cam.distanceTo(wp.setFromMatrixPosition(m.matrixWorld));
        if (prio >= 60) return true;
        return c.camDist < 40000 || d < 15000;
      },
    });
  }
  for (const h of pgf.hubs) labelEntries.push({ obj: h.userData.label, host: h, prio: 30, width: 120, hub: h.userData.hub, rule: (c) => c.camToSun > 1500 && c.cam.distanceTo(h.position) < 60000 });
  for (const l of starLabelObjs) labelEntries.push({ obj: l, host: l, prio: 5 + (4 - Math.min(4, l.userData.star.m)), width: l.userData.star.n.length * 6.5 + 10, star: l.userData.star, rule: (c) => c.camToSun < 320 && (c.camDist < 150 || l.userData.star.m < 2.5) });
  for (const l of gl.labels) labelEntries.push({ obj: l, host: l, prio: 10, width: 110, glob: l.userData.glob, rule: (c) => c.camToSun > 3000 && c.cam.distanceTo(l.position) < 22000 });
  for (const it of ga.items) labelEntries.push({ obj: it.userData.label, host: it, prio: 36, width: 150, gal: it.userData.galaxy, rule: (c) => c.cam.distanceTo(it.position) < it.userData.galaxy.d * 1.6 || c.camToSun > 60000 });
  const placed = [];
  function declutter(ctx) {
    placed.length = 0;
    const W = window.innerWidth, H = window.innerHeight;
    const cands = [];
    for (const e of labelEntries) {
      if (!e.rule(ctx) || !e.host.visible || e.host.parent?.visible === false) { e.obj.visible = false; continue; }
      wp.setFromMatrixPosition(e.host.matrixWorld).project(camera);
      if (wp.z > 1 || wp.x < -1.1 || wp.x > 1.1 || wp.y < -1.1 || wp.y > 1.1) { e.obj.visible = false; continue; }
      e.sx = (wp.x + 1) / 2 * W; e.sy = (1 - wp.y) / 2 * H;
      cands.push(e);
    }
    cands.sort((a, b) => b.prio - a.prio);
    for (const e of cands) {
      if (e.obj.visible && e.obj.element.offsetWidth) e.width = e.obj.element.offsetWidth;   // measured once visible
      const x0 = e.sx, y0 = e.sy - 11, x1 = x0 + e.width, y1 = y0 + 22;
      let ok = true;
      for (const p of placed) { if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) { ok = false; break; } }
      e.obj.visible = ok;
      if (ok) { const r = [x0, y0, x1, y1]; r.entry = e; placed.push(r); }
    }
  }

  function hitLabel(x, y) {
    for (const r of placed) if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return r.entry;
    return null;
  }

  function updateMarkers() {
    const camDist = camera.position.distanceTo(controls.target);
    const camToSun = camera.position.distanceTo(SUN);
    const fovScale = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / window.innerHeight; // world units per pixel at distance 1
    for (const m of sm.markers) {
      const s = m.userData.sys;
      if (m.userData.hiddenByBook) continue;
      const d = camera.position.distanceTo(m.position);
      const px = fovScale * d;
      if (m.userData.glow) { const g = m.userData.glow; g.scale.setScalar(px * g.userData.px); }
      if (m.userData.ring) { const r = m.userData.ring; r.scale.setScalar(px * r.userData.px); }
      if (m.userData.glow) m.userData.glow.visible = s.tier === 'core' ? camToSun < 40000 : true;
      if (m.userData.ring) m.userData.ring.visible = m.userData.glow.visible;
    }
    for (const h of pgf.hubs) { const d = camera.position.distanceTo(h.position); h.scale.setScalar(fovScale * d * h.userData.px); }
    declutter({ cam: camera.position, camDist, camToSun });
    if (locked && !flight) controls.target.copy(SUN);
    stems.children.forEach(c => { if (c.isCSS2DObject) c.visible = locked && camToSun < 200; });
    // Bob paths
    if (layers.travels.visible) {
      const y = travelState.year, bookMax = ui.api.state.book;
      for (const [bob, list] of Object.entries(byBob)) {
        const on = travelState.bobs.has(bob);
        let current = null;
        for (const it of list) {
          const show = on && it.t.depart <= y && (it.t.book == null || it.t.book <= bookMax);
          it.line.visible = show; it.dot.visible = false;
          if (show) current = it;
        }
        if (current) {
          const t = current.t;
          const u = y >= t.arrive ? 1 : (y - t.depart) / Math.max(t.arrive - t.depart, 0.01);
          current.curve.getPoint(THREE.MathUtils.clamp(u, 0, 1), current.dot.position);
          current.dot.visible = true;
          current.dot.scale.setScalar(fovScale * camera.position.distanceTo(current.dot.position) * current.dot.userData.px);
          current.label.visible = true;
        }
      }
    }
    if (layers.nemesis) layers.nemesis.userData.trajectoryLabel.visible = camDist > 20000 && layers.nemesis.visible;
    // inside the disc the real all-sky panorama takes over from the particle model
    sky.position.copy(camera.position);
    sky.material.uniforms.uOpacity.value = 1 - THREE.MathUtils.smoothstep(camToSun, 600, 4000);
    // the flat picture of the disc fades once we are inside the disc
    const h = Math.abs(camera.position.y);
    galaxyPlane.material.opacity = 0.55 * THREE.MathUtils.smoothstep(camToSun, 400, 6000) * THREE.MathUtils.smoothstep(h, 300, 4000);
    if (!locked && !layers.grid.visible) layers.grid.userData.local.visible = false; else if (layers.grid.visible) layers.grid.userData.local.visible = camToSun < 400;
    layers.grid.children.forEach(c => { if (c.isCSS2DObject) c.visible = c.userData.local ? camToSun < 400 : camToSun > 5000; });
    // the galaxy's fine-star layer eases out when we stand among the real catalog stars
    galaxyPts.material.uniforms.uOpacity.value = THREE.MathUtils.clamp((camToSun - 40) / 600, 0.25, 1);
    sgr.userData.disc.rotation.z += 0.002;
    layers.nemesis.children[1].userData.disc.rotation.z += 0.004;
    ui.api.setHud(`camera ${fmtLy(camDist)} from target · ${fmtLy(camToSun)} from Sol · ${fmtLy(camera.position.length())} from the galactic centre`);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); labelRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  controls.target.set(0, 0, 4000);
  window.__bob = { scene, camera, controls, layers, sky, renderer, pick, hitLabel, placed, showGalaxy };
  ui.api.loadingDone();
  renderer.setAnimationLoop((now) => {
    stepFlight(now);
    controls.update();
    updateMarkers();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  // deep link: ?go=eps-eri
  const go = new URLSearchParams(location.search).get('go');
  if (go && byId[go]?.p) { select(byId[go]); flyTo(byId[go].p, byId[go].tier === 'galaxy' ? 1200 : 10, byId[go]); }
}

init().catch(err => { console.error(err); document.getElementById('loading-text').textContent = 'Failed to load: ' + err.message; });
