import {
  DEFAULT_PLAYER_TANK,
  inferPlayerTank,
  parsePlayerTank,
  type PlayerTankKind,
} from "./loadouts.ts";

export type MissionRank = "S" | "A" | "B";

export interface MissionRecord {
  rank: MissionRank;
  time: number;
  accuracy: number;
  hull: number;
  bonus: boolean;
}

export interface GameSettings {
  sound: boolean;
}

export interface CampaignSave {
  version: 3;
  unlockedMission: number;
  records: Record<string, MissionRecord>;
  tankClass: PlayerTankKind;
  survivalBest: number;
  settings: GameSettings;
}

const SAVE_KEY = "v-tanks-save-v2";
const LEGACY_PROGRESS_KEY = "v-tanks-campaign-v1";

export function createDefaultSave(): CampaignSave {
  return {
    version: 3,
    unlockedMission: 0,
    records: {},
    tankClass: DEFAULT_PLAYER_TANK,
    survivalBest: 0,
    settings: {
      sound: true,
    },
  };
}

export function readCampaignSave(): CampaignSave {
  const fallback = createDefaultSave();
  try {
    const legacy = Number.parseInt(localStorage.getItem(LEGACY_PROGRESS_KEY) ?? "0", 10);
    if (Number.isFinite(legacy)) fallback.unlockedMission = Math.max(0, legacy);
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (!stored || (stored.version !== 2 && stored.version !== 3)) return fallback;
    const records: Record<string, MissionRecord> = {};
    for (const [key, record] of Object.entries(!Array.isArray(stored.records) ? stored.records ?? {} : {})) {
      const value = record as MissionRecord | null;
      if (!/^\d+$/.test(key) || !value || !["S", "A", "B"].includes(value.rank)
        || ![value.time, value.accuracy, value.hull].every(isNonnegativeNumber)
        || typeof value.bonus !== "boolean") continue;
      records[key] = { rank: value.rank, time: value.time, accuracy: value.accuracy,
        hull: value.hull, bonus: value.bonus };
    }
    return {
      version: 3,
      unlockedMission: isNonnegativeNumber(stored.unlockedMission)
        ? Math.floor(stored.unlockedMission) : fallback.unlockedMission,
      records,
      survivalBest: isNonnegativeNumber(stored.survivalBest) ? stored.survivalBest : 0,
      tankClass: stored.version === 2
        ? inferPlayerTank(stored.loadout)
        : parsePlayerTank(stored.tankClass),
      settings: {
        sound: typeof stored.settings?.sound === "boolean" ? stored.settings.sound : true,
      },
    };
  } catch {
    return fallback;
  }
}

export function writeCampaignSave(save: CampaignSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Keep playing with the in-memory save when storage is blocked or full.
  }
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const RANK_VALUE: Record<MissionRank, number> = { B: 1, A: 2, S: 3 };

export function bestRecord(
  previous: MissionRecord | undefined,
  next: MissionRecord,
): MissionRecord {
  if (!previous) return next;
  if (RANK_VALUE[next.rank] > RANK_VALUE[previous.rank]) return next;
  if (RANK_VALUE[next.rank] < RANK_VALUE[previous.rank]) return previous;
  return {
    rank: previous.rank,
    time: Math.min(previous.time, next.time),
    accuracy: Math.max(previous.accuracy, next.accuracy),
    hull: Math.max(previous.hull, next.hull),
    bonus: previous.bonus || next.bonus,
  };
}
