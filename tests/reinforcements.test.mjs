import assert from "node:assert/strict";
import test from "node:test";
import {
  STANDARD_TANK_RADIUS,
  TANK_WALL_PADDING,
  MISSIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../src/game/levels.ts";
import {
  findReinforcementEntry,
  getReinforcementDelay,
  pickReinforcementKind,
} from "../src/game/reinforcements.ts";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function distanceSquared(first, second) {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return (deltaX * deltaX) + (deltaY * deltaY);
}

test("reinforcement delays stay within each mission's level-scaled window", () => {
  for (const [missionIndex, mission] of MISSIONS.entries()) {
    const random = seededRandom(700 + missionIndex);
    for (let sample = 0; sample < 20; sample += 1) {
      const delay = getReinforcementDelay(mission, random);
      assert.ok(delay >= mission.reinforcements.intervalMin);
      assert.ok(delay <= mission.reinforcements.intervalMax);
    }
  }
});

test("reinforcements never add another boss", () => {
  for (const [missionIndex, mission] of MISSIONS.entries()) {
    const random = seededRandom(900 + missionIndex);
    for (let sample = 0; sample < 30; sample += 1) {
      assert.notEqual(pickReinforcementKind(mission, random), "boss");
    }
  }
});

test("random reinforcements enter from safe level edges", () => {
  for (const [missionIndex, mission] of MISSIONS.entries()) {
    const random = seededRandom(1200 + missionIndex);
    const occupied = mission.enemies.map((enemy) => ({
      ...enemy,
      radius: enemy.kind === "boss" ? 25 : STANDARD_TANK_RADIUS,
    }));

    for (let sample = 0; sample < 12; sample += 1) {
      const entry = findReinforcementEntry(mission, mission.player, occupied, random);
      assert.ok(entry, `mission ${mission.number} has no safe reinforcement entry`);
      assert.ok(
        entry.x === 24
          || entry.x === WORLD_WIDTH - 24
          || entry.y === 24
          || entry.y === WORLD_HEIGHT - 24,
        `mission ${mission.number} reinforcement is not on an arena edge`,
      );
      assert.ok(distanceSquared(entry, mission.player) >= 360 * 360);
      assert.ok(mission.walls.every((wall) => (
        entry.x < wall.x - STANDARD_TANK_RADIUS - TANK_WALL_PADDING
        || entry.x > wall.x + wall.width + STANDARD_TANK_RADIUS + TANK_WALL_PADDING
        || entry.y < wall.y - STANDARD_TANK_RADIUS - TANK_WALL_PADDING
        || entry.y > wall.y + wall.height + STANDARD_TANK_RADIUS + TANK_WALL_PADDING
      )));
      occupied.push({ ...entry, radius: STANDARD_TANK_RADIUS });
    }
  }
});
