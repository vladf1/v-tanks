export const CANNON_KINDS = ["rapid", "heavy", "ricochet"] as const;
export const CHASSIS_KINDS = ["fast", "armored", "balanced"] as const;
export const UTILITY_KINDS = ["dash", "shield", "mine"] as const;

export type CannonKind = typeof CANNON_KINDS[number];
export type ChassisKind = typeof CHASSIS_KINDS[number];
export type UtilityKind = typeof UTILITY_KINDS[number];

export interface Loadout {
  cannon: CannonKind;
  chassis: ChassisKind;
  utility: UtilityKind;
}

export interface LoadoutOption {
  label: string;
  description: string;
}

export const DEFAULT_LOADOUT: Loadout = {
  cannon: "ricochet",
  chassis: "balanced",
  utility: "dash",
};

export const CANNONS: Record<CannonKind, LoadoutOption> = {
  rapid: { label: "Cycler", description: "Fast reload, lighter shells." },
  heavy: { label: "Siege", description: "Slow reload, double damage." },
  ricochet: { label: "Bankshot", description: "Two wall bounces." },
};

export const CHASSIS: Record<ChassisKind, LoadoutOption> = {
  fast: { label: "Raptor", description: "Fast movement, 2 hull." },
  armored: { label: "Bulwark", description: "Slower movement, 5 hull." },
  balanced: { label: "Vanguard", description: "Balanced speed and 3 hull." },
};

export const UTILITIES: Record<UtilityKind, LoadoutOption> = {
  dash: { label: "Overdrive", description: "Short 2.6 second dash recharge." },
  shield: { label: "Aegis", description: "Deploy with a 3-hit shield." },
  mine: { label: "Sapper", description: "Press E to deploy proximity mines." },
};

export function parseLoadout(value: unknown): Loadout {
  if (!value || typeof value !== "object") return { ...DEFAULT_LOADOUT };
  const candidate = value as Partial<Loadout>;
  return {
    cannon: CANNON_KINDS.includes(candidate.cannon as CannonKind)
      ? candidate.cannon as CannonKind
      : DEFAULT_LOADOUT.cannon,
    chassis: CHASSIS_KINDS.includes(candidate.chassis as ChassisKind)
      ? candidate.chassis as ChassisKind
      : DEFAULT_LOADOUT.chassis,
    utility: UTILITY_KINDS.includes(candidate.utility as UtilityKind)
      ? candidate.utility as UtilityKind
      : DEFAULT_LOADOUT.utility,
  };
}

export function getChassisStats(kind: ChassisKind): { hp: number; speed: number } {
  if (kind === "fast") return { hp: 2, speed: 1.2 };
  if (kind === "armored") return { hp: 5, speed: 0.82 };
  return { hp: 3, speed: 1 };
}

export function getCannonStats(kind: CannonKind): {
  reload: number;
  damage: number;
  bounces: number;
  speed: number;
} {
  if (kind === "rapid") return { reload: 0.19, damage: 1, bounces: 0, speed: 570 };
  if (kind === "heavy") return { reload: 0.62, damage: 2, bounces: 0, speed: 470 };
  return { reload: 0.34, damage: 1, bounces: 2, speed: 535 };
}
