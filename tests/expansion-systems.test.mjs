import assert from "node:assert/strict";
import test from "node:test";
import { MISSIONS } from "../src/game/levels.ts";
import {
  CANNON_KINDS,
  CHASSIS_KINDS,
  UTILITY_KINDS,
  getCannonStats,
  getChassisStats,
  parseLoadout,
} from "../src/game/loadouts.ts";
import { bestRecord } from "../src/game/progress.ts";

test("campaign distributes varied objectives, bonuses, hazards, and specialist enemies", () => {
  const objectives = new Set(MISSIONS.map((mission) => mission.objective.kind));
  assert.deepEqual(
    objectives,
    new Set(["eliminate", "relays", "hold", "survive", "omega"]),
  );
  assert.ok(MISSIONS.every((mission) => mission.bonus.label.length > 0));
  assert.ok(MISSIONS.slice(1).every((mission) => mission.hazards.length >= 2));

  const enemyKinds = new Set(MISSIONS.flatMap((mission) => (
    mission.enemies.map((enemy) => enemy.kind)
  )));
  for (const kind of ["heavy", "minelayer", "support", "artillery"]) {
    assert.ok(enemyKinds.has(kind), `campaign never deploys ${kind}`);
  }
});

test("loadout options are balanced sidegrades with validated fallbacks", () => {
  assert.equal(CANNON_KINDS.length, 3);
  assert.equal(CHASSIS_KINDS.length, 3);
  assert.equal(UTILITY_KINDS.length, 3);
  assert.ok(getCannonStats("rapid").reload < getCannonStats("heavy").reload);
  assert.ok(getCannonStats("heavy").damage > getCannonStats("rapid").damage);
  assert.ok(getChassisStats("fast").speed > getChassisStats("armored").speed);
  assert.ok(getChassisStats("armored").hp > getChassisStats("fast").hp);
  assert.deepEqual(parseLoadout({ cannon: "bad", chassis: "fast", utility: "mine" }), {
    cannon: "ricochet",
    chassis: "fast",
    utility: "mine",
  });
});

test("mission records retain the strongest rank and best telemetry", () => {
  const previous = { rank: "A", time: 75, accuracy: 71, hull: 2, bonus: false };
  const lowerRank = { rank: "B", time: 50, accuracy: 95, hull: 3, bonus: true };
  assert.deepEqual(bestRecord(previous, lowerRank), previous);

  const sameRank = { rank: "A", time: 70, accuracy: 76, hull: 1, bonus: true };
  assert.deepEqual(bestRecord(previous, sameRank), {
    rank: "A",
    time: 70,
    accuracy: 76,
    hull: 2,
    bonus: true,
  });
});
