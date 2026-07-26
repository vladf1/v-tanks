import type { Metadata } from "next";
import { TinyTanks } from "./game/TinyTanks";

export const metadata: Metadata = {
  title: "V/Tanks — Tactical Arcade",
  description: "A desktop-only single-player tactical tank arena rendered in Canvas.",
};

export default function Home() {
  return <TinyTanks />;
}
