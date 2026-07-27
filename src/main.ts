import { TinyTanks } from "./game/TinyTanks";
import "./style.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

const game = new TinyTanks(root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy());
}
