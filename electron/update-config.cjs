const fs = require("node:fs/promises");

function isPrivateHostname(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value === "localhost"
    || value === "::1"
    || value.endsWith(".local")
    || /^(?:0|10|127)\./.test(value)
    || /^169\.254\./.test(value)
    || /^192\.168\./.test(value)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(value);
}

function normalizeUpdateUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    const target = new URL(value);
    if (target.protocol !== "https:" || target.username || target.password || isPrivateHostname(target.hostname)) return "";
    target.search = "";
    target.hash = "";
    if (!target.pathname.endsWith("/")) target.pathname += "/";
    return target.href;
  } catch {
    return "";
  }
}

function normalizeUpdateConfig(config = {}, env = process.env) {
  const envUrl = String(env?.PAPERLOOM_UPDATE_URL || "").trim();
  const url = normalizeUpdateUrl(envUrl || config?.url);
  const channelCandidate = String(config?.channel || "latest").trim().toLowerCase();
  const channel = /^[a-z0-9][a-z0-9._-]{0,31}$/.test(channelCandidate) ? channelCandidate : "latest";
  return { url, channel };
}

async function loadUpdateConfig(configPath, env = process.env) {
  let parsed = {};
  try {
    parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch {
    parsed = {};
  }
  return normalizeUpdateConfig(parsed, env);
}

module.exports = {
  isPrivateHostname,
  loadUpdateConfig,
  normalizeUpdateConfig,
  normalizeUpdateUrl,
};
