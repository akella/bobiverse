// Procedural extragalactic background: thousands of faint, distant galaxies on a
// cubemap. Rendered once into six canvases at start-up. There is no real all-sky
// image of what the universe looks like from outside the Milky Way, so this layer
// is decorative; the *real* neighbouring galaxies are placed separately in the scene.
import * as THREE from 'three';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawGalaxy(ctx, x, y, r, angle, type, rand, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const hue = type === 'elliptical' ? 35 + rand() * 20 : 200 + rand() * 40;
  const squash = type === 'elliptical' ? 0.55 + rand() * 0.4 : 0.25 + rand() * 0.6;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `hsla(${hue + 20}, 60%, 92%, ${alpha})`);
  g.addColorStop(0.25, `hsla(${hue}, 55%, 75%, ${alpha * 0.55})`);
  g.addColorStop(1, `hsla(${hue}, 60%, 60%, 0)`);
  ctx.scale(1, squash);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  if (type === 'spiral' && r > 6) {
    ctx.strokeStyle = `hsla(${hue + 10}, 70%, 85%, ${alpha * 0.35})`;
    ctx.lineWidth = Math.max(0.6, r * 0.08);
    for (let arm = 0; arm < 2; arm++) {
      ctx.beginPath();
      for (let t = 0; t < 2.6; t += 0.08) {
        const rr = r * 0.12 * Math.exp(t * 0.75);
        const a = t * 1.9 + arm * Math.PI;
        const px = rr * Math.cos(a), py = rr * Math.sin(a);
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Sprite texture for one neighbouring galaxy (used for LMC, Andromeda, ...). */
export function makeGalaxyTexture(kind, seed = 1) {
  const rand = mulberry32(seed);
  const s = 256;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const type = kind === 'spiral' ? 'spiral' : 'elliptical';
  drawGalaxy(ctx, s / 2, s / 2, s * 0.46, 0, type, rand, kind === 'dwarf' ? 0.5 : 0.85);
  if (kind === 'irregular') {
    for (let i = 0; i < 40; i++) {
      const g = ctx.createRadialGradient(s / 2 + (rand() - 0.5) * s * 0.5, s / 2 + (rand() - 0.5) * s * 0.4, 0, s / 2, s / 2, s * 0.12);
      g.addColorStop(0, `rgba(255,230,200,${0.08 + rand() * 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSkybox(size = 1024, seed = 99) {
  const rand = mulberry32(seed);
  const faces = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    // deep background with a very faint large-scale gradient (cosmic web hint)
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6; i++) {
      const g = ctx.createRadialGradient(rand() * size, rand() * size, 0, rand() * size, rand() * size, size * (0.4 + rand() * 0.5));
      g.addColorStop(0, `rgba(${30 + rand() * 20 | 0}, ${30 + rand() * 20 | 0}, ${60 + rand() * 30 | 0}, 0.10)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    }
    // far galaxies: many tiny, few larger; clustered a little
    const clusters = [];
    for (let i = 0; i < 14; i++) clusters.push([rand() * size, rand() * size, 40 + rand() * 120]);
    const count = 3200;
    for (let i = 0; i < count; i++) {
      let x = rand() * size, y = rand() * size;
      if (rand() < 0.45) { const cl = clusters[(rand() * clusters.length) | 0]; x = cl[0] + (rand() - 0.5) * cl[2] * 2; y = cl[1] + (rand() - 0.5) * cl[2] * 2; }
      const t = rand();
      const r = t < 0.9 ? 0.6 + rand() * 1.2 : t < 0.992 ? 1.8 + rand() * 2.5 : 4 + rand() * 5;
      const type = rand() < 0.55 ? 'spiral' : 'elliptical';
      drawGalaxy(ctx, x, y, r, rand() * Math.PI, type, rand, r < 2 ? 0.22 + rand() * 0.25 : 0.3 + rand() * 0.3);
    }
    faces.push(c);
  }
  const tex = new THREE.CubeTexture(faces);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
