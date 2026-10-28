// Search, info panel, layer toggles, spoiler filter, HUD.
const BOOKS = {
  1: 'We Are Legion (We Are Bob)', 2: 'For We Are Many', 3: 'All These Worlds',
  4: "Heaven's River", 5: 'Not Till We Are Lost', 6: 'The Infinite Extent',
};
const KIND_LABEL = { star: 'star system', blackhole: 'black hole', cluster: 'globular cluster', pgf: 'PGF site', hub: 'PGF hub', region: 'region', galaxy: 'galaxy' };

export function fmtLy(ly) {
  if (ly < 100) return `${ly.toFixed(1)} ly`;
  if (ly < 10000) return `${Math.round(ly).toLocaleString()} ly`;
  if (ly < 1e6) return `${(ly / 1000).toFixed(1)}k ly`;
  return `${(ly / 1e6).toFixed(2)}M ly`;
}

export function setupUI({ systems, events, named, globulars, galaxies, places = [], onSelect, onFlyTo, onLayer, onBook, onView, onYear, onBobToggle, bobs = [], bobColor }) {
  const $ = (s) => document.querySelector(s);
  const state = { book: 6 };

  // ---- search
  const entries = [];
  for (const s of systems) entries.push({ name: s.name, sub: s.unlocated ? 'not located in the books' : (s.aka?.join(', ') || KIND_LABEL[s.kind] || ''), kind: 'sys', ref: s, keys: [s.name, ...(s.aka || [])].join(' ').toLowerCase() });
  for (const n of named) entries.push({ name: n.n, sub: `star · ${fmtLy(n.d)}`, kind: 'star', ref: n, keys: n.n.toLowerCase() });
  for (const g of globulars) entries.push({ name: g.name ? `${g.id} (${g.name})` : g.id, sub: `globular cluster · ${fmtLy(g.rsun)}`, kind: 'glob', ref: g, keys: (g.id + ' ' + g.name).toLowerCase() });
  for (const g of galaxies) entries.push({ name: g.name, sub: `galaxy · ${fmtLy(g.d)}`, kind: 'gal', ref: g, keys: g.name.toLowerCase() });
  const input = $('#search'), list = $('#search-results');
  let active = -1, shown = [];
  const render = () => {
    list.innerHTML = '';
    shown.forEach((e, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${e.name}</span><small>${e.sub}</small>`;
      if (i === active) li.classList.add('active');
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(e); });
      list.appendChild(li);
    });
    list.hidden = shown.length === 0;
  };
  const choose = (e) => {
    input.value = ''; list.hidden = true; shown = [];
    if (e.kind === 'sys') { if (e.ref.p) onFlyTo(e.ref.p, e.ref.tier === 'galaxy' ? 1500 : 12, e.ref); onSelect(e.ref); }
    else if (e.kind === 'star') onFlyTo(e.ref.p, 6, null);
    else if (e.kind === 'glob') onFlyTo(e.ref.p, 1500, null);
    else if (e.kind === 'gal') onFlyTo(e.ref.p, e.ref.size * 2.2, null);
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { shown = []; render(); return; }
    shown = entries.filter(e => e.keys.includes(q)).sort((a, b) => (a.kind === 'sys' ? 0 : 1) - (b.kind === 'sys' ? 0 : 1) || a.keys.indexOf(q) - b.keys.indexOf(q)).slice(0, 12);
    active = 0; render();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); render(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); ev.preventDefault(); }
    else if (ev.key === 'Enter' && shown[active]) choose(shown[active]);
    else if (ev.key === 'Escape') { input.blur(); list.hidden = true; }
  });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 120));
  window.addEventListener('keydown', (ev) => { if (ev.key === '/' && document.activeElement !== input) { input.focus(); ev.preventDefault(); } });

  // ---- panel
  const panel = $('#panel');
  const showSystem = (s) => {
    if (!s) { panel.hidden = true; return; }
    panel.hidden = false; $('#places').hidden = true; $('#btn-places').classList.remove('active');
    $('#panel-kind').textContent = [KIND_LABEL[s.kind] || s.kind, s.approx ? 'approximate position' : s.unlocated ? 'position unknown' : 'catalog position'].join(' · ');
    $('#panel-title').textContent = s.name;
    $('#panel-aka').textContent = s.aka?.length ? 'also: ' + s.aka.join(', ') : '';
    const facts = [];
    if (s.dist != null) facts.push(`<span>from Sol <b>${fmtLy(s.dist)}</b></span>`);
    if (s.spectral) facts.push(`<span>spectral <b>${s.spectral}</b></span>`);
    if (s.mag != null) facts.push(`<span>mag <b>${s.mag.toFixed(2)}</b></span>`);
    if (s.books?.length) facts.push(`<span>books <b>${s.books.join(', ')}</b></span>`);
    $('#panel-facts').innerHTML = facts.join('');
    $('#panel-summary').textContent = s.summary || '';
    $('#panel-planets').innerHTML = (s.planets || []).map(p => `<span>${p}</span>`).join('');
    const evs = events.filter(e => e.sys === s.id && (e.book == null || e.book <= state.book));
    const hidden = events.filter(e => e.sys === s.id).length - evs.length;
    $('#panel-count').textContent = evs.length ? `(${evs.length}${hidden ? `, ${hidden} hidden by spoiler filter` : ''})` : '';
    const ol = $('#panel-events'); ol.innerHTML = '';
    if (!evs.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = hidden ? 'All events here are beyond your spoiler setting.' : 'No chapter is set here, but the place is referenced in the books.'; ol.appendChild(li); }
    for (const e of evs) {
      const li = document.createElement('li'); li.className = 'b' + e.book;
      const when = `${e.y ?? '?'} ${e.m || ''} · Book ${e.part} ch ${e.ch}`;
      li.innerHTML = `<span class="when">${when}${e.loc && e.loc !== s.name ? ' · ' + e.loc : ''}</span>${e.bob ? `<span class="who">${e.bob}</span>: ` : ''}${e.text}`;
      ol.appendChild(li);
    }
  };
  // generic panel for things that are not Bobiverse places (galaxies, globular clusters, stars)
  const showInfo = ({ kind, name, aka, facts = [], summary = '' }) => {
    panel.hidden = false; $('#places').hidden = true; $('#btn-places').classList.remove('active');
    $('#panel-kind').textContent = kind;
    $('#panel-title').textContent = name;
    $('#panel-aka').textContent = aka || '';
    $('#panel-facts').innerHTML = facts.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
    $('#panel-summary').textContent = summary;
    $('#panel-planets').innerHTML = '';
    $('#panel-count').textContent = '';
    const ol = $('#panel-events'); ol.innerHTML = '';
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Real astronomical object, not a Bobiverse location.'; ol.appendChild(li);
  };
  $('#panel-close').addEventListener('click', () => { panel.hidden = true; onSelect(null); });

  // ---- layers (+ master "all" toggle)
  const layerBoxes = [...document.querySelectorAll('#layers input[data-layer]')];
  const allBox = $('#layers-all');
  const syncAll = () => { const on = layerBoxes.filter(b => b.checked).length; allBox.checked = on === layerBoxes.length; allBox.indeterminate = on > 0 && on < layerBoxes.length; };
  layerBoxes.forEach(cb => cb.addEventListener('change', () => { onLayer(cb.dataset.layer, cb.checked); syncAll(); }));
  allBox.addEventListener('change', () => { for (const cb of layerBoxes) { cb.checked = allBox.checked; onLayer(cb.dataset.layer, cb.checked); } syncAll(); });
  syncAll();
  // ---- places panel
  const placesPanel = $('#places'), placesBtn = $('#btn-places');
  const togglePlaces = (on) => { placesPanel.hidden = !on; placesBtn.classList.toggle('active', on); if (on) panel.hidden = true; };
  placesBtn.addEventListener('click', () => togglePlaces(placesPanel.hidden));
  $('#places-close').addEventListener('click', () => togglePlaces(false));
  const byId = Object.fromEntries(systems.map(s => [s.id, s]));
  const plist = $("#places-list");
  for (const group of places) {
    const h = document.createElement("h3"); h.textContent = group.title; plist.appendChild(h);
    for (const [id, blurb] of group.items) {
      const s = byId[id]; if (!s) continue;
      const b = document.createElement('button');
      b.innerHTML = `<span class="d">${s.dist != null ? fmtLy(s.dist) : ''}</span><b>${s.name}</b><small>${blurb}</small>`;
      b.addEventListener('click', () => { if (s.p) onFlyTo(s.p, s.tier === 'galaxy' ? (s.kind === 'galaxy' ? 25000 : 1200) : 12, s); onSelect(s); });
      plist.appendChild(b);
    }
  }
  // ---- spoiler slider
  const range = $('#book-range'), bl = $('#book-label');
  const applyBook = () => { state.book = +range.value; bl.textContent = `Through book ${state.book}: ${BOOKS[state.book]}`; onBook(state.book); try { localStorage.setItem('bobiverse.book', String(state.book)); } catch (_) {} };
  range.addEventListener('input', applyBook);
  // first visit: ask how far the reader got before showing anything spoilery
  const gate = $('#spoiler-gate');
  let saved = null; try { saved = localStorage.getItem('bobiverse.book'); } catch (_) {}
  if (saved && BOOKS[+saved]) { range.value = saved; applyBook(); }
  else { range.value = 1; applyBook(); gate.hidden = false; }
  gate.querySelectorAll('button[data-book]').forEach(b => b.addEventListener('click', () => { range.value = b.dataset.book; applyBook(); gate.hidden = true; }));
  $('#btn-spoilers').addEventListener('click', () => { gate.hidden = false; });
  gate.addEventListener('click', (e) => { if (e.target.id === 'spoiler-gate' && saved) gate.hidden = true; });
  // ---- Bob paths year scrubber
  const yr = $('#year-range'), yl = $('#year-label'), play = $('#year-play');
  let timer = null;
  const applyYear = () => { const y = +yr.value; yl.textContent = `Year ${Math.floor(y)} · drag or press play`; onYear(y); };
  yr.addEventListener('input', () => { stop(); applyYear(); });
  const stop = () => { if (timer) { clearInterval(timer); timer = null; play.textContent = '▶'; } };
  play.addEventListener('click', () => {
    if (timer) return stop();
    if (+yr.value >= +yr.max) yr.value = yr.min;
    play.textContent = '❚❚';
    timer = setInterval(() => { yr.value = Math.min(+yr.max, +yr.value + 0.25); applyYear(); if (+yr.value >= +yr.max) stop(); }, 50);
  });
  applyYear();
  const chips = $('#year-bobs');
  for (const b of bobs) {
    const el = document.createElement('span'); el.textContent = b; el.style.color = '#' + bobColor(b).getHexString();
    el.addEventListener('click', () => { el.classList.toggle('off'); onBobToggle(b, !el.classList.contains('off')); });
    chips.appendChild(el);
  }
  // ---- views / about
  document.querySelectorAll('.views button[data-view]').forEach(b => b.addEventListener('click', () => { onView(b.dataset.view); document.querySelectorAll('.views button').forEach(x => x.classList.toggle('active', x === b)); }));
  $('#btn-about').addEventListener('click', () => { $('#about').hidden = false; });
  $('#about-close').addEventListener('click', () => { $('#about').hidden = true; });
  $('#about').addEventListener('click', (e) => { if (e.target.id === 'about') $('#about').hidden = true; });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#about').hidden = true; } });

  const hud = $('#hud-dist');
  return {
    state, showSystem, showInfo,
    setHud(text) { hud.textContent = text; },
    setView(v) { document.querySelectorAll('.views button').forEach(x => x.classList.toggle('active', x.dataset.view === v)); },
    loadingDone() { $('#loading').classList.add('done'); },
    loadingText(t) { $('#loading-text').textContent = t; },
  };
}
