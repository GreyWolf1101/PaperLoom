const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  normalizeUpdateConfig,
  normalizeUpdateUrl,
} = require("../electron/update-config.cjs");
const {
  createUpdateManager,
  releaseNotesText,
  safeErrorMessage,
} = require("../electron/update-manager.cjs");

test("normalizes a public HTTPS update directory", () => {
  assert.equal(
    normalizeUpdateUrl("https://download.example.com/paperloom/windows"),
    "https://download.example.com/paperloom/windows/",
  );
});

test("rejects insecure, credentialed and private update sources", () => {
  assert.equal(normalizeUpdateUrl("http://download.example.com/releases"), "");
  assert.equal(normalizeUpdateUrl("https://user:secret@download.example.com/releases"), "");
  assert.equal(normalizeUpdateUrl("https://127.0.0.1/releases"), "");
  assert.equal(normalizeUpdateUrl("https://192.168.1.8/releases"), "");
});

test("environment URL safely overrides the bundled release source", () => {
  assert.deepEqual(
    normalizeUpdateConfig(
      { url: "https://old.example.com/releases", channel: "LATEST" },
      { PAPERLOOM_UPDATE_URL: "https://new.example.com/windows" },
    ),
    { url: "https://new.example.com/windows/", channel: "latest" },
  );
});

test("release notes and errors are bounded and credential-safe", () => {
  assert.equal(releaseNotesText([{ note: "修复阅读位置" }, { note: "改进更新体验" }]), "修复阅读位置\n\n改进更新体验");
  assert.equal(
    safeErrorMessage(new Error("failed https://name:secret@example.com/latest.yml")),
    "failed https://example.com/latest.yml",
  );
});

test("a configured packaged build initializes the updater instead of reporting unconfigured", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "paperloom-update-test-"));
  const configPath = path.join(directory, "update-config.json");
  await fs.writeFile(configPath, JSON.stringify({ url: "https://download.example.com/paperloom/windows/" }), "utf8");
  let receivedOptions;
  const fakeUpdater = new EventEmitter();
  fakeUpdater.checkForUpdates = async () => null;
  fakeUpdater.downloadUpdate = async () => null;
  fakeUpdater.quitAndInstall = () => undefined;

  const manager = createUpdateManager({
    app: { isPackaged: true, getVersion: () => "0.9.2" },
    getWindow: () => null,
    getSettings: async () => ({ language: "zh-CN", autoCheckUpdates: false }),
    configPath,
    createUpdater: (options) => {
      receivedOptions = options;
      return fakeUpdater;
    },
  });

  try {
    const status = await manager.initialize();
    assert.equal(status.configured, true);
    assert.equal(status.phase, "idle");
    assert.deepEqual(receivedOptions, {
      provider: "generic",
      url: "https://download.example.com/paperloom/windows/",
      channel: "latest",
    });
  } finally {
    manager.dispose();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
