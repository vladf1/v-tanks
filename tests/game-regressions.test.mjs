import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from './game-fixture.mjs';
import { createDefaultSave, readCampaignSave, writeCampaignSave } from '../src/game/progress.ts';
import { MISSIONS } from '../src/game/levels.ts';

test('death takes precedence over completion and publishes one terminal snapshot', () => {
  const { game, snapshots } = createGame();
  game.enemies = [];
  game.reinforcementsRemaining = 0;
  game.clearTimer = 1.05;
  game.player.alive = false;
  snapshots.length = 0;
  game.update(1 / 120);
  assert.deepEqual(snapshots.map(s => s.phase), ['defeat']);
  const elapsed = game.elapsed;
  game.update(1 / 120);
  assert.equal(game.elapsed, elapsed);
  game.destroy();
});

test('animation substeps stop immediately after victory', () => {
  const { game, snapshots } = createGame();
  game.enemies = [];
  game.reinforcementsRemaining = 0;
  game.clearTimer = 1.05;
  game.previousFrame = 1000;
  game.renderer.render = () => {};
  snapshots.length = 0;
  game.frame(1050);
  assert.deepEqual(snapshots.map(s => s.phase), ['victory']);
  assert.ok(game.elapsed <= 1 / 120 + 1e-10);
  game.destroy();
});

test('mines and artillery respect invulnerability and dead players take no damage', () => {
  const { game } = createGame();
  const hp = game.player.hp;
  game.player.invulnerable = 1;
  game.detonate(game.player.x, game.player.y, 82, 'enemy');
  game.artilleryStrikes = [{ ...game.player, delay: 0, radius: 60 }];
  game.updateArtillery(1 / 120);
  assert.equal(game.player.hp, hp);
  game.player.invulnerable = 0;
  game.damagePlayer(1);
  game.damagePlayer(1);
  assert.equal(game.player.hp, hp - 1);
  game.player.invulnerable = 0;
  game.player.alive = false;
  game.damagePlayer(1);
  assert.equal(game.player.hp, hp - 1);
  game.destroy();
});

test('restart and R retain survival seed, mode and reset transient state', () => {
  const { game, snapshots } = createGame();
  game.startSurvival(20260907);
  const pickups = JSON.stringify([game.powerUps, game.ammoPacks]);
  for (const restart of [() => game.restart(), () => game.onKeyDown({ key: 'r' })]) {
    game.hitStop = 0.1;
    game.elapsed = 100;
    game.primaryFireHeld = true;
    restart();
    assert.equal(snapshots.at(-1).mode, 'survival');
    assert.equal(game.elapsed, 0);
    assert.equal(game.hitStop, 0);
    assert.equal(game.primaryFireHeld, false);
    assert.equal(JSON.stringify([game.powerUps, game.ammoPacks]), pickups);
  }
  game.startMission(3);
  game.restart();
  assert.equal(snapshots.at(-1).mode, 'campaign');
  assert.equal(snapshots.at(-1).missionIndex, 3);
  game.destroy();
});

test('dead enemies leave combat arrays while wrecks and stable survivor ids remain', () => {
  const { game } = createGame();
  const [dead, survivor] = game.enemies;
  game.destroyEnemy(dead);
  const wreckCount = game.wrecks.length;
  game.update(1 / 120);
  assert.ok(!game.enemies.includes(dead));
  assert.ok(game.enemies.includes(survivor));
  assert.equal(game.wrecks.length, wreckCount);
  assert.equal(game.countActiveEnemies(), game.enemies.length);
  game.destroy();
});

test('pause and menu clear shake and publish once per phase change', () => {
  const { game, snapshots } = createGame();
  for (const leave of [() => game.pause(), () => game.showMenu()]) {
    game.startMission(0);
    game.shake = 3;
    snapshots.length = 0;
    leave();
    leave();
    assert.equal(game.shake, 0);
    assert.equal(snapshots.length, 1);
  }
  game.destroy();
});

test('storage failures preserve an in-memory default and never interrupt gameplay', () => {
  globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } };
  assert.deepEqual(readCampaignSave(), createDefaultSave());
  assert.doesNotThrow(() => writeCampaignSave(createDefaultSave()));
});

test('saved fields are validated and legacy progress and loadouts still migrate', () => {
  let stored = { version: 3, unlockedMission: 'oops', survivalBest: null, settings: { sound: 'false' },
    records: { 0: { rank: 'S', time: 10, accuracy: 80, hull: 4, bonus: true },
      1: { rank: 'Z' }, 2: { rank: 'A', time: -1, accuracy: 80, hull: 3, bonus: true } } };
  globalThis.localStorage = { getItem: key => key === 'v-tanks-save-v2' ? JSON.stringify(stored) : '2' };
  const save = readCampaignSave();
  assert.equal(save.unlockedMission, 2);
  assert.equal(save.survivalBest, 0);
  assert.equal(save.settings.sound, true);
  assert.deepEqual(Object.keys(save.records), ['0']);
  stored = { version: 2, unlockedMission: 3.8, loadout: { cannon: 'heavy', chassis: 'armored', utility: 'shield' } };
  assert.equal(readCampaignSave().tankClass, 'bulwark');
  assert.equal(readCampaignSave().unlockedMission, 3);
});

test('all missions start with separate ammo and power-up placements', () => {
  const { game } = createGame();
  for (let index = 0; index < MISSIONS.length; index++) {
    game.startMission(index);
    for (const ammo of game.ammoPacks) for (const power of game.powerUps) {
      assert.ok(Math.hypot(ammo.x - power.x, ammo.y - power.y) >= 92);
    }
  }
  game.destroy();
});
