import { TankGame, type GamePhase, type GameSnapshot } from "./engine.ts";
import { getMissionEnemyTotal, MISSIONS } from "./levels.ts";
import { GameRenderer } from "./renderer.ts";
import { POWER_UP_DEFINITIONS } from "./powerups.ts";
import {
  PLAYER_TANKS,
  type PlayerTankKind,
} from "./loadouts.ts";
import { AMMO_DEFINITIONS, type AmmoKind } from "./ammunition.ts";
import {
  bestRecord,
  readCampaignSave,
  writeCampaignSave,
  type CampaignSave,
  type MissionRank,
} from "./progress.ts";
import gameShell from "./v-tanks.html?raw";

const INITIAL_SNAPSHOT: GameSnapshot = {
  phase: "menu",
  mode: "campaign",
  missionIndex: 0,
  health: 4,
  maxHealth: 4,
  enemiesLeft: getMissionEnemyTotal(MISSIONS[0]),
  activeEnemies: MISSIONS[0].enemies.length,
  totalEnemies: getMissionEnemyTotal(MISSIONS[0]),
  completionPercent: 0,
  elapsed: 0,
  shots: 0,
  hits: 0,
  abilityReady: 1,
  abilityLabel: PLAYER_TANKS.vanguard.abilityLabel,
  abilityCharges: 0,
  selectedAmmo: "basic",
  ammunition: [
    { kind: "basic", count: null },
    { kind: "piercing", count: 0 },
    { kind: "explosive", count: 0 },
    { kind: "emp", count: 0 },
  ],
  bossHealth: null,
  bossPhase: null,
  activePowerUps: [],
  objectiveLabel: "CLEAR THE ARENA",
  objectiveProgress: 0,
  objectiveDetail: "",
  bonusLabel: "",
  bonusComplete: false,
  score: 0,
  wave: 1,
  fps: 0,
};

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function accuracy(snapshot: GameSnapshot): number {
  if (snapshot.shots === 0) return 0;
  return Math.round((snapshot.hits / snapshot.shots) * 100);
}

function getMissionTip(
  mission: (typeof MISSIONS)[number],
  snapshot: GameSnapshot,
): { title: string; copy: string; secondary: string } {
  let title = "FIELD DIRECTIVE";
  let copy = "Destroy every hostile tank.";
  if (mission.objective.kind === "relays") {
    title = "TARGET / BLUE RELAYS";
    copy = "Shoot the marked relay towers. Hostiles are secondary.";
  } else if (mission.objective.kind === "hold") {
    title = "HOLD / YELLOW UPLINK";
    copy = "Stay inside the uplink ring. Leaving drains link progress.";
  } else if (mission.objective.kind === "survive") {
    title = "SURVIVE / CLOCK";
    copy = "Keep moving until the operation timer expires.";
  } else if (mission.objective.kind === "omega") {
    if (snapshot.objectiveDetail.includes("SHIELDS ACTIVE")) {
      title = "OMEGA / SHIELDS";
      copy = "Destroy the marked blue relays to expose the Omega Core.";
    } else if (snapshot.objectiveDetail === "DESTROY OMEGA") {
      title = "OMEGA / CORE EXPOSED";
      copy = "The shield is down. Destroy the Omega Core.";
    } else {
      title = "OMEGA / EXTRACT";
      copy = "Drive into the active green extraction zone.";
    }
  }
  const secondary = mission.hazards.some((hazard) => hazard.kind === "barricade")
    ? "BREACH TIP / Concrete barricades block tanks. Shoot them to clear a path."
    : "";
  return { title, copy, secondary };
}

function getRating(snapshot: GameSnapshot): MissionRank {
  const mission = MISSIONS[snapshot.missionIndex];
  if (snapshot.elapsed <= mission.parTime && accuracy(snapshot) >= 65 && snapshot.health >= 2) return "S";
  if (snapshot.elapsed <= mission.parTime * 1.25 && accuracy(snapshot) >= 45) return "A";
  return "B";
}

