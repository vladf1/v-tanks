import {
  STANDARD_TANK_RADIUS,
  TANK_WALL_PADDING,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type EnemyKind,
  type Mission,
  type Point,
} from "./levels.ts";

export interface OccupiedTank extends Point {
  radius: number;
}

const ENTRY_INSET = 24;
const PLAYER_CLEARANCE = 360;
const TANK_CLEARANCE = 24;
const RANDOM_ATTEMPTS = 48;

function distanceSquared(a: Point, b: Point): number {
  const deltaX = a.x - b.x;
  const deltaY = a.y - b.y;
  return (deltaX * deltaX) + (deltaY * deltaY);
}

function pointInExpandedWall(
  point: Point,
  wall: Mission["walls"][number],
  expansion: number,
): boolean {
  return point.x >= wall.x - expansion
    && point.x <= wall.x + wall.width + expansion
    && point.y >= wall.y - expansion
    && point.y <= wall.y + wall.height + expansion;
}

function randomEdgePoint(random: () => number): Point {
  const horizontalSpan = WORLD_WIDTH - (ENTRY_INSET * 2);
  const verticalSpan = WORLD_HEIGHT - (ENTRY_INSET * 2);
  switch (Math.floor(random() * 4)) {
    case 0:
      return { x: ENTRY_INSET, y: ENTRY_INSET + (random() * verticalSpan) };
    case 1:
      return { x: WORLD_WIDTH - ENTRY_INSET, y: ENTRY_INSET + (random() * verticalSpan) };
    case 2:
      return { x: ENTRY_INSET + (random() * horizontalSpan), y: ENTRY_INSET };
    default:
      return { x: ENTRY_INSET + (random() * horizontalSpan), y: WORLD_HEIGHT - ENTRY_INSET };
  }
}

function isSafeEntry(
  point: Point,
  mission: Mission,
  player: Point,
  occupied: OccupiedTank[],
): boolean {
  if (distanceSquared(point, player) < PLAYER_CLEARANCE * PLAYER_CLEARANCE) return false;
  if (mission.walls.some((wall) => (
    pointInExpandedWall(point, wall, STANDARD_TANK_RADIUS + TANK_WALL_PADDING)
  ))) return false;
  return occupied.every((tank) => {
    const clearance = STANDARD_TANK_RADIUS + tank.radius + TANK_CLEARANCE;
    return distanceSquared(point, tank) >= clearance * clearance;
  });
}

export function getReinforcementDelay(
  mission: Mission,
  random: () => number = Math.random,
): number {
  const { intervalMin, intervalMax } = mission.reinforcements;
  return intervalMin + (random() * (intervalMax - intervalMin));
}

export function pickReinforcementKind(
  mission: Mission,
  random: () => number = Math.random,
): Exclude<EnemyKind, "boss"> {
  const candidates = mission.enemies
    .map(({ kind }) => kind)
    .filter((kind): kind is Exclude<EnemyKind, "boss"> => kind !== "boss");
  return candidates[Math.floor(random() * candidates.length)] ?? "scout";
}

export function findReinforcementEntry(
  mission: Mission,
  player: Point,
  occupied: OccupiedTank[],
  random: () => number = Math.random,
): Point | null {
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
    const point = randomEdgePoint(random);
    if (isSafeEntry(point, mission, player, occupied)) return point;
  }

  const fallbackEntries: Point[] = [];
  for (let x = 120; x < WORLD_WIDTH; x += 160) {
    fallbackEntries.push({ x, y: ENTRY_INSET }, { x, y: WORLD_HEIGHT - ENTRY_INSET });
  }
  for (let y = 120; y < WORLD_HEIGHT; y += 160) {
    fallbackEntries.push({ x: ENTRY_INSET, y }, { x: WORLD_WIDTH - ENTRY_INSET, y });
  }
  return fallbackEntries.find((point) => isSafeEntry(point, mission, player, occupied)) ?? null;
}
