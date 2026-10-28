#!/usr/bin/env python3
"""Build the runtime data files in public/data from the sources in data/.

Scene coordinate system (light-years):
  origin  = galactic centre
  +z      = direction from the galactic centre to the Sun (Sun at z = +R_SUN)
  +y      = galactic north
  +x      = galactic longitude 270 deg side (so l = 90 deg points to -x)
This matches the orientation of the ESO/NASA Milky Way artist's impression
when viewed from galactic north with the Sun at the bottom of the picture.
"""
import csv, json, math, os, struct, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'public', 'data')
os.makedirs(OUT, exist_ok=True)

PC = 3.26156           # light-years per parsec
R_SUN = 26000.0        # ly, Sun to galactic centre (matches the ESO image scale)

# J2000 equatorial -> galactic rotation (Hipparcos convention)
EQ2GAL = (
    (-0.0548755604, -0.8734370902, -0.4838350155),
    ( 0.4941094279, -0.4448296300,  0.7469822445),
    (-0.8676661490, -0.1980763734,  0.4559837762),
)

def eq_to_gal(x, y, z):
    gx = EQ2GAL[0][0]*x + EQ2GAL[0][1]*y + EQ2GAL[0][2]*z
    gy = EQ2GAL[1][0]*x + EQ2GAL[1][1]*y + EQ2GAL[1][2]*z
    gz = EQ2GAL[2][0]*x + EQ2GAL[2][1]*y + EQ2GAL[2][2]*z
    return gx, gy, gz

def gal_to_scene(gx, gy, gz):
    """heliocentric galactic cartesian (ly) -> scene"""
    return (-gy, gz, -gx + R_SUN)

def lbd_to_scene(l_deg, b_deg, d_ly):
    l = math.radians(l_deg); b = math.radians(b_deg)
    gx = d_ly*math.cos(b)*math.cos(l); gy = d_ly*math.cos(b)*math.sin(l); gz = d_ly*math.sin(b)
    return gal_to_scene(gx, gy, gz)

def radec_to_scene(ra_h, dec_deg, d_ly):
    ra = ra_h*math.pi/12; dec = math.radians(dec_deg)
    x = d_ly*math.cos(dec)*math.cos(ra); y = d_ly*math.cos(dec)*math.sin(ra); z = d_ly*math.sin(dec)
    return gal_to_scene(*eq_to_gal(x, y, z))

def dist(a, b):
    return math.sqrt(sum((a[i]-b[i])**2 for i in range(3)))

# ---------------------------------------------------------------- HYG stars
hyg_by_hip = {}
stars = []        # [x,y,z,mag,ci]
far_stars = []    # the rest of HYG, loaded on demand
named = []        # bright / named stars for labels
with open(os.path.join(DATA, 'hygdata_v41.csv'), newline='') as f:
    for row in csv.DictReader(f):
        try:
            d_pc = float(row['dist']); mag = float(row['mag'])
        except ValueError:
            continue
        if d_pc >= 99999:        # HYG placeholder for unknown distance
            continue
        d_ly = d_pc*PC
        pos = radec_to_scene(float(row['ra']), float(row['dec']), d_ly)
        ci = row['ci']
        ci = float(ci) if ci not in ('', None) else 0.6
        hip = row['hip']
        rec = dict(pos=pos, mag=mag, ci=ci, d=d_ly, proper=row['proper'], spect=row['spect'], hip=hip)
        if hip:
            hyg_by_hip[int(hip)] = rec
        if row['id'] == '0':
            hyg_by_hip[0] = rec
            continue                       # the Sun is drawn separately
        if d_ly <= 300 or mag <= 6.0:
            stars.append((pos[0], pos[1], pos[2], mag, ci))
            if row['proper'] and (d_ly <= 300 or mag <= 2.5):
                named.append(dict(n=row['proper'], p=[round(v, 2) for v in pos], m=mag, d=round(d_ly, 1)))
        else:
            far_stars.append((pos[0], pos[1], pos[2], mag, ci))

with open(os.path.join(OUT, 'stars.bin'), 'wb') as f:
    for s in stars:
        f.write(struct.pack('<5f', *s))
with open(os.path.join(OUT, 'stars_far.bin'), 'wb') as f:
    for s in far_stars:
        f.write(struct.pack('<5f', *s))
json.dump(dict(count=len(stars), farCount=len(far_stars), stride=5, fields=['x', 'y', 'z', 'mag', 'ci'], named=named),
          open(os.path.join(OUT, 'stars.json'), 'w'))
print('stars', len(stars), 'far', len(far_stars), 'named', len(named))

