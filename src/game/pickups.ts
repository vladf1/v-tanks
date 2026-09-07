import { TANK_WALL_PADDING, WORLD_HEIGHT, WORLD_WIDTH, type Mission, type Point } from "./levels.ts";
import { distanceSquared, pointInExpandedWall } from "./geometry.ts";

export function placePickups<K extends string>(
  mission: Mission,
  kinds: readonly K[],
  { radius, edge, spawnClearance, pickupClearance, wallGap }: {
    radius: number; edge: number; spawnClearance: number; pickupClearance: number; wallGap: number;
  },
  random: () => number,
  occupied: readonly Point[] = [],
): Array<Point & { id: number; kind: K; radius: number; active: boolean }> {
  const placed: Array<Point & { id: number; kind: K; radius: number; active: boolean }> = [];
  const spawns = [mission.player, ...mission.enemies];
  const safe = (point: Point): boolean => (
    !mission.walls.some((wall) => pointInExpandedWall(point, wall, radius + TANK_WALL_PADDING + wallGap))
    && spawns.every((spawn) => distanceSquared(point, spawn) >= spawnClearance ** 2)
    && occupied.every((pickup) => distanceSquared(point, pickup) >= pickupClearance ** 2)
    && placed.every((pickup) => distanceSquared(point, pickup) >= pickupClearance ** 2)
  );
  for (const [id, kind] of kinds.entries()) {
    let point: Point | undefined;
    for (let attempt = 0; attempt < 140 && !point; attempt += 1) {
      const candidate = {
        x: edge + random() * (WORLD_WIDTH - edge * 2),
        y: edge + random() * (WORLD_HEIGHT - edge * 2),
      };
      if (safe(candidate)) point = candidate;
    }
    for (let y = edge; y <= WORLD_HEIGHT - edge && !point; y += 42) {
      for (let x = edge; x <= WORLD_WIDTH - edge && !point; x += 42) {
        if (safe({ x, y })) point = { x, y };
      }
    }
    if (!point) throw new Error(`Mission ${mission.number} has no safe position for ${kind}.`);
    placed.push({ id, kind, ...point, radius, active: true });
  }
  return placed;
}
