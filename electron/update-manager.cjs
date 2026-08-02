const fs = require("node:fs");
const path = require("node:path");
const { loadUpdateConfig } = require("./update-config.cjs");

function releaseNotesText(value) {
  if (typeof value === "string") return value.trim().slice(0, 8_000);
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => typeof item === "string" ? item : item?.note)
    .filter(Boolean)
    .join("\n\n")
    .trim()
    .slice(0, 8_000);
}

function safeErrorMessage(error) {
  return String(error?.message || error || "")
    .replace(/https:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://")
    .slice(0, 500);
}

function defaultCreateUpdater(options) {
  const { NsisUpdater } = require("electron-updater");
  return new NsisUpdater(options);
}

function createUpdateManager({ app, getWindow, getSettings, configPath, createUpdater = defaultCreateUpdater }) {
  let updater = null;
  let language = "zh-CN";
  let initialized = false;
  let autoCheckTimer = null;
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
    || fs.existsSync(path.join(path.dirname(process.execPath), "使用说明.txt"));
  let snapshot = {
    phase: "idle",
    supported: process.platform === "win32" && app.isPackaged,
    configured: false,
    portable,
    currentVersion: app.getVersion(),
    message: "",
  };

  const tr = (zh, en) => language === "en-US" ? en : zh;
  const send = () => {
    const window = getWindow();
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("updates:status", { ...snapshot });
    }
  };
  const update = (patch) => {
    snapshot = { ...snapshot, ...patch };
    send();
    return { ...snapshot };
  };
  const unavailable = ({ requireUpdater = true } = {}) => {
    if (!snapshot.supported) {
      return update({
        phase: "disabled",
        message: tr("自动更新仅在打包后的 Windows 版本中可用。", "Automatic updates are available only in packaged Windows builds."),
      });
    }
    if (!snapshot.configured) {
      return update({
        phase: "unconfigured",
        message: tr("尚未配置正式更新源。请先填写 electron/update-config.json。", "No release feed is configured. Set electron/update-config.json first."),
      });
    }
    if (requireUpdater && !updater) {
      return update({
        phase: "error",
        message: tr("更新服务初始化失败，请重新启动应用后再试。", "The update service could not be initialized. Restart the app and try again."),
      });
    }
    return null;
  };

  async function refreshLanguage() {
    try {
      const settings = await getSettings();
      language = settings?.language === "en-US" ? "en-US" : "zh-CN";
      return settings;
    } catch {
      return { language };
    }
  }

  async function initialize() {
    if (initialized) return { ...snapshot };
    initialized = true;
    const settings = await refreshLanguage();
    const config = await loadUpdateConfig(configPath);
    snapshot = {
      ...snapshot,
      configured: Boolean(config.url),
      feedHost: config.url ? new URL(config.url).hostname : undefined,
    };
    const blocked = unavailable({ requireUpdater: false });
    if (blocked) return blocked;

    try {
      updater = createUpdater({
        provider: "generic",
        url: config.url,
        channel: config.channel,
      });
    } catch (error) {
      return update({
        phase: "error",
        message: tr(`更新服务初始化失败：${safeErrorMessage(error)}`, `Update service initialization failed: ${safeErrorMessage(error)}`),
      });
    }
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.autoRunAppAfterInstall = true;
    updater.disableWebInstaller = true;

    updater.on("checking-for-update", () => update({
      phase: "checking",
      progress: undefined,
      message: tr("正在检查新版本……", "Checking for updates…"),
    }));
    updater.on("update-available", (info) => update({
      phase: "available",
      availableVersion: String(info?.version || ""),
      releaseName: String(info?.releaseName || ""),
      releaseNotes: releaseNotesText(info?.releaseNotes),
      checkedAt: Date.now(),
      message: tr(`发现新版本 ${info?.version || ""}`, `Version ${info?.version || ""} is available`),
    }));
    updater.on("update-not-available", () => update({
      phase: "up-to-date",
      availableVersion: undefined,
      releaseName: undefined,
      releaseNotes: undefined,
      checkedAt: Date.now(),
      message: tr("当前已是最新版本。", "You are using the latest version."),
    }));
    updater.on("download-progress", (progress) => update({
      phase: "downloading",
      progress: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
      transferred: Number(progress?.transferred) || 0,
      total: Number(progress?.total) || 0,
      bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
      message: tr("正在安全下载更新……", "Downloading the update securely…"),
    }));
    updater.on("update-downloaded", (info) => update({
      phase: "downloaded",
      progress: 100,
      availableVersion: String(info?.version || snapshot.availableVersion || ""),
      releaseName: String(info?.releaseName || snapshot.releaseName || ""),
      releaseNotes: releaseNotesText(info?.releaseNotes) || snapshot.releaseNotes,
      message: portable
        ? tr("更新已下载。重启安装后将从便携版迁移到安装版，现有本地数据会保留。", "Update downloaded. Restarting will migrate this portable copy to the installed edition while preserving local data.")
        : tr("更新已下载，重启应用即可完成安装。", "Update downloaded. Restart the app to finish installing."),
    }));
    updater.on("error", (error) => update({
      phase: "error",
      message: tr(`更新失败：${safeErrorMessage(error)}`, `Update failed: ${safeErrorMessage(error)}`),
    }));

    update({
      phase: "idle",
      message: portable
        ? tr("当前为便携版；可检查并下载更新，安装时会迁移到正式安装版。", "This is the portable edition. You can check and download updates, then migrate to the installed edition.")
        : tr("自动更新已就绪。", "Automatic updates are ready."),
    });
    if (settings?.autoCheckUpdates !== false) {
      autoCheckTimer = setTimeout(() => void check(false), 8_000);
    }
    return { ...snapshot };
  }

  async function check(manual = true) {
    await refreshLanguage();
    if (!initialized) await initialize();
    const blocked = unavailable();
    if (blocked) return blocked;
    try {
      update({
        phase: "checking",
        progress: undefined,
        message: tr("正在检查新版本……", "Checking for updates…"),
      });
      await updater.checkForUpdates();
    } catch (error) {
      update({
        phase: "error",
        message: manual
          ? tr(`检查更新失败：${safeErrorMessage(error)}`, `Could not check for updates: ${safeErrorMessage(error)}`)
          : tr("自动检查更新暂时失败，可稍后手动重试。", "Automatic update check failed; retry manually later."),
      });
    }
    return { ...snapshot };
  }

  async function download() {
    await refreshLanguage();
    const blocked = unavailable();
    if (blocked) return blocked;
    if (snapshot.phase !== "available") {
      return update({ phase: "error", message: tr("请先检查并确认有可用更新。", "Check for an available update first.") });
    }
    try {
      update({ phase: "downloading", progress: 0, message: tr("正在准备下载更新……", "Preparing update download…") });
      await updater.downloadUpdate();
    } catch (error) {
      update({ phase: "error", message: tr(`下载更新失败：${safeErrorMessage(error)}`, `Update download failed: ${safeErrorMessage(error)}`) });
    }
    return { ...snapshot };
  }

  async function install() {
    await refreshLanguage();
    const blocked = unavailable();
    if (blocked) return blocked;
    if (snapshot.phase !== "downloaded") {
      return update({ phase: "error", message: tr("更新尚未下载完成。", "The update has not finished downloading.") });
    }
    update({ message: tr("正在退出并安装更新……", "Restarting to install the update…") });
    setImmediate(() => updater.quitAndInstall(false, true));
    return { ...snapshot };
  }

  function dispose() {
    if (autoCheckTimer) clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
  }

  return {
    initialize,
    check,
    download,
    install,
    dispose,
    getStatus: () => ({ ...snapshot }),
  };
}

module.exports = {
  createUpdateManager,
  defaultCreateUpdater,
  releaseNotesText,
  safeErrorMessage,
};
