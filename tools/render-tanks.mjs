import { access, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const TANK_KINDS = ["player", "scout", "guard", "sniper", "boss"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OUTPUT_DIR = path.resolve(PROJECT_ROOT, "artifacts", "tanks");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next known Chrome installation.
    }
  }
  throw new Error("Chrome was not found. Set CHROME_PATH to a Chrome or Chromium executable.");
}

async function captureWithChrome(chromePath, profileDir, url, outputPath) {
  await rm(outputPath, { force: true });
  const args = [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--force-device-scale-factor=1",
    "--window-size=1280,720",
    "--virtual-time-budget=1000",
    `--user-data-dir=${profileDir}`,
    `--screenshot=${outputPath}`,
    url,
  ];

  return new Promise((resolve, reject) => {
    const chrome = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errorOutput = "";
    let lastSize = -1;
    let screenshotReady = false;
    let forceKillTimer;
    chrome.stderr.setEncoding("utf8");
    chrome.stderr.on("data", (chunk) => {
      errorOutput += chunk;
    });
    chrome.on("error", reject);
    const screenshotPoll = setInterval(async () => {
      try {
        const file = await stat(outputPath);
        if (file.size > 0 && file.size === lastSize) {
          screenshotReady = true;
          clearInterval(screenshotPoll);
          chrome.kill("SIGTERM");
          forceKillTimer = setTimeout(() => chrome.kill("SIGKILL"), 2000);
        }
        lastSize = file.size;
      } catch {
        // Chrome has not written the screenshot yet.
      }
    }, 100);
    const timeout = setTimeout(() => {
      clearInterval(screenshotPoll);
      chrome.kill("SIGKILL");
    }, 15000);
    chrome.on("close", (code) => {
      clearInterval(screenshotPoll);
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      if (screenshotReady || code === 0) resolve();
      else reject(new Error(`Chrome exited with code ${code}.\n${errorOutput.trim()}`));
    });
  });
}

const chromePath = await findChrome();
const profileDir = await mkdtemp(path.join(tmpdir(), "v-tanks-render-"));
const server = await createServer({
  root: PROJECT_ROOT,
  server: {
    host: "127.0.0.1",
    port: 41731,
    strictPort: false,
  },
});

try {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite did not expose a local TCP address.");
  }

  for (const kind of TANK_KINDS) {
    const url = `http://127.0.0.1:${address.port}/tools/tank-renderer.html?kind=${kind}`;
    const outputPath = path.join(OUTPUT_DIR, `${kind}.png`);
    await captureWithChrome(chromePath, profileDir, url, outputPath);
    console.log(`Rendered ${path.relative(PROJECT_ROOT, outputPath)}`);
  }
} finally {
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}
