export type EnemyKind =
  | "scout"
  | "guard"
  | "sniper"
  | "heavy"
  | "minelayer"
  | "support"
  | "artillery"
  | "boss";

export interface Point {
  x: number;
  y: number;
}

export type WallKind = "rock" | "dragons-teeth" | "hedgehog";

export interface Wall {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: WallKind;
}

export interface EnemySpawn extends Point {
  kind: EnemyKind;
}

export type ObjectiveKind = "eliminate" | "relays" | "hold" | "survive" | "omega";
export type BonusKind = "accuracy" | "hull" | "time" | "ricochet";
export type HazardKind = "barrel" | "mud" | "minefield" | "repair-station" | "barricade";
export type VisualThemeKey = "proving-ground" | "industrial" | "command-complex";

export function getMissionVisualTheme(missionNumber: string | number): VisualThemeKey {
  const parsed = typeof missionNumber === "number"
    ? missionNumber
    : Number.parseInt(missionNumber, 10);
  if ([3, 5, 8, 11, 13].includes(parsed)) return "industrial";
  if ([6, 9, 10, 12, 14].includes(parsed)) return "command-complex";
  return "proving-ground";
}

export interface ObjectiveSpec {
  kind: ObjectiveKind;
  label: string;
  description: string;
  targetSeconds: number;
  positions: Point[];
}

export interface BonusObjective {
  kind: BonusKind;
  label: string;
  target: number;
}

export interface HazardSpawn extends Point {
  id: number;
  kind: HazardKind;
  radius: number;
}

export interface ReinforcementPlan {
  count: number;
  intervalMin: number;
  intervalMax: number;
  maxConcurrent: number;
}

export interface Mission {
  number: string;
  visualTheme: VisualThemeKey;
  name: string;
  briefing: string;
  threat: string;
  parTime: number;
  player: Point;
  enemies: EnemySpawn[];
  reinforcements: ReinforcementPlan;
  walls: Wall[];
  objective: ObjectiveSpec;
  bonus: BonusObjective;
  hazards: HazardSpawn[];
}

export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 600;
export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1500;
export const STANDARD_TANK_RADIUS = 15;
export const BOSS_TANK_RADIUS = 25;
export const TANK_WALL_PADDING = 2;

