import { createGame, recordDrawing } from "./game-fixture.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GameRenderer } from "../src/game/renderer.ts";
import {
  MISSIONS,
  getMissionVisualTheme,
} from "../src/game/levels.ts";
import {
  EJECTED_TURRET_CHANCE,
  EJECTED_TURRET_FADE_SECONDS,
  EJECTED_TURRET_MAX_ANGULAR_VELOCITY,
  EJECTED_TURRET_MIN_ANGULAR_VELOCITY,
  EJECTED_TURRET_SOLID_SECONDS,
  GROUND_OVERSCAN,
  VISUAL_CAPS,
  WRECK_FADE_SECONDS,
  WRECK_SOLID_SECONDS,
  calculateRecoilOffset,
  generateEnvironmentalDetails,
  generateGroundTileTexture,
  getEjectedTurretOpacity,
  getWreckOpacity,
  pushCapped,
  updateEjectedTurret,
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
      "industrial",
      "command-complex",
      "industrial",
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

test("rare ejected enemy turrets travel, spin moderately, land, and fade", () => {
  assert.equal(EJECTED_TURRET_CHANCE, 0.25);
  assert.ok(EJECTED_TURRET_MIN_ANGULAR_VELOCITY >= 2);
  assert.ok(EJECTED_TURRET_MAX_ANGULAR_VELOCITY <= 5);
  const turret = {
    id: 1,
    kind: "guard",
    x: 100,
    y: 100,
    angle: 0,
    velocityX: 90,
    velocityY: 0,
    angularVelocity: 3.6,
    height: 6,
    verticalVelocity: 70,
    scale: 1,
    landed: false,
    life: EJECTED_TURRET_SOLID_SECONDS + EJECTED_TURRET_FADE_SECONDS,
  };
  let maximumHeight = turret.height;
  for (let frame = 0; frame < 180 && !turret.landed; frame += 1) {
    updateEjectedTurret(turret, 1 / 60);
    maximumHeight = Math.max(maximumHeight, turret.height);
  }

  assert.equal(turret.landed, true);
  assert.equal(turret.height, 0);
  assert.ok(maximumHeight > 25);
  assert.ok(turret.x - 100 > 60);
  assert.ok(Math.abs(turret.angle) > Math.PI);
  assert.ok(Math.abs(turret.angle) < Math.PI * 2);
  assert.equal(getEjectedTurretOpacity(turret.life), 1);

  updateEjectedTurret(turret, EJECTED_TURRET_SOLID_SECONDS);
  assert.equal(getEjectedTurretOpacity(turret.life), 1);
  updateEjectedTurret(turret, EJECTED_TURRET_FADE_SECONDS / 2);
  assert.equal(getEjectedTurretOpacity(turret.life), 0.5);
  updateEjectedTurret(turret, EJECTED_TURRET_FADE_SECONDS / 2);
  assert.equal(getEjectedTurretOpacity(turret.life), 0);
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

test("wrecks, decals and ejected turrets do not block tanks or shells", () => {
  const { game } = createGame();
  const obstacle = { ...game.player, id: 1, size: 100, radius: 100 };
  game.decals = [obstacle];
  game.wrecks = [obstacle];
  game.ejectedTurrets = [obstacle];
  assert.equal(game.collidesWithWalls(game.player), false);
  game.tryPlayerShoot();
  const projectile = game.projectiles[0];
  const startX = projectile.x;
  game.updateProjectiles(1 / 120);
  assert.equal(game.projectiles[0], projectile);
  assert.ok(projectile.x > startX);
  game.destroy();
});

test("renderer draws ground details, obstacles, combatants and effects in depth order", () => {
  const { game } = createGame();
  const renderer = game.renderer;
  const calls = [];
  for (const name of ["Decal", "TrackMark", "WallLayer", "Hazard", "ObjectiveNode", "Mine",
    "ArtilleryStrike", "Wreck", "EjectedTurret", "PowerUp", "AmmoPack", "Projectile", "Tank",
    "TankHealthBar", "PlayerPowerUpEffects", "Particle", "Crosshair"]) {
    renderer[`draw${name}`] = () => calls.push(name);
  }
  const item = { id: 0, x: 100, y: 100, radius: 10, size: 10, active: true, alive: true };
  renderer.drawMission({}, {
    mission: game.mission, player: { ...item, invulnerable: 0 }, enemies: [item],
    decals: [item], trackMarks: [item], hazards: [item], objectiveNodes: [item], mines: [item],
    artilleryStrikes: [item], wrecks: [item], powerUps: [item], ammoPacks: [item],
    ejectedTurrets: [{ ...item, landed: true }, { ...item, landed: false }],
    projectiles: [item], particles: [item], mouse: item,
  });
  assert.deepEqual(calls, ["Decal", "TrackMark", "WallLayer", "Hazard", "ObjectiveNode", "Mine",
    "ArtilleryStrike", "Wreck", "EjectedTurret", "PowerUp", "AmmoPack", "Projectile",
    "Tank", "TankHealthBar", "Tank", "PlayerPowerUpEffects", "TankHealthBar",
    "EjectedTurret", "Particle", "Crosshair"]);
  game.destroy();
});

test("wall runs keep the terrain grid visible between individual obstacles", () => {
  for (const kind of ['rock', 'dragons-teeth', 'hedgehog']) {
    const { context, calls } = recordDrawing();
    GameRenderer.renderWallPreview(context, { x: 0, y: 0, width: 180, height: 28, kind });
    assert.ok(calls.some(c => c.name === 'fill' || c.name === 'stroke'));
    assert.ok(!calls.some(c => c.name === 'fillRect' && c.args[2] >= 180 && c.args[3] >= 28));
  }
});

test("wall cache respects display resolution, skips offscreen walls and reuses images", () => {
  const { game } = createGame();
  const transforms = [];
  globalThis.document = { createElement: () => ({ getContext: () => ({
    setTransform: (...args) => transforms.push(args), translate() {},
  }) }) };
  const renderer = game.renderer;
  renderer.dpr = 2;
  renderer.displayScale = 1.5;
  renderer.drawWall = () => {};
  const draws = [];
  const context = { drawImage: (...args) => draws.push(args) };
  const mission = { number: 'test', walls: [
    { x: 100, y: 100, width: 30, height: 40 }, { x: 1800, y: 100, width: 30, height: 40 },
  ] };
  renderer.drawWallLayer(context, mission);
  assert.equal(draws.length, 1);
  assert.equal(transforms[0][0], 3);
  assert.equal(draws[0][0].width, (30 + 36) * 3);
  renderer.drawWallLayer(context, mission);
  assert.equal(transforms.length, 2);
  assert.equal(draws[0][0], draws[1][0]);
  renderer.cameraX = 1500;
  renderer.drawWallLayer(context, mission);
  assert.notEqual(draws[2][0], draws[0][0]);
  game.destroy();
});

test("pointer conversion reuses bounds and refreshes after canvas movement", () => {
  const { game, canvas } = createGame();
  let reads = 0;
  canvas.getBoundingClientRect = () => {
    reads++;
    return { left: 100, top: 50, width: 960, height: 600 };
  };
  const before = game.renderer.clientToWorld(300, 200);
  for (let i = 0; i < 120; i++) game.renderer.clientToWorld(300, 200);
  assert.equal(reads, 0);
  game.renderer.refreshBounds();
  const after = game.renderer.clientToWorld(400, 250);
  assert.deepEqual(after, before);
  assert.equal(reads, 1);
  game.destroy();
});


test("mines and their craters use angular paths", () => {
  const { game } = createGame();
  const { context, calls } = recordDrawing();
  GameRenderer.renderMinePreview(context, { id: 1, x: 0, y: 0, radius: 9, owner: 'enemy', armTime: 0 }, 0);
  assert.ok(calls.filter(c => c.name === 'lineTo').length >= 8);
  calls.length = 0;
  GameRenderer.renderDecalPreview(context, { id: 1, kind: 'mine-crater', x: 0, y: 0, size: 30, opacity: 1, angle: 0 });
  assert.ok(calls.filter(c => c.name === 'lineTo').length >= 10);
  assert.ok(!calls.some(c => c.name === 'ellipse'));
  game.destroy();
});

test("destroyed relays leave electronic wreckage at the objective position", () => {
  const { game } = createGame();
  game.startMission(MISSIONS.findIndex(m => m.objective.kind === 'relays'));
  const node = game.objectiveNodes[0];
  node.hp = 1;
  game.tryPlayerShoot();
  Object.assign(game.projectiles[0], { x: node.x, y: node.y, previousX: node.x, previousY: node.y });
  assert.equal(game.projectileHitsObjective(game.projectiles[0]), true);
  assert.equal(node.active, false);
  const wreck = game.decals.find(d => d.kind === 'relay-wreck');
  assert.deepEqual([wreck.x, wreck.y], [node.x, node.y]);
  const { context, calls } = recordDrawing();
  GameRenderer.renderDecalPreview(context, wreck);
  assert.ok(calls.some(c => c.name === 'bezierCurveTo'));
  assert.ok(!calls.some(c => c.name === 'ellipse'));
  game.destroy();
});

test("oil and mud reuse curved paths while decal opacity continues fading", () => {
  const { game } = createGame();
  for (const kind of ['oil', 'mud']) {
    const { context, calls } = recordDrawing();
    const item = { id: 1, kind, x: 10, y: 10, size: 30, radius: 30, angle: 0, opacity: 0.5, life: 20 };
    const draw = () => kind === 'oil' ? GameRenderer.renderDecalPreview(context, item)
      : GameRenderer.renderHazardPreview(context, item, 0);
    draw();
    const first = calls.find(c => c.name === 'fill' && c.args[0] instanceof Path2D);
    assert.ok(first.args[0].calls.some(c => c[0] === 'quadraticCurveTo'));
    calls.length = 0;
    item.life = 4;
    draw();
    const next = calls.find(c => c.name === 'fill' && c.args[0] instanceof Path2D);
    assert.equal(first.args[0], next.args[0]);
    if (kind === 'oil') assert.equal(next.alpha, first.alpha / 2);
    assert.ok(!calls.some(c => c.name === 'ellipse'));
  }
  game.destroy();
});

test("barrels have circular tops and barricades grow with their collision radius", () => {
  const barrel = recordDrawing();
  GameRenderer.renderHazardPreview(barrel.context, { id: 1, kind: 'barrel', x: 0, y: 0, radius: 30 }, 0);
  assert.ok(barrel.calls.some(c => c.name === 'arc'));
  assert.ok(barrel.calls.some(c => c.name === 'fillText' && c.args[0] === '!'));
  const widths = [30, 46].map(radius => {
    const { context, calls } = recordDrawing();
    GameRenderer.renderHazardPreview(context, { id: 1, kind: 'barricade', x: 0, y: 0, radius }, 0);
    assert.ok(calls.some(c => c.name === 'fillText' && c.args[0] === 'SHOOT TO BREACH' && c.args[2] < -radius));
    return Math.max(...calls.filter(c => c.name === 'lineTo').map(c => Math.abs(c.args[0])));
  });
  assert.ok(widths[1] > widths[0]);
});

test("uplink countdown text stays above its capture zone", () => {
  const { game } = createGame();
  game.startMission(MISSIONS.findIndex(m => m.objective.kind === 'hold'));
  game.holdProgress = 7;
  const { context, calls } = recordDrawing();
  game.renderer.context = context;
  for (const method of ['drawGround', 'drawWallLayer', 'drawTank', 'drawHazard', 'drawRadar',
    'drawMine', 'drawPowerUp', 'drawAmmoPack', 'drawCrosshair', 'drawPlayerPowerUpEffects', 'drawTankHealthBar']) {
    game.renderer[method] = () => {};
  }
  const node = game.objectiveNodes[0];
  Object.assign(game.player, { x: node.x, y: node.y });
  game.frame(0);
  const label = calls.find(c => c.name === 'fillText' && c.args[0] === 'HOLD HERE  13s');
  assert.ok(label && label.args[2] < -62);
  game.destroy();
});

test("menu painting is reused until resize, a new player, or a return from gameplay", () => {
  const { game, canvas } = createGame();
  game.renderer.context = recordDrawing().context;
  for (const method of ['drawBackdrop', 'drawGround', 'drawMission', 'drawRadar']) game.renderer[method] = () => {};
  let paints = 0;
  game.renderer.drawAttractScene = () => paints++;
  game.showMenu();
  game.frame(0);
  game.frame(16);
  assert.equal(paints, 1);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 750 });
  game.renderer.refreshBounds();
  game.frame(32);
  assert.equal(paints, 2);
  game.startMission(1);
  game.showMenu();
  game.frame(48);
  assert.equal(paints, 3);
  game.setPhase('paused');
  game.frame(64);
  game.showMenu();
  game.frame(80);
  assert.equal(paints, 4);
  assert.equal(game.decals.length, 0);
  game.destroy();
});

test("victory and defeat cross-fade over the retained arena with reduced-motion support", async () => {
  const stylesheet = await readFile(
    new URL("../src/style.css", import.meta.url),
    "utf8",
  );
  assert.match(stylesheet, /\.phase-victory \.game-canvas,\s*\.phase-defeat \.game-canvas\s*\{[^}]*outcome-level-fade/s);
  assert.match(stylesheet, /\[data-screen="victory"\] \.overlay-card,\s*\.phase-defeat \[data-screen="defeat"\] \.overlay-card\s*\{[^}]*outcome-card-in/s);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});

test("mission directions appear at the bottom temporarily and honor reduced motion", async () => {
  const stylesheet = await readFile(
    new URL("../src/style.css", import.meta.url),
    "utf8",
  );
  const start = stylesheet.indexOf(".mission-tip {");
  const end = stylesheet.indexOf(".mission-tip > span", start);
  const missionTip = stylesheet.slice(start, end);
  assert.match(missionTip, /bottom:\s*96px/);
  assert.doesNotMatch(missionTip, /top:\s*91px/);
  assert.match(missionTip, /animation:\s*mission-tip-in-out/);
  assert.match(stylesheet, /@keyframes mission-tip-in-out[\s\S]*100%[\s\S]*opacity:\s*0/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*mission-tip-reduced/);
});

test("ammunition HUD is anchored below the minimap", async () => {
  const stylesheet = await readFile(
    new URL("../src/style.css", import.meta.url),
    "utf8",
  );
  const start = stylesheet.indexOf(".ammo-readout {");
  const end = stylesheet.indexOf(".ammo-readout > span", start);
  const ammoReadout = stylesheet.slice(start, end);
  assert.match(ammoReadout, /top:\s*auto/);
  assert.match(ammoReadout, /bottom:\s*108px/);
});
