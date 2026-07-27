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
import {
  ENEMY_ACCENT,
  ENEMY_COLOR,
  GameRenderer,
  PLAYER_ACCENT,
  PLAYER_COLOR,
} from "./renderer";

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

export interface Tank extends Point {
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

export interface Projectile extends Point {
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

export interface Particle extends Point {
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
  private readonly renderer: GameRenderer;
  private readonly keys = new Set<string>();
  private readonly audio = new SynthAudio();
  private readonly onSnapshot: (snapshot: GameSnapshot) => void;
  private readonly onPhase: (phase: GamePhase) => void;
  private animationFrame = 0;
  private previousFrame = 0;
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onSnapshot: (snapshot: GameSnapshot) => void,
    onPhase: (phase: GamePhase) => void,
  ) {
    this.renderer = new GameRenderer(canvas);
    this.onSnapshot = onSnapshot;
    this.onPhase = onPhase;
    this.bindEvents();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.renderer.destroy();
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

    this.renderer.render({
      phase: this.phase,
      mission: this.mission,
      player: this.player,
      enemies: this.enemies,
      projectiles: this.projectiles,
      particles: this.particles,
      mouse: this.mouse,
      attractTime: this.attractTime,
    });
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
    this.mouse = this.renderer.clientToWorld(event.clientX, event.clientY);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.onPointerMove(event);
    if (event.button === 0) this.tryPlayerShoot();
    if (event.button === 2) this.tryDash();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

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

}
