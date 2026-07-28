import {
  getCameraPosition,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Mission,
  type Point,
  type Wall,
} from "./levels";
import type { GamePhase, Particle, Projectile, Tank } from "./engine";
import {
  POWER_UP_DEFINITIONS,
  type ActivePowerUps,
  type PowerUp,
} from "./powerups";

export const PLAYER_COLOR = "#9dffd7";
export const PLAYER_ACCENT = "#ffe27a";
export const ENEMY_COLOR = "#ff7c73";
export const ENEMY_ACCENT = "#ffb29d";

const TAU = Math.PI * 2;

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export interface RenderState {
  phase: GamePhase;
  mission: Mission;
  player: Tank;
  enemies: Tank[];
  projectiles: Projectile[];
  particles: Particle[];
  powerUps: PowerUp[];
  activePowerUps: ActivePowerUps;
  mouse: Point;
  attractTime: number;
}

export class GameRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private displayScale = 1;
  private displayOffsetX = 0;
  private displayOffsetY = 0;
  private dpr = 1;
  private cameraX = 0;
  private cameraY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  static renderTankPreview(
    context: CanvasRenderingContext2D,
    tank: Tank,
    color: string,
    accent: string,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawTank(context, tank, color, accent);
  }

  static renderWallPreview(context: CanvasRenderingContext2D, wall: Wall): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawWall(context, wall);
  }

  static renderProjectilePreview(
    context: CanvasRenderingContext2D,
    projectile: Projectile,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawProjectile(context, projectile);
  }

  static renderParticlePreview(context: CanvasRenderingContext2D, particle: Particle): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawParticle(context, particle);
  }

  static renderCrosshairPreview(context: CanvasRenderingContext2D, mouse: Point): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawCrosshair(context, mouse);
  }

  static renderBossArmorPreview(
    context: CanvasRenderingContext2D,
    tank: Tank,
    time: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawBossArmor(context, tank, time);
  }

  static renderPowerUpPreview(
    context: CanvasRenderingContext2D,
    powerUp: PowerUp,
    time: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawPowerUp(context, powerUp, time);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
  }

  clientToWorld(clientX: number, clientY: number, focus?: Point): Point {
    const rect = this.canvas.getBoundingClientRect();
    const camera = focus ? getCameraPosition(focus) : { x: this.cameraX, y: this.cameraY };
    return {
      x: (clientX - rect.left - this.displayOffsetX) / this.displayScale + camera.x,
      y: (clientY - rect.top - this.displayOffsetY) / this.displayScale + camera.y,
    };
  }

  render(state: RenderState): void {
    const context = this.context;
    const rect = this.canvas.getBoundingClientRect();
    const camera = state.phase === "menu" ? { x: 0, y: 0 } : getCameraPosition(state.player);
    this.cameraX = camera.x;
    this.cameraY = camera.y;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.fillStyle = "#020504";
    context.fillRect(0, 0, rect.width, rect.height);
    context.translate(this.displayOffsetX, this.displayOffsetY);
    context.scale(this.displayScale, this.displayScale);
    context.save();
    context.beginPath();
    context.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    context.clip();
    if (state.phase === "menu") {
      this.drawBackdrop(context, state.attractTime, VIEW_WIDTH, VIEW_HEIGHT);
      this.drawAttractScene(context, state);
    } else {
      context.save();
      context.translate(-camera.x, -camera.y);
      this.drawBackdrop(context, state.attractTime, WORLD_WIDTH, WORLD_HEIGHT);
      this.drawMission(context, state);
      context.restore();
      this.drawRadar(context, state.player, state.enemies, state.powerUps);
    }
    context.restore();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.displayScale = Math.min(rect.width / VIEW_WIDTH, rect.height / VIEW_HEIGHT);
    this.displayOffsetX = (rect.width - (VIEW_WIDTH * this.displayScale)) / 2;
    this.displayOffsetY = (rect.height - (VIEW_HEIGHT * this.displayScale)) / 2;
  }

  private drawBackdrop(
    context: CanvasRenderingContext2D,
    attractTime: number,
    width: number,
    height: number,
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const gradient = context.createRadialGradient(
      centerX,
      centerY - 20,
      60,
      centerX,
      centerY,
      Math.max(width, height) * 0.65,
    );
    gradient.addColorStop(0, "#0a1713");
    gradient.addColorStop(0.6, "#06100d");
    gradient.addColorStop(1, "#020605");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(140, 255, 192, 0.055)";
    context.lineWidth = 1;
    context.beginPath();
    const offset = (attractTime * 4) % 32;
    for (let x = -32 + offset; x <= width + 32; x += 32) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = -32 + offset; y <= height + 32; y += 32) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();

    context.strokeStyle = "rgba(157, 255, 215, 0.28)";
    context.lineWidth = 2;
    context.strokeRect(9, 9, width - 18, height - 18);
    context.strokeStyle = "rgba(157, 255, 215, 0.08)";
    context.strokeRect(14, 14, width - 28, height - 28);
  }

  private drawAttractScene(context: CanvasRenderingContext2D, state: RenderState): void {
    context.save();
    context.globalAlpha = 0.32;
    this.drawWall(context, { x: 555, y: 90, width: 28, height: 174, kind: "rock" });
    this.drawWall(context, { x: 555, y: 336, width: 28, height: 174, kind: "hedgehog" });
    this.drawWall(context, { x: 700, y: 260, width: 130, height: 28, kind: "dragons-teeth" });
    this.drawTank(context, {
      ...state.player,
      x: 690,
      y: 300,
      hullAngle: -0.18,
      turretAngle: -0.35 + Math.sin(state.attractTime * 0.7) * 0.25,
    }, PLAYER_COLOR, PLAYER_ACCENT);
    for (let index = 0; index < 3; index += 1) {
      const angle = state.attractTime * (0.1 + index * 0.03) + index * 2.1;
      this.drawTank(context, {
        ...state.player,
        kind: "guard",
        id: index,
        x: 720 + Math.cos(angle) * (95 + index * 16),
        y: 300 + Math.sin(angle) * (95 + index * 20),
        hullAngle: angle + Math.PI / 2,
        turretAngle: angle + Math.PI,
      }, ENEMY_COLOR, ENEMY_ACCENT);
    }
    context.restore();
  }

  private drawMission(context: CanvasRenderingContext2D, state: RenderState): void {
    for (const wall of state.mission.walls) this.drawWall(context, wall);
    for (const powerUp of state.powerUps) {
      if (powerUp.active) this.drawPowerUp(context, powerUp, state.attractTime);
    }
    for (const projectile of state.projectiles) this.drawProjectile(context, projectile);
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      this.drawTank(context, enemy, ENEMY_COLOR, enemy.kind === "boss" ? "#ffe27a" : ENEMY_ACCENT);
      if (enemy.kind === "boss") this.drawBossArmor(context, enemy, state.attractTime);
    }
    if (state.player.alive
      && !(state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 14) % 2 === 0)) {
      this.drawTank(context, state.player, PLAYER_COLOR, PLAYER_ACCENT);
      this.drawPlayerPowerUpEffects(
        context,
        state.player,
        state.activePowerUps,
        state.attractTime,
      );
    }
    for (const particle of state.particles) this.drawParticle(context, particle);
    this.drawCrosshair(context, state.mouse);
  }

  private drawPowerUp(
    context: CanvasRenderingContext2D,
    powerUp: PowerUp,
    time: number,
  ): void {
    const definition = POWER_UP_DEFINITIONS[powerUp.kind];
    const bob = Math.sin(time * 2.7 + powerUp.id * 1.4) * 1.8;
    const rotation = time * 0.65 + powerUp.id * 0.9;

    context.save();
    context.translate(powerUp.x, powerUp.y + bob);

    context.fillStyle = "rgba(0, 0, 0, 0.48)";
    context.beginPath();
    context.ellipse(2, 15, 15, 6, 0, 0, TAU);
    context.fill();

    context.save();
    context.rotate(rotation);
    context.strokeStyle = definition.color;
    context.globalAlpha = 0.55;
    context.lineWidth = 1.2;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.arc(0, 0, 18, 0, TAU);
    context.stroke();
    context.restore();

    context.fillStyle = "#06100d";
    context.strokeStyle = definition.color;
    context.lineWidth = 1.7;
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + (index / 6) * TAU;
      const x = Math.cos(angle) * 12;
      const y = Math.sin(angle) * 12;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.stroke();

    context.strokeStyle = definition.color;
    context.fillStyle = definition.color;
    context.lineWidth = 2.1;
    context.lineCap = "square";
    context.lineJoin = "miter";

    if (powerUp.kind === "speed") {
      for (const offset of [-4, 3]) {
        context.beginPath();
        context.moveTo(offset - 3, -6);
        context.lineTo(offset + 3, 0);
        context.lineTo(offset - 3, 6);
        context.stroke();
      }
    } else if (powerUp.kind === "gun") {
      context.fillRect(-7, -4, 7, 8);
      context.fillRect(0, -1.7, 9, 3.4);
      context.fillRect(-5, -7, 2.5, 2);
    } else if (powerUp.kind === "shield") {
      context.beginPath();
      context.moveTo(0, -8);
      context.lineTo(7, -5);
      context.lineTo(6, 3);
      context.quadraticCurveTo(4, 8, 0, 10);
      context.quadraticCurveTo(-4, 8, -6, 3);
      context.lineTo(-7, -5);
      context.closePath();
      context.stroke();
    } else if (powerUp.kind === "ricochet") {
      context.beginPath();
      context.arc(-1, 0, 7, -Math.PI * 0.65, Math.PI * 0.55);
      context.stroke();
      context.beginPath();
      context.moveTo(3, 7);
      context.lineTo(8, 6);
      context.lineTo(6, 1);
      context.closePath();
      context.fill();
    } else {
      context.fillRect(-2.2, -8, 4.4, 16);
      context.fillRect(-8, -2.2, 16, 4.4);
    }

    context.globalAlpha = 0.82;
    context.fillStyle = definition.color;
    context.font = "700 5.5px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(definition.shortLabel.toUpperCase(), 0, 24);
    context.restore();
  }

  private drawPlayerPowerUpEffects(
    context: CanvasRenderingContext2D,
    player: Tank,
    active: ActivePowerUps,
    time: number,
  ): void {
    const activeKinds = (["speed", "gun", "ricochet"] as const).filter(
      (kind) => active[kind] > 0,
    );

    context.save();
    context.translate(player.x, player.y);
    context.lineWidth = 1.4;
    for (const [index, kind] of activeKinds.entries()) {
      context.save();
      context.rotate(time * (0.5 + index * 0.16) * (index % 2 === 0 ? 1 : -1));
      context.strokeStyle = POWER_UP_DEFINITIONS[kind].color;
      context.globalAlpha = 0.34;
      context.setLineDash([5 + index * 2, 7]);
      context.beginPath();
      context.arc(0, 0, 24 + index * 3.5, 0, TAU);
      context.stroke();
      context.restore();
    }

    if (active.shield > 0 && active.shieldPoints > 0) {
      context.lineWidth = 2.2;
      context.strokeStyle = POWER_UP_DEFINITIONS.shield.color;
      context.shadowColor = POWER_UP_DEFINITIONS.shield.color;
      context.shadowBlur = 8;
      for (let index = 0; index < active.shieldPoints; index += 1) {
        const start = -Math.PI / 2 + (index / 3) * TAU + 0.12;
        context.beginPath();
        context.arc(0, 0, 30, start, start + TAU / 3 - 0.24);
        context.stroke();
      }
    }
    context.restore();
  }

  private drawWall(context: CanvasRenderingContext2D, wall: Wall): void {
    if (wall.kind === "rock") {
      this.drawRockWall(context, wall);
    } else if (wall.kind === "dragons-teeth") {
      this.drawDragonsTeeth(context, wall);
    } else {
      this.drawHedgehogs(context, wall);
    }
  }

  private drawRockWall(context: CanvasRenderingContext2D, wall: Wall): void {
    const rockSize = 22;
    const columns = Math.max(1, Math.ceil(wall.width / rockSize));
    const rows = Math.max(1, Math.ceil(wall.height / rockSize));
    const cellWidth = wall.width / columns;
    const cellHeight = wall.height / rows;
    const rockColors = ["#0a1310", "#101a16", "#16211c", "#1b2520"];

    context.save();
    context.lineJoin = "round";
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = wall.x * 0.17 + wall.y * 0.31 + row * 19 + column * 7;
        const centerX = wall.x + (column + 0.5) * cellWidth
          + (noise(seed) - 0.5) * Math.min(6, cellWidth * 0.3);
        const centerY = wall.y + (row + 0.5) * cellHeight
          + (noise(seed + 1) - 0.5) * Math.min(6, cellHeight * 0.3);
        const radiusX = cellWidth * (0.54 + noise(seed + 2) * 0.12);
        const radiusY = cellHeight * (0.54 + noise(seed + 3) * 0.12);
        const vertices = 6 + Math.floor(noise(seed + 4) * 4);
        const rotation = noise(seed + 5) * TAU;

        context.fillStyle = "rgba(0, 0, 0, 0.36)";
        context.beginPath();
        context.ellipse(
          centerX + radiusX * 0.16,
          centerY + radiusY * 0.25,
          radiusX * 0.92,
          radiusY * 0.72,
          rotation,
          0,
          TAU,
        );
        context.fill();

        context.fillStyle = rockColors[Math.floor(noise(seed + 6) * rockColors.length)];
        context.strokeStyle = "rgba(178, 207, 191, 0.56)";
        context.lineWidth = 0.9 + noise(seed + 7) * 0.7;
        context.beginPath();
        for (let vertex = 0; vertex < vertices; vertex += 1) {
          const angle = rotation + (vertex / vertices) * TAU;
          const irregularity = 0.72 + noise(seed + vertex + 8) * 0.38;
          const x = centerX + Math.cos(angle) * radiusX * irregularity;
          const y = centerY + Math.sin(angle) * radiusY * irregularity;
          if (vertex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
        context.stroke();

        context.strokeStyle = `rgba(157, 255, 215, ${0.08 + noise(seed + 18) * 0.13})`;
        context.lineWidth = 0.65;
        context.beginPath();
        context.moveTo(centerX - radiusX * 0.4, centerY + radiusY * 0.12);
        context.lineTo(
          centerX + (noise(seed + 19) - 0.65) * radiusX * 0.28,
          centerY - radiusY * (0.2 + noise(seed + 20) * 0.22),
        );
        context.lineTo(centerX + radiusX * 0.4, centerY - radiusY * 0.08);
        context.stroke();

        if (noise(seed + 21) > 0.45) {
          context.fillStyle = `rgba(118, 151, 105, ${0.08 + noise(seed + 22) * 0.16})`;
          context.beginPath();
          context.ellipse(
            centerX + (noise(seed + 23) - 0.5) * radiusX,
            centerY + (noise(seed + 24) - 0.5) * radiusY,
            radiusX * (0.12 + noise(seed + 25) * 0.14),
            radiusY * (0.08 + noise(seed + 26) * 0.11),
            rotation,
            0,
            TAU,
          );
          context.fill();
        }
      }
    }
    context.restore();
  }

  private drawDragonsTeeth(context: CanvasRenderingContext2D, wall: Wall): void {
    const horizontal = wall.width >= wall.height;
    const length = horizontal ? wall.width : wall.height;
    const depth = horizontal ? wall.height : wall.width;
    const columns = Math.max(1, Math.ceil(length / 28));
    const rows = depth >= 62 ? 2 : 1;
    const cellLength = length / columns;
    const cellDepth = depth / rows;

    context.save();
    context.translate(wall.x + wall.width / 2, wall.y + wall.height / 2);
    if (!horizontal) context.rotate(Math.PI / 2);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = wall.x * 0.23 + wall.y * 0.41 + row * 29 + column * 11;
        const stagger = rows > 1 && row % 2 === 1 ? cellLength * 0.18 : 0;
        const x = -length / 2 + (column + 0.5) * cellLength
          + stagger
          + (noise(seed) - 0.5) * Math.min(7, cellLength * 0.3);
        const y = -depth / 2 + (row + 0.5) * cellDepth
          + (noise(seed + 1) - 0.5) * Math.min(6, cellDepth * 0.26);
        const halfWidth = Math.min(11, cellLength * 0.38) * (0.82 + noise(seed + 2) * 0.3);
        const halfHeight = Math.min(13, cellDepth * 0.4) * (0.8 + noise(seed + 3) * 0.34);
        const rotation = (noise(seed + 4) - 0.5) * 0.34;
        const tipX = (noise(seed + 5) - 0.5) * halfWidth * 0.45;
        const tipY = -halfHeight * (0.86 + noise(seed + 6) * 0.2);

        context.save();
        context.translate(x, y);
        context.rotate(rotation);

        context.fillStyle = "rgba(0, 0, 0, 0.34)";
        context.beginPath();
        context.ellipse(3, 5, halfWidth, halfHeight * 0.58, 0, 0, TAU);
        context.fill();

        const concreteShade = 34 + Math.round(noise(seed + 7) * 12);
        context.fillStyle = `rgb(${concreteShade}, ${concreteShade + 8}, ${concreteShade + 4})`;
        context.strokeStyle = `rgba(206, 224, 214, ${0.48 + noise(seed + 8) * 0.28})`;
        context.lineWidth = 0.85 + noise(seed + 9) * 0.55;
        context.beginPath();
        context.moveTo(tipX, tipY);
        context.lineTo(halfWidth, halfHeight * (0.48 + noise(seed + 10) * 0.13));
        context.lineTo((noise(seed + 11) - 0.5) * 2, halfHeight);
        context.lineTo(-halfWidth, halfHeight * (0.48 + noise(seed + 12) * 0.13));
        context.closePath();
        context.fill();
        context.stroke();

        context.fillStyle = `rgba(10, 17, 14, ${0.52 + noise(seed + 13) * 0.24})`;
        context.beginPath();
        context.moveTo(tipX, tipY);
        context.lineTo(0, halfHeight);
        context.lineTo(-halfWidth, halfHeight * 0.55);
        context.closePath();
        context.fill();

        context.strokeStyle = `rgba(157, 255, 215, ${0.1 + noise(seed + 14) * 0.15})`;
        context.lineWidth = 0.65;
        context.beginPath();
        context.moveTo(tipX, tipY);
        context.lineTo(0, halfHeight);
        context.stroke();

        context.strokeStyle = `rgba(9, 13, 11, ${0.35 + noise(seed + 15) * 0.35})`;
        context.beginPath();
        context.moveTo(
          tipX * 0.35,
          tipY * 0.32,
        );
        context.lineTo(
          (noise(seed + 16) - 0.5) * halfWidth * 0.45,
          halfHeight * 0.08,
        );
        if (noise(seed + 17) > 0.42) {
          context.lineTo(
            (noise(seed + 18) - 0.5) * halfWidth * 0.8,
            halfHeight * 0.38,
          );
        }
        context.stroke();
        context.restore();
      }
    }
    context.restore();
  }

  private drawHedgehogs(context: CanvasRenderingContext2D, wall: Wall): void {
    const horizontal = wall.width >= wall.height;
    const length = horizontal ? wall.width : wall.height;
    const depth = horizontal ? wall.height : wall.width;
    const columns = Math.max(1, Math.ceil(length / 31));
    const rows = depth >= 65 ? 2 : 1;
    const cellLength = length / columns;
    const cellDepth = depth / rows;

    context.save();
    context.translate(wall.x + wall.width / 2, wall.y + wall.height / 2);
    if (!horizontal) context.rotate(Math.PI / 2);
    context.lineCap = "square";
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = wall.x * 0.37 + wall.y * 0.19 + row * 31 + column * 13;
        const stagger = rows > 1 && row % 2 === 1 ? cellLength * 0.16 : 0;
        const x = -length / 2 + (column + 0.5) * cellLength
          + stagger
          + (noise(seed) - 0.5) * Math.min(8, cellLength * 0.32);
        const y = -depth / 2 + (row + 0.5) * cellDepth
          + (noise(seed + 1) - 0.5) * Math.min(7, cellDepth * 0.3);
        const radius = Math.min(12, cellLength * 0.36, cellDepth * 0.42)
          * (0.82 + noise(seed + 2) * 0.34);
        const rotation = (noise(seed + 3) - 0.5) * 0.5;
        const beamLengths = [
          radius * (0.9 + noise(seed + 4) * 0.22),
          radius * (0.9 + noise(seed + 5) * 0.22),
          radius * (1.08 + noise(seed + 6) * 0.22),
        ];
        const beams = [
          [-beamLengths[0], -beamLengths[0], beamLengths[0], beamLengths[0]],
          [-beamLengths[1], beamLengths[1], beamLengths[1], -beamLengths[1]],
          [-beamLengths[2], 0, beamLengths[2], 0],
        ];

        context.save();
        context.translate(x, y);
        context.rotate(rotation);

        context.strokeStyle = "rgba(0, 0, 0, 0.72)";
        for (const [startX, startY, endX, endY] of beams) {
          context.lineWidth = 6.2 + noise(seed + 7 + startY) * 1.5;
          context.beginPath();
          context.moveTo(startX + 2.5, startY + 3);
          context.lineTo(endX + 2.5, endY + 3);
          context.stroke();
        }

        const steelShade = 112 + Math.round(noise(seed + 8) * 40);
        context.strokeStyle = `rgb(${steelShade - 10}, ${steelShade}, ${steelShade - 4})`;
        for (const [startX, startY, endX, endY] of beams) {
          context.lineWidth = 2.8 + noise(seed + 9 + endX) * 1.2;
          context.beginPath();
          context.moveTo(startX, startY);
          context.lineTo(endX, endY);
          context.stroke();
        }

        const rustBeam = Math.floor(noise(seed + 10) * beams.length);
        const [rustStartX, rustStartY, rustEndX, rustEndY] = beams[rustBeam];
        const rustStart = 0.05 + noise(seed + 11) * 0.38;
        const rustEnd = Math.min(0.95, rustStart + 0.18 + noise(seed + 12) * 0.26);
        context.strokeStyle = `rgba(151, 83, 52, ${0.38 + noise(seed + 13) * 0.38})`;
        context.lineWidth = 1.3 + noise(seed + 14) * 1.1;
        context.beginPath();
        context.moveTo(
          rustStartX + (rustEndX - rustStartX) * rustStart,
          rustStartY + (rustEndY - rustStartY) * rustStart,
        );
        context.lineTo(
          rustStartX + (rustEndX - rustStartX) * rustEnd,
          rustStartY + (rustEndY - rustStartY) * rustEnd,
        );
        context.stroke();

        context.fillStyle = "#101815";
        context.strokeStyle = `rgba(157, 255, 215, ${0.36 + noise(seed + 15) * 0.3})`;
        context.lineWidth = 0.8 + noise(seed + 16) * 0.45;
        context.beginPath();
        context.arc(0, 0, 3 + noise(seed + 17), 0, TAU);
        context.fill();
        context.stroke();
        context.restore();
      }
    }
    context.restore();
  }

  private drawTank(context: CanvasRenderingContext2D, tank: Tank, color: string, accent: string): void {
    const scale = tank.kind === "boss" ? 1.48 : 1;
    context.save();
    context.translate(tank.x, tank.y);
    context.rotate(tank.hullAngle);
    context.scale(scale, scale);
    this.drawTankHull(context, tank.kind, color, accent);
    context.restore();

    context.save();
    context.translate(tank.x, tank.y);
    context.rotate(tank.turretAngle);
    context.scale(scale, scale);
    this.drawTankTurret(context, tank.kind, color, accent);
    context.restore();
  }

  private drawTankHull(
    context: CanvasRenderingContext2D,
    kind: Tank["kind"],
    color: string,
    accent: string,
  ): void {
    const isAbrams = kind === "player";
    const isType99 = kind === "boss";
    const halfLength = isAbrams ? 17 : isType99 ? 17.5 : kind === "scout" ? 16 : 15.5;
    const trackOuterY = isAbrams || isType99 ? 15 : 14;
    const exposedTrackInnerY = trackOuterY - 2.3;
    const skirtInnerY = isAbrams || isType99 ? 8.2 : 7.7;
    const skirtOuterY = exposedTrackInnerY + 0.45;
    const hullFrontY = isAbrams ? 5.7 : isType99 ? 5.5 : 5;

    context.fillStyle = "#070806";
    for (const side of [-1, 1]) {
      const outer = trackOuterY * side;
      const inner = exposedTrackInnerY * side;
      context.beginPath();
      context.moveTo(-halfLength + 1.5, outer);
      context.lineTo(halfLength - 1.5, outer);
      context.lineTo(halfLength + 0.5, outer - side * 1.2);
      context.lineTo(halfLength + 0.5, inner);
      context.lineTo(-halfLength - 0.5, inner);
      context.lineTo(-halfLength - 0.5, outer - side * 1.2);
      context.closePath();
      context.fill();
    }

    context.fillStyle = "#202019";
    for (let x = -halfLength + 1.8; x <= halfLength - 1.5; x += 3.7) {
      for (const side of [-1, 1]) {
        const y = side < 0 ? -trackOuterY - 0.35 : exposedTrackInnerY;
        context.fillRect(x - 1.25, y, 2.5, 2.65);
      }
    }

    for (const side of [-1, 1]) {
      context.fillStyle = "#050908";
      context.beginPath();
      context.moveTo(-halfLength + 1.5, skirtOuterY * side);
      context.lineTo(halfLength - 2, skirtOuterY * side);
      context.lineTo(halfLength + 0.25, (skirtOuterY - 1.25) * side);
      context.lineTo(halfLength + 0.25, skirtInnerY * side);
      context.lineTo(-halfLength - 0.25, skirtInnerY * side);
      context.lineTo(-halfLength - 0.25, (skirtOuterY - 1.25) * side);
      context.closePath();
      context.fill();

      context.save();
      context.globalAlpha = 0.1;
      context.fillStyle = color;
      context.fill();
      context.restore();

      context.strokeStyle = color;
      context.lineWidth = 1.15;
      context.beginPath();
      context.moveTo(-halfLength - 0.25, skirtInnerY * side);
      context.lineTo(-halfLength - 0.25, (skirtOuterY - 1.25) * side);
      context.lineTo(-halfLength + 1.5, skirtOuterY * side);
      context.lineTo(halfLength - 2, skirtOuterY * side);
      context.lineTo(halfLength + 0.25, (skirtOuterY - 1.25) * side);
      context.lineTo(halfLength + 0.25, skirtInnerY * side);
      context.lineTo(halfLength, hullFrontY * side);
      context.stroke();
    }

    context.fillStyle = "#050908";
    context.strokeStyle = color;
    context.lineWidth = 1.8;
    context.beginPath();
    if (isAbrams) {
      context.moveTo(-16, -8.5);
      context.lineTo(10, -8.5);
      context.lineTo(17, -5.7);
      context.lineTo(17, 5.7);
      context.lineTo(10, 8.5);
      context.lineTo(-16, 8.5);
    } else if (isType99) {
      context.moveTo(-16.5, -9);
      context.lineTo(9, -9);
      context.lineTo(17.5, -5.5);
      context.lineTo(17.5, 5.5);
      context.lineTo(9, 9);
      context.lineTo(-16.5, 9);
    } else {
      context.moveTo(-15, -8);
      context.lineTo(9.5, -8);
      context.lineTo(15.5, -5);
      context.lineTo(15.5, 5);
      context.lineTo(9.5, 8);
      context.lineTo(-15, 8);
    }
    context.closePath();
    context.fill();
    context.stroke();

    context.lineWidth = 0.9;
    if (isAbrams) {
      context.strokeStyle = "rgba(255,255,255,0.34)";
      for (let x = -14; x <= -8; x += 3) {
        context.beginPath();
        context.moveTo(x, -8);
        context.lineTo(x, 8);
        context.stroke();
      }
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(8, -8.5);
      context.lineTo(15, 0);
      context.lineTo(8, 8.5);
      context.stroke();
      context.fillStyle = accent;
      context.fillRect(12.5, -6.5, 2, 2);
      context.fillRect(12.5, 4.5, 2, 2);
    } else if (kind === "scout") {
      context.strokeStyle = "rgba(255,255,255,0.34)";
      context.strokeRect(-14, -7.5, 6, 15);
      for (let x = -12; x <= -8; x += 2) {
        context.beginPath();
        context.moveTo(x, -7);
        context.lineTo(x, 7);
        context.stroke();
      }
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(9, -8);
      context.lineTo(14, -4);
      context.moveTo(9, 8);
      context.lineTo(14, 4);
      context.stroke();
    } else if (kind === "guard") {
      context.strokeStyle = "rgba(255,255,255,0.28)";
      context.strokeRect(-14, -7.5, 5.5, 15);
      context.beginPath();
      context.moveTo(-12, -6);
      context.lineTo(-9.5, -3);
      context.moveTo(-12, 6);
      context.lineTo(-9.5, 3);
      context.stroke();
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(8, -8);
      context.lineTo(14.5, 0);
      context.lineTo(8, 8);
      context.stroke();
    } else {
      context.strokeStyle = color;
      for (const y of [-6, -2, 2, 6]) {
        context.strokeRect(8.5, y - 1.2, 5, 2.4);
      }
      context.strokeStyle = "rgba(255,255,255,0.32)";
      for (let x = -14; x <= -9; x += 2.5) {
        context.beginPath();
        context.moveTo(x, -7.5);
        context.lineTo(x, 7.5);
        context.stroke();
      }
      if (isType99) {
        context.fillStyle = accent;
        context.fillRect(12, -7.5, 2, 2);
        context.fillRect(12, 5.5, 2, 2);
      }
    }
  }

  private drawTankTurret(
    context: CanvasRenderingContext2D,
    kind: Tank["kind"],
    color: string,
    accent: string,
  ): void {
    const isAbrams = kind === "player";
    const isType99 = kind === "boss";
    const barrelLength = isAbrams ? 29 : isType99 ? 30 : kind === "sniper" ? 29 : 25;
    const barrelWidth = isType99 ? 2.4 : 2;

    context.lineCap = "butt";
    context.strokeStyle = "#020504";
    context.lineWidth = barrelWidth + 2.4;
    context.beginPath();
    context.moveTo(5, 0);
    context.lineTo(barrelLength, 0);
    context.stroke();
    context.strokeStyle = "#ffffff";
    context.lineWidth = barrelWidth;
    context.beginPath();
    context.moveTo(5, 0);
    context.lineTo(barrelLength, 0);
    context.stroke();
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(barrelLength - 11, -1.7, 4.5, 3.4);

    context.fillStyle = "#050908";
    context.strokeStyle = color;
    context.lineWidth = 1.8;
    context.beginPath();
    if (isAbrams) {
      context.moveTo(-13.5, -8.5);
      context.lineTo(2.5, -8.5);
      context.lineTo(11.5, -4.5);
      context.lineTo(11.5, 4.5);
      context.lineTo(2.5, 8.5);
      context.lineTo(-13.5, 8.5);
      context.lineTo(-15, 5.5);
      context.lineTo(-15, -5.5);
    } else if (kind === "guard") {
      context.ellipse(-0.5, 0, 10.5, 8.5, 0, 0, TAU);
    } else if (kind === "scout") {
      context.moveTo(-9.5, -6);
      context.quadraticCurveTo(-7, -9, -1, -9);
      context.quadraticCurveTo(7, -8, 11, -3.5);
      context.lineTo(11, 3.5);
      context.quadraticCurveTo(7, 8, -1, 9);
      context.quadraticCurveTo(-7, 9, -9.5, 6);
      context.closePath();
    } else if (kind === "sniper") {
      context.moveTo(-10, -7);
      context.quadraticCurveTo(-6, -9, -1, -9);
      context.lineTo(9.5, -5.5);
      context.lineTo(12, -3);
      context.lineTo(12, 3);
      context.lineTo(9.5, 5.5);
      context.lineTo(-1, 9);
      context.quadraticCurveTo(-6, 9, -10, 7);
      context.closePath();
    } else {
      context.moveTo(-13.5, -8.5);
      context.lineTo(1, -9.5);
      context.lineTo(12.5, -5);
      context.lineTo(12.5, 5);
      context.lineTo(1, 9.5);
      context.lineTo(-13.5, 8.5);
      context.lineTo(-15.5, 5);
      context.lineTo(-15.5, -5);
    }
    context.closePath();
    context.fill();
    context.stroke();

    context.lineWidth = 0.9;
    if (isAbrams) {
      context.strokeStyle = "rgba(255,255,255,0.34)";
      context.strokeRect(-13, -6.5, 5, 13);
      context.beginPath();
      context.moveTo(-10.5, -6);
      context.lineTo(-10.5, 6);
      context.stroke();
      context.strokeStyle = color;
      context.strokeRect(-3, -5.5, 6.5, 4);
      context.beginPath();
      context.arc(-2, 4.2, 2.4, 0, TAU);
      context.stroke();
      context.fillStyle = accent;
      context.fillRect(5.5, -5, 2.5, 2.5);
    } else if (kind === "guard") {
      context.strokeStyle = "rgba(255,255,255,0.34)";
      context.beginPath();
      context.arc(-3.5, -2.7, 2.5, 0, TAU);
      context.arc(-2.5, 3.5, 2.2, 0, TAU);
      context.stroke();
      context.strokeStyle = color;
      for (const y of [-5.5, -2.7, 2.7, 5.5]) {
        context.beginPath();
        context.moveTo(5, y);
        context.lineTo(9, y * 0.72);
        context.stroke();
      }
      context.fillStyle = accent;
      context.beginPath();
      context.arc(2, 0, 1.8, 0, TAU);
      context.fill();
    } else if (kind === "scout") {
      context.strokeStyle = color;
      for (const y of [-5.6, -3, 3, 5.6]) {
        context.beginPath();
        context.moveTo(4, y);
        context.lineTo(9, y * 0.6);
        context.stroke();
      }
      context.strokeStyle = "rgba(255,255,255,0.34)";
      context.beginPath();
      context.arc(-3, 0, 3, 0, TAU);
      context.stroke();
      context.fillStyle = accent;
      context.fillRect(1, -1.5, 3, 3);
    } else if (kind === "sniper") {
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(1, -7.5);
      context.lineTo(9, -4.5);
      context.moveTo(1, 7.5);
      context.lineTo(9, 4.5);
      context.stroke();
      context.fillStyle = accent;
      context.fillRect(6.5, -5.2, 2.8, 2.8);
      context.fillRect(6.5, 2.4, 2.8, 2.8);
      context.strokeStyle = "rgba(255,255,255,0.38)";
      context.beginPath();
      context.arc(-4, 0, 2.8, 0, TAU);
      context.stroke();
    } else {
      context.strokeStyle = color;
      for (const y of [-6.5, -3.2, 3.2, 6.5]) {
        context.beginPath();
        context.moveTo(2, y);
        context.lineTo(10, y * 0.66);
        context.stroke();
      }
      context.strokeStyle = "rgba(255,255,255,0.34)";
      context.strokeRect(-13, -6.5, 5.5, 13);
      context.beginPath();
      context.arc(-2, 2.8, 2.5, 0, TAU);
      context.stroke();
      context.fillStyle = accent;
      context.fillRect(1.5, -5, 3.4, 3.4);
      context.fillRect(7, 2, 2.5, 2.5);
    }
  }

  private drawBossArmor(
    context: CanvasRenderingContext2D,
    tank: Tank,
    attractTime: number,
  ): void {
    context.save();
    context.translate(tank.x, tank.y);
    context.rotate(attractTime * 0.55);
    context.strokeStyle = "rgba(255, 226, 122, 0.64)";
    context.lineWidth = 2;
    context.setLineDash([8, 8]);
    context.beginPath();
    context.arc(0, 0, 41, 0, TAU);
    context.stroke();
    context.restore();
  }

  private drawProjectile(context: CanvasRenderingContext2D, projectile: Projectile): void {
    context.save();
    context.globalCompositeOperation = "lighter";
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY);
    const trail = 14;
    context.strokeStyle = projectile.color;
    context.globalAlpha = 0.28;
    context.lineWidth = projectile.radius * 2.4;
    context.beginPath();
    context.moveTo(
      projectile.x - (projectile.velocityX / speed) * trail,
      projectile.y - (projectile.velocityY / speed) * trail,
    );
    context.lineTo(projectile.x, projectile.y);
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = projectile.color;
    context.beginPath();
    context.arc(projectile.x, projectile.y, projectile.radius, 0, TAU);
    context.fill();
    context.fillStyle = "#fffbe2";
    context.beginPath();
    context.arc(projectile.x, projectile.y, projectile.radius * 0.42, 0, TAU);
    context.fill();
    context.restore();
  }

  private drawParticle(context: CanvasRenderingContext2D, particle: Particle): void {
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    context.fillStyle = particle.color;
    context.translate(particle.x, particle.y);
    context.rotate(Math.atan2(particle.velocityY, particle.velocityX));
    context.fillRect(-particle.size, -particle.size * 0.45, particle.size * 2.6, particle.size * 0.9);
    context.restore();
  }

  private drawCrosshair(context: CanvasRenderingContext2D, mouse: Point): void {
    if (mouse.x < 0 || mouse.x > WORLD_WIDTH || mouse.y < 0 || mouse.y > WORLD_HEIGHT) return;
    context.save();
    context.translate(mouse.x, mouse.y);
    context.strokeStyle = "rgba(255, 255, 255, 0.82)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(0, 0, 7, 0, TAU);
    context.moveTo(-13, 0);
    context.lineTo(-7, 0);
    context.moveTo(7, 0);
    context.lineTo(13, 0);
    context.moveTo(0, -13);
    context.lineTo(0, -7);
    context.moveTo(0, 7);
    context.lineTo(0, 13);
    context.stroke();
    context.restore();
  }

  private drawRadar(
    context: CanvasRenderingContext2D,
    player: Tank,
    enemies: Tank[],
    powerUps: PowerUp[],
  ): void {
    context.save();
    context.translate(875, 72);
    context.fillStyle = "rgba(3, 8, 6, 0.78)";
    context.strokeStyle = "rgba(157, 255, 215, 0.24)";
    context.lineWidth = 1;
    context.fillRect(-54, -40, 108, 80);
    context.strokeRect(-54, -40, 108, 80);
    context.fillStyle = PLAYER_COLOR;
    context.fillRect(
      -50 + (player.x / WORLD_WIDTH) * 100 - 2,
      -36 + (player.y / WORLD_HEIGHT) * 72 - 2,
      4,
      4,
    );
    context.fillStyle = ENEMY_COLOR;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      context.fillRect(
        -50 + (enemy.x / WORLD_WIDTH) * 100 - 1.5,
        -36 + (enemy.y / WORLD_HEIGHT) * 72 - 1.5,
        enemy.kind === "boss" ? 5 : 3,
        enemy.kind === "boss" ? 5 : 3,
      );
    }
    for (const powerUp of powerUps) {
      if (!powerUp.active) continue;
      context.fillStyle = POWER_UP_DEFINITIONS[powerUp.kind].color;
      context.fillRect(
        -50 + (powerUp.x / WORLD_WIDTH) * 100 - 1,
        -36 + (powerUp.y / WORLD_HEIGHT) * 72 - 1,
        2,
        2,
      );
    }
    context.restore();
  }
}
