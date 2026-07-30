import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type EnemyKind,
  type Mission,
  type Point,
  type VisualThemeKey,
} from "./levels.ts";

export type { VisualThemeKey } from "./levels.ts";

export interface VisualTheme {
  key: VisualThemeKey;
  ground: [string, string, string];
  texture: [string, string];
  gridColor: string;
  gridOpacity: number;
  dustTint: string;
  shadowStrength: number;
  decalPalette: [string, string, string, string];
}

export type ParticleKind = "spark" | "smoke" | "dust" | "debris" | "flash" | "ring";
export type DecalKind =
  | "scorch"
  | "crater"
  | "mine-crater"
  | "wall-chip"
  | "oil"
  | "rubble"
  | "grate"
  | "warning"
  | "cable"
  | "casings";

export interface Decal extends Point {
  id: number;
  kind: DecalKind;
  angle: number;
  size: number;
  opacity: number;
  color: string;
  life?: number;
  critical?: boolean;
}

export interface Wreck extends Point {
  id: number;
  kind: EnemyKind | "player";
  hullAngle: number;
  turretAngle: number;
  scale: number;
  faction: "player" | "enemy";
  burn: number;
  life: number;
  critical?: boolean;
}

export const WRECK_SOLID_SECONDS = 20;
export const WRECK_FADE_SECONDS = 8;

export function getWreckOpacity(life: number): number {
  if (life <= 0) return 0;
  return Math.min(1, life / WRECK_FADE_SECONDS);
}

export const VISUAL_CAPS = {
  particles: 700,
  trackMarks: 300,
  decals: 220,
  wrecks: 30,
} as const;

export const VISUAL_THEMES: Record<VisualThemeKey, VisualTheme> = {
  "proving-ground": {
    key: "proving-ground",
    ground: ["#17211b", "#111914", "#090f0c"],
    texture: ["#34483b", "#080c09"],
    gridColor: "#8fbda2",
    gridOpacity: 0.075,
    dustTint: "#a99a72",
    shadowStrength: 0.3,
    decalPalette: ["#15150f", "#24241a", "#3a3324", "#77705a"],
  },
  industrial: {
    key: "industrial",
    ground: ["#1c201f", "#131716", "#090c0c"],
    texture: ["#444b48", "#080a0a"],
    gridColor: "#9eb8ad",
    gridOpacity: 0.06,
    dustTint: "#9f9380",
    shadowStrength: 0.38,
    decalPalette: ["#111413", "#262b29", "#413b32", "#7d7568"],
  },
  "command-complex": {
    key: "command-complex",
    ground: ["#151d1c", "#0c1312", "#050909"],
    texture: ["#30413d", "#040706"],
    gridColor: "#8ae4c4",
    gridOpacity: 0.095,
    dustTint: "#899b91",
    shadowStrength: 0.46,
    decalPalette: ["#080b0a", "#18201e", "#293632", "#6c7e76"],
  },
};

function hash32(...values: number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= value | 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

function unitHash(...values: number[]): number {
  return hash32(...values) / 0xffff_ffff;
}

export interface GroundTextureSample {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  dark: boolean;
}

export function generateGroundTileTexture(
  missionNumber: string | number,
  tileX: number,
  tileY: number,
): GroundTextureSample[] {
  const seed = Number.parseInt(String(missionNumber), 10) || 1;
  return Array.from({ length: 7 }, (_, index) => ({
    x: unitHash(seed, tileX, tileY, index, 1),
    y: unitHash(seed, tileX, tileY, index, 2),
    radius: 0.7 + unitHash(seed, tileX, tileY, index, 3) * 2.2,
    alpha: 0.025 + unitHash(seed, tileX, tileY, index, 4) * 0.08,
    dark: unitHash(seed, tileX, tileY, index, 5) > 0.55,
  }));
}

export function generateEnvironmentalDetails(mission: Mission): Decal[] {
  const seed = Number.parseInt(mission.number, 10) || 1;
  const theme = VISUAL_THEMES[mission.visualTheme];
  const kinds: DecalKind[] = ["grate", "warning", "cable", "rubble", "casings", "oil"];
  const count = 46;
  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[hash32(seed, index, 8) % kinds.length];
    return {
      id: -(index + 1),
      kind,
      x: 48 + unitHash(seed, index, 10) * (WORLD_WIDTH - 96),
      y: 48 + unitHash(seed, index, 11) * (WORLD_HEIGHT - 96),
      angle: unitHash(seed, index, 12) * Math.PI * 2,
      size: 8 + unitHash(seed, index, 13) * 18,
      opacity: 0.18 + unitHash(seed, index, 14) * 0.24,
      color: theme.decalPalette[hash32(seed, index, 15) % theme.decalPalette.length],
    };
  });
}

export function calculateRecoilOffset(
  strength: number,
  remaining: number,
  duration: number,
): number {
  if (strength <= 0 || remaining <= 0 || duration <= 0) return 0;
  const progress = Math.min(1, remaining / duration);
  return strength * progress * progress;
}

export function getAdmittedParticleCount(
  kind: ParticleKind,
  requested: number,
  reducedMotion: boolean,
): number {
  const safeCount = Math.max(0, Math.floor(requested));
  if (!reducedMotion) return safeCount;
  if (kind === "ring") return 0;
  if (kind === "smoke" || kind === "dust") return Math.ceil(safeCount / 2);
  return Math.max(safeCount > 0 ? 1 : 0, safeCount);
}

export function pushCapped<T extends { critical?: boolean }>(
  collection: T[],
  value: T,
  cap: number,
): void {
  if (cap <= 0) return;
  if (collection.length >= cap) {
    const oldestNoncritical = collection.findIndex((entry) => !entry.critical);
    if (oldestNoncritical < 0 && !value.critical) return;
    collection.splice(oldestNoncritical >= 0 ? oldestNoncritical : 0, 1);
  }
  collection.push(value);
}
