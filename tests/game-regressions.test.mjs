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

test('piercing hits count one accurate shot and retain individual ricochet hits', () => {
  const { game, snapshots } = createGame();
  game.enemies = [game.createEnemy('guard', { x: 500, y: 300 }), game.createEnemy('guard', { x: 600, y: 300 })];
  game.selectedAmmo = 'piercing';
  game.ammunition.piercing = 1;
  game.tryPlayerShoot();
  const projectile = game.projectiles[0];
  projectile.ricocheted = true;
  for (const enemy of game.enemies) {
    Object.assign(projectile, { x: enemy.x, y: enemy.y, previousX: enemy.x - 5, previousY: enemy.y });
    game.projectileHitsTank(projectile);
  }
  // A subsequent relay hit by the same round must not count another accurate shot.
  game.objectiveNodes = [{ x: 700, y: 300, radius: 24, hp: 3, active: true, kind: 'relay' }];
  Object.assign(projectile, { x: 700, previousX: 695 });
  game.projectileHitsObjective(projectile);
  game.publishSnapshot();
  assert.equal(snapshots.at(-1).shots, 1);
  assert.equal(snapshots.at(-1).hits, 1);
  assert.equal(game.ricochetHits, 3);
  game.destroy();
});

test('survival reinforcement gameplay is independent of cosmetic randomness', () => {
  const { game } = createGame();
  const random = Math.random;
  const runs = [];
  try {
    for (const cosmeticRandom of [0.1, 0.9]) {
      Math.random = () => cosmeticRandom;
      game.startSurvival(20260907);
      const spawns = [];
      for (let i = 0; i < 8; i++) {
        game.enemies = [];
        game.reinforcementTimer = 0;
        game.updateReinforcements(1 / 120);
        spawns.push([game.enemies[0], game.reinforcementTimer]);
      }
      runs.push(spawns);
    }
    assert.deepEqual(runs[0], runs[1]);
  } finally { Math.random = random; game.destroy(); }
});

test('repeated action keys do not toggle pause or restart; movement keys remain held', () => {
  const { game } = createGame();
  game.onKeyDown({ key: 'Escape' });
  game.onKeyDown({ key: 'Escape', repeat: true });
  assert.equal(game.phase, 'paused');
  game.onKeyDown({ key: 'Escape' });
  game.elapsed = 12;
  game.onKeyDown({ key: 'r', repeat: true });
  assert.equal(game.elapsed, 12);
  game.onKeyDown({ key: 'w', repeat: true, preventDefault() {} });
  assert.ok(game.keys.has('w'));
  game.destroy();
});

test('engine audio is silent after every exit from play, including mute toggles', () => {
  const { game } = createGame();
  const gains = [];
  game.audio.context = { currentTime: 0, close() {} };
  game.audio.engineOscillator = { frequency: { setTargetAtTime() {} }, stop() {} };
  game.audio.engineGain = { gain: { setTargetAtTime: value => gains.push(value) } };
  game.setSound(true);
  for (const phase of ['paused', 'menu', 'victory', 'defeat']) {
    game.startMission(0);
    game.audio.engine(1);
    assert.ok(gains.at(-1) > 0);
    game.keys.add('w');
    game.primaryFireHeld = true;
    game.setPhase(phase);
    game.setSound(false);
    game.setSound(true);
    assert.equal(gains.at(-1), 0);
    assert.equal(game.keys.size, 0);
    assert.equal(game.primaryFireHeld, false);
  }
  game.destroy();
});

test('objective snapshots distinguish survival and each Omega stage', () => {
  const { game, snapshots } = createGame();
  game.startSurvival(1);
  assert.equal(snapshots.at(-1).objectiveStage, 'survival');
  game.startMission(MISSIONS.length - 1);
  assert.equal(snapshots.at(-1).objectiveStage, 'shields');
  game.objectiveNodes.forEach(node => { if (node.kind === 'relay') node.active = false; });
  game.publishSnapshot();
  assert.equal(snapshots.at(-1).objectiveStage, 'boss');
  game.enemies = [];
  game.updateObjective(0);
  game.publishSnapshot();
  assert.equal(snapshots.at(-1).objectiveStage, 'extract');
  assert.ok(game.objectiveNodes.find(node => node.kind === 'extract').active);
  game.destroy();
});

test('stun expires with enemy updates even when visual updates are skipped', () => {
  const { game } = createGame();
  const enemy = game.enemies[0];
  enemy.stunned = 0.02;
  const start = { x: enemy.x, y: enemy.y };
  game.updateEnemies(0.02);
  assert.equal(enemy.stunned, 0);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, start);
  game.updateEnemies(0.02);
  assert.notDeepEqual({ x: enemy.x, y: enemy.y }, start);
  game.destroy();
});

test('direct hits and area attacks honor boss shielding and award one source-specific kill', () => {
  const { game } = createGame();
  const attacks = [
    [p => game.projectileHitsTank(p), 2500],
    [p => game.applyExplosiveImpact(p, -1), 140],
    [p => game.applyProjectileInterceptionBlast(p, 44), 120],
    [p => game.detonate(p.x, p.y, 82, 'player'), 120],
  ];
  for (const [attack, score] of attacks) {
    game.startMission(MISSIONS.length - 1);
    const boss = game.enemies.find(e => e.kind === 'boss');
    game.enemies = [boss];
    game.spawnProjectile(game.player, 0, 'player', 500, 0, 1, 'explosive');
    const p = game.projectiles[0];
    Object.assign(p, { x: boss.x, y: boss.y, previousX: boss.x, previousY: boss.y });
    attack(p);
    assert.equal(boss.hp, boss.maxHp);
    game.objectiveNodes.forEach(node => { node.active = false; });
    boss.hp = 1;
    attack(p);
    attack(p);
    assert.equal(boss.alive, false);
    assert.equal(game.score, score);
    assert.equal(game.wrecks.length, 1);
  }
  game.destroy();
});
