import type { Mission, Point } from "./levels.ts";
import { placePickups } from "./pickups.ts";

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

export function placeMissionAmmoPacks(
  mission: Mission,
  random = Math.random,
  occupied: readonly Point[] = [],
): AmmoPack[] {
  return placePickups(mission, ["piercing", "explosive", "emp"] as const, {
    radius: AMMO_PACK_RADIUS, edge: 64, spawnClearance: 96, pickupClearance: 92, wallGap: 10,
  }, random, occupied);
}
