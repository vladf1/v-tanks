import { useEffect, useMemo, useRef, useState } from "react";
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
  if (typeof window === "undefined") return 0;
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

export function TinyTanks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TankGame | null>(null);
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [snapshot, setSnapshot] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [unlockedMission, setUnlockedMission] = useState(0);
  const [selectedMission, setSelectedMission] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setUnlockedMission(readUnlockedMission()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new TankGame(
      canvas,
      (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        if (nextSnapshot.phase !== "victory") return;
        const nextUnlocked = Math.min(MISSIONS.length - 1, nextSnapshot.missionIndex + 1);
        setUnlockedMission((current) => {
          const updated = Math.max(current, nextUnlocked);
          window.localStorage.setItem(PROGRESS_KEY, String(updated));
          return updated;
        });
      },
      setPhase,
    );
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    gameRef.current?.setSound(soundEnabled);
  }, [soundEnabled]);

  const selected = MISSIONS[selectedMission];
  const currentMission = MISSIONS[snapshot.missionIndex];
  const completion = useMemo(
    () => MISSIONS.map((_, index) => index < unlockedMission),
    [unlockedMission],
  );

  const startMission = (index: number) => {
    setSelectedMission(index);
    gameRef.current?.startMission(index);
  };

  const returnToMenu = () => {
    setSelectedMission(snapshot.missionIndex);
    gameRef.current?.showMenu();
  };

  return (
    <main className={`game-shell phase-${phase}`}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label="V/Tanks tactical arena"
      />

      <header className="game-chrome">
        <button className="brand-lockup" onClick={returnToMenu} aria-label="Return to mission select">
          <span className="brand-mark"><i />V</span>
          <span>
            <strong>V/TANKS</strong>
            <small>TACTICAL ARCADE</small>
          </span>
        </button>
        {phase !== "menu" && (
          <div className="top-readout" aria-live="polite">
            <div>
              <span>MISSION</span>
              <strong>{currentMission.number} / {currentMission.name}</strong>
            </div>
            <div>
              <span>TARGETS</span>
              <strong>{snapshot.enemiesLeft.toString().padStart(2, "0")}</strong>
            </div>
            <div>
              <span>TIME</span>
              <strong>{formatTime(snapshot.elapsed)}</strong>
            </div>
          </div>
        )}
        <div className="chrome-actions">
          <button
            className="icon-button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
            aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
            title={soundEnabled ? "Mute sound" : "Enable sound"}
          >
            {soundEnabled ? ")))" : "×"}
          </button>
          {phase === "playing" && (
            <button className="chrome-button" onClick={() => gameRef.current?.pause()}>
              PAUSE
            </button>
          )}
        </div>
      </header>

      {phase === "playing" && (
        <>
          <section className="combat-status combat-status-left" aria-label="Hull status">
            <span className="status-label">HULL</span>
            <div className="armor-pips">
              {[0, 1, 2].map((pip) => (
                <i key={pip} className={pip < snapshot.health ? "active" : ""} />
              ))}
            </div>
          </section>
          <section className="combat-status combat-status-right" aria-label="Dash charge">
            <span className="status-label">DASH / SHIFT</span>
            <div className="dash-track">
              <i style={{ width: `${snapshot.dashReady * 100}%` }} />
            </div>
          </section>
          {snapshot.bossHealth !== null && (
            <section className="boss-readout">
              <span>RED CORE</span>
              <div><i style={{ width: `${snapshot.bossHealth * 100}%` }} /></div>
            </section>
          )}
          <div className="control-strip">
            <span><kbd>WASD</kbd> MOVE</span>
            <span><kbd>MOUSE</kbd> AIM</span>
            <span><kbd>LMB</kbd> FIRE</span>
            <span><kbd>SHIFT</kbd> DASH</span>
            <span><kbd>R</kbd> RESTART</span>
          </div>
        </>
      )}

      {phase === "menu" && (
        <section className="menu-layout">
          <div className="hero-copy">
            <div className="eyebrow"><span /> SOLO TACTICAL PROGRAM</div>
            <h1><span>V/</span>TANKS</h1>
            <p className="hero-lede">
              Tiny machines. Sharp angles. Clear the arena before the arena clears you.
            </p>
            <div className="feature-line">
              <span>01</span>
              <p><strong>MOVE FAST</strong> — break sightlines and force bad shots.</p>
            </div>
            <div className="feature-line">
              <span>02</span>
              <p><strong>USE THE WALLS</strong> — every shell carries one ricochet.</p>
            </div>
            <div className="feature-line">
              <span>03</span>
              <p><strong>READ THE ROOM</strong> — each enemy has a different rhythm.</p>
            </div>
            <div className="desktop-tag">DESKTOP ONLY / KEYBOARD + MOUSE</div>
          </div>

          <div className="campaign-panel">
            <div className="panel-heading">
              <div>
                <span>CAMPAIGN</span>
                <h2>Select operation</h2>
              </div>
              <div className="campaign-progress">
                {unlockedMission + 1}<small>/06</small>
              </div>
            </div>
            <div className="mission-grid">
              {MISSIONS.map((mission, index) => {
                const locked = index > unlockedMission;
                const active = selectedMission === index;
                return (
                  <button
                    key={mission.number}
                    className={`mission-card ${active ? "selected" : ""} ${locked ? "locked" : ""}`}
                    onClick={() => !locked && setSelectedMission(index)}
                    disabled={locked}
                  >
                    <span className="mission-number">{mission.number}</span>
                    <span className="mission-name">{mission.name}</span>
                    <span className={`threat threat-${mission.threat.toLowerCase()}`}>{mission.threat}</span>
                    {completion[index] && <span className="complete-mark">✓</span>}
                    {locked && <span className="lock-mark">LOCK</span>}
                  </button>
                );
              })}
            </div>
            <div className="mission-brief">
              <div>
                <span>MISSION {selected.number}</span>
                <h3>{selected.name}</h3>
                <p>{selected.briefing}</p>
              </div>
              <dl>
                <div><dt>HOSTILES</dt><dd>{selected.enemies.length}</dd></div>
                <div><dt>PAR</dt><dd>{formatTime(selected.parTime)}</dd></div>
                <div><dt>THREAT</dt><dd>{selected.threat}</dd></div>
              </dl>
            </div>
            <button className="primary-button" onClick={() => startMission(selectedMission)}>
              <span>DEPLOY</span>
              <i>→</i>
            </button>
          </div>
        </section>
      )}

      {phase === "paused" && (
        <OverlayCard eyebrow={`MISSION ${currentMission.number}`} title="SYSTEM PAUSED">
          <p>Combat clock suspended. Re-enter the arena when you&apos;re ready.</p>
          <button className="primary-button" onClick={() => gameRef.current?.resume()}>
            <span>RESUME</span><i>→</i>
          </button>
          <div className="overlay-actions">
            <button onClick={() => startMission(snapshot.missionIndex)}>RESTART</button>
            <button onClick={returnToMenu}>MISSION SELECT</button>
          </div>
        </OverlayCard>
      )}

      {phase === "victory" && (
        <OverlayCard eyebrow="ARENA SECURED" title={`RANK ${getRating(snapshot)}`}>
          <p>{currentMission.name} cleared. Combat telemetry has been recorded.</p>
          <div className="result-grid">
            <div><span>TIME</span><strong>{formatTime(snapshot.elapsed)}</strong></div>
            <div><span>PAR</span><strong>{formatTime(currentMission.parTime)}</strong></div>
            <div><span>ACCURACY</span><strong>{accuracy(snapshot)}%</strong></div>
            <div><span>HULL</span><strong>{snapshot.health}/3</strong></div>
          </div>
          {snapshot.missionIndex < MISSIONS.length - 1 ? (
            <button className="primary-button" onClick={() => startMission(snapshot.missionIndex + 1)}>
              <span>NEXT MISSION</span><i>→</i>
            </button>
          ) : (
            <button className="primary-button" onClick={returnToMenu}>
              <span>CAMPAIGN COMPLETE</span><i>✓</i>
            </button>
          )}
          <div className="overlay-actions">
            <button onClick={() => startMission(snapshot.missionIndex)}>REPLAY</button>
            <button onClick={returnToMenu}>MISSION SELECT</button>
          </div>
        </OverlayCard>
      )}

      {phase === "defeat" && (
        <OverlayCard eyebrow="SIGNAL LOST" title="HULL BREACHED" danger>
          <p>The arena still holds {snapshot.enemiesLeft} hostile unit{snapshot.enemiesLeft === 1 ? "" : "s"}.</p>
          <button className="primary-button danger-button" onClick={() => startMission(snapshot.missionIndex)}>
            <span>REDEPLOY</span><i>↻</i>
          </button>
          <div className="overlay-actions">
            <button onClick={returnToMenu}>MISSION SELECT</button>
          </div>
        </OverlayCard>
      )}

      <div className="desktop-blocker">
        <div className="blocker-mark">V</div>
        <span>DESKTOP SYSTEM REQUIRED</span>
        <h1>V/TANKS needs a wider battlefield.</h1>
        <p>Open this game on a desktop or laptop with a keyboard and mouse.</p>
      </div>
    </main>
  );
}

function OverlayCard({
  eyebrow,
  title,
  danger = false,
  children,
}: {
  eyebrow: string;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`overlay-screen ${danger ? "danger" : ""}`}>
      <div className="overlay-card">
        <div className="overlay-eyebrow"><span />{eyebrow}<span /></div>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}