# ---------------------------------------------------------------- globular clusters
harris = json.load(open(os.path.join(DATA, 'globulars_harris.json')))
globs = []
for g in harris:
    pos = gal_to_scene(g['x']*1000*PC, g['y']*1000*PC, g['z']*1000*PC)
    globs.append(dict(id=g['id'], name=g['name'], p=[round(v) for v in pos], rsun=round(g['rsun']*1000*PC)))
json.dump(globs, open(os.path.join(OUT, 'globulars.json'), 'w'))
harris_pos = {g['id']: g['p'] for g in globs}
print('globulars', len(globs))

# ---------------------------------------------------------------- PGF hub layout (reconstruction)
# Rings of hubs roughly every 12,000 ly from the core (book 6 ch. 2), hubs every 7 degrees of
# galactocentric azimuth, covering a 126-degree sector ("one third of the galaxy") centred
# near the Sun's azimuth. Azimuth 0 = the Sun's radial line, positive toward +l.
rng = random.Random(42)
RINGS = [12200, 24400, 36600, 48800]
EXPLORED = {24400, 36600}      # rings Ick and Dae actually travelled (first hub ring, Hub Zero ring)
HUB_RANGE = range(-9, 9)          # 18 hubs x 7 deg = 126 deg
def hub_pos(R, i):
    theta = math.radians(3.0 + 7.0*i)
    r = R + rng.uniform(-R*0.03, R*0.03)
    return (-r*math.sin(theta), rng.uniform(-150, 150)*(R/25000), r*math.cos(theta))
hubs = {}
for R in RINGS:
    for i in HUB_RANGE:
        hubs[(R, i)] = hub_pos(R, i)
NAMED = {(24400, 0): 'Malacca (first hub, 342 wormholes)', (36600, 5): 'Hub Zero (1000 wormholes)'}

chains = []
for (R, i), h in hubs.items():
    n = 70 if (R, i) in NAMED else (40 if R in EXPLORED else 22)
    reach = 160 + R*0.012
    for _ in range(n):
        ang = rng.uniform(0, 2*math.pi); el = rng.uniform(-0.25, 0.25)
        length = rng.randint(2, 5)
        pts = [h]
        step = rng.uniform(0.8, 1.3)*reach
        for k in range(length):
            prev = pts[-1]
            a = ang + rng.uniform(-0.35, 0.35)
            pts.append((prev[0] + step*math.cos(a)*math.cos(el), prev[1] + step*math.sin(el)*0.6 + rng.uniform(-30, 30), prev[2] + step*math.sin(a)*math.cos(el)))
        chains.append([[round(v) for v in p] for p in pts])

hub_list = [dict(ring=R, i=i, p=[round(v) for v in p], name=NAMED.get((R, i), f'Hub {R//1000}k {i:+d}')) for (R, i), p in hubs.items()]
ring_links = [[[R, i], [R, i+1]] for R in RINGS for i in HUB_RANGE if i+1 in HUB_RANGE]
radial_links = [[[RINGS[k], i], [RINGS[k+1], i]] for k in range(len(RINGS)-1) for i in HUB_RANGE if i % 3 == 0]
pgf = dict(rings=RINGS, explored=sorted(EXPLORED), hubs=hub_list, ringLinks=ring_links, radialLinks=radial_links, chains=chains)

# ---------------------------------------------------------------- Bobiverse systems
src = json.load(open(os.path.join(DATA, 'systems.json')))
systems = []
by_id = {}
pending = []
for s in src['systems']:
    s = dict(s)
    pos = None
    if 'hip' in s:
        rec = hyg_by_hip[s['hip']]
        pos = rec['pos']
        s['dist'] = round(rec['d'], 2); s['mag'] = rec['mag']; s['ci'] = rec['ci']
        s.setdefault('spectral', rec['spect'])
    elif 'scene' in s:
        pos = tuple(s['scene'])
    elif 'gal' in s:
        pos = lbd_to_scene(*s['gal'])
    elif 'harris' in s:
        pos = tuple(harris_pos[s['harris']])
    elif 'hub' in s:
        pos = hubs[(s['hub']['ring'], s['hub']['index'])]
    elif 'hubOffset' in s:
        h = hubs[(s['hubOffset']['ring'], s['hubOffset']['index'])]; o = s['hubOffset']['offset']
        pos = (h[0]+o[0], h[1]+o[1], h[2]+o[2])
    elif 'trilaterate' in s:
        pending.append(s)
    if pos is not None:
        s['p'] = [round(v, 3) for v in pos]
    systems.append(s); by_id[s['id']] = s

