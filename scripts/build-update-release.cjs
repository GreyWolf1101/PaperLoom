const fs = require("node:fs");
const path = require("node:path");
const { build, Platform } = require("electron-builder");
const packageJson = require("../package.json");
const { normalizeUpdateConfig } = require("../electron/update-config.cjs");

const projectDirectory = path.resolve(__dirname, "..");
const configPath = path.join(projectDirectory, "electron", "update-config.json");
const config = normalizeUpdateConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
const releaseNotesPath = path.join(projectDirectory, "release-notes.md");
const releaseNotes = fs.existsSync(releaseNotesPath)
  ? fs.readFileSync(releaseNotesPath, "utf8").trim()
  : "";

if (!config.url) {
  throw new Error("请先在 electron/update-config.json 中填写公开的 HTTPS 更新地址，再构建更新安装包。");
}

build({
  projectDir: projectDirectory,
  targets: Platform.WINDOWS.createTarget(["nsis"]),
  publish: "never",
  config: {
    ...packageJson.build,
    publish: [{ provider: "generic", url: config.url, channel: config.channel }],
    releaseInfo: {
      releaseName: `PaperLoom ${packageJson.version}`,
      releaseNotes,
    },
  },
}).then((artifacts) => {
  process.stdout.write(`更新发布文件已生成：\n${artifacts.join("\n")}\n`);
}).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
