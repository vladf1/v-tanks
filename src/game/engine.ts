import {
  BOSS_TANK_RADIUS,
  findMissionSpawnOverlaps,
  getMissionEnemyTotal,
  MISSIONS,
  STANDARD_TANK_RADIUS,
  TANK_WALL_PADDING,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type EnemyKind,
  type HazardSpawn,
  type Point,
  type Wall,
} from "./levels";
import {
  findReinforcementEntry,
  getReinforcementDelay,
  pickReinforcementKind,
} from "./reinforcements.ts";
import {
  ENEMY_ACCENT,
  ENEMY_COLOR,
  GameRenderer,
  PLAYER_ACCENT,
  PLAYER_COLOR,
} from "./renderer";
import {
  POWER_UP_DEFINITIONS,
  absorbShieldDamage,
  activateTimedPowerUp,
  createActivePowerUps,
  getActivePowerUpSnapshots,
  getPlayerShellStats,
  getPlayerSpeedMultiplier,
  placeMissionPowerUps,
  tickActivePowerUps,
  type ActivePowerUpSnapshot,
  type ActivePowerUps,
  type PowerUp,
  type TimedPowerUpKind,
} from "./powerups";
import {
  getCannonStats,
  getChassisStats,
  type Loadout,
} from "./loadouts";
import {
  EJECTED_TURRET_CHANCE,
  EJECTED_TURRET_FADE_SECONDS,
  EJECTED_TURRET_MAX_ANGULAR_VELOCITY,
  EJECTED_TURRET_MIN_ANGULAR_VELOCITY,
  EJECTED_TURRET_SOLID_SECONDS,
  VISUAL_CAPS,
  VISUAL_THEMES,
  WRECK_FADE_SECONDS,
  WRECK_SOLID_SECONDS,
  generateEnvironmentalDetails,
  pushCapped,
  updateEjectedTurret,
  type Decal,
  type EjectedTurret,
  type ParticleKind,
  type Wreck,
} from "./visual-state.ts";

export type GamePhase = "menu" | "playing" | "paused" | "victory" | "defeat";
export type GameMode = "campaign" | "survival";

export interface GameSnapshot {
  phase: GamePhase;
  mode: GameMode;
  missionIndex: number;
  health: number;
  maxHealth: number;
  enemiesLeft: number;
  activeEnemies: number;
  totalEnemies: number;
  completionPercent: number;
  elapsed: number;
  shots: number;
  hits: number;
  dashReady: number;
  bossHealth: number | null;
  bossPhase: number | null;
  activePowerUps: ActivePowerUpSnapshot[];
  objectiveLabel: string;
  objectiveProgress: number;
  objectiveDetail: string;
  bonusLabel: string;
  bonusComplete: boolean;
  score: number;
  wave: number;
  utilityCharges: number;
  fps: number;
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
  trackCooldown: number;
  recoil: number;
  recoilTime: number;
  recoilDuration: number;
  chassisKick: number;
  damageFlash: number;
  lastHitDirection: number;
  smokeIntensity: number;
  smokeCooldown: number;
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
  ricocheted: boolean;
}

export interface Particle extends Point {
  kind: ParticleKind;
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  angle: number;
  critical?: boolean;
}

export interface ObjectiveNode extends Point {
  id: number;
  kind: "relay" | "uplink" | "extract";
  hp: number;
  maxHp: number;
  radius: number;
  active: boolean;
}

export interface HazardState extends HazardSpawn {
  active: boolean;
  cooldown: number;
}

export interface ProximityMine extends Point {
  id: number;
  owner: "player" | "enemy";
  armTime: number;
  life: number;
}

export interface ArtilleryStrike extends Point {
  delay: number;
  radius: number;
  enemyId: number;
}

