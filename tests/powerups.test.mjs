import { AMMO_DEFINITIONS } from "../src/game/ammunition.ts";
import { createGame } from "./game-fixture.mjs";
import { PLAYER_TANKS, getCannonStats } from "../src/game/loadouts.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { MISSIONS, WORLD_HEIGHT, WORLD_WIDTH } from "../src/game/levels.ts";
import {
  POWER_UP_DEFINITIONS,
  POWER_UP_KINDS,
  absorbShieldDamage,
  activateTimedPowerUp,
  createActivePowerUps,
  getActivePowerUpSnapshots,
  getPlayerSpeedMultiplier,
  placeMissionPowerUps,
  tickActivePowerUps,
} from "../src/game/powerups.ts";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("every mission places one safe power-up of each kind", () => {
  for (const [missionIndex, mission] of MISSIONS.entries()) {
    const powerUps = placeMissionPowerUps(mission, seededRandom(1000 + missionIndex));
    assert.deepEqual(powerUps.map(({ kind }) => kind), POWER_UP_KINDS);
    assert.equal(powerUps.length, POWER_UP_KINDS.length);

    for (const powerUp of powerUps) {
      assert.ok(powerUp.x > powerUp.radius && powerUp.x < WORLD_WIDTH - powerUp.radius);
      assert.ok(powerUp.y > powerUp.radius && powerUp.y < WORLD_HEIGHT - powerUp.radius);
      assert.ok(mission.walls.every((wall) => (
        powerUp.x < wall.x - powerUp.radius
          || powerUp.x > wall.x + wall.width + powerUp.radius
          || powerUp.y < wall.y - powerUp.radius
          || powerUp.y > wall.y + wall.height + powerUp.radius
      )), `mission ${mission.number} placed ${powerUp.kind} inside a wall`);
    }
  }
});

test("power-up positions change with the mission random seed", () => {
  const first = placeMissionPowerUps(MISSIONS[0], seededRandom(11));
  const second = placeMissionPowerUps(MISSIONS[0], seededRandom(12));
  assert.notDeepEqual(
    first.map(({ x, y }) => ({ x, y })),
    second.map(({ x, y }) => ({ x, y })),
  );
});

test("timed power-ups apply their documented player modifiers and expire", () => {
  const active = createActivePowerUps();
  assert.equal(getPlayerSpeedMultiplier(active), 1);

  activateTimedPowerUp(active, "speed");
  activateTimedPowerUp(active, "gun");
  activateTimedPowerUp(active, "ricochet");
  assert.equal(getPlayerSpeedMultiplier(active), 1.5);
  assert.equal(getActivePowerUpSnapshots(active).length, 3);

  tickActivePowerUps(active, POWER_UP_DEFINITIONS.speed.duration);
  assert.equal(getPlayerSpeedMultiplier(active), 1);
  assert.deepEqual(getActivePowerUpSnapshots(active), []);
});

test("shield absorbs three damage before hull damage passes through", () => {
  const active = createActivePowerUps();
  activateTimedPowerUp(active, "shield");

  assert.equal(absorbShieldDamage(active, 1), 0);
  assert.equal(active.shieldPoints, 2);
  assert.equal(absorbShieldDamage(active, 3), 1);
  assert.equal(active.shieldPoints, 0);
  assert.equal(active.shield, 0);
});

test("class cannons apply gun and ricochet upgrades in actual firing", () => {
  const { game } = createGame();
  for (const [kind, definition] of Object.entries(PLAYER_TANKS)) {
    game.configure(kind);
    game.startMission(0);
    const cannon = getCannonStats(definition.loadout.cannon);
    game.tryPlayerShoot();
    assert.equal(game.player.cooldown, cannon.reload);
    assert.equal(game.projectiles.at(-1).color, AMMO_DEFINITIONS.basic.color);
    assert.equal(game.projectiles.at(-1).damage, cannon.damage);
    assert.equal(game.projectiles.at(-1).bounces, cannon.bounces);
    activateTimedPowerUp(game.activePowerUps, "gun");
    activateTimedPowerUp(game.activePowerUps, "ricochet");
    game.player.cooldown = 0;
    game.tryPlayerShoot();
    assert.equal(game.player.cooldown, cannon.reload * 0.5);
    assert.equal(game.projectiles.at(-1).damage, cannon.damage * 2);
    assert.equal(game.projectiles.at(-1).bounces, cannon.bounces + 2);
    tickActivePowerUps(game.activePowerUps, 12);
    game.player.cooldown = 0;
    game.tryPlayerShoot();
    assert.equal(game.projectiles.at(-1).damage, cannon.damage);
    assert.equal(game.projectiles.at(-1).bounces, cannon.bounces);
  }
  game.destroy();
});