const ARENA_SCALE = 2.5;
const PAR_TIME_SCALE = 2;
const REINFORCEMENT_PAR_SECONDS = 4.5;
const REINFORCEMENT_COUNTS = [7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
const WALL_KINDS: WallKind[] = ["rock", "dragons-teeth", "hedgehog"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getCameraPosition(focus: Point): Point {
  return {
    x: clamp(focus.x - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH),
    y: clamp(focus.y - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT),
  };
}

type MissionTemplate = Omit<
  Mission,
  "visualTheme" | "reinforcements" | "walls" | "objective" | "bonus" | "hazards"
> & {
  walls: Array<Omit<Wall, "kind">>;
};

const OBJECTIVE_KINDS: ObjectiveKind[] = [
  "eliminate",
  "relays",
  "hold",
  "survive",
  "relays",
  "eliminate",
  "hold",
  "survive",
  "relays",
  "eliminate",
  "relays",
  "hold",
  "survive",
  "omega",
];
const BONUS_KINDS: BonusKind[] = [
  "accuracy",
  "ricochet",
  "hull",
  "time",
  "accuracy",
  "hull",
  "ricochet",
  "time",
  "accuracy",
  "hull",
  "time",
  "ricochet",
  "accuracy",
  "hull",
];

function distanceSquared(first: Point, second: Point): number {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return (deltaX * deltaX) + (deltaY * deltaY);
}

function findFeaturePositions(
  mission: Pick<Mission, "player" | "enemies" | "walls">,
  count: number,
  offset: number,
): Point[] {
  const candidates: Point[] = [];
  for (let y = 150; y <= WORLD_HEIGHT - 150; y += 150) {
    for (let x = 150; x <= WORLD_WIDTH - 150; x += 170) {
      candidates.push({ x, y });
    }
  }
  candidates.sort((first, second) => {
    const firstScore = noiseScore(first, offset);
    const secondScore = noiseScore(second, offset);
    return firstScore - secondScore;
  });

  const placed: Point[] = [];
  for (const candidate of candidates) {
    if (mission.walls.some((wall) => isPointInExpandedWall(candidate, wall, 62))) continue;
    if ([mission.player, ...mission.enemies].some((spawn) => (
      distanceSquared(candidate, spawn) < 150 * 150
    ))) continue;
    if (placed.some((point) => distanceSquared(candidate, point) < 230 * 230)) continue;
    placed.push(candidate);
    if (placed.length === count) break;
  }
  return placed;
}

function noiseScore(point: Point, seed: number): number {
  const value = Math.sin(point.x * 0.013 + point.y * 0.019 + seed * 4.17) * 43758.5453;
  return value - Math.floor(value);
}

function createObjective(
  mission: Pick<Mission, "player" | "enemies" | "walls">,
  missionIndex: number,
): ObjectiveSpec {
  const kind = OBJECTIVE_KINDS[missionIndex] ?? "eliminate";
  const relayCount = missionIndex >= 8 ? 4 : missionIndex >= 4 ? 3 : 2;
  const positions = findFeaturePositions(
    mission,
    kind === "relays" ? relayCount : kind === "omega" ? 3 : kind === "hold" ? 1 : 0,
    missionIndex + 31,
  );
  if (kind === "relays") {
    return {
      kind,
      label: "DISABLE RELAYS",
      description: `Destroy all ${relayCount} command relays. Hostiles are secondary.`,
      targetSeconds: 0,
      positions,
    };
  }
  if (kind === "hold") {
    const seconds = 20;
    return {
      kind,
      label: "HOLD UPLINK",
      description: `Occupy the uplink for ${seconds} seconds under fire.`,
      targetSeconds: seconds,
      positions,
    };
  }
  if (kind === "survive") {
    const seconds = missionIndex >= 7 ? 105 : 78;
    return {
      kind,
      label: "SURVIVE",
      description: `Remain operational for ${seconds} seconds.`,
      targetSeconds: seconds,
      positions: [],
    };
  }
  if (kind === "omega") {
    return {
      kind,
      label: "BREAK THE OMEGA CORE",
      description: "Destroy both shield generators, eliminate the Core, then extract.",
      targetSeconds: 0,
      positions,
    };
  }
  return {
    kind,
    label: "CLEAR THE ARENA",
    description: "Eliminate every hostile tank.",
    targetSeconds: 0,
    positions: [],
  };
}

function createBonus(missionIndex: number): BonusObjective {
  const kind = BONUS_KINDS[missionIndex] ?? "accuracy";
  if (kind === "accuracy") return { kind, label: "Maintain 65% accuracy", target: 65 };
  if (kind === "hull") return { kind, label: "Finish with at least 2 hull", target: 2 };
  if (kind === "time") return { kind, label: "Beat the operation par time", target: 1 };
  return { kind, label: "Score 5 ricochet hits", target: 5 };
}

function createHazards(
  mission: Pick<Mission, "player" | "enemies" | "walls">,
  missionIndex: number,
): HazardSpawn[] {
  if (missionIndex < 1) return [];
  const count = Math.min(7, 2 + Math.floor(missionIndex / 2));
  const positions = findFeaturePositions(mission, count, missionIndex + 83);
  const kinds: HazardKind[] = ["barrel", "mud", "minefield", "repair-station", "barricade"];
  return positions.map((position, index) => ({
    ...position,
    id: missionIndex * 10 + index,
    kind: kinds[(missionIndex + index) % kinds.length],
    radius: kinds[(missionIndex + index) % kinds.length] === "mud" ? 58 : 20,
  }));
}

function expandMission(mission: MissionTemplate, missionIndex: number): Mission {
  const wallKindOffset = Number.parseInt(mission.number, 10) % WALL_KINDS.length;
  const reinforcementCount = REINFORCEMENT_COUNTS[missionIndex];
  const expanded = {
    ...mission,
    parTime: Math.round(
      (mission.parTime * PAR_TIME_SCALE)
      + (reinforcementCount * REINFORCEMENT_PAR_SECONDS),
    ),
    player: {
      x: mission.player.x * ARENA_SCALE,
      y: mission.player.y * ARENA_SCALE,
    },
    enemies: mission.enemies.map((enemy, index) => ({
      ...enemy,
      kind: upgradeEnemyKind(enemy.kind, missionIndex, index),
      x: enemy.x * ARENA_SCALE,
      y: enemy.y * ARENA_SCALE,
    })),
    reinforcements: {
      count: reinforcementCount,
      intervalMin: 6
        - (Math.min(missionIndex, 9) * 0.22)
        - (Math.max(0, missionIndex - 9) * 0.08),
      intervalMax: 8.5
        - (Math.min(missionIndex, 9) * 0.32)
        - (Math.max(0, missionIndex - 9) * 0.06),
      maxConcurrent: mission.enemies.length + 1 + Math.min(1, Math.floor(missionIndex / 5)),
    },
    walls: mission.walls.map((wall, index) => ({
      x: wall.x * ARENA_SCALE,
      y: wall.y * ARENA_SCALE,
      width: wall.width * ARENA_SCALE,
      height: wall.height * ARENA_SCALE,
      kind: WALL_KINDS[(wallKindOffset + index) % WALL_KINDS.length],
    })),
  };
  return {
    ...expanded,
    visualTheme: getMissionVisualTheme(mission.number),
    objective: createObjective(expanded, missionIndex),
    bonus: createBonus(missionIndex),
    hazards: createHazards(expanded, missionIndex),
  };
}

function upgradeEnemyKind(
  kind: EnemyKind,
  missionIndex: number,
  enemyIndex: number,
): EnemyKind {
  if (kind === "boss" || missionIndex < 3) return kind;
  if (enemyIndex === 0 && missionIndex >= 3 && missionIndex <= 6) {
    return (["heavy", "minelayer", "support", "artillery"] as EnemyKind[])[missionIndex - 3];
  }
  const cycle: EnemyKind[] = ["heavy", "minelayer", "support", "artillery"];
  const specialFrequency = missionIndex >= 7 ? 4 : 6;
  if ((enemyIndex + missionIndex) % specialFrequency !== 0) return kind;
  return cycle[(missionIndex + enemyIndex) % cycle.length];
}

export function getMissionEnemyTotal(mission: Mission): number {
  return mission.enemies.length + mission.reinforcements.count;
}

export interface SpawnOverlap {
  unit: string;
  wallIndex: number;
}

function isPointInExpandedWall(point: Point, wall: Wall, expansion: number): boolean {
  return point.x >= wall.x - expansion
    && point.x <= wall.x + wall.width + expansion
    && point.y >= wall.y - expansion
    && point.y <= wall.y + wall.height + expansion;
}

export function findMissionSpawnOverlaps(mission: Mission): SpawnOverlap[] {
  const units = [
    { label: "player", radius: STANDARD_TANK_RADIUS, point: mission.player },
    ...mission.enemies.map((enemy, index) => ({
      label: `enemy ${index + 1}`,
      radius: enemy.kind === "boss" ? BOSS_TANK_RADIUS : STANDARD_TANK_RADIUS,
      point: enemy,
    })),
  ];

  return units.flatMap((unit) => mission.walls.flatMap((wall, wallIndex) => (
    isPointInExpandedWall(unit.point, wall, unit.radius + TANK_WALL_PADDING)
      ? [{ unit: unit.label, wallIndex }]
      : []
  )));
}

const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    number: "01",
    name: "First Contact",
    briefing: "Clear the calibration floor. Use the walls to break enemy sightlines.",
    threat: "LOW",
    parTime: 36,
    player: { x: 150, y: 300 },
    enemies: [
      { kind: "scout", x: 610, y: 95 },
      { kind: "scout", x: 730, y: 170 },
      { kind: "scout", x: 790, y: 430 },
      { kind: "guard", x: 690, y: 300 },
      { kind: "guard", x: 840, y: 300 },
    ],
    walls: [
      { x: 372, y: 78, width: 34, height: 180 },
      { x: 372, y: 342, width: 34, height: 180 },
      { x: 555, y: 215, width: 105, height: 28 },
      { x: 555, y: 357, width: 105, height: 28 },
    ],
  },
  {
    number: "02",
    name: "Crossfire",
    briefing: "A split lane with no safe center. Ricochet shots around the barricades.",
    threat: "LOW",
    parTime: 46,
    player: { x: 480, y: 510 },
    enemies: [
      { kind: "scout", x: 180, y: 135 },
      { kind: "guard", x: 480, y: 120 },
      { kind: "scout", x: 780, y: 135 },
      { kind: "guard", x: 210, y: 370 },
      { kind: "guard", x: 750, y: 370 },
      { kind: "scout", x: 130, y: 495 },
      { kind: "sniper", x: 830, y: 500 },
    ],
    walls: [
      { x: 298, y: 74, width: 28, height: 195 },
      { x: 634, y: 74, width: 28, height: 195 },
      { x: 298, y: 350, width: 28, height: 170 },
      { x: 634, y: 350, width: 28, height: 170 },
      { x: 416, y: 265, width: 128, height: 70 },
    ],
  },
  {
    number: "03",
    name: "Blind Corner",
    briefing: "Long sightlines favor marksmen. Keep moving and close distance quickly.",
    threat: "MED",
    parTime: 54,
    player: { x: 115, y: 500 },
    enemies: [
      { kind: "sniper", x: 845, y: 96 },
      { kind: "sniper", x: 845, y: 500 },
      { kind: "guard", x: 530, y: 300 },
      { kind: "scout", x: 700, y: 200 },
      { kind: "scout", x: 700, y: 350 },
      { kind: "guard", x: 260, y: 120 },
      { kind: "guard", x: 300, y: 500 },
      { kind: "scout", x: 830, y: 300 },
    ],
    walls: [
      { x: 184, y: 208, width: 320, height: 30 },
      { x: 455, y: 238, width: 30, height: 225 },
      { x: 590, y: 95, width: 30, height: 215 },
      { x: 590, y: 385, width: 215, height: 30 },
      { x: 735, y: 210, width: 30, height: 105 },
    ],
  },
  {
    number: "04",
    name: "The Gauntlet",
    briefing: "A dense killbox. Dash through firing lanes before they converge.",
    threat: "HIGH",
    parTime: 66,
    player: { x: 105, y: 300 },
    enemies: [
      { kind: "guard", x: 315, y: 122 },
      { kind: "guard", x: 315, y: 478 },
      { kind: "sniper", x: 510, y: 110 },
      { kind: "sniper", x: 510, y: 490 },
      { kind: "scout", x: 720, y: 205 },
      { kind: "scout", x: 720, y: 395 },
      { kind: "guard", x: 838, y: 160 },
      { kind: "guard", x: 838, y: 440 },
      { kind: "scout", x: 500, y: 300 },
      { kind: "sniper", x: 850, y: 300 },
    ],
    walls: [
      { x: 195, y: 220, width: 110, height: 28 },
      { x: 195, y: 352, width: 110, height: 28 },
      { x: 390, y: 72, width: 28, height: 210 },
      { x: 390, y: 365, width: 28, height: 162 },
      { x: 575, y: 205, width: 120, height: 28 },
      { x: 575, y: 367, width: 120, height: 28 },
      { x: 770, y: 255, width: 28, height: 90 },
    ],
  },
  {
    number: "05",
    name: "Dead Circuit",
    briefing: "Advance from the west. Clear each pocket before pushing deeper into the circuit.",
    threat: "HIGH",
    parTime: 72,
    player: { x: 120, y: 300 },
    enemies: [
      { kind: "sniper", x: 868, y: 92 },
      { kind: "sniper", x: 868, y: 508 },
      { kind: "guard", x: 600, y: 300 },
      { kind: "guard", x: 710, y: 300 },
      { kind: "scout", x: 480, y: 105 },
      { kind: "scout", x: 480, y: 495 },
      { kind: "scout", x: 500, y: 150 },
      { kind: "scout", x: 645, y: 465 },
      { kind: "guard", x: 860, y: 300 },
      { kind: "scout", x: 760, y: 85 },
    ],
    walls: [
      { x: 178, y: 175, width: 155, height: 26 },
      { x: 627, y: 175, width: 155, height: 26 },
      { x: 178, y: 399, width: 155, height: 26 },
      { x: 627, y: 399, width: 155, height: 26 },
      { x: 367, y: 83, width: 26, height: 142 },
      { x: 567, y: 375, width: 26, height: 142 },
      { x: 367, y: 375, width: 26, height: 142 },
      { x: 567, y: 83, width: 26, height: 142 },
      { x: 220, y: 245, width: 26, height: 110 },
    ],
  },
  {
    number: "06",
    name: "Red Bastion",
    briefing: "Breach the command arena and dismantle the bastion's armored escort.",
    threat: "EXTREME",
    parTime: 92,
    player: { x: 115, y: 300 },
    enemies: [
      { kind: "guard", x: 770, y: 300 },
      { kind: "sniper", x: 810, y: 105 },
      { kind: "sniper", x: 810, y: 495 },
      { kind: "guard", x: 585, y: 140 },
      { kind: "guard", x: 585, y: 460 },
      { kind: "scout", x: 420, y: 195 },
      { kind: "scout", x: 420, y: 405 },
      { kind: "guard", x: 300, y: 90 },
      { kind: "guard", x: 300, y: 510 },
      { kind: "scout", x: 650, y: 90 },
      { kind: "scout", x: 650, y: 510 },
    ],
    walls: [
      { x: 210, y: 92, width: 30, height: 166 },
      { x: 210, y: 342, width: 30, height: 166 },
      { x: 345, y: 235, width: 105, height: 28 },
      { x: 345, y: 337, width: 105, height: 28 },
      { x: 520, y: 70, width: 28, height: 150 },
      { x: 520, y: 380, width: 28, height: 150 },
      { x: 665, y: 190, width: 145, height: 24 },
      { x: 665, y: 386, width: 145, height: 24 },
    ],
  },
  {
    number: "07",
    name: "Iron Divide",
    briefing: "Break through layered barricades and clear each armored pocket in sequence.",
    threat: "HIGH",
    parTime: 105,
    player: { x: 100, y: 300 },
    enemies: [
      { kind: "guard", x: 280, y: 120 },
      { kind: "guard", x: 280, y: 480 },
      { kind: "guard", x: 470, y: 300 },
      { kind: "guard", x: 680, y: 120 },
      { kind: "guard", x: 680, y: 480 },
      { kind: "guard", x: 860, y: 300 },
      { kind: "scout", x: 420, y: 100 },
      { kind: "scout", x: 420, y: 500 },
      { kind: "scout", x: 610, y: 275 },
      { kind: "scout", x: 610, y: 325 },
      { kind: "sniper", x: 880, y: 100 },
      { kind: "sniper", x: 880, y: 500 },
    ],
    walls: [
      { x: 190, y: 190, width: 140, height: 28 },
      { x: 190, y: 382, width: 140, height: 28 },
      { x: 360, y: 70, width: 28, height: 170 },
      { x: 360, y: 360, width: 28, height: 170 },
      { x: 520, y: 210, width: 120, height: 28 },
      { x: 520, y: 362, width: 120, height: 28 },
      { x: 720, y: 70, width: 28, height: 180 },
      { x: 720, y: 350, width: 28, height: 180 },
      { x: 790, y: 250, width: 28, height: 100 },
    ],
  },
  {
    number: "08",
    name: "Black Relay",
    briefing: "Sweep the relay grid from the southern staging zone before the lanes collapse.",
    threat: "HIGH",
    parTime: 122,
    player: { x: 480, y: 550 },
    enemies: [
      { kind: "sniper", x: 120, y: 90 },
      { kind: "sniper", x: 840, y: 90 },
      { kind: "sniper", x: 120, y: 500 },
      { kind: "sniper", x: 840, y: 500 },
      { kind: "guard", x: 260, y: 150 },
      { kind: "guard", x: 700, y: 150 },
      { kind: "guard", x: 260, y: 450 },
      { kind: "guard", x: 700, y: 450 },
      { kind: "guard", x: 480, y: 300 },
      { kind: "scout", x: 380, y: 90 },
      { kind: "scout", x: 580, y: 90 },
      { kind: "scout", x: 380, y: 500 },
      { kind: "scout", x: 580, y: 500 },
      { kind: "scout", x: 480, y: 90 },
    ],
    walls: [
      { x: 190, y: 170, width: 28, height: 260 },
      { x: 742, y: 170, width: 28, height: 260 },
      { x: 320, y: 150, width: 320, height: 28 },
      { x: 320, y: 422, width: 320, height: 28 },
      { x: 430, y: 230, width: 100, height: 28 },
      { x: 430, y: 342, width: 100, height: 28 },
      { x: 300, y: 270, width: 28, height: 60 },
      { x: 632, y: 270, width: 28, height: 60 },
    ],
  },
  {
    number: "09",
    name: "Kill Grid",
    briefing: "Push east through a full-depth kill grid. Use every barrier to isolate the packs.",
    threat: "EXTREME",
    parTime: 142,
    player: { x: 90, y: 300 },
    enemies: [
      { kind: "sniper", x: 880, y: 80 },
      { kind: "sniper", x: 880, y: 200 },
      { kind: "sniper", x: 880, y: 400 },
      { kind: "sniper", x: 880, y: 520 },
      { kind: "guard", x: 260, y: 100 },
      { kind: "guard", x: 260, y: 300 },
      { kind: "guard", x: 260, y: 500 },
      { kind: "guard", x: 600, y: 100 },
      { kind: "guard", x: 600, y: 300 },
      { kind: "guard", x: 600, y: 500 },
      { kind: "scout", x: 420, y: 80 },
      { kind: "scout", x: 420, y: 220 },
      { kind: "scout", x: 420, y: 380 },
      { kind: "scout", x: 420, y: 520 },
      { kind: "scout", x: 760, y: 220 },
      { kind: "scout", x: 760, y: 380 },
    ],
    walls: [
      { x: 170, y: 180, width: 120, height: 24 },
      { x: 170, y: 396, width: 120, height: 24 },
      { x: 340, y: 60, width: 24, height: 180 },
      { x: 340, y: 360, width: 24, height: 180 },
      { x: 500, y: 190, width: 120, height: 24 },
      { x: 500, y: 386, width: 120, height: 24 },
      { x: 700, y: 60, width: 24, height: 180 },
      { x: 700, y: 360, width: 24, height: 180 },
      { x: 820, y: 250, width: 24, height: 100 },
    ],
  },
  {
    number: "10",
    name: "Shatterline",
    briefing: "Cut through the fractured command line and turn its volatile defenses inward.",
    threat: "EXTREME",
    parTime: 158,
    player: { x: 110, y: 520 },
    enemies: [
      { kind: "guard", x: 290, y: 120 },
      { kind: "guard", x: 290, y: 300 },
      { kind: "guard", x: 290, y: 480 },
      { kind: "scout", x: 430, y: 90 },
      { kind: "scout", x: 430, y: 220 },
      { kind: "scout", x: 430, y: 390 },
      { kind: "scout", x: 430, y: 520 },
      { kind: "sniper", x: 590, y: 85 },
      { kind: "guard", x: 590, y: 260 },
      { kind: "guard", x: 590, y: 440 },
      { kind: "sniper", x: 720, y: 520 },
      { kind: "guard", x: 760, y: 170 },
      { kind: "guard", x: 760, y: 350 },
      { kind: "sniper", x: 880, y: 80 },
      { kind: "scout", x: 875, y: 300 },
      { kind: "sniper", x: 880, y: 510 },
    ],
    walls: [
      { x: 190, y: 180, width: 110, height: 24 },
      { x: 190, y: 390, width: 110, height: 24 },
      { x: 350, y: 55, width: 24, height: 170 },
      { x: 350, y: 360, width: 24, height: 185 },
      { x: 500, y: 205, width: 120, height: 24 },
      { x: 500, y: 372, width: 120, height: 24 },
      { x: 680, y: 55, width: 24, height: 180 },
      { x: 680, y: 365, width: 24, height: 180 },
      { x: 820, y: 230, width: 24, height: 140 },
    ],
  },
  {
    number: "11",
    name: "Signal Storm",
    briefing: "Disable the relay web while specialist armor closes from every direction.",
    threat: "EXTREME",
    parTime: 172,
    player: { x: 480, y: 545 },
    enemies: [
      { kind: "sniper", x: 90, y: 85 },
      { kind: "sniper", x: 870, y: 85 },
      { kind: "guard", x: 210, y: 145 },
      { kind: "guard", x: 750, y: 145 },
      { kind: "scout", x: 340, y: 90 },
      { kind: "scout", x: 620, y: 90 },
      { kind: "guard", x: 170, y: 310 },
      { kind: "guard", x: 790, y: 310 },
      { kind: "scout", x: 310, y: 300 },
      { kind: "scout", x: 650, y: 300 },
      { kind: "guard", x: 220, y: 475 },
      { kind: "guard", x: 740, y: 475 },
      { kind: "sniper", x: 90, y: 520 },
      { kind: "sniper", x: 870, y: 520 },
      { kind: "scout", x: 400, y: 430 },
      { kind: "scout", x: 545, y: 430 },
      { kind: "guard", x: 480, y: 180 },
    ],
    walls: [
      { x: 130, y: 210, width: 180, height: 24 },
      { x: 650, y: 210, width: 180, height: 24 },
      { x: 130, y: 380, width: 180, height: 24 },
      { x: 650, y: 380, width: 180, height: 24 },
      { x: 350, y: 70, width: 24, height: 155 },
      { x: 586, y: 70, width: 24, height: 155 },
      { x: 350, y: 375, width: 24, height: 155 },
      { x: 586, y: 375, width: 24, height: 155 },
      { x: 435, y: 265, width: 90, height: 70 },
    ],
  },
  {
    number: "12",
    name: "Thunder Basin",
    briefing: "Seize the central uplink and use EMP ammunition to break the encirclement.",
    threat: "EXTREME",
    parTime: 188,
    player: { x: 100, y: 300 },
    enemies: [
      { kind: "guard", x: 270, y: 90 },
      { kind: "guard", x: 270, y: 510 },
      { kind: "scout", x: 360, y: 210 },
      { kind: "scout", x: 360, y: 390 },
      { kind: "sniper", x: 490, y: 80 },
      { kind: "guard", x: 490, y: 220 },
      { kind: "guard", x: 490, y: 380 },
      { kind: "sniper", x: 490, y: 520 },
      { kind: "scout", x: 620, y: 120 },
      { kind: "scout", x: 620, y: 300 },
      { kind: "scout", x: 620, y: 480 },
      { kind: "guard", x: 740, y: 90 },
      { kind: "guard", x: 740, y: 275 },
      { kind: "guard", x: 740, y: 420 },
      { kind: "sniper", x: 875, y: 80 },
      { kind: "scout", x: 865, y: 220 },
      { kind: "scout", x: 865, y: 380 },
      { kind: "sniper", x: 875, y: 520 },
    ],
    walls: [
      { x: 180, y: 170, width: 24, height: 260 },
      { x: 305, y: 70, width: 24, height: 150 },
      { x: 305, y: 380, width: 24, height: 150 },
      { x: 430, y: 245, width: 100, height: 24 },
      { x: 430, y: 331, width: 100, height: 24 },
      { x: 575, y: 70, width: 24, height: 170 },
      { x: 575, y: 360, width: 24, height: 170 },
      { x: 700, y: 220, width: 120, height: 24 },
      { x: 700, y: 356, width: 120, height: 24 },
    ],
  },
  {
    number: "13",
    name: "Last Light",
    briefing: "Survive the final defense lattice. Every ammunition pack is a tactical lifeline.",
    threat: "EXTREME",
    parTime: 205,
    player: { x: 480, y: 535 },
    enemies: [
      { kind: "sniper", x: 80, y: 80 },
      { kind: "sniper", x: 880, y: 80 },
      { kind: "guard", x: 190, y: 135 },
      { kind: "guard", x: 770, y: 135 },
      { kind: "scout", x: 320, y: 85 },
      { kind: "scout", x: 640, y: 85 },
      { kind: "guard", x: 110, y: 300 },
      { kind: "guard", x: 850, y: 300 },
      { kind: "scout", x: 270, y: 285 },
      { kind: "scout", x: 690, y: 285 },
      { kind: "guard", x: 400, y: 210 },
      { kind: "guard", x: 560, y: 210 },
      { kind: "scout", x: 180, y: 470 },
      { kind: "scout", x: 780, y: 470 },
      { kind: "sniper", x: 70, y: 525 },
      { kind: "sniper", x: 890, y: 525 },
      { kind: "guard", x: 390, y: 405 },
      { kind: "guard", x: 570, y: 405 },
      { kind: "scout", x: 480, y: 95 },
    ],
    walls: [
      { x: 145, y: 190, width: 150, height: 24 },
      { x: 665, y: 190, width: 150, height: 24 },
      { x: 145, y: 390, width: 150, height: 24 },
      { x: 665, y: 390, width: 150, height: 24 },
      { x: 335, y: 65, width: 24, height: 170 },
      { x: 601, y: 65, width: 24, height: 170 },
      { x: 335, y: 365, width: 24, height: 165 },
      { x: 601, y: 365, width: 24, height: 165 },
      { x: 435, y: 255, width: 90, height: 90 },
    ],
  },
  {
    number: "14",
    name: "Omega Core",
    briefing: "Cross the final defense lattice, dismantle the escort, and destroy the Omega Core.",
    threat: "BOSS",
    parTime: 225,
    player: { x: 90, y: 300 },
    enemies: [
      { kind: "boss", x: 850, y: 300 },
      { kind: "sniper", x: 900, y: 70 },
      { kind: "sniper", x: 900, y: 530 },
      { kind: "sniper", x: 780, y: 80 },
      { kind: "sniper", x: 780, y: 520 },
      { kind: "sniper", x: 650, y: 110 },
      { kind: "sniper", x: 650, y: 490 },
      { kind: "guard", x: 260, y: 100 },
      { kind: "guard", x: 260, y: 500 },
      { kind: "guard", x: 430, y: 160 },
      { kind: "guard", x: 430, y: 440 },
      { kind: "guard", x: 600, y: 250 },
      { kind: "guard", x: 600, y: 350 },
      { kind: "scout", x: 320, y: 250 },
      { kind: "scout", x: 320, y: 350 },
      { kind: "scout", x: 500, y: 90 },
      { kind: "scout", x: 500, y: 510 },
      { kind: "scout", x: 730, y: 300 },
    ],
    walls: [
      { x: 170, y: 190, width: 24, height: 220 },
      { x: 300, y: 70, width: 24, height: 140 },
      { x: 300, y: 390, width: 24, height: 140 },
      { x: 380, y: 250, width: 110, height: 24 },
      { x: 380, y: 326, width: 110, height: 24 },
      { x: 540, y: 70, width: 24, height: 140 },
      { x: 540, y: 390, width: 24, height: 140 },
      { x: 680, y: 190, width: 24, height: 220 },
      { x: 760, y: 220, width: 90, height: 20 },
      { x: 760, y: 360, width: 90, height: 20 },
    ],
  },
];

export const MISSIONS: Mission[] = MISSION_TEMPLATES.map(expandMission);
