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

export function isUltraAggressiveEnemy(id: number, kind: EnemyKind): boolean {
  return kind !== "boss" && (id + 1) % ULTRA_AGGRESSIVE_INTERVAL === 0;
}

export function getEnemyBehaviorProfile(
  kind: EnemyKind,
  ultraAggressive: boolean,
): EnemyBehaviorProfile {
  const speed = kind === "scout"
    ? 78
    : kind === "guard" || kind === "minelayer" || kind === "support"
      ? 48
      : kind === "heavy" || kind === "boss" ? 34 : 0;
  const preferredRange = kind === "scout"
    ? 165
    : kind === "boss" ? 245
      : kind === "minelayer" ? 120
        : kind === "support" ? 330 : 270;
  const turnSpeed = kind === "sniper" || kind === "artillery"
    ? 1.7
    : kind === "boss" ? 2.6 : 3.3;

  if (!ultraAggressive) {
    return { speed, preferredRange, turnSpeed, aimTolerance: 0.075 };
  }

  return {
    speed: Math.max(72, speed * 1.35),
    preferredRange: 105,
    turnSpeed: Math.max(5.2, turnSpeed * 1.4),
    aimTolerance: 0.12,
  };
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
  const baseRate = kind === "artillery"
    ? 3.4
    : kind === "scout" ? 1.45
      : kind === "guard" || kind === "support" ? 1.15
        : kind === "sniper" ? 2.3
          : kind === "heavy" ? 2.05
            : kind === "minelayer" ? 1.75 : 0.72;
  const jitter = kind === "artillery" ? 0 : (id % 3) * 0.11;
  return (baseRate + jitter) * (ultraAggressive ? ULTRA_AGGRESSIVE_RELOAD_MULTIPLIER : 1);
}
