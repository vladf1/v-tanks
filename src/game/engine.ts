import {
  BOSS_TANK_RADIUS,
  findMissionSpawnOverlaps,
  MISSIONS,
  STANDARD_TANK_RADIUS,
  TANK_WALL_PADDING,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type EnemyKind,
  type Point,
  type Wall,
} from "./levels";

export type GamePhase = "menu" | "playing" | "paused" | "victory" | "defeat";

export interface GameSnapshot {
  phase: GamePhase;
  missionIndex: number;
  health: number;
  enemiesLeft: number;
  elapsed: number;
  shots: number;
  hits: number;
  dashReady: number;
  bossHealth: number | null;
}

interface Tank extends Point {
  id: number;
  kind: EnemyKind | "player";
  radius: number;
  hullAngle: number;
  turretAngle: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  dashCooldown: number;
  invulnerable: number;
  alive: boolean;
  patrolAngle: number;
  strafeDirection: number;
}

interface Projectile extends Point {
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  owner: "player" | "enemy";
  life: number;
  bounces: number;
  damage: number;
  radius: number;
  color: string;
}

interface Particle extends Point {
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const PLAYER_SPEED = 184;
const TANK_GUTTER = 24;
const TAU = Math.PI * 2;
const PLAYER_COLOR = "#9dffd7";
const PLAYER_ACCENT = "#ffe27a";
const ENEMY_COLOR = "#ff7c73";
const ENEMY_ACCENT = "#ffb29d";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return (dx * dx) + (dy * dy);
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= TAU;
  while (result < -Math.PI) result += TAU;
  return result;
}

function turnTowards(current: number, target: number, amount: number): number {
  const difference = normalizeAngle(target - current);
  return current + clamp(difference, -amount, amount);
}

function seededDirection(id: number): number {
  return id % 2 === 0 ? 1 : -1;
}

function pointInExpandedWall(point: Point, wall: Wall, expansion: number): boolean {
  return point.x >= wall.x - expansion
    && point.x <= wall.x + wall.width + expansion
    && point.y >= wall.y - expansion
    && point.y <= wall.y + wall.height + expansion;
}

function segmentIntersectsWall(from: Point, to: Point, wall: Wall, padding = 0): boolean {
  const left = wall.x - padding;
  const right = wall.x + wall.width + padding;
  const top = wall.y - padding;
  const bottom = wall.y + wall.height + padding;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let near = 0;
  let far = 1;

  for (const [start, delta, min, max] of [
    [from.x, dx, left, right],
    [from.y, dy, top, bottom],
  ] as const) {
    if (Math.abs(delta) < 0.0001) {
      if (start < min || start > max) return false;
      continue;
    }
    const first = (min - start) / delta;
    const second = (max - start) / delta;
    const entry = Math.min(first, second);
    const exit = Math.max(first, second);
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return false;
  }
  return true;
}

function hasLineOfSight(from: Point, to: Point, walls: Wall[]): boolean {
  return !walls.some((wall) => segmentIntersectsWall(from, to, wall, 3));
}

function segmentDistanceSquared(from: Point, to: Point, point: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared === 0) return distanceSquared(from, point);
  const amount = clamp(
    (((point.x - from.x) * dx) + ((point.y - from.y) * dy)) / lengthSquared,
    0,
    1,
  );
  return distanceSquared(
    { x: from.x + (dx * amount), y: from.y + (dy * amount) },
    point,
  );
}

class SynthAudio {
  private context: AudioContext | null = null;
  enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  tone(frequency: number, duration: number, gain: number, type: OscillatorType): void {
    const context = this.getContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(45, frequency * 0.55),
      context.currentTime + duration,
    );
    envelope.gain.setValueAtTime(gain, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  shoot(playerOwned: boolean): void {
    this.tone(playerOwned ? 240 : 150, playerOwned ? 0.075 : 0.1, 0.035, "square");
  }

  impact(): void {
    this.tone(105, 0.16, 0.045, "sawtooth");
  }

  dash(): void {
    this.tone(420, 0.12, 0.025, "triangle");
  }
}

export class TankGame {
  private readonly context: CanvasRenderingContext2D;
  private readonly keys = new Set<string>();
  private readonly audio = new SynthAudio();
  private readonly onSnapshot: (snapshot: GameSnapshot) => void;
  private readonly onPhase: (phase: GamePhase) => void;
  private animationFrame = 0;
  private previousFrame = 0;
  private displayScale = 1;
  private displayOffsetX = 0;
  private displayOffsetY = 0;
  private dpr = 1;
  private mission = MISSIONS[0];
  private missionIndex = 0;
  private phase: GamePhase = "menu";
  private player: Tank = this.createPlayer(this.mission.player);
  private enemies: Tank[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private mouse = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  private elapsed = 0;
  private shots = 0;
  private hits = 0;
  private clearTimer = 0;
  private snapshotTimer = 0;
  private attractTime = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onSnapshot: (snapshot: GameSnapshot) => void,
    onPhase: (phase: GamePhase) => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.onSnapshot = onSnapshot;
    this.onPhase = onPhase;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.bindEvents();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.unbindEvents();
  }

