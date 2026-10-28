# Bobiverse Galaxy Map

An interactive 3D map of the Milky Way with the places of Dennis E. Taylor's
*Bobiverse* novels (books 1–6, through *The Infinite Extent*) marked on it.

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

Rebuild the runtime data (after editing anything in `data/`). The HYG catalog is not
committed; fetch it once:

```sh
curl -L -o data/hygdata_v41.csv https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv
python3 tools/build_data.py
```

Live: https://bobiverse2026.vercel.app

## Controls worth knowing

- On first visit a **spoiler gate** asks which book you finished; the choice is kept in
  localStorage and can be changed with the Spoilers button or slider.

- **Lock to Sol** keeps the orbit centred on the Sun (zoom 4–900 ly), drops a stem from
  every human-space system to the galactic plane with its height in ly, and stops clicks
  from flying the camera away.
- **Bob paths** layer: each narrator's chapter locations joined in order, with a year
  scrubber (2133–2349) and play button. Solid arcs are ship travel (capped at ~0.9c),
  dashed arcs are wormhole-era moves. Click a Bob's name to hide or show them.
- **PGF wormhole network**: hub rings roughly every 12,000 ly from the core (12k, 24k, 37k, 49k,
  per book 6 ch. 2); the two rings Ick and Dae travelled are drawn brighter.
- **Places** button: a curated list of the story's key destinations, click to fly there.
- The **all** checkbox in the Layers panel hides or shows every layer at once.
- **All HYG stars** toggle loads the remaining 85k catalog stars (1.7 MB) on demand.
- Neighbouring galaxies, globular clusters and named stars are clickable too and open a
  short real-astronomy panel (what it is, distance, galactic coordinates).

## What is where

| Path | Purpose |
|------|---------|
| `data/systems.json` | Hand-curated Bobiverse places: Hipparcos ids for real stars, estimated positions for book-only places, summaries, tags |
| `data/locations.json` | Maps the wiki Timeline's "Location" strings to system ids |
| `data/timeline.json` | The Bobiverse Wiki timeline table (427 chapter rows, all six books) |
| `data/hygdata_v41.csv` | HYG v4.1 star catalog (source for real star positions) |
| `data/globulars_harris.json` | Harris (2010) Milky Way globular cluster catalog |
| `tools/build_data.py` | Converts all of the above into `public/data/*` in scene coordinates |
| `src/galaxy.js` | Milky Way particle model sampled from the ESO/NASA artist's impression |
| `src/skysphere.js` | ESO all-sky panorama, shown when the camera is inside the disc |
| `src/skybox.js` | Procedural cubemap of distant galaxies |
| `src/markers.js` | System markers, WormNet, PGF network, Nemesis, clusters, galaxies |
| `src/main.js` | Scene, camera flights, label decluttering |

Scene units are light-years. The galactic centre is at the origin, the Sun at
`z = +26000`, `+y` is galactic north.

## Real vs reconstructed

Real: star positions (HYG), galaxy arm structure (ESO/NASA/JPL-Caltech/R. Hurt
image), globular clusters (Harris), neighbouring galaxies, the all-sky panorama
(ESO/S. Brunier, CC BY 4.0).

Reconstructed from book descriptions (dashed rings in the UI): the PGF hub ring
and leaf chains, Nemesis (placed from the distances quoted in *Not Till We Are
Lost* ch. 70), the sentry station, the Edge of the Galaxy and Outer Reaches
wormhole sites, Perseus Transit, George's vantage point. Places with no location
in the books (Jabberwocky, Skippyland, Ghinah, BSC-142-C, Cashmere, Las Cañadas,
Great River) are searchable but not plotted.

## Sources

- [Bobiverse Wiki](https://bobiverse.fandom.com/wiki/Bobiverse_Wiki) timeline and system pages
- [thunfischtoast/bobiverse-map](https://github.com/thunfischtoast/bobiverse-map) (initial star list)
- [HYG Database v4.1](https://github.com/astronexus/HYG-Database)
- [Harris catalog of Milky Way globular clusters](https://physics.mcmaster.ca/~harris/mwgc.dat)
- Milky Way artist's impression: NASA/JPL-Caltech/ESO/R. Hurt (public domain)
- Milky Way panorama: ESO/S. Brunier (CC BY 4.0)