export interface TrackMark extends Point {
  angle: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
  faction: "player" | "enemy";
  critical?: boolean;
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

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
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
  private engineOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.engineGain && this.context) {
      this.engineGain.gain.setTargetAtTime(enabled ? 0.006 : 0, this.context.currentTime, 0.04);
    }
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

  shoot(profile: "rapid" | "heavy" | "ricochet" | "enemy" | "boss"): void {
    const frequency = profile === "rapid"
      ? 315
      : profile === "heavy" ? 112
        : profile === "ricochet" ? 238
          : profile === "boss" ? 82 : 150;
    const duration = profile === "heavy" || profile === "boss" ? 0.15 : 0.08;
    this.tone(frequency, duration, profile === "heavy" ? 0.055 : 0.035, "square");
  }

  impact(): void {
    this.tone(105, 0.16, 0.045, "sawtooth");
  }

  dash(): void {
    this.tone(420, 0.12, 0.025, "triangle");
  }

  powerUp(): void {
    this.tone(720, 0.18, 0.035, "triangle");
  }

  engine(intensity: number): void {
    if (!this.context || !this.enabled) return;
    if (!this.engineOscillator || !this.engineGain) {
      this.engineOscillator = this.context.createOscillator();
      this.engineGain = this.context.createGain();
      this.engineOscillator.type = "sawtooth";
      this.engineGain.gain.value = 0;
      this.engineOscillator.connect(this.engineGain);
      this.engineGain.connect(this.context.destination);
      this.engineOscillator.start();
    }
    this.engineOscillator.frequency.setTargetAtTime(
      42 + intensity * 34,
      this.context.currentTime,
      0.05,
    );
    this.engineGain.gain.setTargetAtTime(
      intensity > 0 ? 0.007 : 0.002,
      this.context.currentTime,
      0.08,
    );
  }

  destroy(): void {
    this.engineOscillator?.stop();
    void this.context?.close();
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
  private mode: GameMode = "campaign";
  private phase: GamePhase = "menu";
  private loadout: Loadout = { cannon: "ricochet", chassis: "balanced", utility: "dash" };
  private player: Tank = this.createPlayer(this.mission.player);
  private enemies: Tank[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private powerUps: PowerUp[] = [];
  private activePowerUps: ActivePowerUps = createActivePowerUps();
  private mouse = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  private pointerClient: Point | null = null;
  private primaryFireHeld = false;
  private elapsed = 0;
  private shots = 0;
  private hits = 0;
  private clearTimer = 0;
  private snapshotTimer = 0;
  private attractTime = 0;
  private reinforcementsRemaining = 0;
  private reinforcementTimer = 0;
  private nextEnemyId = 0;
  private objectiveNodes: ObjectiveNode[] = [];
  private hazards: HazardState[] = [];
  private mines: ProximityMine[] = [];
  private artilleryStrikes: ArtilleryStrike[] = [];
  private trackMarks: TrackMark[] = [];
  private decals: Decal[] = [];
  private wrecks: Wreck[] = [];
  private ejectedTurrets: EjectedTurret[] = [];
  private nextDecalId = 1;
  private holdProgress = 0;
  private ricochetHits = 0;
  private score = 0;
  private wave = 1;
  private utilityCharges = 0;
  private shake = 0;
  private survivalRandom: () => number = Math.random;
  private hitStop = 0;
  private fps = 0;
  private fpsSampleStart = 0;
  private fpsSampleFrames = 0;

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
    this.audio.destroy();
    this.unbindEvents();
  }

  setSound(enabled: boolean): void {
    this.audio.setEnabled(enabled);
  }

  configure(loadout: Loadout): void {
    this.loadout = { ...loadout };
  }

  showMenu(): void {
    this.primaryFireHeld = false;
    this.phase = "menu";
    this.onPhase(this.phase);
    this.publishSnapshot();
  }

  startMission(index: number): void {
    this.mode = "campaign";
    this.missionIndex = clamp(index, 0, MISSIONS.length - 1);
    this.mission = MISSIONS[this.missionIndex];
    const spawnOverlaps = findMissionSpawnOverlaps(this.mission);
    if (spawnOverlaps.length > 0) {
      const first = spawnOverlaps[0];
      throw new Error(
        `Mission ${this.mission.number} ${first.unit} overlaps wall ${first.wallIndex + 1}.`,
      );
    }
    this.resetOperationState();
    this.player = this.createPlayer(this.mission.player);
    this.nextEnemyId = 0;
    this.enemies = this.mission.enemies.map((spawn) => (
      this.createEnemy(spawn.kind, spawn)
    ));
    this.reinforcementsRemaining = this.mission.reinforcements.count;
    this.reinforcementTimer = getReinforcementDelay(this.mission);
    this.powerUps = placeMissionPowerUps(this.mission);
    this.activePowerUps = createActivePowerUps();
    if (this.loadout.utility === "shield") activateTimedPowerUp(this.activePowerUps, "shield");
    this.primaryFireHeld = false;
    this.mouse = { x: this.player.x + 180, y: this.player.y };
    this.phase = "playing";
    this.onPhase(this.phase);
    this.publishSnapshot();
  }

  startSurvival(seed: number): void {
    this.mode = "survival";
    this.missionIndex = Math.min(7, MISSIONS.length - 1);
    this.mission = MISSIONS[this.missionIndex];
    this.resetOperationState();
    this.survivalRandom = createSeededRandom(seed);
    this.player = this.createPlayer({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
    this.nextEnemyId = 0;
    this.enemies = [];
    this.reinforcementsRemaining = Number.MAX_SAFE_INTEGER;
    this.reinforcementTimer = 1;
    this.powerUps = placeMissionPowerUps(this.mission, this.survivalRandom);
    this.activePowerUps = createActivePowerUps();
    if (this.loadout.utility === "shield") activateTimedPowerUp(this.activePowerUps, "shield");
    this.mouse = { x: this.player.x + 180, y: this.player.y };
    this.phase = "playing";
    this.onPhase(this.phase);
    this.publishSnapshot();
  }

  private resetOperationState(): void {
    this.projectiles = [];
    this.particles = [];
    this.mines = [];
    this.artilleryStrikes = [];
    this.trackMarks = [];
    this.decals = generateEnvironmentalDetails(this.mission);
    this.wrecks = [];
    this.ejectedTurrets = [];
    this.nextDecalId = 1;
    this.hazards = this.mission.hazards.map((hazard) => ({
      ...hazard,
      active: true,
      cooldown: 0,
    }));
    this.objectiveNodes = this.mission.objective.positions.map((position, index) => ({
      ...position,
      id: index,
      kind: this.mission.objective.kind === "hold"
        ? "uplink"
        : this.mission.objective.kind === "omega" && index === this.mission.objective.positions.length - 1
          ? "extract"
          : "relay",
      hp: 3,
      maxHp: 3,
      radius: 24,
      active: this.mission.objective.kind !== "omega"
        || index < this.mission.objective.positions.length - 1,
    }));
    this.elapsed = 0;
    this.shots = 0;
    this.hits = 0;
    this.ricochetHits = 0;
    this.score = 0;
    this.wave = 1;
    this.holdProgress = 0;
    this.clearTimer = 0;
    this.utilityCharges = this.loadout.utility === "mine" ? 3 : 0;
    this.shake = 0;
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.primaryFireHeld = false;
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
    const chassis = getChassisStats(this.loadout.chassis);
    return {
      id: -1,
      kind: "player",
      x: position.x,
      y: position.y,
      radius: STANDARD_TANK_RADIUS,
      hullAngle: 0,
      turretAngle: 0,
      hp: chassis.hp,
      maxHp: chassis.hp,
      cooldown: 0,
      dashCooldown: 0,
      invulnerable: 0,
      alive: true,
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
    };
  }

  private createEnemy(kind: EnemyKind, position: Point): Tank {
    const id = this.nextEnemyId;
    this.nextEnemyId += 1;
    const maxHp = kind === "boss" ? 12 : kind === "heavy" ? 4 : kind === "support" ? 2 : 1;
    return {
      id,
      kind,
      x: position.x,
      y: position.y,
      radius: kind === "boss" ? BOSS_TANK_RADIUS : STANDARD_TANK_RADIUS,
      hullAngle: Math.PI,
      turretAngle: Math.PI,
      hp: maxHp,
      maxHp,
      cooldown: 0.7 + ((id % 5) * 0.16),
      dashCooldown: 0,
      invulnerable: 0,
      alive: true,
      patrolAngle: (id * 1.73) % TAU,
      strafeDirection: seededDirection(id),
      trackCooldown: 0,
      recoil: 0,
      recoilTime: 0,
      recoilDuration: 0,
      chassisKick: 0,
      damageFlash: 0,
      lastHitDirection: 0,
      smokeIntensity: 0,
      smokeCooldown: 0,
    };
  }

  private readonly frame = (timestamp: number): void => {
    this.updateFps(timestamp);
    const rawDelta = this.previousFrame === 0 ? 0 : (timestamp - this.previousFrame) / 1000;
    this.previousFrame = timestamp;
    const delta = Math.min(rawDelta, 0.05);
    this.attractTime += delta;

    if (this.phase === "playing") {
      if (this.hitStop > 0) {
        this.hitStop = Math.max(0, this.hitStop - delta);
      } else {
        const steps = Math.max(1, Math.ceil(delta / (1 / 120)));
        const step = delta / steps;
        for (let index = 0; index < steps; index += 1) this.update(step);
      }
    } else {
      this.updateParticles(delta);
      if (this.phase === "victory" || this.phase === "defeat") {
        this.updateEjectedTurrets(delta);
      }
    }

    this.canvas.dataset.visualTheme = this.mission.visualTheme;
    this.canvas.dataset.particleCount = String(this.particles.length);
    this.canvas.dataset.trackCount = String(this.trackMarks.length);
    this.canvas.dataset.decalCount = String(this.decals.length);
    this.canvas.dataset.wreckCount = String(this.wrecks.length);
    this.canvas.dataset.ejectedTurretCount = String(this.ejectedTurrets.length);
    this.canvas.dataset.fps = String(this.fps);
    this.renderer.render({
      phase: this.phase,
      mission: this.mission,
      player: this.player,
      enemies: this.enemies,
      projectiles: this.projectiles,
      particles: this.particles,
      powerUps: this.powerUps,
      activePowerUps: this.activePowerUps,
      objectiveNodes: this.objectiveNodes,
      uplinkSecondsRemaining: this.mission.objective.kind === "hold"
        ? Math.ceil(Math.max(0, this.mission.objective.targetSeconds - this.holdProgress))
        : null,
      hazards: this.hazards,
      mines: this.mines,
      artilleryStrikes: this.artilleryStrikes,
      trackMarks: this.trackMarks,
      decals: this.decals,
      wrecks: this.wrecks,
      ejectedTurrets: this.ejectedTurrets,
      theme: VISUAL_THEMES[this.mission.visualTheme],
      shake: this.shake,
      mouse: this.mouse,
      attractTime: this.attractTime,
    });
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private updateFps(timestamp: number): void {
    if (this.fpsSampleStart === 0 || timestamp - this.fpsSampleStart > 2_000) {
      this.fpsSampleStart = timestamp;
      this.fpsSampleFrames = 0;
      return;
    }

    this.fpsSampleFrames += 1;
    const sampleDuration = timestamp - this.fpsSampleStart;
    if (sampleDuration < 500) return;

    this.fps = Math.round((this.fpsSampleFrames * 1_000) / sampleDuration);
    this.fpsSampleStart = timestamp;
    this.fpsSampleFrames = 0;
  }

  private bindEvents(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("blur", this.onWindowBlur);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("blur", this.onWindowBlur);
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
    if (key === "e") this.tryDeployMine();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointerClient = { x: event.clientX, y: event.clientY };
    this.mouse = this.renderer.clientToWorld(
      event.clientX,
      event.clientY,
      this.phase === "menu" ? undefined : this.player,
    );
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.onPointerMove(event);
    if (event.button === 0) {
      this.primaryFireHeld = true;
      this.tryPlayerShoot();
    }
    if (event.button === 2) this.tryDash();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0) this.primaryFireHeld = false;
  };

  private readonly onPointerCancel = (): void => {
    this.primaryFireHeld = false;
  };

  private readonly onWindowBlur = (): void => {
    this.keys.clear();
    this.primaryFireHeld = false;
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
    this.shake = Math.max(0, this.shake - delta * 24);
    tickActivePowerUps(this.activePowerUps, delta);

    this.updatePlayer(delta);
    this.collectPowerUps();
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.updateReinforcements(delta);
    this.updateHazards(delta);
    this.updateMines(delta);
    this.updateArtillery(delta);
    this.updateTrackMarks(delta);
    this.updateDecals(delta);
    this.updateWrecks(delta);
    this.updateEjectedTurrets(delta);
    this.updateTankVisualStates(delta);
    this.updateObjective(delta);
    this.updateParticles(delta);

    if (this.isObjectiveComplete()) {
      this.clearTimer += delta;
      if (this.clearTimer >= 1.05 && this.mode === "campaign") this.setPhase("victory");
    } else {
      this.clearTimer = 0;
    }

    if (this.mode === "survival") {
      this.wave = 1 + Math.floor(this.elapsed / 30);
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
    this.audio.engine(Math.min(1, length));
    if (length > 0) {
      movementX /= length;
      movementY /= length;
      const angle = Math.atan2(movementY, movementX);
      this.player.hullAngle = turnTowards(this.player.hullAngle, angle, delta * 9);
      const inMud = this.hazards.some((hazard) => (
        hazard.active
          && hazard.kind === "mud"
          && distanceSquared(this.player, hazard) < hazard.radius * hazard.radius
      ));
      const chassis = getChassisStats(this.loadout.chassis);
      const speed = PLAYER_SPEED
        * chassis.speed
        * getPlayerSpeedMultiplier(this.activePowerUps)
        * (inMud ? 0.58 : 1);
      this.moveTank(this.player, movementX * speed * delta, movementY * speed * delta);
      this.updateTankTracks(this.player, delta, this.getTrackColor("player"), 0.09);
    }
    if (this.pointerClient) {
      this.mouse = this.renderer.clientToWorld(
        this.pointerClient.x,
        this.pointerClient.y,
        this.player,
      );
    }
    this.player.turretAngle = Math.atan2(this.mouse.y - this.player.y, this.mouse.x - this.player.x);
    if (this.primaryFireHeld || this.keys.has(" ")) this.tryPlayerShoot();
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - delta);
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const targetAngle = Math.atan2(dy, dx);
      const turnSpeed = enemy.kind === "sniper" || enemy.kind === "artillery"
        ? 1.7
        : enemy.kind === "boss" ? 2.6 : 3.3;
      enemy.turretAngle = turnTowards(enemy.turretAngle, targetAngle, turnSpeed * delta);

      const visible = hasLineOfSight(enemy, this.player, this.mission.walls);
      const speed = enemy.kind === "scout"
        ? 78
        : enemy.kind === "guard" || enemy.kind === "minelayer" || enemy.kind === "support"
          ? 48
          : enemy.kind === "heavy" || enemy.kind === "boss" ? 34 : 0;
      const preferredRange = enemy.kind === "scout"
        ? 165
        : enemy.kind === "boss" ? 245
          : enemy.kind === "minelayer" ? 120
            : enemy.kind === "support" ? 330 : 270;
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
        this.updateTankTracks(enemy, delta, this.getTrackColor("enemy"), 0.14);
      }

      const aimDifference = Math.abs(normalizeAngle(targetAngle - enemy.turretAngle));
      if (enemy.kind === "minelayer") {
        enemy.dashCooldown -= delta;
        if (enemy.dashCooldown <= 0 && distance < 260) {
          this.mines.push({
            id: enemy.id * 100 + this.mines.length,
            owner: "enemy",
            x: enemy.x,
            y: enemy.y,
            armTime: 0.8,
            life: 18,
          });
          enemy.dashCooldown = 4.8;
        }
      }

      const maxRange = enemy.kind === "sniper" || enemy.kind === "artillery"
        ? 710
        : enemy.kind === "boss" ? 560 : 455;
      if (visible && distance < maxRange && aimDifference < 0.075 && enemy.cooldown <= 0) {
        this.enemyShoot(enemy);
      }
    }
  }

  private updateReinforcements(delta: number): void {
    if (this.reinforcementsRemaining <= 0 || !this.player.alive) return;
    const activeEnemies = this.enemies.filter((enemy) => enemy.alive);
    this.reinforcementTimer -= delta;
    if (activeEnemies.length === 0) {
      this.reinforcementTimer = Math.min(this.reinforcementTimer, 0.9);
    }
    if (this.reinforcementTimer > 0) return;
    const maxConcurrent = this.mode === "survival"
      ? Math.min(14, 4 + this.wave)
      : this.mission.reinforcements.maxConcurrent;
    if (activeEnemies.length >= maxConcurrent) {
      this.reinforcementTimer = 0.7;
      return;
    }

    const entry = findReinforcementEntry(
      this.mission,
      this.player,
      activeEnemies,
      this.mode === "survival" ? this.survivalRandom : Math.random,
    );
    if (!entry) {
      this.reinforcementTimer = 0.7;
      return;
    }

    const enemyKind = this.mode === "survival"
      ? this.pickSurvivalEnemyKind()
      : pickReinforcementKind(this.mission);
    const enemy = this.createEnemy(enemyKind, entry);
    const inwardAngle = Math.atan2(
      (WORLD_HEIGHT / 2) - enemy.y,
      (WORLD_WIDTH / 2) - enemy.x,
    );
    enemy.hullAngle = inwardAngle;
    enemy.turretAngle = inwardAngle;
    enemy.cooldown = 1.1 + (Math.random() * 0.45);
    this.enemies.push(enemy);
    if (this.mode === "campaign") this.reinforcementsRemaining -= 1;
    this.reinforcementTimer = this.mode === "survival"
      ? Math.max(0.65, 3.1 - this.wave * 0.18) + this.survivalRandom() * 1.3
      : getReinforcementDelay(this.mission);
    this.spawnImpactParticles(enemy.x, enemy.y, ENEMY_ACCENT, 14);
    this.publishSnapshot();
  }

  private getEnemiesLeft(): number {
    if (this.mode === "survival") return this.enemies.filter((enemy) => enemy.alive).length;
    return this.reinforcementsRemaining
      + this.enemies.filter((enemy) => enemy.alive).length;
  }

  private pickSurvivalEnemyKind(): Exclude<EnemyKind, "boss"> {
    const available: Array<Exclude<EnemyKind, "boss">> = ["scout", "guard"];
    if (this.wave >= 2) available.push("sniper", "heavy");
    if (this.wave >= 3) available.push("minelayer", "support");
    if (this.wave >= 4) available.push("artillery");
    return available[Math.floor(this.survivalRandom() * available.length)] ?? "scout";
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
    )) || this.hazards.some((hazard) => (
      hazard.active
        && hazard.kind === "barricade"
        && distanceSquared(tank, hazard) < (tank.radius + hazard.radius) ** 2
    ));
  }

  private tryPlayerShoot(): void {
    if (this.phase !== "playing" || this.player.cooldown > 0 || !this.player.alive) return;
    const cannon = getCannonStats(this.loadout.cannon);
    this.player.cooldown = this.activePowerUps.gun > 0
      ? cannon.reload * 0.5
      : cannon.reload;
    this.shots += 1;
    const boostedShell = getPlayerShellStats(this.activePowerUps);
    this.spawnProjectile(
      this.player,
      this.player.turretAngle,
      "player",
      cannon.speed,
      cannon.bounces + (this.activePowerUps.ricochet > 0 ? 2 : 0),
      cannon.damage * boostedShell.damage,
    );
    this.audio.shoot(this.loadout.cannon);
  }

  private collectPowerUps(): void {
    for (const powerUp of this.powerUps) {
      if (!powerUp.active) continue;
      const radius = this.player.radius + powerUp.radius;
      if (distanceSquared(this.player, powerUp) > radius * radius) continue;
      if (powerUp.kind === "repair" && this.player.hp >= this.player.maxHp) continue;

      powerUp.active = false;
      if (powerUp.kind === "repair") {
        this.player.hp = this.player.maxHp;
      } else {
        activateTimedPowerUp(this.activePowerUps, powerUp.kind as TimedPowerUpKind);
      }
      this.spawnExplosion(
        powerUp.x,
        powerUp.y,
        14,
        POWER_UP_DEFINITIONS[powerUp.kind].color,
      );
      this.audio.powerUp();
      this.publishSnapshot();
    }
  }

  private enemyShoot(enemy: Tank): void {
    if (enemy.kind === "artillery") {
      enemy.cooldown = 3.4;
      this.artilleryStrikes.push({
        x: this.player.x,
        y: this.player.y,
        delay: 1.35,
        radius: 52,
        enemyId: enemy.id,
      });
      return;
    }
    const rate = enemy.kind === "scout"
      ? 1.45
      : enemy.kind === "guard" || enemy.kind === "support" ? 1.15
        : enemy.kind === "sniper" ? 2.3
          : enemy.kind === "heavy" ? 2.05
            : enemy.kind === "minelayer" ? 1.75 : 0.72;
    enemy.cooldown = rate + ((enemy.id % 3) * 0.11);
    const speed = enemy.kind === "sniper" ? 650 : enemy.kind === "boss" ? 410 : 390;
    const error = enemy.kind === "scout" ? Math.sin(this.elapsed * 4 + enemy.id) * 0.09 : 0;
    const bounces = enemy.kind === "sniper" || enemy.kind === "boss" ? 1 : 0;
    const damage = enemy.kind === "heavy" ? 2 : 1;
    this.spawnProjectile(enemy, enemy.turretAngle + error, "enemy", speed, bounces, damage);
    if (enemy.kind === "boss" && enemy.hp <= 8 && enemy.hp > 4) {
      this.spawnProjectile(enemy, enemy.turretAngle - 0.12, "enemy", speed, 0, 1);
      this.spawnProjectile(enemy, enemy.turretAngle + 0.12, "enemy", speed, 0, 1);
    }
    if (enemy.kind === "boss" && enemy.hp <= 4) {
      this.spawnProjectile(enemy, enemy.turretAngle - 0.18, "enemy", speed, 0, 1);
      this.spawnProjectile(enemy, enemy.turretAngle + 0.18, "enemy", speed, 0, 1);
      this.spawnProjectile(enemy, enemy.turretAngle + Math.PI, "enemy", speed, 1, 1);
    }
    this.audio.shoot(enemy.kind === "boss" ? "boss" : "enemy");
  }

  private spawnProjectile(
    tank: Tank,
    angle: number,
    owner: "player" | "enemy",
    speed: number,
    bounces: number,
    damage: number,
  ): void {
    const heavyShot = tank.kind === "boss"
      || tank.kind === "heavy"
      || tank.kind === "artillery"
      || damage > 1;
    tank.recoil = heavyShot ? 6.5 : 4;
    tank.recoilDuration = heavyShot ? 0.13 : 0.09;
    tank.recoilTime = tank.recoilDuration;
    tank.chassisKick = 1.5;
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
      color: owner === "player"
        ? PLAYER_COLOR
        : "#ff8c7d",
      ricocheted: false,
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
    this.player.dashCooldown = this.loadout.utility === "dash" ? 2.6 : 3.8;
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.28);
    for (let step = 0; step < 8; step += 1) this.moveTank(this.player, dx * 9, dy * 9);
    const dashDustCount = 12;
    for (let index = 0; index < dashDustCount; index += 1) {
      this.addParticle({
        kind: "dust",
        x: this.player.x - dx * 12,
        y: this.player.y - dy * 12,
        velocityX: -dx * (80 + Math.random() * 90) + (Math.random() - 0.5) * 55,
        velocityY: -dy * (80 + Math.random() * 90) + (Math.random() - 0.5) * 55,
        life: 0.34 + Math.random() * 0.2,
        maxLife: 0.54,
        size: 1.4 + Math.random() * 2.3,
        color: PLAYER_COLOR,
        angle: Math.atan2(-dy, -dx),
      });
    }
    this.audio.dash();
  }

  private tryDeployMine(): void {
    if (
      this.phase !== "playing"
      || this.loadout.utility !== "mine"
      || this.utilityCharges <= 0
      || !this.player.alive
    ) return;
    this.utilityCharges -= 1;
    this.mines.push({
      id: -100 - this.utilityCharges,
      owner: "player",
      x: this.player.x,
      y: this.player.y,
      armTime: 0.45,
      life: 25,
    });
    this.audio.powerUp();
    this.publishSnapshot();
  }

  private updateProjectiles(delta: number): void {
    const remaining: Projectile[] = [];
    for (const projectile of this.projectiles) {
      projectile.life -= delta;
      if (projectile.life <= 0) {
        this.spawnImpactParticles(
          projectile.x,
          projectile.y,
          VISUAL_THEMES[this.mission.visualTheme].dustTint,
          4,
          Math.atan2(projectile.velocityY, projectile.velocityX),
          "dust",
        );
        this.addDecal("scorch", projectile.x, projectile.y, 5);
        continue;
      }
      projectile.previousX = projectile.x;
      projectile.previousY = projectile.y;
      let nextX = projectile.x + projectile.velocityX * delta;
      let nextY = projectile.y + projectile.velocityY * delta;
      let bounced = false;
      let bouncedOnWall = false;

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
        bouncedOnWall = true;
        break;
      }

      if (bounced) {
        projectile.bounces -= 1;
        projectile.ricocheted = true;
        const reflectedDirection = Math.atan2(projectile.velocityY, projectile.velocityX);
        this.spawnImpactParticles(
          projectile.x,
          projectile.y,
          bouncedOnWall ? "#fff0b4" : projectile.color,
          bouncedOnWall ? 7 : 4,
          reflectedDirection,
          "spark",
        );
        if (bouncedOnWall) {
          this.spawnImpactParticles(
            projectile.x,
            projectile.y,
            "#c7c2b8",
            4,
            reflectedDirection,
            "debris",
          );
          this.spawnImpactParticles(
            projectile.x,
            projectile.y,
            VISUAL_THEMES[this.mission.visualTheme].dustTint,
            5,
            reflectedDirection + Math.PI,
            "dust",
          );
          this.addDecal("wall-chip", projectile.x, projectile.y, 7, "#c4beb0", reflectedDirection);
        }
        if (projectile.bounces < 0) continue;
      }

      projectile.x = nextX;
      projectile.y = nextY;
      if (this.projectileHitsObjective(projectile)) continue;
      if (this.projectileHitsHazard(projectile)) continue;
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
        this.damagePlayer(
          projectile.damage,
          Math.atan2(projectile.y - this.player.y, projectile.x - this.player.x),
        );
        return true;
      }
      return false;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const radius = projectile.radius + enemy.radius;
      if (segmentDistanceSquared(projectile, { x: projectile.previousX, y: projectile.previousY }, enemy) > radius * radius) continue;
      if (
        enemy.kind === "boss"
        && this.objectiveNodes.some((node) => node.kind === "relay" && node.active)
      ) {
        this.spawnImpactParticles(
          projectile.x,
          projectile.y,
          "#7bdcff",
          12,
          Math.atan2(projectile.velocityY, projectile.velocityX) + Math.PI,
          "spark",
        );
        this.spawnShieldArc(projectile.x, projectile.y, "#7bdcff");
        this.shake = Math.max(this.shake, 0.8);
        return true;
      }
      if (enemy.kind === "heavy") {
        const impactAngle = Math.atan2(projectile.y - enemy.y, projectile.x - enemy.x);
        if (Math.abs(normalizeAngle(impactAngle - enemy.hullAngle)) < 1.05) {
          this.spawnImpactParticles(
            projectile.x,
            projectile.y,
            "#fff0b4",
            10,
            Math.atan2(projectile.velocityY, projectile.velocityX) + Math.PI,
          );
          enemy.damageFlash = 0.1;
          enemy.lastHitDirection = impactAngle;
          return true;
        }
      }
      const supportingTank = this.enemies.find((candidate) => (
        candidate.alive
          && candidate.kind === "support"
          && candidate.id !== enemy.id
          && distanceSquared(candidate, enemy) < 110 * 110
      ));
      if (supportingTank) {
        supportingTank.hp -= 1;
        supportingTank.damageFlash = 0.12;
        supportingTank.lastHitDirection = Math.atan2(projectile.y - enemy.y, projectile.x - enemy.x);
        this.spawnImpactParticles(enemy.x, enemy.y, "#7bdcff", 10);
        this.spawnShieldArc(enemy.x, enemy.y, "#7bdcff");
        if (supportingTank.hp <= 0) {
          supportingTank.alive = false;
          this.recordWreck(supportingTank);
          this.score += 160;
          this.spawnExplosion(
            supportingTank.x,
            supportingTank.y,
            24,
            ENEMY_COLOR,
            WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS,
          );
        }
        return true;
      }
      enemy.hp -= projectile.damage;
      enemy.damageFlash = 0.12;
      enemy.lastHitDirection = Math.atan2(projectile.y - enemy.y, projectile.x - enemy.x);
      this.hits += 1;
      if (projectile.ricocheted) this.ricochetHits += 1;
      this.spawnImpactParticles(
        projectile.x,
        projectile.y,
        "#fff0b4",
        8,
        Math.atan2(projectile.velocityY, projectile.velocityX) + Math.PI,
      );
      this.audio.impact();
      if (enemy.hp <= 0) {
        enemy.alive = false;
        this.recordWreck(enemy);
        this.score += enemy.kind === "boss"
          ? 2500
          : enemy.kind === "heavy" || enemy.kind === "artillery" ? 260 : 100;
        this.shake = Math.max(this.shake, enemy.kind === "boss" ? 4 : 1.6);
        this.hitStop = enemy.kind === "boss" ? 0.11 : 0.045;
        this.spawnExplosion(
          enemy.x,
          enemy.y,
          enemy.kind === "boss" ? 42 : 22,
          ENEMY_COLOR,
          WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS,
        );
      }
      return true;
    }
    return false;
  }

  private projectileHitsObjective(projectile: Projectile): boolean {
    if (projectile.owner !== "player") return false;
    for (const node of this.objectiveNodes) {
      if (!node.active || node.kind !== "relay") continue;
      const radius = node.radius + projectile.radius;
      if (segmentDistanceSquared(
        projectile,
        { x: projectile.previousX, y: projectile.previousY },
        node,
      ) > radius * radius) continue;
      node.hp -= projectile.damage;
      this.hits += 1;
      if (projectile.ricocheted) this.ricochetHits += 1;
      this.spawnImpactParticles(projectile.x, projectile.y, "#7bdcff", 12);
      if (node.hp <= 0) {
        node.active = false;
        this.score += 400;
        this.shake = Math.max(this.shake, 2.5);
        this.spawnExplosion(node.x, node.y, 34, "#7bdcff");
      }
      return true;
    }
    return false;
  }

  private projectileHitsHazard(projectile: Projectile): boolean {
    if (projectile.owner !== "player") return false;
    for (const hazard of this.hazards) {
      if (
        !hazard.active
        || (hazard.kind !== "barrel" && hazard.kind !== "barricade")
      ) continue;
      const radius = hazard.radius + projectile.radius;
      if (segmentDistanceSquared(
        projectile,
        { x: projectile.previousX, y: projectile.previousY },
        hazard,
      ) > radius * radius) continue;
      hazard.active = false;
      if (hazard.kind === "barrel") {
        this.detonate(hazard.x, hazard.y, 96, "player");
      } else {
        this.spawnExplosion(hazard.x, hazard.y, 24, "#b9c7be");
        this.addDecal("rubble", hazard.x, hazard.y, 24, "#777b73");
        this.score += 25;
      }
      return true;
    }
    return false;
  }

  private updateHazards(delta: number): void {
    for (const hazard of this.hazards) {
      hazard.cooldown = Math.max(0, hazard.cooldown - delta);
      if (!hazard.active) continue;
      const playerDistance = distanceSquared(this.player, hazard);
      if (hazard.kind === "minefield" && hazard.cooldown <= 0 && playerDistance < 48 * 48) {
        hazard.cooldown = 2.5;
        this.damagePlayer(1);
        this.spawnExplosion(this.player.x, this.player.y, 20, "#ffb45f");
      }
      if (
        hazard.kind === "repair-station"
        && this.player.hp < this.player.maxHp
        && playerDistance < 42 * 42
      ) {
        hazard.active = false;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
        this.spawnExplosion(hazard.x, hazard.y, 18, POWER_UP_DEFINITIONS.repair.color);
        this.audio.powerUp();
      }
    }
  }

  private updateMines(delta: number): void {
    const remaining: ProximityMine[] = [];
    for (const mine of this.mines) {
      mine.armTime -= delta;
      mine.life -= delta;
      if (mine.life <= 0) continue;
      if (mine.armTime > 0) {
        remaining.push(mine);
        continue;
      }
      const targets = mine.owner === "player"
        ? this.enemies.filter((enemy) => enemy.alive)
        : this.player.alive ? [this.player] : [];
      const target = targets.find((tank) => distanceSquared(tank, mine) < 52 * 52);
      if (!target) {
        remaining.push(mine);
        continue;
      }
      this.detonate(mine.x, mine.y, 82, mine.owner);
    }
    this.mines = remaining;
  }

  private updateArtillery(delta: number): void {
    const remaining: ArtilleryStrike[] = [];
    for (const strike of this.artilleryStrikes) {
      strike.delay -= delta;
      if (strike.delay > 0) {
        remaining.push(strike);
        continue;
      }
      if (distanceSquared(this.player, strike) < strike.radius * strike.radius) {
        this.damagePlayer(2);
      }
      this.spawnExplosion(strike.x, strike.y, strike.radius * 0.38, ENEMY_ACCENT);
      this.addDecal("crater", strike.x, strike.y, strike.radius * 0.62);
      this.shake = Math.max(this.shake, 3);
    }
    this.artilleryStrikes = remaining;
  }

  private updateTrackMarks(delta: number): void {
    for (const mark of this.trackMarks) mark.life = Math.max(0, mark.life - delta * 0.015);
  }

  private getTrackColor(faction: "player" | "enemy"): string {
    if (this.mission.visualTheme === "industrial") {
      return faction === "player" ? "#46534f" : "#493b37";
    }
    if (this.mission.visualTheme === "command-complex") {
      return faction === "player" ? "#3e5b53" : "#49302f";
    }
    return faction === "player" ? "#496258" : "#4b3431";
  }

  private updateTankTracks(
    tank: Tank,
    delta: number,
    color: string,
    interval: number,
  ): void {
    tank.trackCooldown -= delta;
    if (tank.trackCooldown > 0) return;
    tank.trackCooldown = interval;
    const scale = tank.kind === "boss" ? 1.48 : tank.kind === "heavy" ? 1.18 : 1;
    for (const side of [-1, 1]) {
      pushCapped(this.trackMarks, {
        x: tank.x - Math.cos(tank.hullAngle) * 12 * scale
          + Math.cos(tank.hullAngle + Math.PI / 2) * side * 10 * scale,
        y: tank.y - Math.sin(tank.hullAngle) * 12 * scale
          + Math.sin(tank.hullAngle + Math.PI / 2) * side * 10 * scale,
        angle: tank.hullAngle,
        life: 1,
        maxLife: 1,
        color,
        width: 2.2 * scale,
        faction: tank.kind === "player" ? "player" : "enemy",
      }, VISUAL_CAPS.trackMarks);
    }
  }

  private updateObjective(delta: number): void {
    if (this.mode === "survival") return;
    const objective = this.mission.objective;
    if (objective.kind === "hold") {
      const uplink = this.objectiveNodes.find((node) => node.kind === "uplink");
      if (!uplink) return;
      if (distanceSquared(this.player, uplink) < 68 * 68) {
        this.holdProgress = Math.min(objective.targetSeconds, this.holdProgress + delta);
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - delta * 0.25);
      }
      return;
    }
    if (objective.kind === "omega") {
      const relaysDestroyed = !this.objectiveNodes.some((node) => (
        node.kind === "relay" && node.active
      ));
      const bossAlive = this.enemies.some((enemy) => enemy.kind === "boss" && enemy.alive);
      const extraction = this.objectiveNodes.find((node) => node.kind === "extract");
      if (extraction) extraction.active = relaysDestroyed && !bossAlive;
      if (
        extraction?.active
        && distanceSquared(this.player, extraction) < 72 * 72
      ) this.holdProgress = 1;
    }
  }

  private isObjectiveComplete(): boolean {
    if (this.mode === "survival") return false;
    const objective = this.mission.objective;
    if (objective.kind === "eliminate") return this.getEnemiesLeft() === 0;
    if (objective.kind === "relays") {
      return !this.objectiveNodes.some((node) => node.kind === "relay" && node.active);
    }
    if (objective.kind === "hold" || objective.kind === "survive") {
      return (objective.kind === "hold" ? this.holdProgress : this.elapsed)
        >= objective.targetSeconds;
    }
    return this.holdProgress >= 1;
  }

  private getObjectiveProgress(): { progress: number; detail: string } {
    if (this.mode === "survival") {
      return {
        progress: Math.min(1, (this.elapsed % 30) / 30),
        detail: `WAVE ${this.wave} / ${this.score} PTS`,
      };
    }
    const objective = this.mission.objective;
    if (objective.kind === "eliminate") {
      const total = getMissionEnemyTotal(this.mission);
      const left = this.getEnemiesLeft();
      return { progress: (total - left) / total, detail: `${left} HOSTILES REMAIN` };
    }
    if (objective.kind === "relays") {
      const total = this.objectiveNodes.filter((node) => node.kind === "relay").length;
      const left = this.objectiveNodes.filter((node) => node.kind === "relay" && node.active).length;
      return { progress: total === 0 ? 1 : (total - left) / total, detail: `${left} RELAYS ACTIVE` };
    }
    if (objective.kind === "hold") {
      return {
        progress: this.holdProgress / objective.targetSeconds,
        detail: `${Math.ceil(objective.targetSeconds - this.holdProgress)}s TO LINK`,
      };
    }
    if (objective.kind === "survive") {
      return {
        progress: this.elapsed / objective.targetSeconds,
        detail: `${Math.ceil(Math.max(0, objective.targetSeconds - this.elapsed))}s REMAIN`,
      };
    }
    const generators = this.objectiveNodes.filter((node) => node.kind === "relay" && node.active).length;
    const boss = this.enemies.find((enemy) => enemy.kind === "boss" && enemy.alive);
    if (generators > 0) return { progress: (2 - generators) / 4, detail: `${generators} SHIELDS ACTIVE` };
    if (boss) return { progress: 0.5 + (1 - boss.hp / boss.maxHp) * 0.4, detail: "DESTROY OMEGA" };
    return { progress: this.holdProgress > 0 ? 1 : 0.95, detail: "ENTER EXTRACTION" };
  }

  private isBonusComplete(): boolean {
    const bonus = this.mission.bonus;
    if (bonus.kind === "accuracy") {
      return this.shots > 0 && (this.hits / this.shots) * 100 >= bonus.target;
    }
    if (bonus.kind === "hull") return this.player.hp >= bonus.target;
    if (bonus.kind === "time") return this.elapsed <= this.mission.parTime;
    return this.ricochetHits >= bonus.target;
  }

  private detonate(
    x: number,
    y: number,
    radius: number,
    owner: "player" | "enemy",
  ): void {
    this.spawnExplosion(x, y, radius * 0.38, owner === "player" ? "#ffb45f" : ENEMY_ACCENT);
    this.addDecal("mine-crater", x, y, radius * 0.34);
    this.shake = Math.max(this.shake, 3);
    if (owner === "enemy" && distanceSquared(this.player, { x, y }) < radius * radius) {
      this.damagePlayer(1);
    }
    if (owner === "player") {
      for (const enemy of this.enemies) {
        if (!enemy.alive || distanceSquared(enemy, { x, y }) >= radius * radius) continue;
        if (
          enemy.kind === "boss"
          && this.objectiveNodes.some((node) => node.kind === "relay" && node.active)
        ) continue;
        enemy.hp -= 2;
        if (enemy.hp <= 0) {
          enemy.alive = false;
          this.recordWreck(enemy);
          this.score += 120;
          this.spawnExplosion(
            enemy.x,
            enemy.y,
            22,
            ENEMY_COLOR,
            WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS,
          );
        }
      }
    }
  }

  private damagePlayer(damage: number, hitDirection = this.player.hullAngle + Math.PI): void {
    const remainingDamage = absorbShieldDamage(this.activePowerUps, damage);
    if (remainingDamage < damage) {
      this.player.invulnerable = 0.24;
      this.player.damageFlash = 0.12;
      this.player.lastHitDirection = hitDirection;
      this.spawnImpactParticles(
        this.player.x,
        this.player.y,
        POWER_UP_DEFINITIONS.shield.color,
        12,
      );
      this.spawnShieldArc(this.player.x, this.player.y, POWER_UP_DEFINITIONS.shield.color);
      this.audio.impact();
      if (remainingDamage <= 0) return;
    }

    this.player.hp -= remainingDamage;
    this.player.damageFlash = 0.12;
    this.player.lastHitDirection = hitDirection;
    this.spawnImpactParticles(
      this.player.x,
      this.player.y,
      "#fff0b4",
      8,
      hitDirection + Math.PI,
    );
    this.shake = Math.max(this.shake, 2.2);
    this.player.invulnerable = 0.86;
    const wreckDecalLife = this.player.hp <= 0
      ? WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS
      : undefined;
    this.spawnExplosion(this.player.x, this.player.y, 18, PLAYER_COLOR, wreckDecalLife);
    this.audio.impact();
    if (this.player.hp <= 0) {
      this.player.alive = false;
      this.recordWreck(this.player);
      this.spawnExplosion(
        this.player.x,
        this.player.y,
        36,
        PLAYER_ACCENT,
        WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS,
      );
    }
  }

  private addParticle(particle: Particle): void {
    pushCapped(this.particles, particle, VISUAL_CAPS.particles);
  }

  private addDecal(
    kind: Decal["kind"],
    x: number,
    y: number,
    size: number,
    color?: string,
    angle = Math.random() * TAU,
    life?: number,
  ): void {
    const palette = VISUAL_THEMES[this.mission.visualTheme].decalPalette;
    pushCapped(this.decals, {
      id: this.nextDecalId,
      kind,
      x,
      y,
      angle,
      size,
      opacity: 0.34 + Math.random() * 0.24,
      color: color ?? palette[this.nextDecalId % palette.length],
      life,
    }, VISUAL_CAPS.decals);
    this.nextDecalId += 1;
  }

  private recordWreck(tank: Tank): void {
    if (this.wrecks.some((wreck) => wreck.id === tank.id && wreck.faction === (
      tank.kind === "player" ? "player" : "enemy"
    ))) return;
    pushCapped(this.wrecks, {
      id: tank.id,
      kind: tank.kind,
      x: tank.x,
      y: tank.y,
      hullAngle: tank.hullAngle,
      turretAngle: tank.turretAngle,
      scale: tank.kind === "boss" ? 1.48 : tank.kind === "heavy" ? 1.18 : 1,
      faction: tank.kind === "player" ? "player" : "enemy",
      burn: tank.kind === "boss" ? 1 : 0.55,
      life: WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS,
    }, VISUAL_CAPS.wrecks);
    if (tank.kind !== "player" && Math.random() < EJECTED_TURRET_CHANCE) {
      this.ejectTurret(tank);
    }
    this.addDecal(
      "oil",
      tank.x - 4,
      tank.y + 4,
      tank.radius * 1.5,
      "#090b0a",
      Math.random() * TAU,
      WRECK_SOLID_SECONDS + WRECK_FADE_SECONDS,
    );
  }

  private updateDecals(delta: number): void {
    this.decals = this.decals.filter((decal) => {
      if (decal.life === undefined) return true;
      decal.life -= delta;
      return decal.life > 0;
    });
  }

  private updateWrecks(delta: number): void {
    this.wrecks = this.wrecks.filter((wreck) => {
      wreck.life -= delta;
      return wreck.life > 0;
    });
  }

  private ejectTurret(tank: Tank): void {
    if (tank.kind === "player") return;
    const launchAngle = tank.lastHitDirection + ((Math.random() - 0.5) * Math.PI * 0.8);
    const launchSpeed = (tank.kind === "boss" ? 116 : tank.kind === "heavy" ? 98 : 82)
      * (0.88 + Math.random() * 0.24);
    const spinDirection = Math.random() < 0.5 ? -1 : 1;
    pushCapped(this.ejectedTurrets, {
      id: tank.id,
      kind: tank.kind,
      x: tank.x,
      y: tank.y,
      angle: tank.turretAngle,
      velocityX: Math.cos(launchAngle) * launchSpeed,
      velocityY: Math.sin(launchAngle) * launchSpeed,
      angularVelocity: spinDirection * (
        EJECTED_TURRET_MIN_ANGULAR_VELOCITY
          + Math.random() * (
            EJECTED_TURRET_MAX_ANGULAR_VELOCITY
              - EJECTED_TURRET_MIN_ANGULAR_VELOCITY
          )
      ),
      height: tank.kind === "boss" ? 9 : 6,
      verticalVelocity: (tank.kind === "boss" ? 82 : 68) + Math.random() * 12,
      scale: tank.kind === "boss" ? 1.48 : tank.kind === "heavy" ? 1.18 : 1,
      landed: false,
      life: EJECTED_TURRET_SOLID_SECONDS + EJECTED_TURRET_FADE_SECONDS,
      critical: tank.kind === "boss",
    }, VISUAL_CAPS.ejectedTurrets);
  }

  private updateEjectedTurrets(delta: number): void {
    this.ejectedTurrets = this.ejectedTurrets.filter((turret) => {
      updateEjectedTurret(turret, delta);
      return !turret.landed || turret.life > 0;
    });
  }

  private updateTankVisualStates(delta: number): void {
    for (const tank of [this.player, ...this.enemies]) {
      tank.recoilTime = Math.max(0, tank.recoilTime - delta);
      tank.chassisKick = Math.max(0, tank.chassisKick - delta * 14);
      tank.damageFlash = Math.max(0, tank.damageFlash - delta);
      const healthRatio = tank.maxHp > 0 ? tank.hp / tank.maxHp : 0;
      tank.smokeIntensity = healthRatio < 0.25 ? 0.9 : healthRatio < 0.5 ? 0.36 : 0;
      if (!tank.alive || tank.smokeIntensity <= 0) continue;
      tank.smokeCooldown -= delta;
      if (tank.smokeCooldown > 0) continue;
      tank.smokeCooldown = tank.smokeIntensity > 0.5 ? 0.09 : 0.24;
      const smokeCount = tank.smokeIntensity > 0.5 ? 2 : 1;
      for (let index = 0; index < smokeCount; index += 1) {
        this.addParticle({
          kind: "smoke",
          x: tank.x + (Math.random() - 0.5) * tank.radius,
          y: tank.y + (Math.random() - 0.5) * tank.radius,
          velocityX: (Math.random() - 0.5) * 12,
          velocityY: -8 - Math.random() * 12,
          life: 0.85 + Math.random() * 0.75,
          maxLife: 1.6,
          size: 4 + Math.random() * 5,
          color: tank.smokeIntensity > 0.5 ? "#151918" : "#38403d",
          angle: 0,
        });
      }
      if (Math.random() < 0.22) {
        this.spawnImpactParticles(tank.x, tank.y, "#ffca78", 2, tank.turretAngle + Math.PI);
      }
    }
  }

  private updateParticles(delta: number): void {
    this.particles = this.particles.filter((particle) => {
      particle.life -= delta;
      if (particle.life <= 0) return false;
      particle.x += particle.velocityX * delta;
      particle.y += particle.velocityY * delta;
      if (particle.kind === "smoke") particle.size += delta * 7;
      if (particle.kind === "ring") particle.size += delta * 58;
      const damping = Math.exp(-(particle.kind === "smoke" ? 1.35 : 4.5) * delta);
      particle.velocityX *= damping;
      particle.velocityY *= damping;
      return true;
    });
  }

  private spawnMuzzleParticles(x: number, y: number, angle: number, color: string): void {
    this.addParticle({
      kind: "flash",
      x,
      y,
      velocityX: 0,
      velocityY: 0,
      life: 0.075,
      maxLife: 0.075,
      size: 7,
      color: "#fff4c2",
      angle,
      critical: true,
    });
    for (let index = 0; index < 5; index += 1) {
      const direction = angle + (Math.random() - 0.5) * 0.7;
      const speed = 55 + Math.random() * 115;
      this.addParticle({
        kind: "spark",
        x,
        y,
        velocityX: Math.cos(direction) * speed,
        velocityY: Math.sin(direction) * speed,
        life: 0.12 + Math.random() * 0.12,
        maxLife: 0.24,
        size: 1.3 + Math.random() * 2,
        color,
        angle: direction,
      });
    }
  }

  private spawnImpactParticles(
    x: number,
    y: number,
    color: string,
    count: number,
    direction?: number,
    kind: ParticleKind = "spark",
  ): void {
    const admitted = Math.max(0, Math.floor(count));
    for (let index = 0; index < admitted; index += 1) {
      const angle = direction === undefined
        ? Math.random() * TAU
        : direction + (Math.random() - 0.5) * 0.78;
      const speed = 45 + Math.random() * 145;
      this.addParticle({
        kind,
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.28,
        maxLife: 0.48,
        size: 1 + Math.random() * 2.4,
        color,
        angle,
      });
    }
  }

  private spawnShieldArc(x: number, y: number, color: string): void {
    this.addParticle({
      kind: "flash",
      x,
      y,
      velocityX: 0,
      velocityY: 0,
      life: 0.16,
      maxLife: 0.16,
      size: 18,
      color,
      angle: Math.random() * TAU,
      critical: true,
    });
  }

  private spawnExplosion(
    x: number,
    y: number,
    size: number,
    color: string,
    decalLife?: number,
  ): void {
    this.addParticle({
      kind: "flash",
      x,
      y,
      velocityX: 0,
      velocityY: 0,
      life: 0.1,
      maxLife: 0.1,
      size: size * 0.7,
      color: "#fff7d1",
      angle: 0,
      critical: true,
    });
    this.addParticle({
      kind: "ring",
      x,
      y,
      velocityX: 0,
      velocityY: 0,
      life: 0.24,
      maxLife: 0.24,
      size: size * 0.32,
      color,
      angle: 0,
    });

    const debrisCount = Math.round(size * 0.48);
    this.spawnImpactParticles(x, y, color, debrisCount, undefined, "debris");
    const smokeCount = Math.max(4, Math.round(size * 0.28));
    for (let index = 0; index < smokeCount; index += 1) {
      const angle = Math.random() * TAU;
      const speed = 12 + Math.random() * size * 1.8;
      this.addParticle({
        kind: "smoke",
        x: x + (Math.random() - 0.5) * size * 0.42,
        y: y + (Math.random() - 0.5) * size * 0.42,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed - 8,
        life: 0.7 + Math.random() * 0.85,
        maxLife: 1.55,
        size: 2.2 + Math.random() * size * 0.14,
        color: index % 4 === 0 ? "#555c57" : "#242927",
        angle,
      });
    }
    if (size >= 18) {
      this.addDecal(
        size >= 30 ? "crater" : "scorch",
        x,
        y,
        size * 0.8,
        undefined,
        Math.random() * TAU,
        decalLife,
      );
    }
  }

  private setPhase(phase: GamePhase): void {
    if (this.phase === phase) return;
    if (phase !== "playing") this.shake = 0;
    this.phase = phase;
    this.onPhase(phase);
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    const boss = this.enemies.find((enemy) => enemy.kind === "boss" && enemy.alive);
    const totalEnemies = getMissionEnemyTotal(this.mission);
    const activeEnemies = this.enemies.filter((enemy) => enemy.alive).length;
    const enemiesLeft = this.getEnemiesLeft();
    const objective = this.getObjectiveProgress();
    const dashCooldown = this.loadout.utility === "dash" ? 2.6 : 3.8;
    this.onSnapshot({
      phase: this.phase,
      mode: this.mode,
      missionIndex: this.missionIndex,
      health: Math.max(0, this.player.hp),
      maxHealth: this.player.maxHp,
      enemiesLeft,
      activeEnemies,
      totalEnemies,
      completionPercent: Math.round(clamp(objective.progress, 0, 1) * 100),
      elapsed: this.elapsed,
      shots: this.shots,
      hits: this.hits,
      dashReady: 1 - clamp(this.player.dashCooldown / dashCooldown, 0, 1),
      bossHealth: boss ? boss.hp / boss.maxHp : null,
      bossPhase: boss ? boss.hp > 8 ? 1 : boss.hp > 4 ? 2 : 3 : null,
      activePowerUps: getActivePowerUpSnapshots(this.activePowerUps),
      objectiveLabel: this.mode === "survival" ? "ENDLESS SURVIVAL" : this.mission.objective.label,
      objectiveProgress: clamp(objective.progress, 0, 1),
      objectiveDetail: objective.detail,
      bonusLabel: this.mission.bonus.label,
      bonusComplete: this.isBonusComplete(),
      score: this.score,
      wave: this.wave,
      utilityCharges: this.utilityCharges,
      fps: this.fps,
    });
  }

}
