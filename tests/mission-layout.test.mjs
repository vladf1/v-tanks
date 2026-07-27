import assert from "node:assert/strict";
import test from "node:test";
import {
  findMissionSpawnOverlaps,
  MISSIONS,
} from "../app/game/levels.ts";

test("every mission starts tanks clear of walls", () => {
  const overlaps = MISSIONS.flatMap((mission) => (
    findMissionSpawnOverlaps(mission).map((overlap) => ({
      mission: mission.number,
      ...overlap,
    }))
  ));

  assert.deepEqual(overlaps, []);
});
