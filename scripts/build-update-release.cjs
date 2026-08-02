const fs = require("node:fs");
const path = require("node:path");
const { build, Platform } = require("electron-builder");
const packageJson = require("../package.json");
const { normalizeUpdateConfig } = require("../electron/update-config.cjs");
const { getUpdateDownloadMode, githubReleaseDownloadBase, parseUpdateMetadata } = require("../electron/update-policy.cjs");

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

async function downloadBuffer(url, maximumBytes = 5 * 1024 * 1024) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "PaperLoom-Release-Builder" } });
  if (!response.ok) throw new Error(`下载差分资源失败 (${response.status})：${url}`);
  const declaredLength = Number(response.headers.get("content-length")) || 0;
  if (declaredLength > maximumBytes) throw new Error(`差分资源超过限制：${declaredLength} bytes`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > maximumBytes) throw new Error(`差分资源大小无效：${data.length} bytes`);
  return data;
}

async function preparePreviousBlockmap() {
  const metadataUrl = new URL(`${config.channel}.yml`, config.url).href;
  const response = await fetch(metadataUrl, { redirect: "follow", headers: { "cache-control": "no-cache", "user-agent": "PaperLoom-Release-Builder" } });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`读取上一版本元数据失败 (${response.status})：${metadataUrl}`);
  }
  const metadata = await response.text();
  const { version: previousVersion, path: previousInstaller } = parseUpdateMetadata(metadata);
  if (!previousVersion || !previousInstaller || previousVersion === packageJson.version) return null;
  if (getUpdateDownloadMode(previousVersion, packageJson.version) !== "differential") {
    return { mode: "full", previousVersion };
  }
  const releaseBase = githubReleaseDownloadBase(config.url, previousVersion);
  if (!releaseBase) throw new Error("当前更新源无法自动定位上一版本 blockmap。请为发布脚本配置 GitHub Releases latest/download 地址。");
  const name = `${path.basename(previousInstaller)}.blockmap`;
  const url = new URL(encodeURIComponent(name), releaseBase).href;
  return { mode: "differential", previousVersion, name, data: await downloadBuffer(url) };
}

async function main() {
  const previousBlockmap = await preparePreviousBlockmap();
  const artifacts = await build({
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
  });
  const extraArtifacts = [];
  if (previousBlockmap?.mode === "differential") {
    const outputDirectory = path.join(projectDirectory, packageJson.build?.directories?.output || "release");
    const destination = path.join(outputDirectory, previousBlockmap.name);
    fs.writeFileSync(destination, previousBlockmap.data);
    extraArtifacts.push(destination);
    process.stdout.write(`已附带 ${previousBlockmap.previousVersion} 的 blockmap，支持小版本差分更新。\n`);
  } else if (previousBlockmap?.mode === "full") {
    process.stdout.write(`检测到大版本更新（${previousBlockmap.previousVersion} → ${packageJson.version}），将使用完整安装包。\n`);
  }
  process.stdout.write(`更新发布文件已生成：\n${[...artifacts, ...extraArtifacts].join("\n")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