function missionCards(): string {
  return MISSIONS.map((mission, index) => `
    <button class="mission-card" data-mission-index="${index}">
      <canvas class="mission-map" data-mission-map="${index}" aria-hidden="true"></canvas>
      <canvas class="mission-icons" data-mission-icons="${index}" aria-hidden="true"></canvas>
      <span class="mission-number">${mission.number}</span>
      <span class="mission-name">${mission.name}</span>
      <span class="threat threat-${mission.threat.toLowerCase()}">${mission.threat}</span>
      <span class="complete-mark" data-complete hidden>✓</span>
      <span class="mission-medal" data-medal hidden></span>
      <span class="lock-mark" data-lock hidden>LOCK</span>
    </button>
  `).join("");
}

function tankClassButtons(): string {
  return Object.entries(PLAYER_TANKS).map(([value, option]) => {
    return `
      <button class="tank-class-option" data-tank-class="${value}">
        <small>${option.role}</small>
        <strong>${option.label}</strong>
        <span>${option.description}</span>
        <em>RMB / ${option.abilityLabel} — ${option.abilityDescription}</em>
      </button>
    `;
  }).join("");
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export class VTanks {
  private readonly root: HTMLElement;
  private readonly shell: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly game: TankGame;
  private phase: GamePhase = "menu";
  private snapshot = INITIAL_SNAPSHOT;
  private save: CampaignSave = readCampaignSave();
  private unlockedMission = Math.min(MISSIONS.length - 1, this.save.unlockedMission);
  private selectedMission = 0;
  private soundEnabled = this.save.settings.sound;
  private recordedResultPhase: GamePhase | null = null;
  private renderedSelectedMapIndex = -1;
  private renderedSelectedMapSize = "";

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = gameShell;
    requiredElement(root, ".mission-grid").innerHTML = missionCards();
    this.renderMissionCardMaps();
    requiredElement(root, "[data-tank-classes]").innerHTML = tankClassButtons();
    requiredElement(root, "[data-campaign-total]").textContent =
      `/${MISSIONS.length.toString().padStart(2, "0")}`;
    this.shell = requiredElement(root, ".game-shell");
    this.canvas = requiredElement(root, ".game-canvas");
    root.addEventListener("click", this.onClick);

    this.game = new TankGame(
      this.canvas,
      this.onSnapshot,
      this.onPhase,
    );
    this.game.configure(this.save.tankClass);
    this.game.setSound(this.soundEnabled);
    this.render();
  }

  destroy(): void {
    this.game.destroy();
    this.root.removeEventListener("click", this.onClick);
    this.root.replaceChildren();
  }

  private readonly onSnapshot = (snapshot: GameSnapshot): void => {
    this.snapshot = snapshot;
    if (snapshot.phase !== this.recordedResultPhase && snapshot.phase === "victory") {
      const nextUnlocked = Math.min(MISSIONS.length - 1, snapshot.missionIndex + 1);
      if (nextUnlocked > this.unlockedMission) {
        this.unlockedMission = nextUnlocked;
        this.save.unlockedMission = nextUnlocked;
      }
      const missionKey = String(snapshot.missionIndex);
      this.save.records[missionKey] = bestRecord(this.save.records[missionKey], {
        rank: getRating(snapshot),
        time: snapshot.elapsed,
        accuracy: accuracy(snapshot),
        hull: snapshot.health,
        bonus: snapshot.bonusComplete,
      });
      writeCampaignSave(this.save);
    }
    if (
      snapshot.phase !== this.recordedResultPhase
      && snapshot.phase === "defeat"
      && snapshot.mode === "survival"
      && snapshot.score > this.save.survivalBest
    ) {
      this.save.survivalBest = snapshot.score;
      writeCampaignSave(this.save);
    }
    this.recordedResultPhase = snapshot.phase;
    this.render();
  };

  private readonly onPhase = (phase: GamePhase): void => {
    this.phase = phase;
    this.render();
  };

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const missionButton = target.closest<HTMLButtonElement>("[data-mission-index]");
    if (missionButton) {
      const index = Number.parseInt(missionButton.dataset.missionIndex ?? "", 10);
      if (!missionButton.disabled && Number.isFinite(index)) {
        this.selectedMission = index;
        this.render();
      }
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    const tankClassButton = target.closest<HTMLButtonElement>("[data-tank-class]");
    if (tankClassButton) {
      const value = tankClassButton.dataset.tankClass as PlayerTankKind | undefined;
      if (value && value in PLAYER_TANKS) {
        this.save.tankClass = value;
        this.game.configure(this.save.tankClass);
        writeCampaignSave(this.save);
        this.render();
      }
      return;
    }
    if (!actionButton) return;
    const action = actionButton.dataset.action;

    if (action === "menu") this.returnToMenu();
    if (action === "sound") {
      this.soundEnabled = !this.soundEnabled;
      this.game.setSound(this.soundEnabled);
      this.save.settings.sound = this.soundEnabled;
      writeCampaignSave(this.save);
      this.render();
    }
    if (action === "pause") this.game.pause();
    if (action === "resume") this.game.resume();
    if (action === "deploy") this.startMission(this.selectedMission);
    if (action === "survival") this.startSurvival();
    if (action === "restart" || action === "replay" || action === "redeploy") {
      this.startMission(this.snapshot.missionIndex);
    }
    if (action === "next") this.startMission(this.snapshot.missionIndex + 1);
  };

  private startMission(index: number): void {
    this.recordedResultPhase = null;
    this.selectedMission = index;
    this.game.configure(this.save.tankClass);
    this.game.startMission(index);
  }

  private startSurvival(): void {
    this.recordedResultPhase = null;
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    this.game.configure(this.save.tankClass);
    this.game.startSurvival(seed);
  }

  private returnToMenu(): void {
    this.selectedMission = this.snapshot.missionIndex;
    this.game.showMenu();
  }

  private preparePreviewCanvas(canvas: HTMLCanvasElement): {
    context: CanvasRenderingContext2D;
    width: number;
    height: number;
  } | null {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  private renderMissionCardMaps(): void {
    this.root.querySelectorAll<HTMLCanvasElement>("[data-mission-map]").forEach((canvas) => {
      const index = Number.parseInt(canvas.dataset.missionMap ?? "", 10);
      const prepared = this.preparePreviewCanvas(canvas);
      if (!prepared || !MISSIONS[index]) return;
      GameRenderer.renderMinimapPreview(
        prepared.context,
        MISSIONS[index],
        prepared.width,
        prepared.height,
        0.34,
      );
    });
    this.root.querySelectorAll<HTMLCanvasElement>("[data-mission-icons]").forEach((canvas) => {
      const index = Number.parseInt(canvas.dataset.missionIcons ?? "", 10);
      const prepared = this.preparePreviewCanvas(canvas);
      if (!prepared || !MISSIONS[index]) return;
      GameRenderer.renderMissionIconsPreview(
        prepared.context,
        MISSIONS[index],
        prepared.width,
        prepared.height,
      );
    });
  }

  private renderSelectedMissionMap(missionIndex: number): void {
    const canvas = requiredElement<HTMLCanvasElement>(this.root, "[data-selected-map]");
    const rect = canvas.getBoundingClientRect();
    const sizeKey = `${Math.round(rect.width)}x${Math.round(rect.height)}@${window.devicePixelRatio || 1}`;
    if (
      this.renderedSelectedMapIndex === missionIndex
      && this.renderedSelectedMapSize === sizeKey
    ) return;
    const prepared = this.preparePreviewCanvas(canvas);
    if (!prepared) return;
    GameRenderer.renderMinimapPreview(
      prepared.context,
      MISSIONS[missionIndex],
      prepared.width,
      prepared.height,
      0.24,
    );
    this.renderedSelectedMapIndex = missionIndex;
    this.renderedSelectedMapSize = sizeKey;
  }

  private render(): void {
    const currentMission = MISSIONS[this.snapshot.missionIndex];
    const selected = MISSIONS[this.selectedMission];
    const playing = this.phase === "playing";

    this.canvas.dataset.shotsFired = String(this.snapshot.shots);
    this.canvas.dataset.activeEnemies = String(this.snapshot.activeEnemies);
    this.shell.className = `game-shell phase-${this.phase}`;
    this.root.querySelectorAll<HTMLElement>("[data-screen]").forEach((screen) => {
      screen.hidden = screen.dataset.screen !== this.phase;
    });
    this.root.querySelectorAll<HTMLElement>("[data-combat]").forEach((element) => {
      element.hidden = !playing;
    });

    requiredElement<HTMLElement>(this.root, "[data-playing-chrome]").hidden = this.phase === "menu";
    requiredElement<HTMLButtonElement>(this.root, '[data-action="pause"]').hidden = !playing;
    requiredElement(this.root, "[data-current-mission]").textContent =
      `${currentMission.number} / ${currentMission.name}`;
    requiredElement(this.root, "[data-targets]").textContent =
      this.snapshot.mode === "survival"
        ? `WAVE ${this.snapshot.wave}`
        : `${this.snapshot.enemiesLeft} / ${this.snapshot.totalEnemies}`;
    requiredElement<HTMLElement>(this.root, "[data-objective-readout]").hidden =
      this.snapshot.mode === "campaign" && currentMission.objective.kind === "eliminate";
    requiredElement(this.root, "[data-mission-completion]").textContent =
      this.snapshot.objectiveDetail;
    requiredElement(this.root, "[data-objective-label]").textContent =
      this.snapshot.objectiveLabel;
    requiredElement(this.root, "[data-time]").textContent = formatTime(this.snapshot.elapsed);
    requiredElement(this.root, "[data-fps-value]").textContent =
      this.snapshot.fps > 0 ? String(this.snapshot.fps) : "--";

    const missionTip = getMissionTip(currentMission, this.snapshot);
    const missionTipElement = requiredElement<HTMLElement>(this.root, ".mission-tip");
    missionTipElement.classList.toggle("boss-active", this.snapshot.bossHealth !== null);
    requiredElement(this.root, "[data-tip-title]").textContent = missionTip.title;
    requiredElement(this.root, "[data-tip-copy]").textContent = missionTip.copy;
    const secondaryTip = requiredElement<HTMLElement>(this.root, "[data-tip-secondary]");
    secondaryTip.textContent = missionTip.secondary;
    secondaryTip.hidden = !missionTip.secondary;

    const soundButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="sound"]');
    const soundLabel = this.soundEnabled ? "Mute sound" : "Enable sound";
    soundButton.textContent = this.soundEnabled ? ")))" : "×";
    soundButton.ariaLabel = soundLabel;
    soundButton.title = soundLabel;
    const armorPips = requiredElement<HTMLElement>(this.root, ".armor-pips");
    armorPips.replaceChildren(...Array.from({ length: this.snapshot.maxHealth }, (_, index) => {
      const pip = document.createElement("i");
      pip.classList.toggle("active", index < this.snapshot.health);
      return pip;
    }));
    requiredElement<HTMLElement>(this.root, "[data-ability-charge]").style.width =
      `${this.snapshot.abilityReady * 100}%`;
    requiredElement(this.root, "[data-ability-label]").textContent = this.snapshot.abilityLabel;
    requiredElement(this.root, "[data-ability-status]").textContent =
      this.save.tankClass === "sapper"
        ? `${this.snapshot.abilityCharges} MINES`
        : this.snapshot.abilityReady >= 1 ? "READY" : "CHARGING";
    const boss = requiredElement<HTMLElement>(this.root, "[data-boss]");
    boss.hidden = !playing || this.snapshot.bossHealth === null;
    requiredElement<HTMLElement>(this.root, "[data-boss-health]").style.width =
      `${(this.snapshot.bossHealth ?? 0) * 100}%`;
    requiredElement(this.root, "[data-boss-phase]").textContent =
      this.snapshot.bossPhase ? ` / PHASE ${this.snapshot.bossPhase}` : "";
    requiredElement(this.root, "[data-bonus-status]").textContent =
      `${this.snapshot.bonusComplete ? "✓" : "○"} ${this.snapshot.bonusLabel}`;
    const ammunition = requiredElement<HTMLElement>(this.root, "[data-ammunition]");
    ammunition.replaceChildren(...this.snapshot.ammunition.map((ammo, index) => {
      const definition = AMMO_DEFINITIONS[ammo.kind as AmmoKind];
      const chip = document.createElement("div");
      chip.className = "ammo-chip";
      chip.classList.toggle("selected", ammo.kind === this.snapshot.selectedAmmo);
      chip.classList.toggle("empty", ammo.count === 0);
      chip.style.setProperty("--ammo-color", definition.color);
      const key = document.createElement("b");
      key.textContent = String(index + 1);
      const label = document.createElement("span");
      label.textContent = definition.shortLabel;
      const count = document.createElement("strong");
      count.textContent = ammo.count === null ? "∞" : String(ammo.count);
      chip.append(key, label, count);
      return chip;
    }));

    const powerUpReadout = requiredElement<HTMLElement>(this.root, "[data-powerup-readout]");
    powerUpReadout.hidden = !playing || this.snapshot.activePowerUps.length === 0;
    const activePowerUps = requiredElement<HTMLElement>(this.root, "[data-active-powerups]");
    activePowerUps.replaceChildren(...this.snapshot.activePowerUps.map((active) => {
      const definition = POWER_UP_DEFINITIONS[active.kind];
      const item = document.createElement("div");
      item.className = "powerup-chip";
      item.style.setProperty("--powerup-color", definition.color);
      const label = document.createElement("span");
      label.textContent = definition.shortLabel;
      const time = document.createElement("strong");
      time.textContent = active.kind === "shield"
        ? `${active.shieldPoints} SH / ${Math.ceil(active.remaining)}s`
        : `${Math.ceil(active.remaining)}s`;
      const track = document.createElement("i");
      const fill = document.createElement("b");
      fill.style.width = `${(active.remaining / active.duration) * 100}%`;
      track.append(fill);
      item.append(label, time, track);
      return item;
    }));

    requiredElement(this.root, "[data-campaign-progress]").textContent =
      String(this.unlockedMission + 1);
    this.root.querySelectorAll<HTMLButtonElement>("[data-mission-index]").forEach((button, index) => {
      const locked = index > this.unlockedMission;
      button.disabled = locked;
      button.classList.toggle("selected", index === this.selectedMission);
      button.classList.toggle("locked", locked);
      requiredElement<HTMLElement>(button, "[data-complete]").hidden = index >= this.unlockedMission;
      requiredElement<HTMLElement>(button, "[data-lock]").hidden = !locked;
      const medal = requiredElement<HTMLElement>(button, "[data-medal]");
      const record = this.save.records[String(index)];
      medal.hidden = !record;
      medal.textContent = record ? `${record.rank}${record.bonus ? "★" : ""}` : "";
    });
    requiredElement(this.root, "[data-selected-number]").textContent = selected.number;
    requiredElement(this.root, "[data-selected-name]").textContent = selected.name;
    requiredElement(this.root, "[data-selected-briefing]").textContent = selected.briefing;
    requiredElement(this.root, "[data-selected-hostiles]").textContent =
      String(getMissionEnemyTotal(selected));
    requiredElement(this.root, "[data-selected-par]").textContent = formatTime(selected.parTime);
    requiredElement(this.root, "[data-selected-threat]").textContent = selected.threat;
    requiredElement(this.root, "[data-selected-objective]").textContent = selected.objective.label;
    requiredElement(this.root, "[data-selected-bonus]").textContent = selected.bonus.label;
    this.renderSelectedMissionMap(this.selectedMission);

    this.root.querySelectorAll<HTMLButtonElement>("[data-tank-class]").forEach((button) => {
      button.classList.toggle("selected", this.save.tankClass === button.dataset.tankClass);
    });
    requiredElement(this.root, "[data-survival-best]").textContent =
      this.save.survivalBest.toLocaleString();

    requiredElement(this.root, "[data-paused-eyebrow]").textContent =
      `MISSION ${currentMission.number}`;
    requiredElement(this.root, "[data-victory-title]").textContent =
      `RANK ${getRating(this.snapshot)}`;
    requiredElement(this.root, "[data-victory-mission]").textContent = currentMission.name;
    requiredElement(this.root, "[data-result-time]").textContent = formatTime(this.snapshot.elapsed);
    requiredElement(this.root, "[data-result-par]").textContent = formatTime(currentMission.parTime);
    requiredElement(this.root, "[data-result-accuracy]").textContent = `${accuracy(this.snapshot)}%`;
    requiredElement(this.root, "[data-result-hull]").textContent =
      `${this.snapshot.health}/${this.snapshot.maxHealth}`;

    const finalMission = this.snapshot.missionIndex === MISSIONS.length - 1;
    requiredElement<HTMLButtonElement>(this.root, '[data-action="next"]').hidden = finalMission;
    requiredElement<HTMLButtonElement>(this.root, "[data-campaign-complete]").hidden = !finalMission;

    const units = this.snapshot.enemiesLeft === 1 ? "tank" : "tanks";
    requiredElement(this.root, "[data-defeat-message]").textContent =
      this.snapshot.mode === "survival"
        ? `Wave ${this.snapshot.wave} reached with ${this.snapshot.score.toLocaleString()} points.`
        : `The operation still has ${this.snapshot.enemiesLeft} hostile ${units} remaining.`;
  }
}
