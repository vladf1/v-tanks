import assert from "node:assert/strict";
import test from "node:test";
import {
  findMissionSpawnOverlaps,
  MISSIONS,
} from "../src/game/levels.ts";

test("every mission starts tanks clear of walls", () => {
  const overlaps = MISSIONS.flatMap((mission) => (
    findMissionSpawnOverlaps(mission).map((overlap) => ({
      mission: mission.number,
      ...overlap,
    }))
  ));

  assert.deepEqual(overlaps, []);
});
