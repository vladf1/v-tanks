import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MISSIONS,
  getMissionVisualTheme,
} from "../src/game/levels.ts";
import {
  GROUND_OVERSCAN,
  VISUAL_CAPS,
  WRECK_FADE_SECONDS,
  WRECK_SOLID_SECONDS,
  calculateRecoilOffset,
  generateEnvironmentalDetails,
  generateGroundTileTexture,
  getWreckOpacity,
  pushCapped,
} from "../src/game/visual-state.ts";

test("ground artwork extends beyond unreachable world edges", () => {
  assert.ok(GROUND_OVERSCAN >= 32);
});

test("missions map to the requested visual themes", () => {
  assert.deepEqual(
    MISSIONS.map((mission) => mission.visualTheme),
    [
      "proving-ground",
      "proving-ground",
      "industrial",
      "proving-ground",
      "industrial",
      "command-complex",
      "proving-ground",
      "industrial",
      "command-complex",
      "command-complex",
    ],
  );
  for (const mission of MISSIONS) {
    assert.equal(mission.visualTheme, getMissionVisualTheme(mission.number));
  }
});

test("ground texture and environmental details are deterministic", () => {
  const firstTile = generateGroundTileTexture("03", 8, 4);
  assert.deepEqual(firstTile, generateGroundTileTexture("03", 8, 4));
  assert.notDeepEqual(firstTile, generateGroundTileTexture("03", 9, 4));
  assert.notDeepEqual(firstTile, generateGroundTileTexture("04", 8, 4));

  const firstDetails = generateEnvironmentalDetails(MISSIONS[2]);
  assert.deepEqual(firstDetails, generateEnvironmentalDetails(MISSIONS[2]));
  assert.notDeepEqual(firstDetails, generateEnvironmentalDetails(MISSIONS[3]));
  assert.equal(firstDetails.length, 46);
});

test("recoil follows a short monotonic decay", () => {
  assert.equal(calculateRecoilOffset(5, 0.09, 0.09), 5);
  assert.equal(calculateRecoilOffset(5, 0, 0.09), 0);
  assert.ok(
    calculateRecoilOffset(5, 0.06, 0.09)
      > calculateRecoilOffset(5, 0.03, 0.09),
  );
  assert.ok(calculateRecoilOffset(6.5, 0.065, 0.13) <= 6.5);
});

test("wrecks remain solid for 20 seconds and then fade out", () => {
  const initialLife = WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS;
  assert.equal(getWreckOpacity(initialLife), 1);
  assert.equal(getWreckOpacity(WRECK_FADE_SECONDS), 1);
  assert.equal(getWreckOpacity(WRECK_FADE_SECONDS / 2), 0.5);
  assert.equal(getWreckOpacity(0), 0);
});

test("every visual collection cap evicts the oldest noncritical entry", () => {
  for (const cap of Object.values(VISUAL_CAPS)) {
    const collection = [{ id: "critical", critical: true }];
    for (let index = 0; index < cap + 4; index += 1) {
      pushCapped(collection, { id: index }, cap);
    }
    assert.equal(collection.length, cap);
    assert.equal(collection[0].id, "critical");
    assert.equal(collection.at(-1).id, cap + 3);
  }
  const protectedCollection = [
    { id: "critical-a", critical: true },
    { id: "critical-b", critical: true },
  ];
  pushCapped(protectedCollection, { id: "ordinary" }, 2);
  assert.deepEqual(
    protectedCollection.map(({ id }) => id),
    ["critical-a", "critical-b"],
  );
});

test("decals and wrecks stay outside collision and projectile resolution", async () => {
  const engineSource = await readFile(
    new URL("../src/game/engine.ts", import.meta.url),
    "utf8",
  );
  const collisionStart = engineSource.indexOf("private collidesWithWalls");
  const collisionEnd = engineSource.indexOf("private tryPlayerShoot", collisionStart);
  const collisionCode = engineSource.slice(collisionStart, collisionEnd);
  assert.match(collisionCode, /this\.mission\.walls/);
  assert.match(collisionCode, /this\.hazards/);
  assert.doesNotMatch(collisionCode, /this\.(decals|wrecks)/);

  const projectileStart = engineSource.indexOf("private updateProjectiles");
  const projectileEnd = engineSource.indexOf("private updateHazards", projectileStart);
  const projectileCode = engineSource.slice(projectileStart, projectileEnd);
  assert.match(projectileCode, /this\.mission\.walls/);
  assert.doesNotMatch(projectileCode, /this\.(decals|wrecks)/);
});

test("renderer preserves the visual depth order", async () => {
  const rendererSource = await readFile(
    new URL("../src/game/renderer.ts", import.meta.url),
    "utf8",
  );
  const start = rendererSource.indexOf("private drawMission");
  const end = rendererSource.indexOf("private drawDecal", start);
  const drawMission = rendererSource.slice(start, end);
  const order = [
    "state.decals",
    "state.trackMarks",
    "state.mission.walls",
    "state.hazards",
    "state.wrecks",
    "state.projectiles",
    "state.particles",
    "drawCrosshair",
  ];
  let previous = -1;
  for (const marker of order) {
    const index = drawMission.indexOf(marker);
    assert.ok(index > previous, `${marker} is out of render order`);
    previous = index;
  }
});
