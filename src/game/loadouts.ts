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

export const DEFAULT_LOADOUT: Loadout = {
  cannon: "ricochet",
  chassis: "balanced",
  utility: "dash",
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
