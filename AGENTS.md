# V/Tanks repository guidance

## Verification

- Run `bun run test` after gameplay, rendering, level, or UI changes.
- For visual Canvas changes, inspect the live game as well as the relevant focused renderer output.

## Toolchain

- Use the Bun version pinned by `packageManager` in `package.json`.
- Run `bun install` locally and `bun ci` for frozen-lockfile verification; do not add an npm `package-lock.json`.
- Keep the `copyfile` backend in `bunfig.toml`. Bun's default macOS `clonefile` backend can create incomplete package directories when this repository is stored on iCloud Drive.

## Visual rendering previews

- Open `/debug/index.html` on the local Vite server for links to every persistent visual debug page and capture variant.
- Open `/debug/gallery.html` on the local Vite server for the permanent visual debug gallery. It includes every tank variant, power-up, fortification, projectile, particle, the crosshair, and boss armor.
- Run `bun run render:tanks` to regenerate close-up PNGs for every tank variant.
- Outputs are written to `artifacts/tanks/` and are intentionally gitignored.
- The command requires local Chrome or Chromium. Set `CHROME_PATH` when it is not installed in a standard location.
- The renderer binds to fixed port `41731` and fails immediately when it is unavailable. Free that port instead of enabling automatic port scanning.
- `tools/tank-renderer.html` must use `GameRenderer.renderTankPreview`; do not duplicate or approximate tank geometry in the preview harness.
- `debug/gallery.html` must call the public `GameRenderer` preview methods so its shapes stay identical to the production game renderer.
- After modifying hulls, turrets, tracks, colors, or tank scale, regenerate all tank previews and visually inspect at least the player, one standard enemy, and the boss.
- Keep preview angles fixed at zero unless a task explicitly requires angle coverage. Fixed angles make visual regressions easy to compare.

## Local development

- Run `bun run dev` for the interactive game.
- If the default Vite port is occupied, use the URL Vite reports instead of starting additional redundant servers.
