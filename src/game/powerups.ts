import type { Mission, Point } from "./levels.ts";
import { placePickups } from "./pickups.ts";

export const POWER_UP_KINDS = [
  "speed",
  "gun",
  "shield",
  "ricochet",
  "repair",
] as const;

export type PowerUpKind = typeof POWER_UP_KINDS[number];
export const TIMED_POWER_UP_KINDS = ["speed", "gun", "shield", "ricochet"] as const;

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
  for (const kind of TIMED_POWER_UP_KINDS) {
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

export function getActivePowerUpSnapshots(active: ActivePowerUps): ActivePowerUpSnapshot[] {
  return TIMED_POWER_UP_KINDS.flatMap((kind) => (
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

export function placeMissionPowerUps(mission: Mission, random = Math.random): PowerUp[] {
  return placePickups(mission, POWER_UP_KINDS, {
    radius: POWER_UP_RADIUS, edge: 54, spawnClearance: 82, pickupClearance: 68, wallGap: 8,
  }, random);
}
