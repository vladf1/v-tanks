import assert from "node:assert/strict";
import test from "node:test";
import {
  AMMO_DEFINITIONS,
  addAmmo,
  createAmmoInventory,
  cycleAmmo,
  placeMissionAmmoPacks,
} from "../src/game/ammunition.ts";
import {
  MINE_BLAST_RADIUS,
  collectMineChainReaction,
  createMinefieldMines,
} from "../src/game/engine.ts";
import { MISSIONS, WORLD_HEIGHT, WORLD_WIDTH } from "../src/game/levels.ts";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("standard rounds are infinite and the wheel skips empty special ammunition", () => {
  const inventory = createAmmoInventory();
  assert.equal(inventory.basic, Number.POSITIVE_INFINITY);
  assert.equal(cycleAmmo("basic", 1, inventory), "basic");

  addAmmo(inventory, "piercing");
  addAmmo(inventory, "emp");
  assert.equal(inventory.piercing, AMMO_DEFINITIONS.piercing.packSize);
  assert.equal(cycleAmmo("basic", 1, inventory), "piercing");
  assert.equal(cycleAmmo("piercing", 1, inventory), "emp");
  assert.equal(cycleAmmo("basic", -1, inventory), "emp");
});

test("every mission places safe packs for all enhanced ammunition", () => {
  for (const [missionIndex, mission] of MISSIONS.entries()) {
    const packs = placeMissionAmmoPacks(mission, seededRandom(700 + missionIndex));
    assert.deepEqual(packs.map(({ kind }) => kind), ["piercing", "explosive", "emp"]);
    assert.ok(packs.every(({ x, y, radius }) => (
      x > radius && x < WORLD_WIDTH - radius && y > radius && y < WORLD_HEIGHT - radius
    )));
  }
});

test("minefield hazards expand into five individually shootable mines", () => {
  const hazard = { id: 7, kind: "minefield", x: 400, y: 300, radius: 20 };
  const mines = createMinefieldMines([hazard]);
  assert.equal(mines.length, 5);
  assert.ok(mines.every((mine) => (
    mine.owner === "enemy"
      && mine.fieldMine
      && mine.radius === 9
      && mine.armTime === 0
  )));
  assert.equal(new Set(mines.map(({ id }) => id)).size, 5);
});

test("mine blasts propagate through nearby mines", () => {
  const createMine = (id, x) => ({
    id,
    owner: "enemy",
    x,
    y: 200,
    armTime: 0,
    life: Number.POSITIVE_INFINITY,
    radius: 9,
    fieldMine: true,
  });
  const initial = createMine(1, 100);
  const adjacent = createMine(2, 100 + MINE_BLAST_RADIUS - 2);
  const chained = createMine(3, 100 + (MINE_BLAST_RADIUS - 2) * 2);
  const distant = createMine(4, 500);

  assert.deepEqual(
    collectMineChainReaction(initial, [adjacent, chained, distant]).map(({ id }) => id),
    [1, 2, 3],
  );
});
