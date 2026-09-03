import type { EnemyKind } from "./levels.ts";

export const ULTRA_AGGRESSIVE_ENEMY_PERCENT = 10;

const ULTRA_AGGRESSIVE_INTERVAL = Math.round(100 / ULTRA_AGGRESSIVE_ENEMY_PERCENT);
const ULTRA_AGGRESSIVE_RELOAD_MULTIPLIER = 0.48;

export interface EnemyBehaviorProfile {
  speed: number;
  preferredRange: number;
  turnSpeed: number;
  aimTolerance: number;
}

export interface EnemyMovementContext {
  ultraAggressive: boolean;
  visible: boolean;
  distance: number;
  targetAngle: number;
  patrolAngle: number;
  strafeDirection: number;
  preferredRange: number;
}

const STANDARD_PROFILES: Record<EnemyKind, EnemyBehaviorProfile> = {
  scout: { speed: 78, preferredRange: 165, turnSpeed: 3.3, aimTolerance: 0.075 },
  guard: { speed: 48, preferredRange: 270, turnSpeed: 3.3, aimTolerance: 0.075 },
  sniper: { speed: 0, preferredRange: 270, turnSpeed: 1.7, aimTolerance: 0.075 },
  heavy: { speed: 34, preferredRange: 270, turnSpeed: 3.3, aimTolerance: 0.075 },
  boss: { speed: 34, preferredRange: 245, turnSpeed: 2.6, aimTolerance: 0.075 },
  minelayer: { speed: 48, preferredRange: 120, turnSpeed: 3.3, aimTolerance: 0.075 },
  support: { speed: 48, preferredRange: 330, turnSpeed: 3.3, aimTolerance: 0.075 },
  artillery: { speed: 0, preferredRange: 270, turnSpeed: 1.7, aimTolerance: 0.075 },
};

const ULTRA_PROFILES: Record<EnemyKind, EnemyBehaviorProfile> = Object.fromEntries(
  Object.entries(STANDARD_PROFILES).map(([kind, profile]) => [kind, {
    speed: Math.max(72, profile.speed * 1.35),
    preferredRange: 105,
    turnSpeed: Math.max(5.2, profile.turnSpeed * 1.4),
    aimTolerance: 0.12,
  }]),
) as Record<EnemyKind, EnemyBehaviorProfile>;

const RELOAD_SECONDS: Record<EnemyKind, number> = {
  artillery: 3.4,
  scout: 1.45,
  guard: 1.15,
  support: 1.15,
  sniper: 2.3,
  heavy: 2.05,
  minelayer: 1.75,
  boss: 0.72,
};

export function isUltraAggressiveEnemy(id: number, kind: EnemyKind): boolean {
  return kind !== "boss" && (id + 1) % ULTRA_AGGRESSIVE_INTERVAL === 0;
}

export function getEnemyBehaviorProfile(
  kind: EnemyKind,
  ultraAggressive: boolean,
): EnemyBehaviorProfile {
  return (ultraAggressive ? ULTRA_PROFILES : STANDARD_PROFILES)[kind];
}

export function getEnemyMoveAngle({
  ultraAggressive,
  visible,
  distance,
  targetAngle,
  patrolAngle,
  strafeDirection,
  preferredRange,
}: EnemyMovementContext): number {
  if (ultraAggressive) {
    const searchOffset = visible ? 0 : strafeDirection * 0.46;
    if (distance > preferredRange + 20) return targetAngle + searchOffset;
    if (distance < preferredRange - 25) return targetAngle + Math.PI;
    return targetAngle + (strafeDirection * Math.PI / 2);
  }

  if (visible) {
    if (distance > preferredRange + 35) return targetAngle;
    if (distance < preferredRange - 30) return targetAngle + Math.PI;
    return targetAngle + (strafeDirection * Math.PI / 2);
  }

  return patrolAngle;
}

export function getEnemyReloadSeconds(
  kind: EnemyKind,
  id: number,
  ultraAggressive: boolean,
): number {
  const jitter = kind === "artillery" ? 0 : (id % 3) * 0.11;
  return (RELOAD_SECONDS[kind] + jitter)
    * (ultraAggressive ? ULTRA_AGGRESSIVE_RELOAD_MULTIPLIER : 1);
}
