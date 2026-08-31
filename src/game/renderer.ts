import {
  getCameraPosition,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Mission,
  type Point,
  type Wall,
} from "./levels.ts";
import type {
  ArtilleryStrike,
  GamePhase,
  HazardState,
  ObjectiveNode,
  Particle,
  Projectile,
  ProximityMine,
  Tank,
  TrackMark,
} from "./engine.ts";
import {
  AMMO_DEFINITIONS,
  type AmmoPack,
} from "./ammunition.ts";
import {
  POWER_UP_DEFINITIONS,
  type ActivePowerUps,
  type PowerUp,
} from "./powerups.ts";
import {
  GROUND_OVERSCAN,
  VISUAL_THEMES,
  calculateRecoilOffset,
  generateEnvironmentalDetails,
  generateGroundTileTexture,
  getEjectedTurretOpacity,
  getWreckOpacity,
  type Decal,
  type EjectedTurret,
  type VisualTheme,
  type Wreck,
} from "./visual-state.ts";

export const PLAYER_COLOR = "#9dffd7";
export const PLAYER_ACCENT = "#ffe27a";
export const ENEMY_COLOR = "#ff7c73";
export const ENEMY_ACCENT = "#ffb29d";

const TAU = Math.PI * 2;
const WRECK_COLOR = "#4a514d";
const WRECK_ACCENT = "#232826";

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function getTankRoleAccent(kind: Tank["kind"], accent: string): string {
  return kind === "heavy"
    ? "#ffb45f"
    : kind === "minelayer" ? "#f06dff"
      : kind === "support" ? "#7bdcff"
        : kind === "artillery" ? "#ffe27a" : accent;
}

function traceOilBlob(
  context: CanvasRenderingContext2D,
  decal: Decal,
  salt: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  pointCount = 13,
): void {
  const seed = decal.id * 37 + Math.round(decal.x) * 3 + Math.round(decal.y) * 5 + salt;
  const points = Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * TAU;
    const radius = 0.68 + noise(seed + index * 17) * 0.44;
    const lobe = index % 4 === 0 ? 1.12 + noise(seed + index * 23) * 0.18 : 1;
    return {
      x: centerX + Math.cos(angle) * radiusX * radius * lobe,
      y: centerY + Math.sin(angle) * radiusY * radius * lobe,
    };
  });
  const first = points[0];
  const last = points.at(-1) ?? first;
  context.beginPath();
  context.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    context.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) * 0.5,
      (point.y + next.y) * 0.5,
    );
  });
  context.closePath();
}

export interface RenderState {
  phase: GamePhase;
  mission: Mission;
  player: Tank;
  enemies: Tank[];
  projectiles: Projectile[];
  particles: Particle[];
  powerUps: PowerUp[];
  ammoPacks: AmmoPack[];
  activePowerUps: ActivePowerUps;
  objectiveNodes: ObjectiveNode[];
  uplinkSecondsRemaining: number | null;
  hazards: HazardState[];
  mines: ProximityMine[];
  artilleryStrikes: ArtilleryStrike[];
  trackMarks: TrackMark[];
  decals: Decal[];
  wrecks: Wreck[];
  ejectedTurrets: EjectedTurret[];
  theme: VisualTheme;
  shake: number;
  mouse: Point;
  attractTime: number;
}

