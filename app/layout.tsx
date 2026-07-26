import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "V/Tanks — Tactical Arcade",
  description:
    "Clear six handcrafted arenas in a fast, vector-styled single-player tank campaign.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
