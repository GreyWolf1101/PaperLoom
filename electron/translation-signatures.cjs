const { createHash } = require("node:crypto");

function baiduTranslationSignature(appId, text, salt, secretKey) {
  return createHash("md5")
    .update(`${appId}${text}${salt}${secretKey}`, "utf8")
    .digest("hex");
}

function youdaoSignedInput(text) {
  const value = String(text || "");
  return value.length <= 20
    ? value
    : `${value.slice(0, 10)}${value.length}${value.slice(-10)}`;
}

function youdaoTranslationSignature(appId, text, salt, currentTime, secretKey) {
  return createHash("sha256")
    .update(`${appId}${youdaoSignedInput(text)}${salt}${currentTime}${secretKey}`, "utf8")
    .digest("hex");
}

module.exports = {
  baiduTranslationSignature,
  youdaoSignedInput,
  youdaoTranslationSignature,
};
