const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getUpdateDownloadMode,
  githubReleaseDownloadBase,
  parseUpdateMetadata,
  parseReleaseVersion,
} = require("../electron/update-policy.cjs");

test("parses release versions without accepting arbitrary tags", () => {
  assert.deepEqual(parseReleaseVersion("v0.9.3"), {
    major: 0,
    minor: 9,
    patch: 3,
    normalized: "0.9.3",
  });
  assert.equal(parseReleaseVersion("latest"), null);
});

test("uses differential downloads for patch updates", () => {
  assert.equal(getUpdateDownloadMode("0.9.3", "0.9.4"), "differential");
  assert.equal(getUpdateDownloadMode("1.4.2", "1.5.0"), "differential");
});

test("uses full installers for major product updates", () => {
  assert.equal(getUpdateDownloadMode("0.9.3", "0.10.0"), "full");
  assert.equal(getUpdateDownloadMode("1.4.2", "2.0.0"), "full");
  assert.equal(getUpdateDownloadMode("invalid", "2.0.0"), "full");
});

test("resolves the previous GitHub release blockmap directory", () => {
  assert.equal(
    githubReleaseDownloadBase(
      "https://github.com/GreyWolf1101/PaperLoom-Releases/releases/latest/download/",
      "0.9.3",
    ),
    "https://github.com/GreyWolf1101/PaperLoom-Releases/releases/download/v0.9.3/",
  );
  assert.equal(githubReleaseDownloadBase("https://downloads.example.com/latest/", "0.9.3"), null);
});

test("reads the previous installer from generated update metadata", () => {
  assert.deepEqual(
    parseUpdateMetadata("version: 0.9.3\npath: PaperLoom-Setup-0.9.3.exe\nsha512: example\n"),
    { version: "0.9.3", path: "PaperLoom-Setup-0.9.3.exe" },
  );
});
