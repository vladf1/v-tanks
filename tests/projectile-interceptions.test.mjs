import assert from "node:assert/strict";
import test from "node:test";
import {
  PROJECTILE_INTERCEPTION_PADDING,
  findProjectileInterception,
} from "../src/game/engine.ts";

function projectile({
  owner,
  previousX,
  previousY = 100,
  x,
  y = 100,
  radius = 4,
}) {
  return {
    owner,
    previousX,
    previousY,
    x,
    y,
    radius,
    velocityX: x - previousX,
    velocityY: y - previousY,
    life: 1,
    bounces: 0,
    damage: 1,
    color: "#fff",
    ricocheted: false,
    ignoresProjectiles: false,
  };
}

test("opposing projectiles intercept when their swept paths cross", () => {
  const player = projectile({ owner: "player", previousX: 80, x: 120 });
  const enemy = projectile({ owner: "enemy", previousX: 120, x: 80 });

  assert.deepEqual(findProjectileInterception(player, enemy), {
    x: 100,
    y: 100,
    time: 0.5,
  });
});

test("the proximity margin makes close counterfire achievable", () => {
  const player = projectile({ owner: "player", previousX: 80, previousY: 100, x: 120, y: 100 });
  const enemy = projectile({ owner: "enemy", previousX: 120, previousY: 111, x: 80, y: 111 });

  assert.ok(findProjectileInterception(player, enemy));

  enemy.previousY = 100 + 8 + PROJECTILE_INTERCEPTION_PADDING + 0.1;
  enemy.y = enemy.previousY;
  assert.equal(findProjectileInterception(player, enemy), null);
});

test("friendly projectiles never destroy each other", () => {
  const first = projectile({ owner: "enemy", previousX: 80, x: 120 });
  const second = projectile({ owner: "enemy", previousX: 120, x: 80 });

  assert.equal(findProjectileInterception(first, second), null);
});

test("piercing rounds pass through incoming projectiles", () => {
  const piercing = projectile({ owner: "player", previousX: 80, x: 120 });
  piercing.ignoresProjectiles = true;
  const enemy = projectile({ owner: "enemy", previousX: 120, x: 80 });
  assert.equal(findProjectileInterception(piercing, enemy), null);
});
