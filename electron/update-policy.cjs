function parseReleaseVersion(value) {
  const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    normalized: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}`,
  };
}

function getUpdateDownloadMode(currentVersion, targetVersion) {
  const current = parseReleaseVersion(currentVersion);
  const target = parseReleaseVersion(targetVersion);
  if (!current || !target) return "full";
  if (current.major !== target.major) return "full";
  // Before 1.0, a minor-version change is treated as a major product update.
  if (current.major === 0 && current.minor !== target.minor) return "full";
  return "differential";
}

function githubReleaseDownloadBase(updateUrl, version) {
  const parsedVersion = parseReleaseVersion(version);
  if (!parsedVersion) return null;
  try {
    const target = new URL(String(updateUrl || ""));
    const match = target.pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/latest\/download\/?$/i);
    if (target.protocol !== "https:" || target.hostname.toLowerCase() !== "github.com" || !match) return null;
    target.pathname = `/${match[1]}/${match[2]}/releases/download/v${parsedVersion.normalized}/`;
    target.search = "";
    target.hash = "";
    return target.href;
  } catch {
    return null;
  }
}

function parseUpdateMetadata(source) {
  const value = String(source || "");
  const read = (key) => {
    const match = value.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
    return match ? match[1].trim().replace(/^(['"])(.*)\1$/, "$2") : "";
  };
  return { version: read("version"), path: read("path") };
}

module.exports = {
  getUpdateDownloadMode,
  githubReleaseDownloadBase,
  parseUpdateMetadata,
  parseReleaseVersion,
};
