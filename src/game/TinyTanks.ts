import { TankGame, type GamePhase, type GameSnapshot } from "./engine";
import { MISSIONS } from "./levels";

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

function gameShell(): string {
  return `
    <main class="game-shell phase-menu">
      <canvas class="game-canvas" aria-label="V/Tanks tactical arena"></canvas>

      <header class="game-chrome">
        <button class="brand-lockup" data-action="menu" aria-label="Return to mission select">
          <span class="brand-mark"><i></i>V</span>
          <span>
            <strong>V/TANKS</strong>
            <small>TACTICAL ARCADE</small>
          </span>
        </button>
        <div class="top-readout" data-playing-chrome hidden aria-live="polite">
          <div>
            <span>MISSION</span>
            <strong data-current-mission></strong>
          </div>
          <div>
            <span>TARGETS</span>
            <strong data-targets></strong>
          </div>
          <div>
            <span>TIME</span>
            <strong data-time></strong>
          </div>
        </div>
        <div class="chrome-actions">
          <button class="icon-button" data-action="sound"></button>
          <button class="chrome-button" data-action="pause" hidden>PAUSE</button>
        </div>
      </header>

      <section class="combat-status combat-status-left" data-combat hidden aria-label="Hull status">
        <span class="status-label">HULL</span>
        <div class="armor-pips"><i></i><i></i><i></i></div>
      </section>
      <section class="combat-status combat-status-right" data-combat hidden aria-label="Dash charge">
        <span class="status-label">DASH / SHIFT</span>
        <div class="dash-track"><i data-dash-charge></i></div>
      </section>
      <section class="boss-readout" data-boss hidden>
        <span>RED CORE</span>
        <div><i data-boss-health></i></div>
      </section>
      <div class="control-strip" data-combat hidden>
        <span><kbd>WASD</kbd> MOVE</span>
        <span><kbd>MOUSE</kbd> AIM</span>
        <span><kbd>LMB</kbd> FIRE</span>
        <span><kbd>SHIFT</kbd> DASH</span>
        <span><kbd>R</kbd> RESTART</span>
      </div>

      <section class="menu-layout" data-screen="menu">
        <div class="hero-copy">
          <div class="eyebrow"><span></span> SOLO TACTICAL PROGRAM</div>
          <h1><span>V/</span>TANKS</h1>
          <p class="hero-lede">
            Tiny machines. Sharp angles. Clear the arena before the arena clears you.
          </p>
          <div class="feature-line">
            <span>01</span>
            <p><strong>MOVE FAST</strong> — break sightlines and force bad shots.</p>
          </div>
          <div class="feature-line">
            <span>02</span>
            <p><strong>USE THE WALLS</strong> — every shell carries one ricochet.</p>
          </div>
          <div class="feature-line">
            <span>03</span>
            <p><strong>READ THE ROOM</strong> — each enemy has a different rhythm.</p>
          </div>
          <div class="desktop-tag">DESKTOP ONLY / KEYBOARD + MOUSE</div>
        </div>

        <div class="campaign-panel">
          <div class="panel-heading">
            <div>
              <span>CAMPAIGN</span>
              <h2>Select operation</h2>
            </div>
            <div class="campaign-progress">
              <span data-campaign-progress></span><small>/06</small>
            </div>
          </div>
          <div class="mission-grid">${missionCards()}</div>
          <div class="mission-brief">
            <div>
              <span>MISSION <span data-selected-number></span></span>
              <h3 data-selected-name></h3>
              <p data-selected-briefing></p>
            </div>
            <dl>
              <div><dt>HOSTILES</dt><dd data-selected-hostiles></dd></div>
              <div><dt>PAR</dt><dd data-selected-par></dd></div>
              <div><dt>THREAT</dt><dd data-selected-threat></dd></div>
            </dl>
          </div>
          <button class="primary-button" data-action="deploy">
            <span>DEPLOY</span>
            <i>→</i>
          </button>
        </div>
      </section>

      <section class="overlay-screen" data-screen="paused" hidden>
        <div class="overlay-card">
          <div class="overlay-eyebrow"><span></span><span data-paused-eyebrow></span><span></span></div>
          <h2>SYSTEM PAUSED</h2>
          <p>Combat clock suspended. Re-enter the arena when you're ready.</p>
          <button class="primary-button" data-action="resume">
            <span>RESUME</span><i>→</i>
          </button>
          <div class="overlay-actions">
            <button data-action="restart">RESTART</button>
            <button data-action="menu">MISSION SELECT</button>
          </div>
        </div>
      </section>

      <section class="overlay-screen" data-screen="victory" hidden>
        <div class="overlay-card">
          <div class="overlay-eyebrow"><span></span>ARENA SECURED<span></span></div>
          <h2 data-victory-title></h2>
          <p><span data-victory-mission></span> cleared. Combat telemetry has been recorded.</p>
          <div class="result-grid">
            <div><span>TIME</span><strong data-result-time></strong></div>
            <div><span>PAR</span><strong data-result-par></strong></div>
            <div><span>ACCURACY</span><strong data-result-accuracy></strong></div>
            <div><span>HULL</span><strong data-result-hull></strong></div>
          </div>
          <button class="primary-button" data-action="next">
            <span>NEXT MISSION</span><i>→</i>
          </button>
          <button class="primary-button" data-action="menu" data-campaign-complete hidden>
            <span>CAMPAIGN COMPLETE</span><i>✓</i>
          </button>
          <div class="overlay-actions">
            <button data-action="replay">REPLAY</button>
            <button data-action="menu">MISSION SELECT</button>
          </div>
        </div>
      </section>

      <section class="overlay-screen danger" data-screen="defeat" hidden>
        <div class="overlay-card">
          <div class="overlay-eyebrow"><span></span>SIGNAL LOST<span></span></div>
          <h2>HULL BREACHED</h2>
          <p data-defeat-message></p>
          <button class="primary-button danger-button" data-action="redeploy">
            <span>REDEPLOY</span><i>↻</i>
          </button>
          <div class="overlay-actions">
            <button data-action="menu">MISSION SELECT</button>
          </div>
        </div>
      </section>

      <div class="desktop-blocker">
        <div class="blocker-mark">V</div>
        <span>DESKTOP SYSTEM REQUIRED</span>
        <h1>V/TANKS needs a wider battlefield.</h1>
        <p>Open this game on a desktop or laptop with a keyboard and mouse.</p>
      </div>
    </main>
  `;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export class TinyTanks {
  private readonly shell: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly game: TankGame;
  private phase: GamePhase = "menu";
  private snapshot = INITIAL_SNAPSHOT;
  private unlockedMission = readUnlockedMission();
  private selectedMission = 0;
  private soundEnabled = true;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = gameShell();
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
