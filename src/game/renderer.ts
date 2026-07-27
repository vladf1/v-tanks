import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Mission,
  type Point,
  type Wall,
} from "./levels";
import type { GamePhase, Particle, Projectile, Tank } from "./engine";

export const PLAYER_COLOR = "#9dffd7";
export const PLAYER_ACCENT = "#ffe27a";
export const ENEMY_COLOR = "#ff7c73";
export const ENEMY_ACCENT = "#ffb29d";

const TAU = Math.PI * 2;

export interface RenderState {
  phase: GamePhase;
  mission: Mission;
  player: Tank;
  enemies: Tank[];
  projectiles: Projectile[];
  particles: Particle[];
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

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
  }

  clientToWorld(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.displayOffsetX) / this.displayScale,
      y: (clientY - rect.top - this.displayOffsetY) / this.displayScale,
    };
  }

  render(state: RenderState): void {
    const context = this.context;
    const rect = this.canvas.getBoundingClientRect();
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.fillStyle = "#020504";
    context.fillRect(0, 0, rect.width, rect.height);
    context.translate(this.displayOffsetX, this.displayOffsetY);
    context.scale(this.displayScale, this.displayScale);
    context.save();
    context.beginPath();
    context.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.clip();
    this.drawBackdrop(context, state.attractTime);
    if (state.phase === "menu") this.drawAttractScene(context, state);
    else this.drawMission(context, state);
    context.restore();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.displayScale = Math.min(rect.width / WORLD_WIDTH, rect.height / WORLD_HEIGHT);
    this.displayOffsetX = (rect.width - (WORLD_WIDTH * this.displayScale)) / 2;
    this.displayOffsetY = (rect.height - (WORLD_HEIGHT * this.displayScale)) / 2;
  }

  private drawBackdrop(context: CanvasRenderingContext2D, attractTime: number): void {
    const gradient = context.createRadialGradient(480, 280, 60, 480, 300, 620);
    gradient.addColorStop(0, "#0a1713");
    gradient.addColorStop(0.6, "#06100d");
    gradient.addColorStop(1, "#020605");
    context.fillStyle = gradient;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    context.strokeStyle = "rgba(140, 255, 192, 0.055)";
    context.lineWidth = 1;
    context.beginPath();
    const offset = (attractTime * 4) % 32;
    for (let x = -32 + offset; x <= WORLD_WIDTH + 32; x += 32) {
      context.moveTo(x, 0);
      context.lineTo(x, WORLD_HEIGHT);
    }
    for (let y = -32 + offset; y <= WORLD_HEIGHT + 32; y += 32) {
      context.moveTo(0, y);
      context.lineTo(WORLD_WIDTH, y);
    }
    context.stroke();

    context.strokeStyle = "rgba(157, 255, 215, 0.28)";
    context.lineWidth = 2;
    context.strokeRect(9, 9, WORLD_WIDTH - 18, WORLD_HEIGHT - 18);
    context.strokeStyle = "rgba(157, 255, 215, 0.08)";
    context.strokeRect(14, 14, WORLD_WIDTH - 28, WORLD_HEIGHT - 28);
  }

  private drawAttractScene(context: CanvasRenderingContext2D, state: RenderState): void {
    context.save();
    context.globalAlpha = 0.32;
    this.drawWall(context, { x: 555, y: 90, width: 28, height: 174 });
    this.drawWall(context, { x: 555, y: 336, width: 28, height: 174 });
    this.drawWall(context, { x: 700, y: 260, width: 130, height: 28 });
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
    for (const projectile of state.projectiles) this.drawProjectile(context, projectile);
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      this.drawTank(context, enemy, ENEMY_COLOR, enemy.kind === "boss" ? "#ffe27a" : ENEMY_ACCENT);
      if (enemy.kind === "boss") this.drawBossArmor(context, enemy, state.attractTime);
    }
    if (state.player.alive
      && !(state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 14) % 2 === 0)) {
      this.drawTank(context, state.player, PLAYER_COLOR, PLAYER_ACCENT);
    }
    for (const particle of state.particles) this.drawParticle(context, particle);
    this.drawCrosshair(context, state.mouse);
    this.drawRadar(context, state.player, state.enemies);
  }

  private drawWall(context: CanvasRenderingContext2D, wall: Wall): void {
    context.save();
    context.fillStyle = "rgba(7, 17, 14, 0.98)";
    context.strokeStyle = "rgba(157, 255, 215, 0.52)";
    context.lineWidth = 1.5;
    context.fillRect(wall.x, wall.y, wall.width, wall.height);
    context.strokeRect(wall.x + 0.75, wall.y + 0.75, wall.width - 1.5, wall.height - 1.5);
    context.strokeStyle = "rgba(157, 255, 215, 0.1)";
    context.beginPath();
    const diagonalSpan = wall.height + wall.width;
    for (let offset = -wall.height; offset < wall.width; offset += 18) {
      context.moveTo(wall.x + offset, wall.y + wall.height);
      context.lineTo(wall.x + offset + diagonalSpan, wall.y);
    }
    context.beginPath();
    context.rect(wall.x, wall.y, wall.width, wall.height);
    context.clip();
    context.stroke();
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
    const trackY = isAbrams || isType99 ? 14 : 13;

    context.fillStyle = "#020504";
    context.strokeStyle = "rgba(255,255,255,0.58)";
    context.lineWidth = 1.15;
    for (const side of [-1, 1]) {
      const outer = trackY * side;
      const inner = (trackY - 4) * side;
      context.beginPath();
      context.moveTo(-halfLength + 2, outer);
      context.lineTo(halfLength - 2, outer);
      context.lineTo(halfLength, outer - side * 2);
      context.lineTo(halfLength, inner + side);
      context.lineTo(-halfLength, inner + side);
      context.lineTo(-halfLength, outer - side * 2);
      context.closePath();
      context.fill();
      context.stroke();
    }

    context.strokeStyle = "rgba(157,255,215,0.24)";
    context.lineWidth = 0.8;
    for (let x = -12; x <= 12; x += 6) {
      context.beginPath();
      context.moveTo(x, -trackY);
      context.lineTo(x, -trackY + 4);
      context.moveTo(x, trackY - 4);
      context.lineTo(x, trackY);
      context.stroke();
    }

    context.fillStyle = "#050908";
    context.strokeStyle = color;
    context.lineWidth = 1.8;
    context.beginPath();
    if (isAbrams) {
      context.moveTo(-16, -10);
      context.lineTo(10, -10);
      context.lineTo(17, -6.5);
      context.lineTo(17, 6.5);
      context.lineTo(10, 10);
      context.lineTo(-16, 10);
    } else if (isType99) {
      context.moveTo(-16.5, -10.5);
      context.lineTo(9, -10.5);
      context.lineTo(17.5, -5.5);
      context.lineTo(17.5, 5.5);
      context.lineTo(9, 10.5);
      context.lineTo(-16.5, 10.5);
    } else {
      context.moveTo(-15, -9.5);
      context.lineTo(9.5, -9.5);
      context.lineTo(15.5, -5.5);
      context.lineTo(15.5, 5.5);
      context.lineTo(9.5, 9.5);
      context.lineTo(-15, 9.5);
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
    context.restore();
  }
}
