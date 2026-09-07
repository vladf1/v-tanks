import type { Point, Wall } from "./levels.ts";

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function pointInExpandedWall(point: Point, wall: Wall, padding: number): boolean {
  return point.x >= wall.x - padding && point.x <= wall.x + wall.width + padding
    && point.y >= wall.y - padding && point.y <= wall.y + wall.height + padding;
}
