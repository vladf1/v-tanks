import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from './game-fixture.mjs';
import { PLAYER_TANKS } from '../src/game/loadouts.ts';

const STEP = 1 / 120;
const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`,
);

function arena(t) {
  const { game } = createGame();
  t.after(() => game.destroy());
  game.mission = { ...game.mission, walls: [] };
  game.hazards = [];
  Object.assign(game.player, { x: 500, y: 350, hullAngle: -Math.PI / 2 });
  return game;
}

function advance(game, seconds, step = STEP) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.updatePlayer(step);
}

test('opposite input reverses along the hull without a U-turn', t => {
  const game = arena(t);
  game.keys.add('w');
  advance(game, 0.25);
  const forwardDistance = 350 - game.player.y;
  game.keys.clear();
  game.keys.add('s');
  const before = { ...game.player };
  advance(game, 0.25);
  near(game.player.hullAngle, -Math.PI / 2);
  near(game.player.x, 500);
  near(game.player.y - before.y, forwardDistance * 0.8);
});

test('a quarter-turn drives along the rotating hull and completes within 0.35 seconds', t => {
  const game = arena(t);
  game.keys.add('d');
  game.updatePlayer(STEP);
  assert.ok(game.player.hullAngle > -Math.PI / 2 && game.player.hullAngle < -1.5);
  const dx = game.player.x - 500;
  const dy = game.player.y - 350;
  assert.ok(dy < 0 && dx > 0 && dx < -dy);
  near(dx * Math.sin(game.player.hullAngle) - dy * Math.cos(game.player.hullAngle), 0);
  assert.ok(Math.hypot(dx, dy) < 0.01, 'sharp turns start with a near-stationary pivot');
  advance(game, 0.35);
  near(game.player.hullAngle, 0);
  assert.ok(350 - game.player.y < 15, 'turn should stay tight enough for corridors');
});

test('diagonals preserve top speed and arrows match WASD', t => {
  const game = arena(t);
  const positions = [];
  for (const keys of [['w', 'd'], ['arrowup', 'arrowright']]) {
    Object.assign(game.player, { x: 500, y: 350, hullAngle: -Math.PI / 4 });
    game.keys = new Set(keys);
    advance(game, 0.25);
    positions.push([game.player.x, game.player.y]);
    near(Math.hypot(game.player.x - 500, game.player.y - 350), 184 * 0.25);
  }
  assert.deepEqual(positions[0], positions[1]);
});

test('releasing or cancelling keys stops both drive and hull turning immediately', t => {
  const game = arena(t);
  game.keys.add('d');
  advance(game, 0.1);
  const before = { ...game.player };
  for (const keys of [[], ['w', 's'], ['a', 'd']]) {
    game.keys = new Set(keys);
    advance(game, 0.1);
    near(game.player.x, before.x);
    near(game.player.y, before.y);
    near(game.player.hullAngle, before.hullAngle);
  }
});

test('all hull orientations choose a stable forward quarter-turn, including angle wrap', t => {
  const game = arena(t);
  for (const hull of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
    Object.assign(game.player, { x: 500, y: 350, hullAngle: hull });
    for (let i = 0; i < 42; i++) game.driveTank(game.player, hull + Math.PI / 2, 184, 4.8, STEP);
    near(Math.cos(game.player.hullAngle), Math.cos(hull + Math.PI / 2));
    near(Math.sin(game.player.hullAngle), Math.sin(hull + Math.PI / 2));
  }
});

test('steering follows the same path across simulation step sizes', t => {
  const game = arena(t);
  const positions = [];
  for (const step of [1 / 60, 1 / 120, 1 / 240]) {
    Object.assign(game.player, { x: 500, y: 350, hullAngle: -Math.PI / 2 });
    game.keys = new Set(['d']);
    advance(game, 0.5, step);
    near(game.player.hullAngle, 0);
    positions.push({ x: game.player.x, y: game.player.y });
  }
  for (const position of positions) {
    assert.ok(Math.hypot(position.x - positions[1].x, position.y - positions[1].y) < 1);
  }
});

test('class speeds, mud and speed power-ups still scale hull-aligned travel', t => {
  const game = arena(t);
  game.keys.add('w');
  for (const [kind, definition] of Object.entries(PLAYER_TANKS)) {
    game.playerTank = kind;
    game.player.y = 350;
    advance(game, 0.25);
    near(350 - game.player.y, 184 * definition.speed * 0.25);
  }
  game.playerTank = 'vanguard';
  game.player.y = 350;
  game.hazards = [{ active: true, kind: 'mud', x: 500, y: 350, radius: 200 }];
  advance(game, 0.25);
  near(350 - game.player.y, 184 * 0.58 * 0.25);
  game.hazards = [];
  game.player.y = 350;
  game.activePowerUps.speed = 10;
  advance(game, 0.25);
  assert.ok(350 - game.player.y > 184 * 0.25);
});

test('a tank can turn away from a wall without penetrating it; aim stays independent', t => {
  const game = arena(t);
  game.mission.walls = [{ x: 450, y: 300, width: 100, height: 20 }];
  game.mouse = { x: 300, y: 350 };
  game.keys.add('w');
  advance(game, 0.2);
  assert.equal(game.collidesWithWalls(game.player), false);
  const beforeX = game.player.x;
  game.keys = new Set(['d']);
  advance(game, 0.5);
  assert.equal(game.collidesWithWalls(game.player), false);
  assert.ok(game.player.x > beforeX + 20);
  near(game.player.hullAngle, 0);
  near(game.player.turretAngle, Math.atan2(350 - game.player.y, 300 - game.player.x));
});

test('moving enemies also drive along their hull and retreat in reverse', t => {
  const game = arena(t);
  const enemy = game.createEnemy('guard', { x: 500, y: 350 });
  game.enemies = [enemy];
  Object.assign(game.player, { x: 900, y: 350 });
  enemy.hullAngle = -Math.PI / 2;
  game.updateEnemies(STEP);
  assert.ok(enemy.y < 350 && enemy.x > 500);
  near((enemy.x - 500) * Math.sin(enemy.hullAngle) - (enemy.y - 350) * Math.cos(enemy.hullAngle), 0);
  Object.assign(enemy, { x: 500, y: 350, hullAngle: 0 });
  game.player.x = 600;
  game.updateEnemies(STEP);
  near(enemy.hullAngle, 0);
  assert.ok(enemy.x < 500);
});

test('Raptor dash follows the hull even during a turn and supports reversing', t => {
  const game = arena(t);
  game.playerTank = 'raptor';
  for (const [key, expectedY] of [['d', 278], ['s', 422]]) {
    Object.assign(game.player, { x: 500, y: 350, hullAngle: -Math.PI / 2, dashCooldown: 0 });
    game.keys = new Set([key]);
    game.tryDash();
    near(game.player.x, 500);
    near(game.player.y, expectedY);
    near(game.player.hullAngle, -Math.PI / 2);
  }
});