export class GameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private displayScale = 1;
  private displayOffsetX = 0;
  private displayOffsetY = 0;
  private dpr = 1;
  private cameraX = 0;
  private cameraY = 0;
  private activeTheme: VisualTheme = VISUAL_THEMES["proving-ground"];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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

  static renderAmmoPackPreview(
    context: CanvasRenderingContext2D,
    ammoPack: AmmoPack,
    time: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawAmmoPack(context, ammoPack, time);
  }

  static renderHazardPreview(
    context: CanvasRenderingContext2D,
    hazard: HazardState,
    time: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawHazard(context, hazard, time);
  }

  static renderObjectivePreview(
    context: CanvasRenderingContext2D,
    node: ObjectiveNode,
    time: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawObjectiveNode(context, node, time, node.kind === "uplink" ? 20 : null);
  }

  static renderMinePreview(
    context: CanvasRenderingContext2D,
    mine: ProximityMine,
    time: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawMine(context, mine, time);
  }

  static renderArtilleryPreview(
    context: CanvasRenderingContext2D,
    strike: ArtilleryStrike,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawArtilleryStrike(context, strike);
  }

  static renderEffectPreview(context: CanvasRenderingContext2D, particle: Particle): void {
    GameRenderer.renderParticlePreview(context, particle);
  }

  static renderThemePreview(
    context: CanvasRenderingContext2D,
    mission: Mission,
    width: number,
    height: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.activeTheme = VISUAL_THEMES[mission.visualTheme];
    renderer.drawGround(context, mission, width, height);
    for (const decal of generateEnvironmentalDetails(mission).slice(0, 18)) {
      renderer.drawDecal(context, {
        ...decal,
        x: (decal.x / WORLD_WIDTH) * width,
        y: (decal.y / WORLD_HEIGHT) * height,
        size: Math.max(3, decal.size * 0.32),
        opacity: Math.max(0.28, decal.opacity),
      });
    }
  }

  static renderDecalPreview(
    context: CanvasRenderingContext2D,
    decal: Decal,
    theme: VisualTheme = VISUAL_THEMES["proving-ground"],
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.activeTheme = theme;
    renderer.drawDecal(context, decal);
  }

  static renderWreckPreview(
    context: CanvasRenderingContext2D,
    wreck: Wreck,
    theme: VisualTheme = VISUAL_THEMES["proving-ground"],
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.activeTheme = theme;
    renderer.drawWreck(context, wreck);
  }

  static renderEjectedTurretPreview(
    context: CanvasRenderingContext2D,
    turret: EjectedTurret,
    theme: VisualTheme = VISUAL_THEMES["proving-ground"],
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.activeTheme = theme;
    renderer.drawEjectedTurret(context, turret);
  }

  static renderDamageStatePreview(
    context: CanvasRenderingContext2D,
    tank: Tank,
    color: string,
    accent: string,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawTank(context, tank, color, accent);
    renderer.drawTankHealthBar(context, tank, color);
  }

  static renderMinimapPreview(
    context: CanvasRenderingContext2D,
    mission: Mission,
    width: number,
    height: number,
    alpha = 1,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawMinimap(context, mission, width, height, alpha);
  }

  static renderMissionIconsPreview(
    context: CanvasRenderingContext2D,
    mission: Mission,
    width: number,
    height: number,
  ): void {
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    renderer.drawMissionIcons(context, mission, width, height);
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
      this.activeTheme = state.theme;
      context.save();
      const shakeX = state.shake > 0 ? Math.sin(state.attractTime * 83) * state.shake : 0;
      const shakeY = state.shake > 0 ? Math.cos(state.attractTime * 71) * state.shake : 0;
      context.translate(-camera.x + shakeX, -camera.y + shakeY);
      this.drawGround(
        context,
        state.mission,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        GROUND_OVERSCAN,
      );
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
    _attractTime: number,
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
    for (let x = 0; x <= width; x += 32) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += 32) {
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

  private drawGround(
    context: CanvasRenderingContext2D,
    mission: Mission,
    width: number,
    height: number,
    overscan = 0,
  ): void {
    const theme = VISUAL_THEMES[mission.visualTheme];
    this.activeTheme = theme;
    const minX = -overscan;
    const minY = -overscan;
    const maxX = width + overscan;
    const maxY = height + overscan;
    const gradient = context.createLinearGradient(minX, minY, maxX, maxY);
    gradient.addColorStop(0, theme.ground[0]);
    gradient.addColorStop(0.55, theme.ground[1]);
    gradient.addColorStop(1, theme.ground[2]);
    context.fillStyle = gradient;
    context.fillRect(minX, minY, maxX - minX, maxY - minY);

    const tileSize = 64;
    const minTileX = Math.floor(minX / tileSize);
    const minTileY = Math.floor(minY / tileSize);
    const maxTileX = Math.ceil(maxX / tileSize);
    const maxTileY = Math.ceil(maxY / tileSize);
    for (let tileY = minTileY; tileY < maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX < maxTileX; tileX += 1) {
        for (const sample of generateGroundTileTexture(mission.number, tileX, tileY)) {
          context.globalAlpha = sample.alpha;
          context.fillStyle = sample.dark ? theme.texture[1] : theme.texture[0];
          context.beginPath();
          context.arc(
            (tileX + sample.x) * tileSize,
            (tileY + sample.y) * tileSize,
            sample.radius,
            0,
            TAU,
          );
          context.fill();
        }
      }
    }
    context.globalAlpha = 1;

    context.strokeStyle = theme.gridColor;
    context.globalAlpha = theme.gridOpacity;
    context.lineWidth = 1;
    context.beginPath();
    const gridSize = 32;
    const minGridX = Math.floor(minX / gridSize) * gridSize;
    const minGridY = Math.floor(minY / gridSize) * gridSize;
    for (let x = minGridX; x <= maxX; x += gridSize) {
      context.moveTo(x, minY);
      context.lineTo(x, maxY);
    }
    for (let y = minGridY; y <= maxY; y += gridSize) {
      context.moveTo(minX, y);
      context.lineTo(maxX, y);
    }
    context.stroke();
    context.globalAlpha = 1;

    context.strokeStyle = "rgba(157, 255, 215, 0.22)";
    context.lineWidth = 2;
    context.strokeRect(9, 9, width - 18, height - 18);
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
      turretAngle: -0.35,
    }, PLAYER_COLOR, PLAYER_ACCENT);
    for (let index = 0; index < 3; index += 1) {
      const angle = index * 2.1;
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
    for (const decal of state.decals) this.drawDecal(context, decal);
    for (const mark of state.trackMarks) this.drawTrackMark(context, mark);
    for (const wall of state.mission.walls) this.drawWall(context, wall);
    for (const hazard of state.hazards) {
      if (hazard.active) this.drawHazard(context, hazard, state.attractTime);
    }
    for (const node of state.objectiveNodes) {
      if (node.active) {
        this.drawObjectiveNode(
          context,
          node,
          state.attractTime,
          node.kind === "uplink" ? state.uplinkSecondsRemaining : null,
        );
      }
    }
    for (const mine of state.mines) this.drawMine(context, mine, state.attractTime);
    for (const strike of state.artilleryStrikes) this.drawArtilleryStrike(context, strike);
    for (const wreck of state.wrecks) this.drawWreck(context, wreck);
    for (const turret of state.ejectedTurrets) {
      if (turret.landed) this.drawEjectedTurret(context, turret);
    }
    for (const powerUp of state.powerUps) {
      if (powerUp.active) this.drawPowerUp(context, powerUp, state.attractTime);
    }
    for (const ammoPack of state.ammoPacks) {
      if (ammoPack.active) this.drawAmmoPack(context, ammoPack, state.attractTime);
    }
    for (const projectile of state.projectiles) this.drawProjectile(context, projectile);
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      this.drawTank(context, enemy, ENEMY_COLOR, enemy.kind === "boss" ? "#ffe27a" : ENEMY_ACCENT);
      if (enemy.kind === "boss") this.drawBossArmor(context, enemy, state.attractTime);
      this.drawTankHealthBar(context, enemy, ENEMY_COLOR);
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
      this.drawTankHealthBar(context, state.player, PLAYER_COLOR);
    }
    for (const turret of state.ejectedTurrets) {
      if (!turret.landed) this.drawEjectedTurret(context, turret);
    }
    for (const particle of state.particles) this.drawParticle(context, particle);
    this.drawCrosshair(context, state.mouse);
  }

  private drawDecal(context: CanvasRenderingContext2D, decal: Decal): void {
    context.save();
    context.translate(decal.x, decal.y);
    context.rotate(decal.angle);
    const fade = decal.life === undefined ? 1 : getWreckOpacity(decal.life);
    context.globalAlpha = decal.opacity * fade;
    context.fillStyle = decal.color;
    context.strokeStyle = decal.color;
    if (decal.kind === "oil") {
      traceOilBlob(context, decal, 11, 0, 0, decal.size, decal.size * 0.72);
      context.fill();

      context.globalAlpha *= 0.58;
      context.fillStyle = "#020403";
      traceOilBlob(
        context,
        decal,
        97,
        decal.size * 0.08,
        -decal.size * 0.03,
        decal.size * 0.62,
        decal.size * 0.4,
        11,
      );
      context.fill();

      context.globalAlpha *= 0.72;
      context.fillStyle = decal.color;
      const dropletSeed = decal.id * 31 + Math.round(decal.x + decal.y);
      for (let index = 0; index < 4; index += 1) {
        const angle = noise(dropletSeed + index * 19) * TAU;
        const distance = decal.size * (0.9 + noise(dropletSeed + index * 29) * 0.52);
        const radius = decal.size * (0.07 + noise(dropletSeed + index * 41) * 0.09);
        traceOilBlob(
          context,
          decal,
          211 + index * 43,
          Math.cos(angle) * distance,
          Math.sin(angle) * distance * 0.72,
          radius,
          radius * (0.72 + noise(dropletSeed + index * 47) * 0.38),
          7,
        );
        context.fill();
      }
    } else if (decal.kind === "scorch") {
      context.beginPath();
      context.ellipse(0, 0, decal.size, decal.size * 0.58, 0.1, 0, TAU);
      context.fill();
      context.globalAlpha *= 0.55;
      context.fillStyle = "#030504";
      context.beginPath();
      context.ellipse(decal.size * 0.12, 0, decal.size * 0.56, decal.size * 0.3, -0.2, 0, TAU);
      context.fill();
    } else if (decal.kind === "crater" || decal.kind === "mine-crater") {
      context.lineWidth = Math.max(1.4, decal.size * 0.12);
      context.beginPath();
      context.ellipse(0, 0, decal.size, decal.size * 0.7, 0, 0, TAU);
      context.stroke();
      context.globalAlpha *= 0.48;
      context.fillStyle = "#030504";
      context.beginPath();
      context.ellipse(0, 2, decal.size * 0.72, decal.size * 0.45, 0, 0, TAU);
      context.fill();
    } else if (decal.kind === "wall-chip" || decal.kind === "casings") {
      context.lineWidth = decal.kind === "casings" ? 1.6 : 2.2;
      for (let index = 0; index < (decal.kind === "casings" ? 5 : 3); index += 1) {
        const offset = (index - 2) * 3;
        context.beginPath();
        context.moveTo(-decal.size * 0.45, offset);
        context.lineTo(decal.size * 0.45, offset + (index % 2 ? 2 : -2));
        context.stroke();
      }
    } else if (decal.kind === "rubble") {
      for (let index = 0; index < 7; index += 1) {
        const angle = index * 2.1;
        context.fillRect(
          Math.cos(angle) * decal.size * 0.42 - 2,
          Math.sin(angle) * decal.size * 0.3 - 2,
          3 + index % 4,
          3 + (index + 2) % 4,
        );
      }
    } else if (decal.kind === "grate") {
      context.lineWidth = 1.2;
      context.strokeRect(-decal.size * 0.6, -decal.size * 0.32, decal.size * 1.2, decal.size * 0.64);
      for (let x = -0.4; x <= 0.4; x += 0.2) {
        context.beginPath();
        context.moveTo(x * decal.size, -decal.size * 0.28);
        context.lineTo(x * decal.size, decal.size * 0.28);
        context.stroke();
      }
    } else if (decal.kind === "warning") {
      context.lineWidth = Math.max(2, decal.size * 0.16);
      for (let index = -2; index <= 2; index += 1) {
        context.beginPath();
        context.moveTo(index * decal.size * 0.28 - 5, -decal.size * 0.36);
        context.lineTo(index * decal.size * 0.28 + 5, decal.size * 0.36);
        context.stroke();
      }
    } else if (decal.kind === "cable") {
      context.lineWidth = 2.4;
      context.beginPath();
      context.moveTo(-decal.size, 0);
      context.bezierCurveTo(
        -decal.size * 0.35,
        -decal.size * 0.55,
        decal.size * 0.32,
        decal.size * 0.55,
        decal.size,
        0,
      );
      context.stroke();
    }
    context.restore();
  }

  private drawWreck(context: CanvasRenderingContext2D, wreck: Wreck): void {
    const tank: Tank = {
      id: wreck.id,
      kind: wreck.kind,
      x: wreck.x,
      y: wreck.y,
      radius: wreck.kind === "boss" ? 25 : 15,
      hullAngle: wreck.hullAngle,
      turretAngle: wreck.turretAngle + 0.12,
      hp: 0,
      maxHp: 1,
      cooldown: 0,
      dashCooldown: 0,
      invulnerable: 0,
      alive: false,
      patrolAngle: 0,
      strafeDirection: 1,
      trackCooldown: 0,
      recoil: 0,
      recoilTime: 0,
      recoilDuration: 0,
      chassisKick: 0,
      damageFlash: 0,
      lastHitDirection: 0,
      smokeIntensity: 0,
      smokeCooldown: 0,
      ultraAggressive: false,
      stunned: 0,
    };
    context.save();
    const fade = getWreckOpacity(wreck.life);
    context.globalAlpha = 0.58 * fade;
    if (wreck.faction === "enemy") {
      context.translate(wreck.x, wreck.y);
      context.rotate(wreck.hullAngle);
      context.scale(wreck.scale, wreck.scale);
      this.drawTankHull(context, tank.kind, WRECK_COLOR, WRECK_ACCENT);
    } else {
      this.drawTank(context, tank, WRECK_COLOR, WRECK_ACCENT);
    }
    context.restore();

    context.save();
    context.globalAlpha = 0.52 * fade;
    context.fillStyle = "#050706";
    context.beginPath();
    context.ellipse(wreck.x, wreck.y, 17 * wreck.scale, 10 * wreck.scale, wreck.hullAngle, 0, TAU);
    context.fill();
    context.restore();
  }

  private drawEjectedTurret(
    context: CanvasRenderingContext2D,
    turret: EjectedTurret,
  ): void {
    const fade = turret.landed ? getEjectedTurretOpacity(turret.life) : 1;
    const height = Math.max(0, turret.height);
    const airScale = 1 + Math.min(0.16, height * 0.0035);
    const sink = turret.landed ? 1 - fade : 0;
    const shadowStrength = this.activeTheme?.shadowStrength ?? 0.34;

    context.save();
    context.globalAlpha *= fade * shadowStrength * (turret.landed ? 0.74 : 0.92);
    context.fillStyle = "#000000";
    context.beginPath();
    context.ellipse(
      turret.x + 4 + height * 0.08,
      turret.y + 5 + height * 0.12,
      13 * turret.scale * (1 + height * 0.002),
      8 * turret.scale * (1 + height * 0.001),
      turret.angle,
      0,
      TAU,
    );
    context.fill();
    context.restore();

    context.save();
    context.globalAlpha *= fade;
    context.translate(turret.x, turret.y - height * 0.52 + sink * 3);
    context.rotate(turret.angle);
    context.scale(turret.scale * airScale, turret.scale * airScale * (1 - sink * 0.22));
    const color = turret.landed ? WRECK_COLOR : "#75514c";
    const accent = turret.landed
      ? WRECK_ACCENT
      : getTankRoleAccent(turret.kind, "#40312e");
    this.drawTankTurret(
      context,
      turret.kind,
      color,
      accent,
    );
    context.restore();
  }

  private drawTrackMark(context: CanvasRenderingContext2D, mark: TrackMark): void {
    context.save();
    context.translate(mark.x, mark.y);
    context.rotate(mark.angle);
    context.globalAlpha = Math.min(0.3, (mark.life / mark.maxLife) * 0.3);
    context.strokeStyle = mark.color;
    context.lineWidth = mark.width;
    context.setLineDash([2, 2]);
    context.beginPath();
    context.moveTo(-5, 0);
    context.lineTo(5, 0);
    context.stroke();
    context.restore();
  }

  private drawHazard(
    context: CanvasRenderingContext2D,
    hazard: HazardState,
    _time: number,
  ): void {
    context.save();
    context.translate(hazard.x, hazard.y);
    if (hazard.kind !== "mud" && hazard.kind !== "minefield") {
      context.save();
      context.translate(3, 4);
      context.globalAlpha = (this.activeTheme?.shadowStrength ?? 0.34) * 0.72;
      context.fillStyle = "#000000";
      context.beginPath();
      context.ellipse(0, 0, hazard.radius * 0.9, hazard.radius * 0.58, 0, 0, TAU);
      context.fill();
      context.restore();
    }
    if (hazard.kind === "mud") {
      context.fillStyle = "rgba(92, 70, 42, 0.32)";
      context.strokeStyle = "rgba(177, 139, 82, 0.38)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.ellipse(0, 0, hazard.radius, hazard.radius * 0.72, 0.2, 0, TAU);
      context.fill();
      context.stroke();
      for (let index = 0; index < 7; index += 1) {
        const angle = index * 2.3;
        context.fillStyle = "rgba(25, 20, 13, 0.28)";
        context.beginPath();
        context.arc(Math.cos(angle) * 30, Math.sin(angle) * 21, 4 + index % 3, 0, TAU);
        context.fill();
      }
    } else if (hazard.kind === "barrel") {
      context.fillStyle = "#39100d";
      context.strokeStyle = "#ff9b66";
      context.lineWidth = 1.5;
      context.fillRect(-10, -14, 20, 28);
      context.strokeRect(-10, -14, 20, 28);
      context.fillStyle = "#ff9b66";
      context.fillRect(-10, -8, 20, 3);
      context.fillRect(-10, 6, 20, 3);
      context.font = "bold 10px monospace";
      context.textAlign = "center";
      context.fillText("!", 0, 3);
    } else if (hazard.kind === "minefield") {
      for (let index = 0; index < 5; index += 1) {
        const angle = index * TAU / 5 + hazard.id * 0.73;
        const distance = index === 0 ? 0 : 23 + (index % 2) * 6;
        context.fillStyle = "#32100e";
        context.strokeStyle = ENEMY_COLOR;
        context.beginPath();
        context.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 6, 0, TAU);
        context.fill();
        context.stroke();
      }
    } else if (hazard.kind === "repair-station") {
      context.fillStyle = "#09251b";
      context.strokeStyle = POWER_UP_DEFINITIONS.repair.color;
      context.lineWidth = 1.5;
      context.fillRect(-18, -18, 36, 36);
      context.strokeRect(-18, -18, 36, 36);
      context.fillStyle = POWER_UP_DEFINITIONS.repair.color;
      context.fillRect(-3, -11, 6, 22);
      context.fillRect(-11, -3, 22, 6);
    } else if (hazard.kind === "barricade") {
      const barrierAngle = (hazard.id % 4) * Math.PI / 4 + Math.PI / 8;
      context.save();
      context.rotate(barrierAngle);
      context.fillStyle = "#080b09";
      context.fillRect(-22, -13, 9, 26);
      context.fillRect(13, -13, 9, 26);
      context.fillStyle = "#4d5550";
      context.strokeStyle = "#d5ded8";
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(-23, -10);
      context.lineTo(23, -10);
      context.lineTo(19, 10);
      context.lineTo(-19, 10);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = "#69716c";
      context.beginPath();
      context.moveTo(-20, -8);
      context.lineTo(20, -8);
      context.lineTo(17, -2);
      context.lineTo(-17, -2);
      context.closePath();
      context.fill();
      context.strokeStyle = "#ffb45f";
      context.lineWidth = 3;
      for (let x = -14; x <= 14; x += 9) {
        context.beginPath();
        context.moveTo(x - 4, 7);
        context.lineTo(x + 3, -7);
        context.stroke();
      }
      context.fillStyle = "#1b211d";
      for (const x of [-15, 15]) {
        context.beginPath();
        context.arc(x, 0, 2, 0, TAU);
        context.fill();
      }
      context.restore();
      context.strokeStyle = "rgba(255, 180, 95, 0.82)";
      context.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(side * 25, -10);
        context.lineTo(side * 25, -18);
        context.lineTo(side * 17, -18);
        context.stroke();
      }
      context.fillStyle = "#ffcf87";
      context.font = "bold 7px monospace";
      context.textAlign = "center";
      context.fillText("SHOOT TO BREACH", 0, -23);
    }
    context.restore();
  }

  private drawObjectiveNode(
    context: CanvasRenderingContext2D,
    node: ObjectiveNode,
    time: number,
    secondsRemaining: number | null = null,
  ): void {
    context.save();
    context.translate(node.x, node.y);
    const color = node.kind === "extract" ? PLAYER_COLOR : node.kind === "uplink" ? "#ffe27a" : "#7bdcff";
    context.strokeStyle = color;
    context.fillStyle = "rgba(4, 14, 12, 0.88)";
    context.lineWidth = 2;
    context.setLineDash(node.kind === "relay" ? [] : [8, 6]);
    context.beginPath();
    context.arc(0, 0, node.kind === "relay" ? 22 : 62, 0, TAU);
    context.fill();
    context.stroke();
    context.setLineDash([]);
    if (node.kind === "relay") {
      const pulse = 0.5 + Math.sin(time * 3 + node.id) * 0.5;
      context.globalAlpha = 0.38 + pulse * 0.3;
      context.setLineDash([3, 4]);
      context.beginPath();
      context.arc(0, 0, 27 + pulse * 3, 0, TAU);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;

      context.fillStyle = "#071411";
      context.strokeStyle = color;
      context.lineWidth = 1.6;
      context.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = Math.PI / 8 + index * Math.PI / 4;
        const x = Math.cos(angle) * 18;
        const y = Math.sin(angle) * 18;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = "#122b25";
      context.fillRect(-10, -10, 20, 20);
      context.strokeRect(-10, -10, 20, 20);

      context.save();
      context.rotate(time * 0.7 + node.id * 0.9);
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(2, 0);
      context.lineTo(17, -8);
      context.lineTo(17, 8);
      context.closePath();
      context.fill();
      context.fillStyle = "#d9fff2";
      context.beginPath();
      context.arc(0, 0, 4, 0, TAU);
      context.fill();
      context.restore();

      context.strokeStyle = "rgba(123, 220, 255, 0.88)";
      context.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(side * 25, -14);
        context.lineTo(side * 25, -22);
        context.lineTo(side * 16, -22);
        context.stroke();
      }
      context.fillStyle = "#bdefff";
      context.font = "bold 7px monospace";
      context.textAlign = "center";
      context.fillText("DESTROY RELAY", 0, -28);
      const pipWidth = 7;
      const pipGap = 2;
      const pipStart = -((node.maxHp * pipWidth + (node.maxHp - 1) * pipGap) / 2);
      for (let index = 0; index < node.maxHp; index += 1) {
        context.fillStyle = index < node.hp ? color : "rgba(123, 220, 255, 0.16)";
        context.fillRect(pipStart + index * (pipWidth + pipGap), 26, pipWidth, 3);
      }
    } else {
      context.globalAlpha = 0.25 + Math.sin(time * 3) * 0.08;
      context.fillStyle = color;
      context.beginPath();
      context.arc(0, 0, 48, 0, TAU);
      context.fill();
      if (node.kind === "uplink") {
        context.globalAlpha = 1;
        context.fillStyle = "#fff4bf";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "800 9px monospace";
        context.fillText("HOLD HERE", 0, -8);
        context.font = "800 18px monospace";
        context.fillText(`${secondsRemaining ?? 20}s`, 0, 12);
      }
    }
    context.restore();
  }

  private drawMine(
    context: CanvasRenderingContext2D,
    mine: ProximityMine,
    time: number,
  ): void {
    context.save();
    context.translate(mine.x, mine.y);
    const color = mine.owner === "player" ? PLAYER_COLOR : ENEMY_COLOR;
    context.fillStyle = "#080b09";
    context.strokeStyle = color;
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(0, 0, mine.radius, 0, TAU);
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.globalAlpha = mine.armTime <= 0 ? 0.6 + Math.sin(time * 8) * 0.35 : 0.3;
    context.beginPath();
    context.arc(0, 0, 3, 0, TAU);
    context.fill();
    context.restore();
  }

  private drawArtilleryStrike(
    context: CanvasRenderingContext2D,
    strike: ArtilleryStrike,
  ): void {
    const progress = Math.max(0, 1 - strike.delay / 1.35);
    context.save();
    context.translate(strike.x, strike.y);
    context.strokeStyle = ENEMY_COLOR;
    context.fillStyle = `rgba(255, 124, 115, ${0.06 + progress * 0.14})`;
    context.lineWidth = 1.5 + progress * 2;
    context.setLineDash([7, 5]);
    context.beginPath();
    context.arc(0, 0, strike.radius, 0, TAU);
    context.fill();
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(-12, 0);
    context.lineTo(12, 0);
    context.moveTo(0, -12);
    context.lineTo(0, 12);
    context.stroke();
    context.restore();
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

  private drawAmmoPack(
    context: CanvasRenderingContext2D,
    pack: AmmoPack,
    time: number,
  ): void {
    const definition = AMMO_DEFINITIONS[pack.kind];
    const bob = Math.sin(time * 2.2 + pack.id * 1.7) * 1.4;
    context.save();
    context.translate(pack.x, pack.y + bob);
    context.fillStyle = "rgba(0, 0, 0, 0.48)";
    context.beginPath();
    context.ellipse(3, 15, 18, 6, 0, 0, TAU);
    context.fill();
    context.fillStyle = "#07100d";
    context.strokeStyle = definition.color;
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(-15, -10);
    context.lineTo(12, -10);
    context.lineTo(16, -5);
    context.lineTo(16, 10);
    context.lineTo(-15, 10);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = definition.color;
    context.fillRect(-11, -4, 22, 3);
    for (let index = 0; index < 3; index += 1) {
      context.beginPath();
      context.moveTo(-9 + index * 9, 7);
      context.lineTo(-6 + index * 9, 1);
      context.lineTo(-3 + index * 9, 7);
      context.closePath();
      context.fill();
    }
    context.fillStyle = definition.color;
    context.font = "800 6.5px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${definition.shortLabel} +${definition.packSize}`, 0, 20);
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

        context.strokeStyle = "rgba(0, 0, 0, 0.26)";
        for (const [startX, startY, endX, endY] of beams) {
          context.lineWidth = 4.2 + noise(seed + 7 + startY) * 0.8;
          context.beginPath();
          context.moveTo(startX + 1.5, startY + 2);
          context.lineTo(endX + 1.5, endY + 2);
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
    const scale = tank.kind === "boss"
      ? 1.48
      : tank.kind === "heavy" || tank.playerClass === "bulwark" ? 1.18
        : tank.playerClass === "raptor" ? 0.94 : 1;
    const shadowStrength = this.activeTheme?.shadowStrength ?? 0.34;
    const chassisKick = tank.chassisKick ?? 0;
    const tankX = tank.x - Math.cos(tank.turretAngle) * chassisKick;
    const tankY = tank.y - Math.sin(tank.turretAngle) * chassisKick;
    const recoilOffset = calculateRecoilOffset(
      tank.recoil ?? 0,
      tank.recoilTime ?? 0,
      tank.recoilDuration ?? 0,
    );
    const roleAccent = getTankRoleAccent(tank.kind, accent);
    const inheritedAlpha = context.globalAlpha;

    context.save();
    context.globalAlpha = inheritedAlpha * shadowStrength;
    context.fillStyle = "#000000";
    context.translate(tankX + 4.5, tankY + 5.5);
    context.rotate(tank.hullAngle);
    context.scale(scale, scale);
    context.beginPath();
    context.roundRect(-18, -14, 36, 28, 7);
    context.fill();
    context.restore();

    context.save();
    context.globalAlpha = inheritedAlpha * shadowStrength * 0.82;
    context.strokeStyle = "#000000";
    context.fillStyle = "#000000";
    context.lineWidth = 5 * scale;
    context.translate(tankX + 5, tankY + 6);
    context.rotate(tank.turretAngle);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo((tank.kind === "artillery" ? 34 : 28) * scale, 0);
    context.stroke();
    context.beginPath();
    context.ellipse(0, 0, 13 * scale, 10 * scale, 0, 0, TAU);
    context.fill();
    context.restore();

    context.save();
    context.translate(tankX, tankY);
    context.rotate(tank.hullAngle);
    context.scale(scale, scale);
    this.drawTankHull(context, tank.kind, color, roleAccent);
    context.restore();

    context.save();
    context.translate(tankX, tankY);
    context.rotate(tank.turretAngle);
    context.translate(-recoilOffset, 0);
    context.scale(scale, scale);
    this.drawTankTurret(context, tank.kind, color, roleAccent);
    context.restore();

    if (tank.kind === "player" && tank.playerClass) {
      context.save();
      context.translate(tankX, tankY);
      context.rotate(tank.hullAngle);
      context.strokeStyle = PLAYER_ACCENT;
      context.fillStyle = PLAYER_ACCENT;
      context.lineWidth = 1.5;
      if (tank.playerClass === "raptor") {
        for (const offset of [-4, 3]) {
          context.beginPath();
          context.moveTo(-7, offset - 2);
          context.lineTo(-2, offset);
          context.lineTo(-7, offset + 2);
          context.stroke();
        }
      } else if (tank.playerClass === "bulwark") {
        context.strokeRect(-10, -6, 6, 12);
        context.fillRect(-8.5, -4.5, 3, 9);
      } else if (tank.playerClass === "sapper") {
        context.beginPath();
        context.arc(-7, 0, 3.2, 0, TAU);
        context.stroke();
        context.fillRect(-8, -1, 2, 2);
      } else {
        context.beginPath();
        context.moveTo(-10, -5);
        context.lineTo(-5, 0);
        context.lineTo(-10, 5);
        context.stroke();
      }
      context.restore();
    }

    if ((tank.damageFlash ?? 0) > 0) {
      const relativeDirection = (tank.lastHitDirection ?? 0);
      context.save();
      context.translate(tankX, tankY);
      context.rotate(relativeDirection);
      context.globalAlpha = Math.min(1, tank.damageFlash / 0.12);
      context.strokeStyle = "#fff4cf";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, tank.radius * 1.16, -0.62, 0.62);
      context.stroke();
      context.restore();
    }
  }

  private drawTankHealthBar(
    context: CanvasRenderingContext2D,
    tank: Tank,
    color: string,
  ): void {
    const width = tank.kind === "boss" ? 54 : 38;
    const y = tank.y - (tank.kind === "boss" ? 48 : tank.playerClass === "bulwark" ? 40 : 36);
    const ratio = Math.max(0, Math.min(1, tank.hp / Math.max(1, tank.maxHp)));
    context.save();
    context.fillStyle = "rgba(1, 5, 4, 0.9)";
    context.strokeStyle = "rgba(230, 255, 244, 0.46)";
    context.lineWidth = 1;
    context.fillRect(tank.x - width / 2 - 1, y - 1, width + 2, 7);
    context.strokeRect(tank.x - width / 2 - 1, y - 1, width + 2, 7);
    context.fillStyle = ratio <= 0.3 ? "#ff7c73" : ratio <= 0.6 ? "#ffe27a" : color;
    context.fillRect(tank.x - width / 2, y, width * ratio, 5);
    if (tank.stunned > 0) {
      context.fillStyle = "#9eeaff";
      context.font = "800 9px monospace";
      context.textAlign = "center";
      context.fillText("⚡", tank.x, y - 4);
    }
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
    const halfLength = isAbrams
      ? 17
      : isType99 ? 17.5
        : kind === "heavy" ? 17 : kind === "scout" ? 16 : 15.5;
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
      context.globalAlpha *= 0.1;
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
    const barrelLength = isAbrams
      ? 29
      : isType99 ? 30
        : kind === "artillery" ? 34
          : kind === "heavy" ? 28 : kind === "sniper" ? 29 : 25;
    const barrelWidth = isType99 || kind === "heavy" || kind === "artillery" ? 2.4 : 2;

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

    if (kind === "heavy") {
      context.strokeStyle = accent;
      context.lineWidth = 2.2;
      context.strokeRect(-12, -7, 5, 14);
      context.strokeRect(4, -6, 5, 12);
    } else if (kind === "minelayer") {
      context.fillStyle = accent;
      for (const y of [-5, 0, 5]) {
        context.beginPath();
        context.arc(-7, y, 1.8, 0, TAU);
        context.fill();
      }
    } else if (kind === "support") {
      context.fillStyle = accent;
      context.fillRect(-6, -1, 6, 2);
      context.fillRect(-4, -3, 2, 6);
    } else if (kind === "artillery") {
      context.strokeStyle = accent;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(-4, 0, 4.5, 0, TAU);
      context.moveTo(-10, 0);
      context.lineTo(2, 0);
      context.moveTo(-4, -6);
      context.lineTo(-4, 6);
      context.stroke();
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
    const kind = projectile.kind ?? "basic";
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY);
    const angle = speed > 0.001
      ? Math.atan2(projectile.velocityY, projectile.velocityX)
      : 0;
    const shellLength = (Math.max(10, projectile.radius * 3.2) + (projectile.damage > 1 ? 4 : 0))
      * (kind === "piercing" ? 1.55 : kind === "explosive" ? 0.9 : 1);
    const shellWidth = (Math.max(3.4, projectile.radius * 1.2) + (projectile.damage > 1 ? 1 : 0))
      * (kind === "piercing" ? 0.55 : kind === "explosive" ? 1.42 : 1);
    const trail = shellLength * 1.7;
    context.translate(projectile.x, projectile.y);
    context.rotate(angle);
    context.globalCompositeOperation = "lighter";
    context.strokeStyle = projectile.color;
    context.globalAlpha = 0.2;
    context.lineWidth = shellWidth * 1.5;
    context.beginPath();
    context.moveTo(-trail, 0);
    context.lineTo(-shellLength * 0.25, 0);
    context.stroke();
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = "rgba(2, 5, 4, 0.92)";
    context.lineWidth = 1.2;
    context.globalAlpha = 1;
    context.fillStyle = projectile.color;
    context.beginPath();
    context.moveTo(shellLength * (kind === "piercing" ? 0.78 : 0.56), 0);
    context.lineTo(shellLength * 0.16, -shellWidth * 0.5);
    context.lineTo(-shellLength * 0.5, -shellWidth * 0.34);
    context.lineTo(-shellLength * 0.5, shellWidth * 0.34);
    context.lineTo(shellLength * 0.16, shellWidth * 0.5);
    context.closePath();
    context.fill();
    context.stroke();
    if (kind === "explosive") {
      context.fillStyle = "#3a1309";
      context.fillRect(-shellLength * 0.2, -shellWidth * 0.46, shellLength * 0.25, shellWidth * 0.92);
    }
    if (kind === "emp") {
      context.strokeStyle = "rgba(158, 234, 255, 0.92)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(0, 0, shellWidth * 1.4, 0, TAU);
      context.stroke();
    }
    context.fillStyle = "rgba(255, 255, 235, 0.92)";
    context.beginPath();
    context.moveTo(shellLength * (kind === "piercing" ? 0.78 : 0.56), 0);
    context.lineTo(shellLength * 0.18, -shellWidth * 0.22);
    context.lineTo(shellLength * 0.18, shellWidth * 0.22);
    context.closePath();
    context.fill();
    context.fillStyle = "rgba(5, 9, 7, 0.72)";
    context.fillRect(-shellLength * 0.48, -shellWidth * 0.44, 2, shellWidth * 0.88);
    context.restore();
  }

  private drawParticle(context: CanvasRenderingContext2D, particle: Particle): void {
    context.save();
    const life = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    context.globalAlpha = life;
    context.translate(particle.x, particle.y);
    if (particle.kind === "smoke" || particle.kind === "dust") {
      context.globalAlpha = life * (particle.kind === "smoke" ? 0.42 : 0.3);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(0, 0, particle.size, 0, TAU);
      context.fill();
      context.globalAlpha *= 0.45;
      context.beginPath();
      context.arc(-particle.size * 0.35, particle.size * 0.18, particle.size * 0.7, 0, TAU);
      context.fill();
    } else if (particle.kind === "ring") {
      context.globalAlpha = life * 0.68;
      context.strokeStyle = particle.color;
      context.lineWidth = Math.max(1, life * 3);
      context.beginPath();
      context.arc(0, 0, particle.size, 0, TAU);
      context.stroke();
    } else if (particle.kind === "flash") {
      context.globalCompositeOperation = "lighter";
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, particle.size);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.22, particle.color);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, particle.size, 0, TAU);
      context.fill();
      if (particle.color.toLowerCase() === "#7bdcff") {
        context.globalAlpha = life * 0.9;
        context.strokeStyle = particle.color;
        context.lineWidth = 2;
        context.rotate(particle.angle);
        context.beginPath();
        context.arc(0, 0, particle.size * 0.9, -0.95, 0.95);
        context.stroke();
      }
    } else {
      context.fillStyle = particle.color;
      context.rotate(particle.angle || Math.atan2(particle.velocityY, particle.velocityX));
      if (particle.kind === "debris") {
        context.fillRect(
          -particle.size * 0.8,
          -particle.size * 0.55,
          particle.size * 1.6,
          particle.size * 1.1,
        );
      } else {
        context.fillRect(
          -particle.size,
          -particle.size * 0.42,
          particle.size * 3.2,
          particle.size * 0.84,
        );
      }
    }
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

  private drawMinimap(
    context: CanvasRenderingContext2D,
    mission: Mission,
    width: number,
    height: number,
    alpha: number,
  ): void {
    const theme = VISUAL_THEMES[mission.visualTheme];
    const scaleX = width / WORLD_WIDTH;
    const scaleY = height / WORLD_HEIGHT;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = theme.ground[1];
    context.fillRect(0, 0, width, height);
    context.strokeStyle = theme.gridColor;
    context.globalAlpha = alpha * theme.gridOpacity * 2.4;
    context.lineWidth = 0.7;
    context.beginPath();
    for (let x = 0; x <= width; x += width / 8) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += height / 5) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();

    context.globalAlpha = alpha * 0.74;
    context.fillStyle = "#87968e";
    for (const wall of mission.walls) {
      context.fillRect(
        wall.x * scaleX,
        wall.y * scaleY,
        Math.max(1, wall.width * scaleX),
        Math.max(1, wall.height * scaleY),
      );
    }
    context.fillStyle = PLAYER_COLOR;
    context.beginPath();
    context.arc(mission.player.x * scaleX, mission.player.y * scaleY, 2.4, 0, TAU);
    context.fill();
    context.fillStyle = ENEMY_COLOR;
    for (const enemy of mission.enemies) {
      context.fillRect(enemy.x * scaleX - 1, enemy.y * scaleY - 1, 2, 2);
    }
    context.strokeStyle = "#ffe27a";
    context.lineWidth = 1.2;
    for (const point of mission.objective.positions) {
      context.beginPath();
      context.arc(point.x * scaleX, point.y * scaleY, 3.4, 0, TAU);
      context.stroke();
    }
    context.fillStyle = "#ffb45f";
    for (const hazard of mission.hazards) {
      context.beginPath();
      context.arc(hazard.x * scaleX, hazard.y * scaleY, 1.5, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  private drawMissionIcons(
    context: CanvasRenderingContext2D,
    mission: Mission,
    width: number,
    height: number,
  ): void {
    context.save();
    context.clearRect(0, 0, width, height);
    context.translate(5, height / 2);
    context.strokeStyle = "#ffe27a";
    context.fillStyle = "#ffe27a";
    context.lineWidth = 1.2;
    if (mission.objective.kind === "eliminate") {
      context.beginPath();
      context.arc(7, 0, 5, 0, TAU);
      context.moveTo(7, -8);
      context.lineTo(7, 8);
      context.moveTo(-1, 0);
      context.lineTo(15, 0);
      context.stroke();
    } else if (mission.objective.kind === "relays") {
      context.strokeRect(2, -5, 10, 10);
      context.beginPath();
      context.moveTo(7, -5);
      context.lineTo(7, -10);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(7, 0, 6, 0, TAU);
      context.stroke();
      context.fillRect(5, -2, 4, 4);
    }

    const specialists = [...new Set(
      mission.enemies
        .map((enemy) => enemy.kind)
        .filter((kind) => kind !== "scout" && kind !== "guard"),
    )].slice(0, 3);
    specialists.forEach((kind, index) => {
      const x = 27 + index * 15;
      context.save();
      context.translate(x, 0);
      context.strokeStyle = kind === "boss" ? "#ffe27a" : ENEMY_ACCENT;
      context.fillStyle = "rgba(255,124,115,0.28)";
      context.beginPath();
      context.moveTo(-5, 5);
      context.lineTo(-6, -3);
      context.lineTo(0, -6);
      context.lineTo(6, -3);
      context.lineTo(5, 5);
      context.closePath();
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(kind === "artillery" || kind === "sniper" ? 9 : 7, 0);
      context.stroke();
      context.restore();
    });
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