for s in pending:   # NN 4285: least-squares trilateration by gradient descent
    anchors = [(by_id[k]['p'], d) for k, d in s['trilaterate'].items()]
    p = [sum(a[0][i] for a in anchors)/len(anchors) for i in range(3)]
    for it in range(20000):
        grad = [0.0, 0.0, 0.0]
        for a, d in anchors:
            cur = dist(p, a) or 1e-6
            for i in range(3):
                grad[i] += 2*(cur-d)*(p[i]-a[i])/cur
        for i in range(3):
            p[i] -= 0.05*grad[i]
    s['p'] = [round(v, 3) for v in p]
    s['dist'] = round(dist(p, by_id['sol']['p']), 2)
    print('trilaterated', s['id'], s['p'], 'residuals', [round(dist(p, a)-d, 2) for a, d in anchors])

for s in systems:
    if 'p' in s and 'dist' not in s:
        s['dist'] = round(dist(s['p'], by_id['sol']['p']), 1)

# Bob's WormNet: chain of wormhole pairs flown between systems (book 5-6). Order is illustrative.
wormnet = [
    ['eps-eri', 'sol'], ['eps-eri', 'omi2-eri'], ['eps-eri', 'delta-eri'], ['eps-eri', 'alpha-cen'],
    ['omi2-eri', '82-eri'], ['omi2-eri', 'eps-indi'], ['eps-eri', 'eta-cas'], ['82-eri', 'hip14101'],
    ['eps-indi', 'delta-pav'], ['delta-pav', 'gamma-pav'], ['gamma-pav', 'hip84051'], ['delta-eri', 'eta-lep'],
]
# non-PGF wormholes found in book 6 (drawn from the hub nearest to the discovery)
non_pgf = [['malacca', 'ngc6934'], ['hub-zero', 'edge'], ['malacca', 'outer-reaches'], ['hub-zero', 'alien-network'], ['sgr-a', 'creator-system']]
pgf['capitalLink'] = ['hub-zero', 'sentry', 'fed-capital']
pgf['coreLinks'] = [[[12200, i], 'fed-capital'] for i in (-6, 0, 6)]
pgf['firstLink'] = ['alien-system', 'malacca']

json.dump(dict(systems=systems, wormnet=wormnet, nonPgf=non_pgf, pgf=pgf, rSun=R_SUN),
          open(os.path.join(OUT, 'systems.json'), 'w'), ensure_ascii=False)
print('systems', len(systems))

# ---------------------------------------------------------------- events from the wiki timeline
import re
locmap = json.load(open(os.path.join(DATA, 'locations.json')))['map']
def clean(t):
    t = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", t).strip()
events = []
unmapped = {}
for e in json.load(open(os.path.join(DATA, 'timeline.json'))):
    loc = clean(e['loc'])
    sysid = locmap.get(e['loc'], locmap.get(loc, 'MISSING'))
    if sysid == 'MISSING':
        unmapped[loc] = unmapped.get(loc, 0) + 1
        sysid = None
    book = e['book'].split('-')[0]
    try:
        year = int(e['year'])
    except ValueError:
        year = None
    events.append(dict(y=year, m=e['month'], loc=loc, book=int(book) if book.isdigit() else None,
                       part=e['book'], ch=e['ch'], bob=clean(e['bob']), text=clean(e['desc']), sys=sysid))
json.dump(events, open(os.path.join(OUT, 'events.json'), 'w'), ensure_ascii=False)

# ---------------------------------------------------------------- narrator paths
# Consecutive chapter locations of the same Bob become path segments. The wiki does not say
# whether a move was physical (ship / wormhole) or remote presence (SCUT, manny, VR), so these
# are "where the narrative goes", not verified flight plans.
MONTHS = {m: k for k, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}
def decimal_year(e):
    if e['y'] is None: return None
    m = (e['m'] or '').strip().lower()
    mi = MONTHS.get(m[:3])
    if mi is None:
        try: mi = int(m.split()[0])
        except (ValueError, IndexError): mi = 6
    return e['y'] + (min(max(mi, 1), 12) - 0.5)/12
SPECIAL_BOBS = {'Original Bob': None}
per_bob = {}
for e in events:
    if e['sys'] is None or e['y'] is None or not e['bob'] or e['bob'] in SPECIAL_BOBS: continue
    if e['sys'] not in by_id or 'p' not in by_id[e['sys']]: continue
    per_bob.setdefault(e['bob'], []).append((decimal_year(e), e))
