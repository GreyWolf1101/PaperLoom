const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const { NsisUpdater } = require("electron-updater");
const semver = require("semver");
const { loadUpdateConfig } = require("../electron/update-config.cjs");

const simulatedVersion = process.env.PAPERLOOM_VERIFY_FROM_VERSION || "0.9.1";
const temporaryUserData = fs.mkdtempSync(path.join(os.tmpdir(), "paperloom-update-verify-"));
app.setPath("userData", temporaryUserData);

app.whenReady().then(async () => {
  const config = await loadUpdateConfig(path.join(__dirname, "..", "electron", "update-config.json"));
  if (!config.url) throw new Error("No update source is configured.");
  const currentVersion = semver.parse(simulatedVersion);
  if (!currentVersion) throw new Error(`Invalid simulated version: ${simulatedVersion}`);

  const updater = new NsisUpdater({ provider: "generic", url: config.url, channel: config.channel });
  updater.autoDownload = false;
  updater.forceDevUpdateConfig = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.currentVersion = currentVersion;
  const result = await updater.checkForUpdates();
  process.stdout.write(`${JSON.stringify({
    updateUrl: config.url,
    simulatedCurrentVersion: simulatedVersion,
    discoveredVersion: result?.updateInfo?.version || "",
    updateAvailable: Boolean(result?.updateInfo?.version && result.updateInfo.version !== simulatedVersion),
  }, null, 2)}\n`);
}).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}).finally(() => {
  try {
    fs.rmSync(temporaryUserData, { recursive: true, force: true });
  } catch {
    // Electron can briefly retain cache handles; the operating system will clean the temp directory.
  }
  app.exit(process.exitCode || 0);
});
