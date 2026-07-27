import { createRoot } from "react-dom/client";
import { TinyTanks } from "./game/TinyTanks";
import "./style.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(<TinyTanks />);
