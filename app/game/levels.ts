export type EnemyKind = "scout" | "guard" | "sniper" | "boss";

export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnemySpawn extends Point {
  kind: EnemyKind;
}

export interface Mission {
  number: string;
  name: string;
  briefing: string;
  threat: string;
  parTime: number;
  player: Point;
  enemies: EnemySpawn[];
  walls: Wall[];
}

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 600;

export const MISSIONS: Mission[] = [
  {
    number: "01",
    name: "First Contact",
    briefing: "Clear the calibration floor. Use the walls to break enemy sightlines.",
    threat: "LOW",
    parTime: 36,
    player: { x: 150, y: 300 },
    enemies: [
      { kind: "scout", x: 730, y: 170 },
      { kind: "scout", x: 790, y: 430 },
      { kind: "guard", x: 690, y: 300 },
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
      { kind: "scout", x: 700, y: 400 },
      { kind: "guard", x: 260, y: 120 },
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
      { kind: "scout", x: 690, y: 205 },
      { kind: "scout", x: 690, y: 395 },
      { kind: "guard", x: 838, y: 160 },
      { kind: "guard", x: 838, y: 440 },
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
    briefing: "No clean angles. Control the center and turn every surface into a weapon.",
    threat: "HIGH",
    parTime: 72,
    player: { x: 480, y: 300 },
    enemies: [
      { kind: "sniper", x: 92, y: 92 },
      { kind: "sniper", x: 868, y: 92 },
      { kind: "sniper", x: 92, y: 508 },
      { kind: "sniper", x: 868, y: 508 },
      { kind: "guard", x: 250, y: 300 },
      { kind: "guard", x: 710, y: 300 },
      { kind: "scout", x: 480, y: 105 },
      { kind: "scout", x: 480, y: 495 },
      { kind: "scout", x: 315, y: 165 },
      { kind: "scout", x: 645, y: 435 },
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
    ],
  },
  {
    number: "06",
    name: "Red Core",
    briefing: "Breach the command arena. Break the escort, then dismantle the Core.",
    threat: "BOSS",
    parTime: 92,
    player: { x: 115, y: 300 },
    enemies: [
      { kind: "boss", x: 770, y: 300 },
      { kind: "sniper", x: 810, y: 105 },
      { kind: "sniper", x: 810, y: 495 },
      { kind: "guard", x: 555, y: 140 },
      { kind: "guard", x: 555, y: 460 },
      { kind: "scout", x: 420, y: 220 },
      { kind: "scout", x: 420, y: 380 },
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
];
