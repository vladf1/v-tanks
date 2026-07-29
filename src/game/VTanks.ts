import { TankGame, type GamePhase, type GameSnapshot } from "./engine";
import { getMissionEnemyTotal, MISSIONS } from "./levels";
import { POWER_UP_DEFINITIONS } from "./powerups";
import {
  CANNONS,
  CHASSIS,
  UTILITIES,
  type Loadout,
} from "./loadouts";
import {
  bestRecord,
  readCampaignSave,
  writeCampaignSave,
  type CampaignSave,
  type MissionRank,
} from "./progress";
import gameShell from "./v-tanks.html?raw";

const INITIAL_SNAPSHOT: GameSnapshot = {
  phase: "menu",
  mode: "campaign",
  missionIndex: 0,
  health: 3,
  maxHealth: 3,
  enemiesLeft: getMissionEnemyTotal(MISSIONS[0]),
  activeEnemies: MISSIONS[0].enemies.length,
  totalEnemies: getMissionEnemyTotal(MISSIONS[0]),
  completionPercent: 0,
  elapsed: 0,
  shots: 0,
  hits: 0,
  dashReady: 1,
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
  utilityCharges: 0,
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

function getRating(snapshot: GameSnapshot): MissionRank {
  const mission = MISSIONS[snapshot.missionIndex];
  if (snapshot.elapsed <= mission.parTime && accuracy(snapshot) >= 65 && snapshot.health >= 2) return "S";
  if (snapshot.elapsed <= mission.parTime * 1.25 && accuracy(snapshot) >= 45) return "A";
  return "B";
}

function missionCards(): string {
  return MISSIONS.map((mission, index) => `
    <button class="mission-card" data-mission-index="${index}">
      <span class="mission-number">${mission.number}</span>
      <span class="mission-name">${mission.name}</span>
      <span class="threat threat-${mission.threat.toLowerCase()}">${mission.threat}</span>
      <span class="complete-mark" data-complete hidden>✓</span>
      <span class="mission-medal" data-medal hidden></span>
      <span class="lock-mark" data-lock hidden>LOCK</span>
    </button>
  `).join("");
}

function loadoutButtons<T extends string>(
  group: keyof Loadout,
  options: Record<T, { label: string; description: string }>,
): string {
  return Object.entries(options).map(([value, option]) => {
    const typed = option as { label: string; description: string };
    return `
      <button class="loadout-option" data-loadout-group="${group}" data-loadout-value="${value}">
        <strong>${typed.label}</strong>
        <span>${typed.description}</span>
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

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = gameShell;
    requiredElement(root, ".mission-grid").innerHTML = missionCards();
    requiredElement(root, '[data-loadout-options="cannon"]').innerHTML =
      loadoutButtons("cannon", CANNONS);
    requiredElement(root, '[data-loadout-options="chassis"]').innerHTML =
      loadoutButtons("chassis", CHASSIS);
    requiredElement(root, '[data-loadout-options="utility"]').innerHTML =
      loadoutButtons("utility", UTILITIES);
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
    this.game.configure(this.save.loadout, this.save.settings);
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
    const loadoutButton = target.closest<HTMLButtonElement>("[data-loadout-group]");
    if (loadoutButton) {
      const group = loadoutButton.dataset.loadoutGroup as keyof Loadout | undefined;
      const value = loadoutButton.dataset.loadoutValue;
      if (group && value) {
        this.save.loadout = { ...this.save.loadout, [group]: value };
        this.game.configure(this.save.loadout, this.save.settings);
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
    if (action === "shake") {
      this.save.settings.cameraShake = !this.save.settings.cameraShake;
      this.game.configure(this.save.loadout, this.save.settings);
      writeCampaignSave(this.save);
      this.render();
    }
    if (action === "motion") {
      this.save.settings.reducedMotion = !this.save.settings.reducedMotion;
      this.game.configure(this.save.loadout, this.save.settings);
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
    this.game.configure(this.save.loadout, this.save.settings);
    this.game.startMission(index);
  }

  private startSurvival(): void {
    this.recordedResultPhase = null;
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    this.game.configure(this.save.loadout, this.save.settings);
    this.game.startSurvival(seed);
  }

  private returnToMenu(): void {
    this.selectedMission = this.snapshot.missionIndex;
    this.game.showMenu();
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
    requiredElement(this.root, "[data-mission-completion]").textContent =
      this.snapshot.objectiveDetail;
    requiredElement(this.root, "[data-objective-label]").textContent =
      this.snapshot.objectiveLabel;
    requiredElement(this.root, "[data-time]").textContent = formatTime(this.snapshot.elapsed);

    const soundButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="sound"]');
    const soundLabel = this.soundEnabled ? "Mute sound" : "Enable sound";
    soundButton.textContent = this.soundEnabled ? ")))" : "×";
    soundButton.ariaLabel = soundLabel;
    soundButton.title = soundLabel;
    const shakeButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="shake"]');
    shakeButton.textContent = this.save.settings.cameraShake ? "SHAKE ON" : "SHAKE OFF";
    const motionButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="motion"]');
    motionButton.textContent = this.save.settings.reducedMotion ? "MOTION LOW" : "MOTION FULL";

    const armorPips = requiredElement<HTMLElement>(this.root, ".armor-pips");
    armorPips.replaceChildren(...Array.from({ length: this.snapshot.maxHealth }, (_, index) => {
      const pip = document.createElement("i");
      pip.classList.toggle("active", index < this.snapshot.health);
      return pip;
    }));
    requiredElement<HTMLElement>(this.root, "[data-dash-charge]").style.width =
      `${this.snapshot.dashReady * 100}%`;
    const boss = requiredElement<HTMLElement>(this.root, "[data-boss]");
    boss.hidden = !playing || this.snapshot.bossHealth === null;
    requiredElement<HTMLElement>(this.root, "[data-boss-health]").style.width =
      `${(this.snapshot.bossHealth ?? 0) * 100}%`;
    requiredElement(this.root, "[data-boss-phase]").textContent =
      this.snapshot.bossPhase ? ` / PHASE ${this.snapshot.bossPhase}` : "";
    requiredElement(this.root, "[data-bonus-status]").textContent =
      `${this.snapshot.bonusComplete ? "✓" : "○"} ${this.snapshot.bonusLabel}`;
    requiredElement(this.root, "[data-utility-status]").textContent =
      this.save.loadout.utility === "mine"
        ? `E / MINES ${this.snapshot.utilityCharges}`
        : this.save.loadout.utility.toUpperCase();

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

    this.root.querySelectorAll<HTMLButtonElement>("[data-loadout-group]").forEach((button) => {
      const group = button.dataset.loadoutGroup as keyof Loadout;
      button.classList.toggle("selected", this.save.loadout[group] === button.dataset.loadoutValue);
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
