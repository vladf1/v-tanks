# V/Tanks

A desktop-only, single-player tactical tank game rendered with the Canvas 2D API.

The campaign has six handcrafted arenas, four enemy archetypes, a boss fight,
ricochet projectiles, dash movement, synthesized sound effects, local campaign
progress, and high-DPI rendering.

## Controls

- `WASD` or arrow keys — move
- Mouse — aim the turret
- Left mouse or Space — fire
- Shift or right mouse — dash
- Escape — pause
- `R` — restart the current mission

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm test
./node_modules/.bin/tsc --noEmit
```
