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

Movement keys choose a world direction. The hull turns gradually and slows through
tight turns; directions behind the hull engage reverse at 80% speed. Release the
keys to stop immediately. Mouse aim stays independent, and the Raptor's dash follows
the hull forward or backward.

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm test
npm run build
npm run render:tanks
```

The permanent visual gallery is available at `/debug/gallery.html` while the
development server is running.
