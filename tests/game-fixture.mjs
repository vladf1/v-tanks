import { TankGame } from '../src/game/engine.ts';

// Only browser I/O is stubbed; tests run the production simulation and snapshots.
export function createGame() {
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.Path2D = class {
    calls = [];
    moveTo(...args) { this.calls.push(['moveTo', ...args]); }
    quadraticCurveTo(...args) { this.calls.push(['quadraticCurveTo', ...args]); }
    closePath() { this.calls.push(['closePath']); }
  };
  const canvas = {
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
    addEventListener() {}, removeEventListener() {}, dataset: {},
  };
  const snapshots = [];
  const game = new TankGame(canvas, snapshot => snapshots.push(snapshot));
  game.setSound(false);
  game.startMission(0);
  return { game, snapshots, canvas };
}

export function recordDrawing() {
  const calls = [];
  const context = new Proxy({ globalAlpha: 1 }, {
    get(target, name) {
      if (name in target) return target[name];
      return (...args) => {
        calls.push({ name, args, alpha: target.globalAlpha, color: target.fillStyle });
        if (name === 'measureText') return { actualBoundingBoxLeft: 0, actualBoundingBoxRight: 80,
          actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2 };
        if (name === 'createRadialGradient' || name === 'createLinearGradient') return { addColorStop() {} };
      };
    },
  });
  return { context, calls };
}