  setSound(enabled: boolean): void {
    this.audio.setEnabled(enabled);
  }

  showMenu(): void {
    this.phase = "menu";
    this.onPhase(this.phase);
    this.publishSnapshot();
  }

  startMission(index: number): void {
    this.missionIndex = clamp(index, 0, MISSIONS.length - 1);
    this.mission = MISSIONS[this.missionIndex];
    const spawnOverlaps = findMissionSpawnOverlaps(this.mission);
    if (spawnOverlaps.length > 0) {
      const first = spawnOverlaps[0];
      throw new Error(
        `Mission ${this.mission.number} ${first.unit} overlaps wall ${first.wallIndex + 1}.`,
      );
    }
    this.player = this.createPlayer(this.mission.player);
    this.enemies = this.mission.enemies.map((spawn, id) => {
      const maxHp = spawn.kind === "boss" ? 7 : 1;
      return {
        id,
        kind: spawn.kind,
        x: spawn.x,
        y: spawn.y,
        radius: spawn.kind === "boss" ? BOSS_TANK_RADIUS : STANDARD_TANK_RADIUS,
        hullAngle: Math.PI,
        turretAngle: Math.PI,
        hp: maxHp,
        maxHp,
        cooldown: 0.7 + (id * 0.16),
        dashCooldown: 0,
        invulnerable: 0,
        alive: true,
        patrolAngle: (id * 1.73) % TAU,
        strafeDirection: seededDirection(id),
      };
    });
    this.projectiles = [];
    this.particles = [];
    this.elapsed = 0;
    this.shots = 0;
    this.hits = 0;
    this.clearTimer = 0;
    this.phase = "playing";
    this.onPhase(this.phase);
    this.publishSnapshot();
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.onPhase(this.phase);
    this.publishSnapshot();
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.previousFrame = performance.now();
    this.onPhase(this.phase);
    this.publishSnapshot();
  }

  private createPlayer(position: Point): Tank {
    return {
      id: -1,
      kind: "player",
      x: position.x,
      y: position.y,
      radius: STANDARD_TANK_RADIUS,
      hullAngle: 0,
      turretAngle: 0,
      hp: 3,
      maxHp: 3,
      cooldown: 0,
      dashCooldown: 0,
      invulnerable: 0,
      alive: true,
      patrolAngle: 0,
      strafeDirection: 1,
    };
  }

  private readonly frame = (timestamp: number): void => {
    const rawDelta = this.previousFrame === 0 ? 0 : (timestamp - this.previousFrame) / 1000;
    this.previousFrame = timestamp;
    const delta = Math.min(rawDelta, 0.05);
    this.attractTime += delta;

    if (this.phase === "playing") {
      const steps = Math.max(1, Math.ceil(delta / (1 / 120)));
      const step = delta / steps;
      for (let index = 0; index < steps; index += 1) this.update(step);
    } else {
      this.updateParticles(delta);
    }

    this.draw();
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private bindEvents(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
      this.keys.add(key);
    }
    if (key === "escape") {
      if (this.phase === "playing") this.pause();
      else if (this.phase === "paused") this.resume();
    }
    if (key === "r" && ["playing", "paused", "defeat", "victory"].includes(this.phase)) {
      this.startMission(this.missionIndex);
    }
    if (key === "shift") this.tryDash();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = (event.clientX - rect.left - this.displayOffsetX) / this.displayScale;
    this.mouse.y = (event.clientY - rect.top - this.displayOffsetY) / this.displayScale;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.onPointerMove(event);
    if (event.button === 0) this.tryPlayerShoot();
    if (event.button === 2) this.tryDash();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.displayScale = Math.min(rect.width / WORLD_WIDTH, rect.height / WORLD_HEIGHT);
    this.displayOffsetX = (rect.width - (WORLD_WIDTH * this.displayScale)) / 2;
    this.displayOffsetY = (rect.height - (WORLD_HEIGHT * this.displayScale)) / 2;
  }

