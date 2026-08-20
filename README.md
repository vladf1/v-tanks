# V/Tanks

A desktop-only, single-player tactical tank game rendered with the Canvas 2D API.

The campaign has ten handcrafted operations with elimination, relay-destruction,
uplink-defense, survival, and multi-stage boss objectives. It includes eight
enemy archetypes, five interactive battlefield hazards, three-part cannon,
chassis, and utility loadouts, power-ups, ricochet projectiles, persistent
mission medals, daily seeded survival, synthesized sound, and high-DPI rendering.

## Controls

- `WASD` or arrow keys — move
- Mouse — aim the turret
- Left mouse or Space — fire
- Shift or right mouse — dash
- `E` — deploy a mine when the Sapper utility is equipped
- Escape — pause
- `R` — restart the current mission

## Development

Install [Bun](https://bun.com/docs/installation) 1.3.14 or newer, then install
the locked dependencies and start Vite:

```bash
bun install
bun run dev
```

Quality checks:

```bash
bun run test
bun run build
bun run render:tanks
```

The committed `bunfig.toml` uses Bun's `copyfile` install backend so dependency
installation remains reliable when the repository is stored on iCloud Drive.
GitHub Pages builds use the same pinned Bun version and `bun.lock` via `bun ci`.

The permanent visual gallery is available at `/debug/gallery.html` while the
development server is running.