travels = []
for bob, lst in per_bob.items():
    lst.sort(key=lambda t: t[0])
    prev = None
    for t, e in lst:
        if prev and prev[1]['sys'] != e['sys']:
            # the previous chapter date is only an upper bound on departure: cap the trip at
            # ~0.9c for ship travel, or a few months once wormholes exist (2345+) / inside the PGF network
            A, B = by_id[prev[1]['sys']], by_id[e['sys']]
            length = dist(A['p'], B['p'])
            instant = t >= 2345 or (A.get('tier') == 'galaxy' and B.get('tier') == 'galaxy')
            max_dur = 0.4 if instant else max(0.3, length/0.9)
            depart = max(prev[0], t - max_dur)
            travels.append(dict(bob=bob, frm=prev[1]['sys'], to=e['sys'], depart=round(depart, 2), arrive=round(t, 2), book=e['book'], ch=e['ch'], mode='wormhole' if instant else 'ship', text=e['text'][:140]))
        prev = (t, e)
first_seen = {bob: round(lst[0][0], 2) for bob, lst in per_bob.items()}
first_sys = {bob: lst[0][1]['sys'] for bob, lst in per_bob.items()}
json.dump(dict(travels=travels, bobs={b: dict(start=first_seen[b], sys=first_sys[b]) for b in per_bob}),
          open(os.path.join(OUT, 'travels.json'), 'w'), ensure_ascii=False)
print('travels', len(travels), 'bobs', len(per_bob))
print('events', len(events), 'unmapped locations:', unmapped)

# ---------------------------------------------------------------- neighbouring galaxies (real)
galaxies = [
    dict(id='lmc', name='Large Magellanic Cloud', l=280.47, b=-32.89, d=163000, size=14000, kind='irregular',
         desc="The Milky Way's largest satellite galaxy, a barred irregular with a few billion stars, visible to the naked eye from the southern hemisphere. In the books the Pan-Galactic Federation beams its digitised citizens here to escape Nemesis, and Phineas sets out for it with the Pav expedition."),
    dict(id='smc', name='Small Magellanic Cloud', l=302.80, b=-44.30, d=200000, size=7000, kind='irregular',
         desc="The LMC's smaller companion, a dwarf irregular galaxy of a few hundred million stars, connected to the LMC and to the Milky Way by a stream of gas torn out by tides."),
    dict(id='sgr-dsph', name='Sagittarius Dwarf', l=5.6, b=-14.2, d=65000, size=10000, kind='dwarf',
         desc="A dwarf elliptical galaxy on the far side of the galactic centre, currently being pulled apart as it orbits through the Milky Way's disc. Its stars are strung around the whole sky as the Sagittarius Stream. Only discovered in 1994 because it hides behind the bulge."),
    dict(id='cma', name='Canis Major Overdensity', l=240.0, b=-8.0, d=25000, size=6000, kind='dwarf',
         desc="A dense clump of stars in the disc toward Canis Major, probably the remains of a dwarf galaxy being digested by the Milky Way, though some astronomers argue it is just a warp in our own disc. If real, it is the nearest galaxy to Earth."),
    dict(id='m31', name='Andromeda (M31)', l=121.17, b=-21.57, d=2540000, size=220000, kind='spiral',
         desc="The nearest large spiral galaxy, about twice the Milky Way's diameter and roughly a trillion stars. Approaching at 110 km/s; the two galaxies are expected to merge in about four to five billion years."),
    dict(id='m33', name='Triangulum (M33)', l=133.61, b=-31.33, d=2730000, size=60000, kind='spiral',
         desc="The third-largest galaxy of the Local Group, a loose spiral of about forty billion stars that orbits near Andromeda."),
    dict(id='draco', name='Draco Dwarf', l=86.4, b=34.7, d=260000, size=3000, kind='dwarf',
         desc="A faint dwarf spheroidal satellite of the Milky Way, one of the most dark-matter-dominated objects known."),
    dict(id='umi', name='Ursa Minor Dwarf', l=105.0, b=44.8, d=225000, size=3000, kind='dwarf',
         desc="A dwarf spheroidal galaxy of old, metal-poor stars orbiting the Milky Way high above the plane."),
    dict(id='sculptor', name='Sculptor Dwarf', l=287.5, b=-83.2, d=290000, size=4000, kind='dwarf',
         desc="The first dwarf spheroidal galaxy ever found (1938), sitting almost directly below the galactic south pole."),
    dict(id='fornax', name='Fornax Dwarf', l=237.1, b=-65.7, d=460000, size=7000, kind='dwarf',
         desc="One of the brighter dwarf spheroidal satellites, unusual for carrying its own six globular clusters."),
]
for g in galaxies:
    g['p'] = [round(v) for v in lbd_to_scene(g['l'], g['b'], g['d'])]
json.dump(galaxies, open(os.path.join(OUT, 'galaxies.json'), 'w'))
print('galaxies', len(galaxies))
