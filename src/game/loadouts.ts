export const CANNON_KINDS = ["rapid", "heavy", "ricochet"] as const;
export const CHASSIS_KINDS = ["fast", "armored", "balanced"] as const;
export const UTILITY_KINDS = ["dash", "shield", "mine", "shock"] as const;

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
  dash: { label: "Overdrive", description: "Right click to surge through incoming fire." },
  shield: { label: "Aegis", description: "Right click to raise a three-hit shield." },
  mine: { label: "Sapper", description: "Right click to deploy a proximity mine." },
  shock: { label: "Arc Pulse", description: "Right click to stun every nearby hostile." },
};

export const PLAYER_TANK_KINDS = ["raptor", "vanguard", "bulwark", "sapper"] as const;
export type PlayerTankKind = typeof PLAYER_TANK_KINDS[number];

export interface PlayerTankDefinition {
  label: string;
  role: string;
  description: string;
  abilityLabel: string;
  abilityDescription: string;
  abilityCooldown: number;
  hp: number;
  speed: number;
  mineCharges: number;
  loadout: Loadout;
}

export const PLAYER_TANKS: Record<PlayerTankKind, PlayerTankDefinition> = {
  raptor: {
    label: "Raptor",
    role: "FAST STRIKER",
    description: "3 hull · fastest movement · rapid cannon",
    abilityLabel: "OVERDRIVE",
    abilityDescription: "Dash through danger with a brief invulnerable window.",
    abilityCooldown: 2.6,
    hp: 3,
    speed: 1.24,
    mineCharges: 0,
    loadout: { cannon: "rapid", chassis: "fast", utility: "dash" },
  },
  vanguard: {
    label: "Vanguard",
    role: "CONTROL BRAWLER",
    description: "4 hull · balanced handling · bankshot cannon",
    abilityLabel: "ARC PULSE",
    abilityDescription: "Stun every hostile tank within 170 meters.",
    abilityCooldown: 8,
    hp: 4,
    speed: 1,
    mineCharges: 0,
    loadout: { cannon: "ricochet", chassis: "balanced", utility: "shock" },
  },
  bulwark: {
    label: "Bulwark",
    role: "HEAVY BREAKER",
    description: "7 hull · slow movement · two-damage siege cannon",
    abilityLabel: "AEGIS SHIELD",
    abilityDescription: "Raise a timed shield that absorbs three damage.",
    abilityCooldown: 12,
    hp: 7,
    speed: 0.76,
    mineCharges: 0,
    loadout: { cannon: "heavy", chassis: "armored", utility: "shield" },
  },
  sapper: {
    label: "Sapper",
    role: "AREA DENIAL",
    description: "4 hull · steady movement · five deployable mines",
    abilityLabel: "LAY MINE",
    abilityDescription: "Drop a shootable proximity mine behind your tank.",
    abilityCooldown: 0.45,
    hp: 4,
    speed: 0.92,
    mineCharges: 5,
    loadout: { cannon: "ricochet", chassis: "balanced", utility: "mine" },
  },
};

export const DEFAULT_PLAYER_TANK: PlayerTankKind = "vanguard";

export function parsePlayerTank(value: unknown): PlayerTankKind {
  return PLAYER_TANK_KINDS.includes(value as PlayerTankKind)
    ? value as PlayerTankKind
    : DEFAULT_PLAYER_TANK;
}

export function inferPlayerTank(loadout: unknown): PlayerTankKind {
  const parsed = parseLoadout(loadout);
  return PLAYER_TANK_KINDS.find((kind) => {
    const preset = PLAYER_TANKS[kind].loadout;
    return preset.cannon === parsed.cannon
      && preset.chassis === parsed.chassis
      && preset.utility === parsed.utility;
  }) ?? DEFAULT_PLAYER_TANK;
}

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
