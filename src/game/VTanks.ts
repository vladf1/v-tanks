import { TankGame, type GamePhase, type GameSnapshot } from "./engine.ts";
import { getMissionEnemyTotal, MISSIONS } from "./levels.ts";
import { GameRenderer } from "./renderer.ts";
import { POWER_UP_DEFINITIONS, TIMED_POWER_UP_KINDS } from "./powerups.ts";
import {
  PLAYER_TANKS,
  type PlayerTankKind,
} from "./loadouts.ts";
import { AMMO_DEFINITIONS, AMMO_KINDS } from "./ammunition.ts";
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

function setText(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

export class VTanks {
  private readonly root: HTMLElement;
  private readonly shell: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly game: TankGame;
  private get phase(): GamePhase { return this.snapshot.phase; }
  private snapshot = INITIAL_SNAPSHOT;
  private save: CampaignSave = readCampaignSave();
  private unlockedMission = Math.min(MISSIONS.length - 1, this.save.unlockedMission);
  private selectedMission = 0;
  private soundEnabled = this.save.settings.sound;
  private recordedResultPhase: GamePhase | null = null;
  private renderedSelectedMapIndex = -1;
  private readonly previewObserver: ResizeObserver;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = gameShell;
    requiredElement(root, ".mission-grid").innerHTML = missionCards();
    requiredElement(root, "[data-tank-classes]").innerHTML = tankClassButtons();
    setText(requiredElement(root, "[data-campaign-total]"), `/${MISSIONS.length.toString().padStart(2, "0")}`);
    this.shell = requiredElement(root, ".game-shell");
    this.canvas = requiredElement(root, ".game-canvas");
    root.addEventListener("click", this.onClick);
    this.createCombatReadouts();
    this.previewObserver = new ResizeObserver(this.renderPreviews);
    window.addEventListener("resize", this.renderPreviews);
    this.previewObserver.observe(requiredElement(root, "[data-screen=menu]"));

    this.game = new TankGame(
      this.canvas,
      this.onSnapshot,
    );
    this.game.configure(this.save.tankClass);
    this.game.setSound(this.soundEnabled);
    this.render();
  }

  destroy(): void {
    this.previewObserver.disconnect();
    window.removeEventListener("resize", this.renderPreviews);
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
      this.game.restart();
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

  private readonly renderPreviews = (): void => {
    if (this.phase !== "menu") return;
    this.renderMissionCardMaps();
    this.renderedSelectedMapIndex = -1;
    this.renderSelectedMissionMap(this.selectedMission);
  };

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
    if (this.renderedSelectedMapIndex === missionIndex) return;
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
  }

  private createCombatReadouts(): void {
    requiredElement(this.root, ".armor-pips").innerHTML =
      "<i></i>".repeat(Math.max(...Object.values(PLAYER_TANKS).map((tank) => tank.hp)));
    requiredElement(this.root, "[data-ammunition]").innerHTML = AMMO_KINDS.map((kind, index) => `
      <div class="ammo-chip" data-ammo-kind="${kind}" style="--ammo-color:${AMMO_DEFINITIONS[kind].color}">
        <b>${index + 1}</b><span>${AMMO_DEFINITIONS[kind].shortLabel}</span><strong></strong>
      </div>`).join("");
    requiredElement(this.root, "[data-active-powerups]").innerHTML = TIMED_POWER_UP_KINDS.map((kind) => `
      <div class="powerup-chip" data-powerup-kind="${kind}" style="--powerup-color:${POWER_UP_DEFINITIONS[kind].color}" hidden>
        <span>${POWER_UP_DEFINITIONS[kind].shortLabel}</span><strong></strong><i><b></b></i>
      </div>`).join("");
  }

  private render(): void {
    const playing = this.phase === "playing";
    const phaseClass = `game-shell phase-${this.phase}`;
    if (this.shell.className !== phaseClass) {
      this.shell.className = phaseClass;
      this.root.querySelectorAll<HTMLElement>("[data-screen]").forEach((screen) => {
        screen.hidden = screen.dataset.screen !== this.phase;
      });
      this.root.querySelectorAll<HTMLElement>("[data-combat]").forEach((element) => {
        element.hidden = !playing;
      });
      requiredElement<HTMLElement>(this.root, "[data-playing-chrome]").hidden = this.phase === "menu";
      requiredElement<HTMLButtonElement>(this.root, '[data-action="pause"]').hidden = !playing;
    }
    const soundButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="sound"]');
    const soundLabel = this.soundEnabled ? "Mute sound" : "Enable sound";
    setText(soundButton, this.soundEnabled ? ")))" : "×");
    soundButton.ariaLabel = soundLabel;
    soundButton.title = soundLabel;
    if (this.phase === "menu") this.renderMenu();
    else if (playing) this.renderCombat();
    else this.renderResult();
  }

  private renderCombat(): void {
    const currentMission = MISSIONS[this.snapshot.missionIndex];
    this.canvas.dataset.shotsFired = String(this.snapshot.shots);
    this.canvas.dataset.activeEnemies = String(this.snapshot.activeEnemies);
    setText(requiredElement(this.root, "[data-current-mission]"), `${currentMission.number} / ${currentMission.name}`);
    setText(requiredElement(this.root, "[data-targets]"), this.snapshot.mode === "survival"
        ? `WAVE ${this.snapshot.wave}`
        : `${this.snapshot.enemiesLeft} / ${this.snapshot.totalEnemies}`);
    requiredElement<HTMLElement>(this.root, "[data-objective-readout]").hidden =
      this.snapshot.mode === "campaign" && currentMission.objective.kind === "eliminate";
    setText(requiredElement(this.root, "[data-mission-completion]"), this.snapshot.objectiveDetail);
    setText(requiredElement(this.root, "[data-objective-label]"), this.snapshot.objectiveLabel);
    setText(requiredElement(this.root, "[data-time]"), formatTime(this.snapshot.elapsed));
    setText(requiredElement(this.root, "[data-fps-value]"), this.snapshot.fps > 0 ? String(this.snapshot.fps) : "--");

    const missionTip = getMissionTip(currentMission, this.snapshot);
    const missionTipElement = requiredElement<HTMLElement>(this.root, ".mission-tip");
    missionTipElement.classList.toggle("boss-active", this.snapshot.bossHealth !== null);
    setText(requiredElement(this.root, "[data-tip-title]"), missionTip.title);
    setText(requiredElement(this.root, "[data-tip-copy]"), missionTip.copy);
    const secondaryTip = requiredElement<HTMLElement>(this.root, "[data-tip-secondary]");
    setText(secondaryTip, missionTip.secondary);
    secondaryTip.hidden = !missionTip.secondary;

    const armorPips = requiredElement(this.root, ".armor-pips");
    Array.from(armorPips.children).forEach((pip, index) => {
      (pip as HTMLElement).hidden = index >= this.snapshot.maxHealth;
      pip.classList.toggle("active", index < this.snapshot.health);
    });
    requiredElement<HTMLElement>(this.root, "[data-ability-charge]").style.width =
      `${this.snapshot.abilityReady * 100}%`;
    setText(requiredElement(this.root, "[data-ability-label]"), this.snapshot.abilityLabel);
    setText(requiredElement(this.root, "[data-ability-status]"), this.save.tankClass === "sapper"
        ? `${this.snapshot.abilityCharges} MINES`
        : this.snapshot.abilityReady >= 1 ? "READY" : "CHARGING");
    const boss = requiredElement<HTMLElement>(this.root, "[data-boss]");
    boss.hidden = this.snapshot.bossHealth === null;
    requiredElement<HTMLElement>(this.root, "[data-boss-health]").style.width =
      `${(this.snapshot.bossHealth ?? 0) * 100}%`;
    setText(requiredElement(this.root, "[data-boss-phase]"), this.snapshot.bossPhase ? ` / PHASE ${this.snapshot.bossPhase}` : "");
    setText(requiredElement(this.root, "[data-bonus-status]"), `${this.snapshot.bonusComplete ? "✓" : "○"} ${this.snapshot.bonusLabel}`);
    this.snapshot.ammunition.forEach((ammo) => {
      const chip = requiredElement(this.root, `[data-ammo-kind="${ammo.kind}"]`);
      chip.classList.toggle("selected", ammo.kind === this.snapshot.selectedAmmo);
      chip.classList.toggle("empty", ammo.count === 0);
      setText(requiredElement(chip, "strong"), ammo.count === null ? "∞" : String(ammo.count));
    });
    requiredElement<HTMLElement>(this.root, "[data-powerup-readout]").hidden =
      this.snapshot.activePowerUps.length === 0;
    for (const kind of TIMED_POWER_UP_KINDS) {
      const chip = requiredElement<HTMLElement>(this.root, `[data-powerup-kind="${kind}"]`);
      const active = this.snapshot.activePowerUps.find((powerUp) => powerUp.kind === kind);
      chip.hidden = !active;
      if (!active) continue;
      setText(requiredElement(chip, "strong"), kind === "shield"
        ? `${active.shieldPoints} SH / ${Math.ceil(active.remaining)}s`
        : `${Math.ceil(active.remaining)}s`);
      requiredElement<HTMLElement>(chip, "b").style.width =
        `${(active.remaining / active.duration) * 100}%`;
    }
  }

  private renderMenu(): void {
    const selected = MISSIONS[this.selectedMission];
    setText(requiredElement(this.root, "[data-campaign-progress]"), String(this.unlockedMission + 1));
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
      setText(medal, record ? `${record.rank}${record.bonus ? "★" : ""}` : "");
    });
    setText(requiredElement(this.root, "[data-selected-number]"), selected.number);
    setText(requiredElement(this.root, "[data-selected-name]"), selected.name);
    setText(requiredElement(this.root, "[data-selected-briefing]"), selected.briefing);
    setText(requiredElement(this.root, "[data-selected-hostiles]"), String(getMissionEnemyTotal(selected)));
    setText(requiredElement(this.root, "[data-selected-par]"), formatTime(selected.parTime));
    setText(requiredElement(this.root, "[data-selected-threat]"), selected.threat);
    setText(requiredElement(this.root, "[data-selected-objective]"), selected.objective.label);
    setText(requiredElement(this.root, "[data-selected-bonus]"), selected.bonus.label);
    this.renderSelectedMissionMap(this.selectedMission);

    this.root.querySelectorAll<HTMLButtonElement>("[data-tank-class]").forEach((button) => {
      button.classList.toggle("selected", this.save.tankClass === button.dataset.tankClass);
    });
    setText(requiredElement(this.root, "[data-survival-best]"), this.save.survivalBest.toLocaleString());

  }

  private renderResult(): void {
    const currentMission = MISSIONS[this.snapshot.missionIndex];
    setText(requiredElement(this.root, "[data-paused-eyebrow]"), `MISSION ${currentMission.number}`);
    if (this.phase === "paused") return;
    if (this.phase === "victory") {
      setText(requiredElement(this.root, "[data-victory-title]"), `RANK ${getRating(this.snapshot)}`);
      setText(requiredElement(this.root, "[data-victory-mission]"), currentMission.name);
      setText(requiredElement(this.root, "[data-result-time]"), formatTime(this.snapshot.elapsed));
      setText(requiredElement(this.root, "[data-result-par]"), formatTime(currentMission.parTime));
      setText(requiredElement(this.root, "[data-result-accuracy]"), `${accuracy(this.snapshot)}%`);
      setText(requiredElement(this.root, "[data-result-hull]"), `${this.snapshot.health}/${this.snapshot.maxHealth}`);

      const finalMission = this.snapshot.missionIndex === MISSIONS.length - 1;
      requiredElement<HTMLButtonElement>(this.root, '[data-action="next"]').hidden = finalMission;
      requiredElement<HTMLButtonElement>(this.root, "[data-campaign-complete]").hidden = !finalMission;

      return;
    }
    const units = this.snapshot.enemiesLeft === 1 ? "tank" : "tanks";
    setText(requiredElement(this.root, "[data-defeat-message]"), this.snapshot.mode === "survival"
        ? `Wave ${this.snapshot.wave} reached with ${this.snapshot.score.toLocaleString()} points.`
        : `The operation still has ${this.snapshot.enemiesLeft} hostile ${units} remaining.`);
  }
}
