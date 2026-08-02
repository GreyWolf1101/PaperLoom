const assert = require("node:assert/strict");
const {
  baiduTranslationSignature,
  youdaoSignedInput,
  youdaoTranslationSignature,
} = require("../electron/translation-signatures.cjs");

assert.equal(
  baiduTranslationSignature("2015063000000001", "apple", "1435660288", "12345678"),
  "f89f9594663708c1605f3d736d01d2d4",
  "Baidu signing must match the provider's documented sample",
);

assert.equal(youdaoSignedInput("short text"), "short text");
assert.equal(
  youdaoSignedInput("abcdefghijklmnopqrstuvwxyz"),
  "abcdefghij26qrstuvwxyz",
  "Youdao v3 input must retain the first/last ten characters and the source length",
);
assert.equal(
  youdaoTranslationSignature("demoApp", "abcdefghijklmnopqrstuvwxyz", "salt-1", "1700000000", "demoSecret"),
  "e403b431f0a57d0b3bafa81fb3d6725c2ffedc92a72a92618450f2f9b91bbd6b",
);

console.log("translation-signature tests passed");
