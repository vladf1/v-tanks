import { DEFAULT_LOADOUT, parseLoadout, type Loadout } from "./loadouts.ts";

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
  version: 2;
  unlockedMission: number;
  records: Record<string, MissionRecord>;
  loadout: Loadout;
  survivalBest: number;
  settings: GameSettings;
}

const SAVE_KEY = "v-tanks-save-v2";
const LEGACY_PROGRESS_KEY = "v-tanks-campaign-v1";

export function createDefaultSave(): CampaignSave {
  const legacy = Number.parseInt(localStorage.getItem(LEGACY_PROGRESS_KEY) ?? "0", 10);
  return {
    version: 2,
    unlockedMission: Number.isFinite(legacy) ? Math.max(0, legacy) : 0,
    records: {},
    loadout: { ...DEFAULT_LOADOUT },
    survivalBest: 0,
    settings: {
      sound: true,
    },
  };
}

export function readCampaignSave(): CampaignSave {
  const fallback = createDefaultSave();
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as Partial<CampaignSave> | null;
    if (!stored || stored.version !== 2) return fallback;
    return {
      ...fallback,
      ...stored,
      unlockedMission: Math.max(0, stored.unlockedMission ?? fallback.unlockedMission),
      records: stored.records ?? {},
      loadout: parseLoadout(stored.loadout),
      settings: {
        sound: stored.settings?.sound ?? fallback.settings.sound,
      },
    };
  } catch {
    return fallback;
  }
}

export function writeCampaignSave(save: CampaignSave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
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
