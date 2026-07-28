import assert from "node:assert/strict";
import test from "node:test";
import {
  findMissionSpawnOverlaps,
  getCameraPosition,
  getMissionEnemyTotal,
  MISSIONS,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../src/game/levels.ts";

const EXPECTED_ENEMY_COUNTS = [5, 7, 8, 10, 10, 11, 12, 14, 16, 18];
const EXPECTED_TOTAL_ENEMY_COUNTS = [12, 15, 18, 22, 24, 27, 30, 34, 38, 42];

test("campaign contains ten increasingly demanding missions", () => {
  assert.equal(MISSIONS.length, 10);
  assert.deepEqual(
    MISSIONS.map(({ number }) => number),
    Array.from({ length: 10 }, (_, index) => String(index + 1).padStart(2, "0")),
  );
  assert.deepEqual(
    MISSIONS.map(({ enemies }) => enemies.length),
    EXPECTED_ENEMY_COUNTS,
  );
  assert.deepEqual(MISSIONS.map(getMissionEnemyTotal), EXPECTED_TOTAL_ENEMY_COUNTS);

  const parTimes = MISSIONS.map(({ parTime }) => parTime);
  assert.ok(parTimes.every((parTime, index) => index === 0 || parTime > parTimes[index - 1]));
  assert.ok(parTimes[0] >= 85);
  assert.ok(parTimes.at(-1) >= 360);
});

test("reinforcement pressure rises moderately with mission number", () => {
  const averageIntervals = MISSIONS.map(({ reinforcements }) => (
    (reinforcements.intervalMin + reinforcements.intervalMax) / 2
  ));
  assert.ok(averageIntervals.every((
    interval,
    index,
  ) => index === 0 || interval < averageIntervals[index - 1]));
  assert.ok(averageIntervals.at(-1) >= averageIntervals[0] * 0.6);
  assert.ok(MISSIONS.every((mission) => (
    mission.reinforcements.maxConcurrent >= mission.enemies.length
    && mission.reinforcements.maxConcurrent <= mission.enemies.length + 2
  )));
});

test("the campaign has exactly one boss and it starts in mission 10", () => {
  const bossSpawns = MISSIONS.flatMap((mission) => (
    mission.enemies
      .filter(({ kind }) => kind === "boss")
      .map(() => mission.number)
  ));
  assert.deepEqual(bossSpawns, ["10"]);
});

test("every mission starts tanks clear of walls", () => {
  const overlaps = MISSIONS.flatMap((mission) => (
    findMissionSpawnOverlaps(mission).map((overlap) => ({
      mission: mission.number,
      ...overlap,
    }))
  ));

  assert.deepEqual(overlaps, []);
});

test("missions occupy a world larger than the viewport and stay in bounds", () => {
  assert.equal(WORLD_WIDTH, VIEW_WIDTH * 2);
  assert.equal(WORLD_HEIGHT, VIEW_HEIGHT * 2);

  for (const mission of MISSIONS) {
    const points = [mission.player, ...mission.enemies];
    assert.ok(points.every(({ x, y }) => (
      x >= 0 && x <= WORLD_WIDTH && y >= 0 && y <= WORLD_HEIGHT
    )), `mission ${mission.number} has an out-of-bounds tank`);
    assert.ok(mission.walls.every((wall) => (
      wall.x >= 0
      && wall.y >= 0
      && wall.x + wall.width <= WORLD_WIDTH
      && wall.y + wall.height <= WORLD_HEIGHT
    )), `mission ${mission.number} has an out-of-bounds wall`);
    assert.deepEqual(
      [...new Set(mission.walls.map((wall) => wall.kind))].sort(),
      ["dragons-teeth", "hedgehog", "rock"],
      `mission ${mission.number} is missing a fortification style`,
    );
    assert.ok(
      points.some(({ x }) => x > VIEW_WIDTH)
        || mission.walls.some((wall) => wall.x + wall.width > VIEW_WIDTH),
      `mission ${mission.number} does not extend beyond the viewport width`,
    );
    assert.ok(
      points.some(({ y }) => y > VIEW_HEIGHT)
        || mission.walls.some((wall) => wall.y + wall.height > VIEW_HEIGHT),
      `mission ${mission.number} does not extend beyond the viewport height`,
    );
  }
});

test("every tank starts clear of every other tank", () => {
  for (const mission of MISSIONS) {
    const tanks = [
      { label: "player", radius: 15, ...mission.player },
      ...mission.enemies.map((enemy, index) => ({
        label: `enemy ${index + 1}`,
        radius: enemy.kind === "boss" ? 25 : 15,
        ...enemy,
      })),
    ];

    for (let index = 0; index < tanks.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < tanks.length; otherIndex += 1) {
        const tank = tanks[index];
        const other = tanks[otherIndex];
        const distance = Math.hypot(tank.x - other.x, tank.y - other.y);
        assert.ok(
          distance >= tank.radius + other.radius + 10,
          `mission ${mission.number}: ${tank.label} overlaps ${other.label}`,
        );
      }
    }
  }
});

test("camera follows the player and clamps at world edges", () => {
  assert.deepEqual(getCameraPosition({ x: 100, y: 100 }), { x: 0, y: 0 });
  assert.deepEqual(getCameraPosition({ x: 720, y: 450 }), { x: 240, y: 150 });
  assert.deepEqual(
    getCameraPosition({ x: WORLD_WIDTH - 100, y: WORLD_HEIGHT - 100 }),
    { x: WORLD_WIDTH - VIEW_WIDTH, y: WORLD_HEIGHT - VIEW_HEIGHT },
  );
});

test("mission 05 starts from a safer western staging area", () => {
  const mission = MISSIONS.find(({ number }) => number === "05");
  assert.ok(mission);
  assert.ok(mission.player.x <= VIEW_WIDTH * 0.25);
  assert.equal(mission.enemies.length, 10);
  assert.ok(mission.enemies.every(({ x }) => x > mission.player.x));

  const nearestEnemyDistance = Math.min(...mission.enemies.map((enemy) => (
    Math.hypot(enemy.x - mission.player.x, enemy.y - mission.player.y)
  )));
  assert.ok(nearestEnemyDistance >= 780);
});