  private update(delta: number): void {
    this.elapsed += delta;
    this.snapshotTimer -= delta;
    this.player.cooldown = Math.max(0, this.player.cooldown - delta);
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);

    this.updatePlayer(delta);
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.updateParticles(delta);

    const enemiesLeft = this.enemies.filter((enemy) => enemy.alive).length;
    if (enemiesLeft === 0) {
      this.clearTimer += delta;
      if (this.clearTimer >= 1.05) this.setPhase("victory");
    }

    if (!this.player.alive) this.setPhase("defeat");
    if (this.snapshotTimer <= 0) {
      this.snapshotTimer = 0.08;
      this.publishSnapshot();
    }
  }

  private updatePlayer(delta: number): void {
    let movementX = 0;
    let movementY = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) movementY -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) movementY += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) movementX -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) movementX += 1;
    const length = Math.hypot(movementX, movementY);
    if (length > 0) {
      movementX /= length;
      movementY /= length;
      const angle = Math.atan2(movementY, movementX);
      this.player.hullAngle = turnTowards(this.player.hullAngle, angle, delta * 9);
      this.moveTank(this.player, movementX * PLAYER_SPEED * delta, movementY * PLAYER_SPEED * delta);
    }
    this.player.turretAngle = Math.atan2(this.mouse.y - this.player.y, this.mouse.x - this.player.x);
    if (this.keys.has(" ")) this.tryPlayerShoot();
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - delta);
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const targetAngle = Math.atan2(dy, dx);
      const turnSpeed = enemy.kind === "sniper" ? 1.7 : enemy.kind === "boss" ? 2.6 : 3.3;
      enemy.turretAngle = turnTowards(enemy.turretAngle, targetAngle, turnSpeed * delta);

      const visible = hasLineOfSight(enemy, this.player, this.mission.walls);
      const speed = enemy.kind === "scout" ? 78 : enemy.kind === "guard" ? 48 : enemy.kind === "boss" ? 34 : 0;
      const preferredRange = enemy.kind === "scout" ? 165 : enemy.kind === "boss" ? 245 : 270;
      let moveAngle = enemy.patrolAngle;

      if (visible) {
        if (distance > preferredRange + 35) {
          moveAngle = targetAngle;
        } else if (distance < preferredRange - 30) {
          moveAngle = targetAngle + Math.PI;
        } else {
          moveAngle = targetAngle + (enemy.strafeDirection * Math.PI / 2);
        }
      } else {
        enemy.patrolAngle += (0.35 + (enemy.id % 3) * 0.08) * delta * enemy.strafeDirection;
      }

      if (speed > 0) {
        enemy.hullAngle = turnTowards(enemy.hullAngle, moveAngle, delta * 3.8);
        this.moveTank(enemy, Math.cos(moveAngle) * speed * delta, Math.sin(moveAngle) * speed * delta);
      }

      const aimDifference = Math.abs(normalizeAngle(targetAngle - enemy.turretAngle));
      const maxRange = enemy.kind === "sniper" ? 710 : enemy.kind === "boss" ? 560 : 455;
      if (visible && distance < maxRange && aimDifference < 0.075 && enemy.cooldown <= 0) {
        this.enemyShoot(enemy);
      }
    }
  }

  private moveTank(tank: Tank, amountX: number, amountY: number): void {
    const originalX = tank.x;
    tank.x = clamp(tank.x + amountX, TANK_GUTTER, WORLD_WIDTH - TANK_GUTTER);
    if (this.collidesWithWalls(tank)) tank.x = originalX;
    const originalY = tank.y;
    tank.y = clamp(tank.y + amountY, TANK_GUTTER, WORLD_HEIGHT - TANK_GUTTER);
    if (this.collidesWithWalls(tank)) tank.y = originalY;
  }

  private collidesWithWalls(tank: Tank): boolean {
    return this.mission.walls.some((wall) => (
      pointInExpandedWall(tank, wall, tank.radius + TANK_WALL_PADDING)
    ));
  }

  private tryPlayerShoot(): void {
    if (this.phase !== "playing" || this.player.cooldown > 0 || !this.player.alive) return;
    this.player.cooldown = 0.3;
    this.shots += 1;
    this.spawnProjectile(this.player, this.player.turretAngle, "player", 535, 1, 1);
    this.audio.shoot(true);
  }

  private enemyShoot(enemy: Tank): void {
    const rate = enemy.kind === "scout" ? 1.45 : enemy.kind === "guard" ? 1.15 : enemy.kind === "sniper" ? 2.3 : 0.72;
    enemy.cooldown = rate + ((enemy.id % 3) * 0.11);
    const speed = enemy.kind === "sniper" ? 650 : enemy.kind === "boss" ? 410 : 390;
    const error = enemy.kind === "scout" ? Math.sin(this.elapsed * 4 + enemy.id) * 0.09 : 0;
    const bounces = enemy.kind === "sniper" || enemy.kind === "boss" ? 1 : 0;
    this.spawnProjectile(enemy, enemy.turretAngle + error, "enemy", speed, bounces, 1);
    if (enemy.kind === "boss" && enemy.hp <= 3) {
      this.spawnProjectile(enemy, enemy.turretAngle - 0.18, "enemy", speed, 0, 1);
      this.spawnProjectile(enemy, enemy.turretAngle + 0.18, "enemy", speed, 0, 1);
    }
    this.audio.shoot(false);
  }

  private spawnProjectile(
    tank: Tank,
    angle: number,
    owner: "player" | "enemy",
    speed: number,
    bounces: number,
    damage: number,
  ): void {
    const muzzle = tank.radius + 15;
    const x = tank.x + Math.cos(angle) * muzzle;
    const y = tank.y + Math.sin(angle) * muzzle;
    this.projectiles.push({
      x,
      y,
      previousX: x,
      previousY: y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      owner,
      life: 3.2,
      bounces,
      damage,
      radius: owner === "player" ? 4 : 4.5,
      color: owner === "player" ? "#ffe27a" : "#ff8c7d",
    });
    this.spawnMuzzleParticles(x, y, angle, owner === "player" ? PLAYER_ACCENT : ENEMY_ACCENT);
  }

  private tryDash(): void {
    if (this.phase !== "playing" || this.player.dashCooldown > 0) return;
    let dx = 0;
    let dy = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    if (dx === 0 && dy === 0) {
      dx = Math.cos(this.player.hullAngle);
      dy = Math.sin(this.player.hullAngle);
    }
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    this.player.dashCooldown = 3.4;
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.28);
    for (let step = 0; step < 8; step += 1) this.moveTank(this.player, dx * 9, dy * 9);
    for (let index = 0; index < 12; index += 1) {
      this.particles.push({
        x: this.player.x - dx * 12,
        y: this.player.y - dy * 12,
        velocityX: -dx * (80 + Math.random() * 90) + (Math.random() - 0.5) * 55,
        velocityY: -dy * (80 + Math.random() * 90) + (Math.random() - 0.5) * 55,
        life: 0.34 + Math.random() * 0.2,
        maxLife: 0.54,
        size: 1.4 + Math.random() * 2.3,
        color: PLAYER_COLOR,
      });
    }
    this.audio.dash();
  }

  private updateProjectiles(delta: number): void {
    const remaining: Projectile[] = [];
    for (const projectile of this.projectiles) {
      projectile.life -= delta;
      if (projectile.life <= 0) continue;
      projectile.previousX = projectile.x;
      projectile.previousY = projectile.y;
      let nextX = projectile.x + projectile.velocityX * delta;
      let nextY = projectile.y + projectile.velocityY * delta;
      let bounced = false;

      if (nextX <= 11 || nextX >= WORLD_WIDTH - 11) {
        projectile.velocityX *= -1;
        nextX = clamp(nextX, 11, WORLD_WIDTH - 11);
        bounced = true;
      }
      if (nextY <= 11 || nextY >= WORLD_HEIGHT - 11) {
        projectile.velocityY *= -1;
        nextY = clamp(nextY, 11, WORLD_HEIGHT - 11);
        bounced = true;
      }

      for (const wall of this.mission.walls) {
        if (!segmentIntersectsWall(projectile, { x: nextX, y: nextY }, wall, projectile.radius)) continue;
        const hitHorizontal = projectile.x < wall.x - projectile.radius
          || projectile.x > wall.x + wall.width + projectile.radius;
        const hitVertical = projectile.y < wall.y - projectile.radius
          || projectile.y > wall.y + wall.height + projectile.radius;
        if (hitHorizontal && !hitVertical) projectile.velocityX *= -1;
        else if (hitVertical && !hitHorizontal) projectile.velocityY *= -1;
        else {
          const horizontalDistance = Math.min(
            Math.abs(projectile.x - wall.x),
            Math.abs(projectile.x - (wall.x + wall.width)),
          );
          const verticalDistance = Math.min(
            Math.abs(projectile.y - wall.y),
            Math.abs(projectile.y - (wall.y + wall.height)),
          );
          if (horizontalDistance < verticalDistance) projectile.velocityX *= -1;
          else projectile.velocityY *= -1;
        }
        nextX = projectile.x;
        nextY = projectile.y;
        bounced = true;
        break;
      }

      if (bounced) {
        projectile.bounces -= 1;
        this.spawnImpactParticles(projectile.x, projectile.y, projectile.color, 4);
        if (projectile.bounces < 0) continue;
      }

      projectile.x = nextX;
      projectile.y = nextY;
      if (this.projectileHitsTank(projectile)) continue;
      remaining.push(projectile);
    }
    this.projectiles = remaining;
  }

  private projectileHitsTank(projectile: Projectile): boolean {
    if (projectile.owner === "enemy") {
      const radius = projectile.radius + this.player.radius;
      if (
        this.player.alive
        && this.player.invulnerable <= 0
        && segmentDistanceSquared(projectile, { x: projectile.previousX, y: projectile.previousY }, this.player) <= radius * radius
      ) {
        this.damagePlayer(projectile.damage);
        return true;
      }
      return false;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const radius = projectile.radius + enemy.radius;
      if (segmentDistanceSquared(projectile, { x: projectile.previousX, y: projectile.previousY }, enemy) > radius * radius) continue;
      enemy.hp -= projectile.damage;
      this.hits += 1;
      this.spawnImpactParticles(projectile.x, projectile.y, projectile.color, 8);
      this.audio.impact();
      if (enemy.hp <= 0) {
        enemy.alive = false;
        this.spawnExplosion(enemy.x, enemy.y, enemy.kind === "boss" ? 42 : 22, ENEMY_COLOR);
      }
      return true;
    }
    return false;
  }

  private damagePlayer(damage: number): void {
    this.player.hp -= damage;
    this.player.invulnerable = 0.86;
    this.spawnExplosion(this.player.x, this.player.y, 18, PLAYER_COLOR);
    this.audio.impact();
    if (this.player.hp <= 0) {
      this.player.alive = false;
      this.spawnExplosion(this.player.x, this.player.y, 36, PLAYER_ACCENT);
    }
  }

  private updateParticles(delta: number): void {
    this.particles = this.particles.filter((particle) => {
      particle.life -= delta;
      if (particle.life <= 0) return false;
      particle.x += particle.velocityX * delta;
      particle.y += particle.velocityY * delta;
      const damping = Math.exp(-4.5 * delta);
      particle.velocityX *= damping;
      particle.velocityY *= damping;
      return true;
    });
  }

  private spawnMuzzleParticles(x: number, y: number, angle: number, color: string): void {
    for (let index = 0; index < 5; index += 1) {
      const direction = angle + (Math.random() - 0.5) * 0.7;
      const speed = 55 + Math.random() * 115;
      this.particles.push({
        x,
        y,
        velocityX: Math.cos(direction) * speed,
        velocityY: Math.sin(direction) * speed,
        life: 0.12 + Math.random() * 0.12,
        maxLife: 0.24,
        size: 1.3 + Math.random() * 2,
        color,
      });
    }
  }

  private spawnImpactParticles(x: number, y: number, color: string, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const speed = 45 + Math.random() * 145;
      this.particles.push({
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.28,
        maxLife: 0.48,
        size: 1 + Math.random() * 2.4,
        color,
      });
    }
  }

  private spawnExplosion(x: number, y: number, size: number, color: string): void {
    const count = Math.round(size * 0.8);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const speed = 45 + Math.random() * (size * 8);
      this.particles.push({
        x: x + (Math.random() - 0.5) * size * 0.35,
        y: y + (Math.random() - 0.5) * size * 0.35,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.55,
        maxLife: 0.9,
        size: 1.5 + Math.random() * (size * 0.15),
        color: index % 4 === 0 ? "#fff7d1" : color,
      });
    }
  }

  private setPhase(phase: GamePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.onPhase(phase);
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    const boss = this.enemies.find((enemy) => enemy.kind === "boss" && enemy.alive);
    this.onSnapshot({
      phase: this.phase,
      missionIndex: this.missionIndex,
      health: Math.max(0, this.player.hp),
      enemiesLeft: this.enemies.filter((enemy) => enemy.alive).length,
      elapsed: this.elapsed,
      shots: this.shots,
      hits: this.hits,
      dashReady: 1 - clamp(this.player.dashCooldown / 3.4, 0, 1),
      bossHealth: boss ? boss.hp / boss.maxHp : null,
    });
  }

  private draw(): void {
    const context = this.context;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const rect = this.canvas.getBoundingClientRect();
    context.fillStyle = "#020504";
    context.fillRect(0, 0, rect.width, rect.height);
    context.translate(this.displayOffsetX, this.displayOffsetY);
    context.scale(this.displayScale, this.displayScale);
    context.save();
    context.beginPath();
    context.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.clip();

    this.drawBackdrop(context);
    if (this.phase === "menu") this.drawAttractScene(context);
    else this.drawMission(context);
    context.restore();
  }

  private drawBackdrop(context: CanvasRenderingContext2D): void {
    const gradient = context.createRadialGradient(480, 280, 60, 480, 300, 620);
    gradient.addColorStop(0, "#0a1713");
    gradient.addColorStop(0.6, "#06100d");
    gradient.addColorStop(1, "#020605");
    context.fillStyle = gradient;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    context.strokeStyle = "rgba(140, 255, 192, 0.055)";
    context.lineWidth = 1;
    context.beginPath();
    const offset = (this.attractTime * 4) % 32;
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

  private drawAttractScene(context: CanvasRenderingContext2D): void {
    context.save();
    context.globalAlpha = 0.32;
    this.drawWall(context, { x: 555, y: 90, width: 28, height: 174 });
    this.drawWall(context, { x: 555, y: 336, width: 28, height: 174 });
    this.drawWall(context, { x: 700, y: 260, width: 130, height: 28 });
    this.drawTank(context, {
      ...this.player,
      x: 690,
      y: 300,
      hullAngle: -0.18,
      turretAngle: -0.35 + Math.sin(this.attractTime * 0.7) * 0.25,
    }, PLAYER_COLOR, PLAYER_ACCENT);
    for (let index = 0; index < 3; index += 1) {
      const angle = this.attractTime * (0.1 + index * 0.03) + index * 2.1;
      this.drawTank(context, {
        ...this.player,
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

  private drawMission(context: CanvasRenderingContext2D): void {
    for (const wall of this.mission.walls) this.drawWall(context, wall);
    for (const projectile of this.projectiles) this.drawProjectile(context, projectile);
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      this.drawTank(context, enemy, ENEMY_COLOR, enemy.kind === "boss" ? "#ffe27a" : ENEMY_ACCENT);
      if (enemy.kind === "boss") this.drawBossArmor(context, enemy);
    }
    if (this.player.alive && !(this.player.invulnerable > 0 && Math.floor(this.player.invulnerable * 14) % 2 === 0)) {
      this.drawTank(context, this.player, PLAYER_COLOR, PLAYER_ACCENT);
    }
    for (const particle of this.particles) this.drawParticle(context, particle);
    this.drawCrosshair(context);
    this.drawRadar(context);
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

  private drawBossArmor(context: CanvasRenderingContext2D, tank: Tank): void {
    context.save();
    context.translate(tank.x, tank.y);
    context.rotate(this.attractTime * 0.55);
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
    context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    context.fillStyle = particle.color;
    context.translate(particle.x, particle.y);
    context.rotate(Math.atan2(particle.velocityY, particle.velocityX));
    context.fillRect(-particle.size, -particle.size * 0.45, particle.size * 2.6, particle.size * 0.9);
    context.restore();
  }

  private drawCrosshair(context: CanvasRenderingContext2D): void {
    if (this.mouse.x < 0 || this.mouse.x > WORLD_WIDTH || this.mouse.y < 0 || this.mouse.y > WORLD_HEIGHT) return;
    context.save();
    context.translate(this.mouse.x, this.mouse.y);
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

  private drawRadar(context: CanvasRenderingContext2D): void {
    context.save();
    context.translate(875, 72);
    context.fillStyle = "rgba(3, 8, 6, 0.78)";
    context.strokeStyle = "rgba(157, 255, 215, 0.24)";
    context.lineWidth = 1;
    context.fillRect(-54, -40, 108, 80);
    context.strokeRect(-54, -40, 108, 80);
    context.fillStyle = PLAYER_COLOR;
    context.fillRect(
      -50 + (this.player.x / WORLD_WIDTH) * 100 - 2,
      -36 + (this.player.y / WORLD_HEIGHT) * 72 - 2,
      4,
      4,
    );
    context.fillStyle = ENEMY_COLOR;
    for (const enemy of this.enemies) {
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
