import { TankGame, type GamePhase, type GameSnapshot } from "./engine";
import { MISSIONS } from "./levels";
import gameShell from "./v-tanks.html?raw";

const INITIAL_SNAPSHOT: GameSnapshot = {
  phase: "menu",
  missionIndex: 0,
  health: 3,
  enemiesLeft: MISSIONS[0].enemies.length,
  elapsed: 0,
  shots: 0,
  hits: 0,
  dashReady: 1,
  bossHealth: null,
};

const PROGRESS_KEY = "v-tanks-campaign-v1";

function readUnlockedMission(): number {
  const stored = Number.parseInt(window.localStorage.getItem(PROGRESS_KEY) ?? "0", 10);
  return Number.isFinite(stored) ? Math.max(0, Math.min(MISSIONS.length - 1, stored)) : 0;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function accuracy(snapshot: GameSnapshot): number {
  if (snapshot.shots === 0) return 0;
  return Math.round((snapshot.hits / snapshot.shots) * 100);
}

function getRating(snapshot: GameSnapshot): string {
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
      <span class="lock-mark" data-lock hidden>LOCK</span>
    </button>
  `).join("");
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
  private unlockedMission = readUnlockedMission();
  private selectedMission = 0;
  private soundEnabled = true;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = gameShell;
    requiredElement(root, ".mission-grid").innerHTML = missionCards();
    this.shell = requiredElement(root, ".game-shell");
    this.canvas = requiredElement(root, ".game-canvas");
    root.addEventListener("click", this.onClick);

    this.game = new TankGame(
      this.canvas,
      this.onSnapshot,
      this.onPhase,
    );
    this.render();
  }

  destroy(): void {
    this.game.destroy();
    this.root.removeEventListener("click", this.onClick);
    this.root.replaceChildren();
  }

  private readonly onSnapshot = (snapshot: GameSnapshot): void => {
    this.snapshot = snapshot;
    if (snapshot.phase === "victory") {
      const nextUnlocked = Math.min(MISSIONS.length - 1, snapshot.missionIndex + 1);
      if (nextUnlocked > this.unlockedMission) {
        this.unlockedMission = nextUnlocked;
        window.localStorage.setItem(PROGRESS_KEY, String(nextUnlocked));
      }
    }
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
    if (!actionButton) return;
    const action = actionButton.dataset.action;

    if (action === "menu") this.returnToMenu();
    if (action === "sound") {
      this.soundEnabled = !this.soundEnabled;
      this.game.setSound(this.soundEnabled);
      this.render();
    }
    if (action === "pause") this.game.pause();
    if (action === "resume") this.game.resume();
    if (action === "deploy") this.startMission(this.selectedMission);
    if (action === "restart" || action === "replay" || action === "redeploy") {
      this.startMission(this.snapshot.missionIndex);
    }
    if (action === "next") this.startMission(this.snapshot.missionIndex + 1);
  };

  private startMission(index: number): void {
    this.selectedMission = index;
    this.game.startMission(index);
  }

  private returnToMenu(): void {
    this.selectedMission = this.snapshot.missionIndex;
    this.game.showMenu();
  }

  private render(): void {
    const currentMission = MISSIONS[this.snapshot.missionIndex];
    const selected = MISSIONS[this.selectedMission];
    const playing = this.phase === "playing";

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
      this.snapshot.enemiesLeft.toString().padStart(2, "0");
    requiredElement(this.root, "[data-time]").textContent = formatTime(this.snapshot.elapsed);

    const soundButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="sound"]');
    const soundLabel = this.soundEnabled ? "Mute sound" : "Enable sound";
    soundButton.textContent = this.soundEnabled ? ")))" : "×";
    soundButton.ariaLabel = soundLabel;
    soundButton.title = soundLabel;

    this.root.querySelectorAll(".armor-pips i").forEach((pip, index) => {
      pip.classList.toggle("active", index < this.snapshot.health);
    });
    requiredElement<HTMLElement>(this.root, "[data-dash-charge]").style.width =
      `${this.snapshot.dashReady * 100}%`;
    const boss = requiredElement<HTMLElement>(this.root, "[data-boss]");
    boss.hidden = !playing || this.snapshot.bossHealth === null;
    requiredElement<HTMLElement>(this.root, "[data-boss-health]").style.width =
      `${(this.snapshot.bossHealth ?? 0) * 100}%`;

    requiredElement(this.root, "[data-campaign-progress]").textContent =
      String(this.unlockedMission + 1);
    this.root.querySelectorAll<HTMLButtonElement>("[data-mission-index]").forEach((button, index) => {
      const locked = index > this.unlockedMission;
      button.disabled = locked;
      button.classList.toggle("selected", index === this.selectedMission);
      button.classList.toggle("locked", locked);
      requiredElement<HTMLElement>(button, "[data-complete]").hidden = index >= this.unlockedMission;
      requiredElement<HTMLElement>(button, "[data-lock]").hidden = !locked;
    });
    requiredElement(this.root, "[data-selected-number]").textContent = selected.number;
    requiredElement(this.root, "[data-selected-name]").textContent = selected.name;
    requiredElement(this.root, "[data-selected-briefing]").textContent = selected.briefing;
    requiredElement(this.root, "[data-selected-hostiles]").textContent = String(selected.enemies.length);
    requiredElement(this.root, "[data-selected-par]").textContent = formatTime(selected.parTime);
    requiredElement(this.root, "[data-selected-threat]").textContent = selected.threat;

    requiredElement(this.root, "[data-paused-eyebrow]").textContent =
      `MISSION ${currentMission.number}`;
    requiredElement(this.root, "[data-victory-title]").textContent =
      `RANK ${getRating(this.snapshot)}`;
    requiredElement(this.root, "[data-victory-mission]").textContent = currentMission.name;
    requiredElement(this.root, "[data-result-time]").textContent = formatTime(this.snapshot.elapsed);
    requiredElement(this.root, "[data-result-par]").textContent = formatTime(currentMission.parTime);
    requiredElement(this.root, "[data-result-accuracy]").textContent = `${accuracy(this.snapshot)}%`;
    requiredElement(this.root, "[data-result-hull]").textContent = `${this.snapshot.health}/3`;

    const finalMission = this.snapshot.missionIndex === MISSIONS.length - 1;
    requiredElement<HTMLButtonElement>(this.root, '[data-action="next"]').hidden = finalMission;
    requiredElement<HTMLButtonElement>(this.root, "[data-campaign-complete]").hidden = !finalMission;

    const units = this.snapshot.enemiesLeft === 1 ? "unit" : "units";
    requiredElement(this.root, "[data-defeat-message]").textContent =
      `The arena still holds ${this.snapshot.enemiesLeft} hostile ${units}.`;
  }
}
