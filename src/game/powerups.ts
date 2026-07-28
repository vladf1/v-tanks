import {
  TANK_WALL_PADDING,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Mission,
  type Point,
} from "./levels.ts";

export const POWER_UP_KINDS = [
  "speed",
  "gun",
  "shield",
  "ricochet",
  "repair",
] as const;

export type PowerUpKind = typeof POWER_UP_KINDS[number];
export type TimedPowerUpKind = Exclude<PowerUpKind, "repair">;

export interface PowerUp extends Point {
  id: number;
  kind: PowerUpKind;
  radius: number;
  active: boolean;
}

export interface PowerUpDefinition {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  duration: number;
}

export const POWER_UP_DEFINITIONS: Record<PowerUpKind, PowerUpDefinition> = {
  speed: {
    label: "Speed Up",
    shortLabel: "Speed",
    description: "Drive speed increased by 50%.",
    color: "#66d9ff",
    duration: 12,
  },
  gun: {
    label: "Gun Upgrade",
    shortLabel: "Rapid Gun",
    description: "Reload time reduced by 50%.",
    color: "#ffb45f",
    duration: 12,
  },
  shield: {
    label: "Shield Upgrade",
    shortLabel: "Shield",
    description: "Energy shield absorbs three damage.",
    color: "#a58cff",
    duration: 15,
  },
  ricochet: {
    label: "Ricochet Core",
    shortLabel: "Ricochet",
    description: "Shells deal double damage and gain two extra bounces.",
    color: "#f06dff",
    duration: 12,
  },
  repair: {
    label: "Health Restore",
    shortLabel: "Repair",
    description: "Immediately removes all hull damage.",
    color: "#74f29c",
    duration: 0,
  },
};

export interface ActivePowerUps {
  speed: number;
  gun: number;
  shield: number;
  ricochet: number;
  shieldPoints: number;
}

export interface ActivePowerUpSnapshot {
  kind: TimedPowerUpKind;
  remaining: number;
  duration: number;
  shieldPoints: number | null;
}

export const POWER_UP_RADIUS = 15;
export const SHIELD_POINTS = 3;
const EDGE_PADDING = 54;
const SPAWN_CLEARANCE = 82;
const PICKUP_CLEARANCE = 68;

export function createActivePowerUps(): ActivePowerUps {
  return {
    speed: 0,
    gun: 0,
    shield: 0,
    ricochet: 0,
    shieldPoints: 0,
  };
}

export function tickActivePowerUps(active: ActivePowerUps, delta: number): void {
  for (const kind of ["speed", "gun", "shield", "ricochet"] as const) {
    active[kind] = Math.max(0, active[kind] - delta);
  }
  if (active.shield <= 0) active.shieldPoints = 0;
}

export function activateTimedPowerUp(
  active: ActivePowerUps,
  kind: TimedPowerUpKind,
): void {
  active[kind] = POWER_UP_DEFINITIONS[kind].duration;
  if (kind === "shield") active.shieldPoints = SHIELD_POINTS;
}

export function absorbShieldDamage(active: ActivePowerUps, damage: number): number {
  if (active.shield <= 0 || active.shieldPoints <= 0) return damage;
  const absorbed = Math.min(active.shieldPoints, damage);
  active.shieldPoints -= absorbed;
  if (active.shieldPoints <= 0) active.shield = 0;
  return damage - absorbed;
}

export function getPlayerSpeedMultiplier(active: ActivePowerUps): number {
  return active.speed > 0 ? 1.5 : 1;
}

export function getPlayerReloadTime(active: ActivePowerUps): number {
  return active.gun > 0 ? 0.15 : 0.3;
}

export function getPlayerShellStats(active: ActivePowerUps): {
  bounces: number;
  damage: number;
} {
  return active.ricochet > 0
    ? { bounces: 3, damage: 2 }
    : { bounces: 1, damage: 1 };
}

export function getActivePowerUpSnapshots(active: ActivePowerUps): ActivePowerUpSnapshot[] {
  return (["speed", "gun", "shield", "ricochet"] as const).flatMap((kind) => (
    active[kind] > 0
      ? [{
          kind,
          remaining: active[kind],
          duration: POWER_UP_DEFINITIONS[kind].duration,
          shieldPoints: kind === "shield" ? active.shieldPoints : null,
        }]
      : []
  ));
}

function distanceSquared(first: Point, second: Point): number {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return (deltaX * deltaX) + (deltaY * deltaY);
}

function isSafePowerUpPosition(
  point: Point,
  mission: Mission,
  placed: PowerUp[],
): boolean {
  const wallPadding = POWER_UP_RADIUS + TANK_WALL_PADDING + 8;
  if (mission.walls.some((wall) => (
    point.x >= wall.x - wallPadding
      && point.x <= wall.x + wall.width + wallPadding
      && point.y >= wall.y - wallPadding
      && point.y <= wall.y + wall.height + wallPadding
  ))) return false;

  const tankSpawns = [mission.player, ...mission.enemies];
  if (tankSpawns.some((spawn) => (
    distanceSquared(point, spawn) < SPAWN_CLEARANCE * SPAWN_CLEARANCE
  ))) return false;

  return placed.every((powerUp) => (
    distanceSquared(point, powerUp) >= PICKUP_CLEARANCE * PICKUP_CLEARANCE
  ));
}

export function placeMissionPowerUps(
  mission: Mission,
  random: () => number = Math.random,
): PowerUp[] {
  const placed: PowerUp[] = [];

  for (const [id, kind] of POWER_UP_KINDS.entries()) {
    let position: Point | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const candidate = {
        x: EDGE_PADDING + random() * (WORLD_WIDTH - EDGE_PADDING * 2),
        y: EDGE_PADDING + random() * (WORLD_HEIGHT - EDGE_PADDING * 2),
      };
      if (isSafePowerUpPosition(candidate, mission, placed)) {
        position = candidate;
        break;
      }
    }

    if (!position) {
      for (let y = EDGE_PADDING; y <= WORLD_HEIGHT - EDGE_PADDING && !position; y += 42) {
        for (let x = EDGE_PADDING; x <= WORLD_WIDTH - EDGE_PADDING; x += 42) {
          const candidate = { x, y };
          if (isSafePowerUpPosition(candidate, mission, placed)) {
            position = candidate;
            break;
          }
        }
      }
    }

    if (!position) {
      throw new Error(`Mission ${mission.number} has no safe position for ${kind} power-up.`);
    }

    placed.push({
      id,
      kind,
      ...position,
      radius: POWER_UP_RADIUS,
      active: true,
    });
  }

  return placed;
}
