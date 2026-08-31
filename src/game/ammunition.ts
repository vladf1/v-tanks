import {
  TANK_WALL_PADDING,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Mission,
  type Point,
} from "./levels.ts";

export const AMMO_KINDS = ["basic", "piercing", "explosive", "emp"] as const;
export type AmmoKind = typeof AMMO_KINDS[number];
export type AmmoInventory = Record<AmmoKind, number>;

export interface AmmoDefinition {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  packSize: number;
  speedMultiplier: number;
  damageMultiplier: number;
  bounces: number | null;
  penetrations: number;
  ignoresProjectiles: boolean;
  explosionRadius: number;
  stunRadius: number;
  stunSeconds: number;
}

export const AMMO_DEFINITIONS: Record<AmmoKind, AmmoDefinition> = {
  basic: {
    label: "Standard Round",
    shortLabel: "STD",
    description: "Unlimited, dependable ammunition using your tank's native cannon.",
    color: "#9dffd7",
    packSize: 0,
    speedMultiplier: 1,
    damageMultiplier: 1,
    bounces: null,
    penetrations: 0,
    ignoresProjectiles: false,
    explosionRadius: 0,
    stunRadius: 0,
    stunSeconds: 0,
  },
  piercing: {
    label: "Needle AP",
    shortLabel: "AP",
    description: "Fast, sharp rounds that pass through enemy fire, armor, and two tanks.",
    color: "#e8fff8",
    packSize: 8,
    speedMultiplier: 1.28,
    damageMultiplier: 1.25,
    bounces: 0,
    penetrations: 2,
    ignoresProjectiles: true,
    explosionRadius: 0,
    stunRadius: 0,
    stunSeconds: 0,
  },
  explosive: {
    label: "High Explosive",
    shortLabel: "HE",
    description: "Slow heavy shells that splash nearby tanks and trigger volatile hazards.",
    color: "#ffb45f",
    packSize: 6,
    speedMultiplier: 0.78,
    damageMultiplier: 1.35,
    bounces: 0,
    penetrations: 0,
    ignoresProjectiles: false,
    explosionRadius: 78,
    stunRadius: 0,
    stunSeconds: 0,
  },
  emp: {
    label: "EMP Capsule",
    shortLabel: "EMP",
    description: "Disruptor rounds that stun every hostile near the impact point.",
    color: "#7bdcff",
    packSize: 5,
    speedMultiplier: 0.9,
    damageMultiplier: 1,
    bounces: 0,
    penetrations: 0,
    ignoresProjectiles: false,
    explosionRadius: 0,
    stunRadius: 118,
    stunSeconds: 2.8,
  },
};

export interface AmmoPack extends Point {
  id: number;
  kind: Exclude<AmmoKind, "basic">;
  radius: number;
  active: boolean;
}

export interface AmmoSnapshot {
  kind: AmmoKind;
  count: number | null;
}

export const AMMO_PACK_RADIUS = 16;
const EDGE_PADDING = 64;
const SPAWN_CLEARANCE = 96;
const PACK_CLEARANCE = 92;

export function createAmmoInventory(): AmmoInventory {
  return { basic: Number.POSITIVE_INFINITY, piercing: 0, explosive: 0, emp: 0 };
}

export function addAmmo(inventory: AmmoInventory, kind: Exclude<AmmoKind, "basic">): number {
  inventory[kind] += AMMO_DEFINITIONS[kind].packSize;
  return inventory[kind];
}

export function getAmmoSnapshots(inventory: AmmoInventory): AmmoSnapshot[] {
  return AMMO_KINDS.map((kind) => ({
    kind,
    count: Number.isFinite(inventory[kind]) ? inventory[kind] : null,
  }));
}

export function cycleAmmo(
  current: AmmoKind,
  direction: number,
  inventory: AmmoInventory,
): AmmoKind {
  const step = direction >= 0 ? 1 : -1;
  const start = AMMO_KINDS.indexOf(current);
  for (let offset = 1; offset <= AMMO_KINDS.length; offset += 1) {
    const index = (start + offset * step + AMMO_KINDS.length) % AMMO_KINDS.length;
    const candidate = AMMO_KINDS[index];
    if (inventory[candidate] > 0) return candidate;
  }
  return "basic";
}

function distanceSquared(first: Point, second: Point): number {
  const x = first.x - second.x;
  const y = first.y - second.y;
  return x * x + y * y;
}

function isSafePackPosition(point: Point, mission: Mission, placed: AmmoPack[]): boolean {
  const wallPadding = AMMO_PACK_RADIUS + TANK_WALL_PADDING + 10;
  if (mission.walls.some((wall) => (
    point.x >= wall.x - wallPadding
      && point.x <= wall.x + wall.width + wallPadding
      && point.y >= wall.y - wallPadding
      && point.y <= wall.y + wall.height + wallPadding
  ))) return false;
  if ([mission.player, ...mission.enemies].some((spawn) => (
    distanceSquared(point, spawn) < SPAWN_CLEARANCE * SPAWN_CLEARANCE
  ))) return false;
  return placed.every((pack) => distanceSquared(point, pack) >= PACK_CLEARANCE * PACK_CLEARANCE);
}

export function placeMissionAmmoPacks(
  mission: Mission,
  random: () => number = Math.random,
): AmmoPack[] {
  const placed: AmmoPack[] = [];
  const kinds = AMMO_KINDS.filter((kind): kind is Exclude<AmmoKind, "basic"> => kind !== "basic");
  for (const [id, kind] of kinds.entries()) {
    let position: Point | null = null;
    for (let attempt = 0; attempt < 140; attempt += 1) {
      const candidate = {
        x: EDGE_PADDING + random() * (WORLD_WIDTH - EDGE_PADDING * 2),
        y: EDGE_PADDING + random() * (WORLD_HEIGHT - EDGE_PADDING * 2),
      };
      if (isSafePackPosition(candidate, mission, placed)) {
        position = candidate;
        break;
      }
    }
    if (!position) throw new Error(`Mission ${mission.number} has no safe ${kind} ammunition pack.`);
    placed.push({ id, kind, ...position, radius: AMMO_PACK_RADIUS, active: true });
  }
  return placed;
}
