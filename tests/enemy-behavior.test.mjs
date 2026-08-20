import assert from "node:assert/strict";
import test from "node:test";
import {
  ULTRA_AGGRESSIVE_ENEMY_PERCENT,
  getEnemyBehaviorProfile,
  getEnemyMoveAngle,
  getEnemyReloadSeconds,
  isUltraAggressiveEnemy,
} from "../src/game/enemy-behavior.ts";

test("ten percent of non-boss enemies are ultra aggressive", () => {
  const enemyIds = Array.from({ length: 100 }, (_, id) => id);
  const hunters = enemyIds.filter((id) => isUltraAggressiveEnemy(id, "guard"));

  assert.equal(ULTRA_AGGRESSIVE_ENEMY_PERCENT, 10);
  assert.equal(hunters.length, 10);
  assert.equal(hunters[0], 9);
  assert.equal(isUltraAggressiveEnemy(0, "boss"), false);
});

test("ultra-aggressive enemies close distance even without line of sight", () => {
  const normalAngle = getEnemyMoveAngle({
    ultraAggressive: false,
    visible: false,
    distance: 500,
    targetAngle: 0,
    patrolAngle: 2.4,
    strafeDirection: 1,
    preferredRange: 270,
  });
  const hunterAngle = getEnemyMoveAngle({
    ultraAggressive: true,
    visible: false,
    distance: 500,
    targetAngle: 0,
    patrolAngle: 2.4,
    strafeDirection: 1,
    preferredRange: 105,
  });

  assert.equal(normalAngle, 2.4);
  assert.equal(hunterAngle, 0.46);
});

test("ultra-aggressive enemies move quickly and reload more than twice as fast", () => {
  const normalGuard = getEnemyBehaviorProfile("guard", false);
  const hunterGuard = getEnemyBehaviorProfile("guard", true);
  const hunterArtillery = getEnemyBehaviorProfile("artillery", true);
  const normalReload = getEnemyReloadSeconds("guard", 5, false);
  const hunterReload = getEnemyReloadSeconds("guard", 5, true);

  assert.ok(hunterGuard.speed > normalGuard.speed);
  assert.ok(hunterGuard.turnSpeed > normalGuard.turnSpeed);
  assert.ok(hunterGuard.preferredRange < normalGuard.preferredRange);
  assert.ok(hunterArtillery.speed > 0);
  assert.ok(hunterReload < normalReload / 2);
});
