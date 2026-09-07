import { TankGame } from '../src/game/engine.ts';

// Only browser I/O is stubbed; tests run the production simulation and snapshots.
export function createGame() {
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
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
