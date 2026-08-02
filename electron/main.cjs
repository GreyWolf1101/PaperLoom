const { app, BrowserWindow, dialog, ipcMain, Menu, net, safeStorage, session, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { searchAcademicLiterature } = require("./academic-search.cjs");
const { searchBooks: searchBookCatalogs } = require("./book-search.cjs");
const { getCitationGraph, resolveReference } = require("./research-services.cjs");
const { createUpdateManager } = require("./update-manager.cjs");
const {
  baiduTranslationSignature,
  youdaoTranslationSignature,
} = require("./translation-signatures.cjs");

let mainWindow;
let updateManager;

const AI_PROVIDERS = new Set(["openai", "deepseek", "anthropic", "gemini", "kimi", "qwen", "minimax", "custom"]);
const AI_NETWORK_MODES = new Set(["auto", "system", "direct", "manual"]);
const TRANSLATION_PROVIDERS = new Set(["mymemory", "baidu", "youdao", "deepl", "microsoft", "google"]);
const TRANSLATION_TARGET_LANGUAGES = new Set(["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE"]);
const INSIGHT_PANEL_MODES = new Set(["hidden", "standard", "custom"]);
const WEEKLY_READING_GOALS = new Set([5, 10, 20, 30, 60, 120]);
const READING_THEMES = new Set(["academic", "books"]);
const ACADEMIC_SEARCH_HOSTS = new Set([
  "kns.cnki.net",
  "s.wanfangdata.com.cn",
  "scholar.google.com",
  "openalex.org",
  "search.crossref.org",
  "www.semanticscholar.org",
  "pubmed.ncbi.nlm.nih.gov",
  "arxiv.org",
  "ieeexplore.ieee.org",
  "www.sciencedirect.com",
  "link.springer.com",
]);
async function openAcademicSearchUrl(rawUrl) {
  try {
    const target = new URL(String(rawUrl || ""));
    if (target.protocol !== "https:" || !ACADEMIC_SEARCH_HOSTS.has(target.hostname.toLowerCase())) return false;
    await shell.openExternal(target.href);
    return true;
  } catch {
    return false;
  }
}

async function openScholarlyResultUrl(rawUrl) {
  try {
    const target = new URL(String(rawUrl || ""));
    const hostname = target.hostname.toLowerCase();
    const privateHost = hostname === "localhost"
      || hostname.endsWith(".local")
      || /^(?:0|10|127)\./.test(hostname)
      || /^169\.254\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
      || hostname === "::1";
    if (target.protocol !== "https:" || target.username || target.password || privateHost) return false;
    await shell.openExternal(target.href);
    return true;
  } catch {
    return false;
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function inferProvider(baseUrl) {
  const value = String(baseUrl || "").toLowerCase();
  if (value.includes("api.openai.com")) return "openai";
  if (value.includes("api.deepseek.com")) return "deepseek";
  if (value.includes("api.anthropic.com")) return "anthropic";
  if (value.includes("generativelanguage.googleapis.com")) return "gemini";
  if (value.includes("api.moonshot.cn")) return "kimi";
  if (value.includes("dashscope.aliyuncs.com")) return "qwen";
  if (value.includes("api.minimaxi.com")) return "minimax";
  return "custom";
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function galleryDocumentDirectory(documentId) {
  const digest = createHash("sha256").update(String(documentId || "")).digest("hex");
  return path.join(app.getPath("userData"), "gallery", digest);
}

function galleryCapturePath(documentId, captureId) {
  const safeId = String(captureId || "");
  if (!/^[a-f\d-]{16,64}$/i.test(safeId)) throw new Error("Invalid gallery capture id");
  return path.join(galleryDocumentDirectory(documentId), `${safeId}.png`);
}

function researchIndexDirectory() {
  return path.join(app.getPath("userData"), "research-index");
}

function researchIndexPath(documentId) {
  const digest = createHash("sha256").update(String(documentId || "")).digest("hex");
  return path.join(researchIndexDirectory(), `${digest}.json`);
}

async function saveResearchIndex(payload) {
  const documentId = String(payload?.documentId || "");
  if (!documentId || !Array.isArray(payload?.paragraphs)) throw new Error("Invalid research index payload");
  const paragraphs = payload.paragraphs.slice(0, 250_000).map((paragraph) => ({
    id: String(paragraph?.id || ""),
    text: String(paragraph?.text || "").slice(0, 100_000),
    kind: paragraph?.kind === "heading" ? "heading" : "body",
    page: Number.isFinite(paragraph?.page) ? Math.max(1, Math.round(paragraph.page)) : undefined,
    fontSize: Number.isFinite(paragraph?.fontSize) ? paragraph.fontSize : undefined,
    links: Array.isArray(paragraph?.links) ? paragraph.links : undefined,
  })).filter((paragraph) => paragraph.id && paragraph.text);
  await fs.mkdir(researchIndexDirectory(), { recursive: true });
  await fs.writeFile(researchIndexPath(documentId), JSON.stringify({
    documentId,
    modifiedAt: Number(payload?.modifiedAt) || 0,
    paragraphs,
    savedAt: Date.now(),
  }), "utf8");
  return { documentId, paragraphs: paragraphs.length };
}

async function readResearchIndexes(payload) {
  const requests = Array.isArray(payload?.documents) ? payload.documents.slice(0, 2_000) : [];
  const entries = await Promise.all(requests.map(async (request) => {
    const documentId = String(request?.id || "");
    if (!documentId) return null;
    try {
      const stored = JSON.parse(await fs.readFile(researchIndexPath(documentId), "utf8"));
      if (Number(request?.modifiedAt) && Number(stored?.modifiedAt) !== Number(request.modifiedAt)) return null;
      return [documentId, Array.isArray(stored?.paragraphs) ? stored.paragraphs : []];
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter(Boolean));
}

async function deleteResearchIndex(documentId) {
  try {
    await fs.unlink(researchIndexPath(documentId));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return true;
}

function clampCaptureRectangle(rect, windowBounds) {
  const x = Math.max(0, Math.floor(Number(rect?.x) || 0));
  const y = Math.max(0, Math.floor(Number(rect?.y) || 0));
  const maxWidth = Math.max(0, windowBounds.width - x);
  const maxHeight = Math.max(0, windowBounds.height - y);
  const width = Math.min(maxWidth, Math.max(1, Math.ceil(Number(rect?.width) || 0)));
  const height = Math.min(maxHeight, Math.max(1, Math.ceil(Number(rect?.height) || 0)));
  if (width < 16 || height < 16) throw new Error("The selected screenshot area is too small");
  return { x, y, width, height };
}

async function readSettingsFile() {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

async function getSettings() {
  const stored = await readSettingsFile();
  const baseUrl = stored.baseUrl || "https://api.openai.com/v1";
  let apiKey = "";
  if (stored.apiKey) {
    try {
      apiKey = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(stored.apiKey, "base64"))
        : Buffer.from(stored.apiKey, "base64").toString("utf8");
    } catch {
      apiKey = "";
    }
  }
  let translationApiKey = "";
  if (stored.translationApiKey) {
    try {
      translationApiKey = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(stored.translationApiKey, "base64"))
        : Buffer.from(stored.translationApiKey, "base64").toString("utf8");
    } catch {
      translationApiKey = "";
    }
  }
  return {
    provider: AI_PROVIDERS.has(stored.provider) ? stored.provider : inferProvider(baseUrl),
    baseUrl,
    model: stored.model || "gpt-5.6-terra",
    apiKey,
    networkMode: AI_NETWORK_MODES.has(stored.networkMode) ? stored.networkMode : "auto",
    proxyUrl: String(stored.proxyUrl || ""),
    language: stored.language === "en-US" ? "en-US" : "zh-CN",
    readingTheme: READING_THEMES.has(stored.readingTheme) ? stored.readingTheme : "academic",
    defaultZoom: Number.isFinite(stored.defaultZoom) ? stored.defaultZoom : 100,
    pageSpacing: stored.pageSpacing === "compact" ? "compact" : "comfortable",
    translationDisplayMode: stored.translationDisplayMode === "side" ? "side" : "inline",
    translationEngine: stored.translationEngine === "dedicated" ? "dedicated" : "ai",
    translationProvider: TRANSLATION_PROVIDERS.has(stored.translationProvider) ? stored.translationProvider : "mymemory",
    translationAppId: String(stored.translationAppId || "").trim(),
    translationApiKey,
    translationRegion: String(stored.translationRegion || "").trim(),
    translationEmail: String(stored.translationEmail || "").trim(),
    translationTargetLanguage: TRANSLATION_TARGET_LANGUAGES.has(stored.translationTargetLanguage)
      ? stored.translationTargetLanguage
      : "zh-CN",
    summaryDisplayMode: stored.summaryDisplayMode === "side" ? "side" : "inline",
    translationFontSize: clampNumber(stored.translationFontSize, 12, 18, 14),
    allowDuplicateHighlights: stored.allowDuplicateHighlights === true,
    insightPanelMode: INSIGHT_PANEL_MODES.has(stored.insightPanelMode) ? stored.insightPanelMode : "standard",
    insightPanelWidth: clampNumber(stored.insightPanelWidth, 320, 960, 500),
    insightFontSize: clampNumber(stored.insightFontSize, 11, 16, 12),
    libraryPanelVisible: stored.libraryPanelVisible !== false,
    weeklyReadingGoal: stored.weeklyReadingGoal === null
      ? null
      : WEEKLY_READING_GOALS.has(Number(stored.weeklyReadingGoal))
        ? Number(stored.weeklyReadingGoal)
        : 120,
    autoCheckUpdates: stored.autoCheckUpdates !== false,
  };
}

async function saveSettings(settings) {
  const rawKey = String(settings.apiKey || "");
  const encrypted = rawKey
    ? safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(rawKey).toString("base64")
      : Buffer.from(rawKey, "utf8").toString("base64")
    : "";
  const rawTranslationKey = String(settings.translationApiKey || "");
  const encryptedTranslationKey = rawTranslationKey
    ? safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(rawTranslationKey).toString("base64")
      : Buffer.from(rawTranslationKey, "utf8").toString("base64")
    : "";
  const stored = {
    provider: AI_PROVIDERS.has(settings.provider) ? settings.provider : inferProvider(settings.baseUrl),
    baseUrl: String(settings.baseUrl || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: String(settings.model || "gpt-5.6-terra"),
    apiKey: encrypted,
    networkMode: AI_NETWORK_MODES.has(settings.networkMode) ? settings.networkMode : "auto",
    proxyUrl: String(settings.proxyUrl || "").trim(),
    language: settings.language === "en-US" ? "en-US" : "zh-CN",
    readingTheme: READING_THEMES.has(settings.readingTheme) ? settings.readingTheme : "academic",
    defaultZoom: Math.min(140, Math.max(80, Number(settings.defaultZoom) || 100)),
    pageSpacing: settings.pageSpacing === "compact" ? "compact" : "comfortable",
    translationDisplayMode: settings.translationDisplayMode === "side" ? "side" : "inline",
    translationEngine: settings.translationEngine === "dedicated" ? "dedicated" : "ai",
    translationProvider: TRANSLATION_PROVIDERS.has(settings.translationProvider) ? settings.translationProvider : "mymemory",
    translationAppId: String(settings.translationAppId || "").trim(),
    translationApiKey: encryptedTranslationKey,
    translationRegion: String(settings.translationRegion || "").trim(),
    translationEmail: String(settings.translationEmail || "").trim(),
    translationTargetLanguage: TRANSLATION_TARGET_LANGUAGES.has(settings.translationTargetLanguage)
      ? settings.translationTargetLanguage
      : "zh-CN",
    summaryDisplayMode: settings.summaryDisplayMode === "side" ? "side" : "inline",
    translationFontSize: clampNumber(settings.translationFontSize, 12, 18, 14),
    allowDuplicateHighlights: settings.allowDuplicateHighlights === true,
    insightPanelMode: INSIGHT_PANEL_MODES.has(settings.insightPanelMode) ? settings.insightPanelMode : "standard",
    insightPanelWidth: clampNumber(settings.insightPanelWidth, 320, 960, 500),
    insightFontSize: clampNumber(settings.insightFontSize, 11, 16, 12),
    libraryPanelVisible: settings.libraryPanelVisible !== false,
    weeklyReadingGoal: settings.weeklyReadingGoal === null
      ? null
      : WEEKLY_READING_GOALS.has(Number(settings.weeklyReadingGoal))
        ? Number(settings.weeklyReadingGoal)
        : 120,
    autoCheckUpdates: settings.autoCheckUpdates !== false,
  };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(stored, null, 2), "utf8");
  applyApplicationMenu(stored.language, stored.readingTheme);
  return getSettings();
}

function applyApplicationMenu(language = "zh-CN", readingTheme = "academic") {
  const zh = language !== "en-US";
  const bookMode = readingTheme === "books";
  const template = [
    {
      label: zh ? "文件" : "File",
      submenu: [
        {
          label: zh ? (bookMode ? "导入书籍…" : "导入论文…") : (bookMode ? "Import book…" : "Import paper…"),
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("menu:open-documents"),
        },
        {
          label: zh ? "导出当前笔记…" : "Export current notes…",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => mainWindow?.webContents.send("menu:export-notes"),
        },
        { type: "separator" },
        { label: zh ? "退出" : "Quit", role: "quit" },
      ],
    },
    {
      label: zh ? "编辑" : "Edit",
      submenu: [
        { label: zh ? "撤销" : "Undo", role: "undo" },
        { label: zh ? "重做" : "Redo", role: "redo" },
        { type: "separator" },
        { label: zh ? "剪切" : "Cut", role: "cut" },
        { label: zh ? "复制" : "Copy", role: "copy" },
        { label: zh ? "粘贴" : "Paste", role: "paste" },
        { label: zh ? "全选" : "Select all", role: "selectAll" },
      ],
    },
    {
      label: zh ? "查看" : "View",
      submenu: [
        { label: zh ? "实际大小" : "Actual size", role: "resetZoom" },
        { label: zh ? "放大" : "Zoom in", role: "zoomIn" },
        { label: zh ? "缩小" : "Zoom out", role: "zoomOut" },
        { type: "separator" },
        { label: zh ? "全屏" : "Full screen", role: "togglefullscreen" },
      ],
    },
    {
      label: zh ? "窗口" : "Window",
      submenu: [
        { label: zh ? "最小化" : "Minimize", role: "minimize" },
        { label: zh ? "关闭" : "Close", role: "close" },
      ],
    },
    {
      label: zh ? "帮助" : "Help",
      submenu: [
        {
          label: zh ? "关于 PaperLoom" : "About PaperLoom",
          click: () => dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "PaperLoom",
            message: "PaperLoom",
            detail: zh
              ? "面向研究工作的本地论文阅读与整理工具。"
              : "A local paper reading and synthesis workspace for researchers.",
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function completionUrl(baseUrl) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function anthropicMessagesUrl(baseUrl) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return base.endsWith("/messages") ? base : `${base}/messages`;
}

function networkErrorCode(error) {
  const directCode = error?.cause?.code || error?.code;
  if (directCode) return String(directCode);
  const combined = `${error?.message || ""} ${error?.cause?.message || ""}`;
  return combined.match(/(?:ERR|UND_ERR|E)[A-Z0-9_]+/)?.[0] || "";
}

function redactProxy(value) {
  return String(value || "")
    .replace(/\/\/[^/@\s]+@/g, "//***@")
    .slice(0, 120);
}

async function readableNetworkError(error, baseUrl, language, networkMode, proxyUrl) {
  const english = language === "en-US";
  const code = networkErrorCode(error);
  const rawMessage = `${error?.message || ""} ${error?.cause?.message || ""}`;
  let target;
  try {
    target = new URL(baseUrl);
  } catch {
    return english
      ? `The AI endpoint is invalid: ${String(baseUrl || "(empty)")}`
      : `AI 接口地址格式无效：${String(baseUrl || "（空）")}`;
  }

  let dns = english ? "unknown" : "未知";
  try {
    const result = await net.resolveHost(target.hostname, {
      cacheUsage: "disallowed",
      secureDnsPolicy: "disable",
    });
    const addresses = result?.endpoints?.map((item) => item.address).filter(Boolean).slice(0, 2) || [];
    dns = addresses.length
      ? (english ? `resolved (${addresses.join(", ")})` : `正常（${addresses.join("、")}）`)
      : (english ? "no address" : "无可用地址");
  } catch {
    dns = english ? "failed" : "失败";
  }

  let proxy = networkMode === "manual" ? redactProxy(proxyUrl) : "";
  if (!proxy) {
    try {
      proxy = await session.defaultSession.resolveProxy(target.href);
    } catch {
      proxy = english ? "unavailable" : "无法读取";
    }
  }
  const online = net.isOnline();
  const attemptLabels = english
    ? { system: "system proxy", chromiumDirect: "Chromium direct", nodeDirect: "Node direct", manual: "manual proxy" }
    : { system: "系统代理", chromiumDirect: "Chromium 直连", nodeDirect: "Node 直连", manual: "手动代理" };
  const attempts = Array.isArray(error?.attempts)
    ? error.attempts.map((item) => attemptLabels[item] || item).join(" → ")
    : "";
  const diagnostics = english
    ? `Network: ${online ? "online" : "offline"}; DNS: ${dns}; proxy: ${proxy || "DIRECT"}${attempts ? `; tried: ${attempts}` : ""}${code ? `; code: ${code}` : ""}.`
    : `网络：${online ? "在线" : "离线"}；DNS：${dns}；代理：${proxy || "DIRECT"}${attempts ? `；已尝试：${attempts}` : ""}${code ? `；错误码：${code}` : ""}。`;

  let summary;
  if (!online) {
    summary = english
      ? "Windows currently reports that this device is offline."
      : "Windows 当前报告设备处于离线状态。";
  } else if (code === "ENOTFOUND" || /ERR_NAME_NOT_RESOLVED/i.test(rawMessage) || dns === "失败" || dns === "failed") {
    summary = english
      ? `Cannot resolve ${target.hostname}. Check DNS or the endpoint address.`
      : `无法解析 ${target.hostname}，请检查 DNS 或接口地址。`;
  } else if (code === "ECONNREFUSED" || /ERR_CONNECTION_REFUSED/i.test(rawMessage)) {
    summary = english
      ? `${target.hostname} refused the connection.`
      : `${target.hostname} 拒绝了连接。`;
  } else if (/TIMEOUT|TIMEDOUT/i.test(code) || /timed? ?out|ERR_TIMED_OUT/i.test(rawMessage)) {
    summary = english
      ? `Connecting to ${target.hostname} timed out.`
      : `连接 ${target.hostname} 超时。`;
  } else if (/CERT|TLS|SSL/i.test(`${code} ${rawMessage}`)) {
    summary = english
      ? `TLS verification failed for ${target.hostname}. Check the system clock, certificate or HTTPS proxy.`
      : `${target.hostname} 的 HTTPS 证书校验失败，请检查系统时间、证书或 HTTPS 代理。`;
  } else if (/RESET|CLOSED|ABORTED/i.test(`${code} ${rawMessage}`)) {
    summary = english
      ? `The connection to ${target.hostname} was interrupted. Check the proxy, VPN, firewall or security software.`
      : `连接 ${target.hostname} 时被中断，请检查代理、VPN、防火墙或安全软件。`;
  } else {
    summary = english
      ? `Cannot connect to ${target.hostname}. The endpoint is valid, but all available network paths failed.`
      : `无法连接 ${target.hostname}。接口地址有效，但可用网络路径均连接失败。`;
  }
  return `${summary}\n${diagnostics}`;
}

async function fetchAttempt(fetcher, url, options, timeoutMs) {
  const controller = new AbortController();
  const parentSignal = options.signal;
  const forwardAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) forwardAbort();
  else parentSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Network attempt timed out")), timeoutMs);
  try {
    return await fetcher(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", forwardAbort);
  }
}

async function fetchAIEndpoint(url, options, networkMode = "auto", proxyUrl = "", attemptTimeoutMs = 30_000) {
  const mode = AI_NETWORK_MODES.has(networkMode) ? networkMode : "auto";
  const attempts = [];

  if (mode === "auto" || mode === "system") {
    attempts.push({
      name: "system",
      fetcher: (input, init) => net.fetch(input, init),
    });
  }

  if (mode === "auto" || mode === "direct") {
    attempts.push({
      name: "chromiumDirect",
      fetcher: async (input, init) => {
        const directSession = session.fromPartition("paperloom-ai-direct-v2");
        await directSession.setProxy({ mode: "direct" });
        return directSession.fetch(input, init);
      },
    });
    attempts.push({
      name: "nodeDirect",
      fetcher: (input, init) => globalThis.fetch(input, init),
    });
  }

  if (mode === "manual") {
    const rules = String(proxyUrl || "").trim();
    if (!rules) throw new Error("已选择手动代理，但没有填写代理地址。");
    attempts.push({
      name: "manual",
      fetcher: async (input, init) => {
        const manualSession = session.fromPartition("paperloom-ai-manual-v2");
        await manualSession.setProxy({
          mode: "fixed_servers",
          proxyRules: rules,
          proxyBypassRules: "<local>",
        });
        return manualSession.fetch(input, init);
      },
    });
  }

  let lastError;
  const attempted = [];
  for (const attempt of attempts) {
    attempted.push(attempt.name);
    try {
      return await fetchAttempt(attempt.fetcher, url, options, attemptTimeoutMs);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }

  const combined = new Error(lastError?.message || "AI network request failed", { cause: lastError });
  combined.attempts = attempted;
  throw combined;
}

function modelsUrl(baseUrl) {
  const base = String(baseUrl || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/(?:chat\/completions|messages)$/i, "");
  return base.endsWith("/models") ? base : `${base}/models`;
}

function providerHeaders(provider, apiKey) {
  if (provider === "anthropic") {
    return {
      Accept: "application/json",
      "anthropic-version": "2023-06-01",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    };
  }
  return {
    Accept: "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

function extractAPIError(detail) {
  try {
    const parsed = JSON.parse(detail);
    return parsed?.error?.message || parsed?.message || detail;
  } catch {
    return detail;
  }
}

const TRANSLATION_TARGET_CODES = {
  mymemory: {
    "zh-CN": "zh-CN",
    "en-US": "en-US",
    "ja-JP": "ja-JP",
    "ko-KR": "ko-KR",
    "fr-FR": "fr-FR",
    "de-DE": "de-DE",
  },
  baidu: {
    "zh-CN": "zh",
    "en-US": "en",
    "ja-JP": "jp",
    "ko-KR": "kor",
    "fr-FR": "fra",
    "de-DE": "de",
  },
  youdao: {
    "zh-CN": "zh-CHS",
    "en-US": "en",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "fr-FR": "fr",
    "de-DE": "de",
  },
  deepl: {
    "zh-CN": "ZH-HANS",
    "en-US": "EN-US",
    "ja-JP": "JA",
    "ko-KR": "KO",
    "fr-FR": "FR",
    "de-DE": "DE",
  },
  microsoft: {
    "zh-CN": "zh-Hans",
    "en-US": "en",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "fr-FR": "fr",
    "de-DE": "de",
  },
  google: {
    "zh-CN": "zh-CN",
    "en-US": "en",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "fr-FR": "fr",
    "de-DE": "de",
  },
};

const TRANSLATION_PROVIDER_NAMES = {
  mymemory: "MyMemory",
  baidu: "百度翻译",
  youdao: "网易有道翻译",
  deepl: "DeepL API Free",
  microsoft: "Microsoft Translator",
  google: "Google Cloud Translation",
};

function translationConfiguration(payload, stored) {
  return {
    provider: TRANSLATION_PROVIDERS.has(payload?.translationProvider)
      ? payload.translationProvider
      : stored.translationProvider,
    appId: String(payload?.translationAppId ?? stored.translationAppId ?? "").trim(),
    apiKey: String(payload?.translationApiKey ?? stored.translationApiKey ?? "").trim(),
    region: String(payload?.translationRegion ?? stored.translationRegion ?? "").trim(),
    email: String(payload?.translationEmail ?? stored.translationEmail ?? "").trim(),
    targetLanguage: TRANSLATION_TARGET_LANGUAGES.has(payload?.translationTargetLanguage)
      ? payload.translationTargetLanguage
      : stored.translationTargetLanguage,
    networkMode: payload?.networkMode || stored.networkMode || "auto",
    proxyUrl: payload?.proxyUrl ?? stored.proxyUrl ?? "",
    language: stored.language,
  };
}

function detectMyMemorySourceLanguage(text) {
  if (/[\u3040-\u30ff]/u.test(text)) return "ja-JP";
  if (/[\uac00-\ud7af]/u.test(text)) return "ko-KR";
  if (/[\u3400-\u9fff]/u.test(text)) return "zh-CN";
  if (/[äöüß]/iu.test(text)) return "de-DE";
  if (/[àâçéèêëîïôùûüÿœ]/iu.test(text)) return "fr-FR";
  return "en-US";
}

function splitUtf8Chunks(value, maxBytes = 450) {
  const chunks = [];
  let current = "";
  for (const character of String(value || "")) {
    if (Buffer.byteLength(current + character, "utf8") > maxBytes && current) {
      chunks.push(current.trim());
      current = character;
    } else {
      current += character;
    }
    if (Buffer.byteLength(current, "utf8") >= Math.floor(maxBytes * 0.7) && /[.!?。！？；;\n]/u.test(character)) {
      chunks.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function decodeTranslationEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&amp;/giu, "&");
}

async function fetchTranslationEndpoint(url, options, config, timeoutMs = 30_000) {
  try {
    return await fetchAIEndpoint(url, options, config.networkMode, config.proxyUrl, timeoutMs);
  } catch (error) {
    const message = await readableNetworkError(
      error,
      url,
      config.language,
      config.networkMode,
      config.proxyUrl,
    );
    throw new Error(message
      .replaceAll("AI endpoint", "translation service")
      .replaceAll("AI 接口", "翻译服务"));
  }
}

async function parseTranslationResponse(response, provider) {
  const detail = await response.text();
  if (!response.ok) {
    const message = extractAPIError(detail).slice(0, 300);
    throw new Error(`${TRANSLATION_PROVIDER_NAMES[provider]} 返回 HTTP ${response.status}：${message}`);
  }
  try {
    return JSON.parse(detail);
  } catch {
    throw new Error(`${TRANSLATION_PROVIDER_NAMES[provider]} 返回了无法识别的数据。`);
  }
}

async function translateWithDedicatedService(text, config) {
  const sourceText = String(text || "").trim();
  if (!sourceText) throw new Error(config.language === "en-US" ? "Select text to translate first." : "请先选择需要翻译的文字。");
  if (sourceText.length > 50_000) throw new Error(config.language === "en-US" ? "The selected passage is too long." : "选中的文字过长，请分段翻译。");

  const provider = config.provider;
  const target = TRANSLATION_TARGET_CODES[provider]?.[config.targetLanguage];
  if (!target) throw new Error(config.language === "en-US" ? "The target language is not supported." : "当前目标语言不受支持。");

  if (provider === "mymemory") {
    const source = detectMyMemorySourceLanguage(sourceText);
    const chunks = splitUtf8Chunks(sourceText);
    const translated = [];
    for (const chunk of chunks) {
      const params = new URLSearchParams({ q: chunk, langpair: `${source}|${target}`, mt: "1" });
      if (config.email) params.set("de", config.email);
      const endpoint = `https://api.mymemory.translated.net/get?${params.toString()}`;
      const response = await fetchTranslationEndpoint(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
      }, config, 20_000);
      const data = await parseTranslationResponse(response, provider);
      if (Number(data?.responseStatus || 200) >= 400 || !data?.responseData?.translatedText) {
        throw new Error(data?.responseDetails || "MyMemory 没有返回译文，可能已达到今日免费额度。");
      }
      translated.push(decodeTranslationEntities(data.responseData.translatedText));
    }
    return translated.join(" ").trim();
  }

  if (["baidu", "youdao"].includes(provider) && !config.appId) {
    throw new Error(config.language === "en-US"
      ? `Enter the ${TRANSLATION_PROVIDER_NAMES[provider]} application ID in Translation settings.`
      : `请先在翻译设置中填写 ${TRANSLATION_PROVIDER_NAMES[provider]} 的应用 ID。`);
  }

  if (!config.apiKey) {
    throw new Error(config.language === "en-US"
      ? `Enter the ${TRANSLATION_PROVIDER_NAMES[provider]} key in Translation settings.`
      : `请先在翻译设置中填写 ${TRANSLATION_PROVIDER_NAMES[provider]} 密钥。`);
  }

  if (provider === "baidu") {
    const chunks = splitUtf8Chunks(sourceText, 4_500);
    const translated = [];
    for (let index = 0; index < chunks.length; index += 1) {
      if (index > 0) await waitMilliseconds(1_050);
      const chunk = chunks[index];
      const salt = randomUUID();
      const body = new URLSearchParams({
        q: chunk,
        from: "auto",
        to: target,
        appid: config.appId,
        salt,
        sign: baiduTranslationSignature(config.appId, chunk, salt, config.apiKey),
      });
      const response = await fetchTranslationEndpoint("https://fanyi-api.baidu.com/api/trans/vip/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
        },
        body: body.toString(),
      }, config);
      const data = await parseTranslationResponse(response, provider);
      if (data?.error_code || !Array.isArray(data?.trans_result)) {
        throw new Error(`百度翻译返回错误 ${data?.error_code || "unknown"}：${data?.error_msg || "没有返回译文"}`);
      }
      translated.push(data.trans_result.map((item) => decodeTranslationEntities(item?.dst)).filter(Boolean).join("\n"));
    }
    return translated.filter(Boolean).join(" ").trim();
  }

  if (provider === "youdao") {
    const chunks = splitUtf8Chunks(sourceText, 4_500);
    const translated = [];
    for (const chunk of chunks) {
      const salt = randomUUID();
      const currentTime = String(Math.floor(Date.now() / 1_000));
      const body = new URLSearchParams({
        q: chunk,
        from: "auto",
        to: target,
        appKey: config.appId,
        salt,
        sign: youdaoTranslationSignature(config.appId, chunk, salt, currentTime, config.apiKey),
        signType: "v3",
        curtime: currentTime,
      });
      const response = await fetchTranslationEndpoint("https://openapi.youdao.com/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
        },
        body: body.toString(),
      }, config);
      const data = await parseTranslationResponse(response, provider);
      if (String(data?.errorCode) !== "0" || !Array.isArray(data?.translation)) {
        throw new Error(`网易有道翻译返回错误 ${data?.errorCode || "unknown"}。请检查应用 ID、应用密钥、服务绑定和账户额度。`);
      }
      translated.push(data.translation.map(decodeTranslationEntities).filter(Boolean).join("\n"));
    }
    return translated.filter(Boolean).join(" ").trim();
  }

  if (provider === "deepl") {
    const endpoint = "https://api-free.deepl.com/v2/translate";
    const response = await fetchTranslationEndpoint(endpoint, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ text: [sourceText], target_lang: target, preserve_formatting: true }),
    }, config);
    const data = await parseTranslationResponse(response, provider);
    const result = data?.translations?.[0]?.text;
    if (!result) throw new Error("DeepL 没有返回译文。");
    return String(result).trim();
  }

  if (provider === "microsoft") {
    const endpoint = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(target)}`;
    const response = await fetchTranslationEndpoint(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": config.apiKey,
        ...(config.region ? { "Ocp-Apim-Subscription-Region": config.region } : {}),
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json",
      },
      body: JSON.stringify([{ Text: sourceText }]),
    }, config);
    const data = await parseTranslationResponse(response, provider);
    const result = data?.[0]?.translations?.[0]?.text;
    if (!result) throw new Error("Microsoft Translator 没有返回译文。");
    return String(result).trim();
  }

  const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetchTranslationEndpoint(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ q: sourceText, target, format: "text" }),
  }, config);
  const data = await parseTranslationResponse(response, provider);
  const result = data?.data?.translations?.[0]?.translatedText;
  if (!result) throw new Error("Google Cloud Translation 没有返回译文。");
  return decodeTranslationEntities(result).trim();
}

async function translateText(payload) {
  const settings = await getSettings();
  if (settings.translationEngine !== "dedicated") {
    throw new Error(settings.language === "en-US"
      ? "Dedicated translation is not enabled in Settings."
      : "尚未在设置中启用专用翻译。");
  }
  return translateWithDedicatedService(payload?.text, translationConfiguration({}, settings));
}

async function testTranslationConnection(payload) {
  const settings = await getSettings();
  const config = translationConfiguration(payload, settings);
  const sample = config.targetLanguage === "zh-CN"
    ? "Scientific evidence should remain connected to its source."
    : "科研证据应当始终与原始来源保持关联。";
  await translateWithDedicatedService(sample, config);
  const english = settings.language === "en-US";
  const quota = english
    ? config.provider === "mymemory"
      ? (config.email ? "50,000 characters/day" : "5,000 characters/day")
      : config.provider === "baidu"
        ? "50,000 characters/month on Standard"
        : config.provider === "youdao"
          ? "CNY 50 trial credit for new accounts"
          : config.provider === "microsoft"
            ? "2,000,000 characters/month on F0"
            : "500,000 characters/month on the free tier"
    : config.provider === "mymemory"
      ? (config.email ? "每天 50,000 字符" : "每天 5,000 字符")
      : config.provider === "baidu"
        ? "标准版每月 50,000 字符"
        : config.provider === "youdao"
          ? "新账户 50 元体验资金"
          : config.provider === "microsoft"
            ? "F0 每月 2,000,000 字符"
            : "免费层每月 500,000 字符";
  return {
    ok: true,
    connected: true,
    message: english
      ? `${TRANSLATION_PROVIDER_NAMES[config.provider]} is ready. Published free allowance: ${quota}.`
      : `${TRANSLATION_PROVIDER_NAMES[config.provider]} 连接成功。官方公布的免费额度：${quota}。`,
  };
}

async function testAIConnection(payload) {
  const settings = await getSettings();
  const provider = payload.provider || settings.provider || inferProvider(payload.baseUrl || settings.baseUrl);
  const baseUrl = String(payload.baseUrl || settings.baseUrl || "").trim();
  const apiKey = payload.apiKey ?? settings.apiKey;
  const model = String(payload.model || settings.model || "").trim();
  const networkMode = payload.networkMode || settings.networkMode || "auto";
  const proxyUrl = payload.proxyUrl ?? settings.proxyUrl ?? "";
  const language = settings.language;
  const english = language === "en-US";

  if (!baseUrl) throw new Error(english ? "Enter an AI endpoint first." : "请先填写 AI 接口地址。");
  if (!apiKey && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(baseUrl)) {
    throw new Error(english ? "Enter an API key first." : "请先填写 API Key。");
  }

  const endpoint = modelsUrl(baseUrl);
  try {
    const response = await fetchAIEndpoint(endpoint, {
      method: "GET",
      headers: providerHeaders(provider, apiKey),
    }, networkMode, proxyUrl, 15_000);
    const detail = await response.text();

    if (response.ok) {
      let availableModels = [];
      try {
        const data = JSON.parse(detail);
        availableModels = Array.isArray(data?.data) ? data.data.map((item) => item?.id).filter(Boolean) : [];
      } catch {
        // A successful response is sufficient even if this provider uses another model-list schema.
      }
      const missingModel = model && availableModels.length > 0 && !availableModels.includes(model);
      return {
        ok: !missingModel,
        connected: true,
        status: response.status,
        message: missingModel
          ? (english
              ? `The API and key work, but model ${model} is not available to this account.`
              : `接口和 API Key 均可用，但当前账号没有返回模型 ${model}。`)
          : (english
              ? "Connection succeeded. The endpoint and API key are valid."
              : "连接成功，接口地址和 API Key 均有效。"),
      };
    }

    const providerDetail = extractAPIError(detail).slice(0, 220);
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        connected: true,
        status: response.status,
        message: english
          ? `The endpoint is reachable, but the API key was rejected (${response.status}). ${providerDetail}`
          : `已连接到接口，但 API Key 被拒绝（${response.status}）。${providerDetail}`,
      };
    }
    return {
      ok: false,
      connected: true,
      status: response.status,
      message: english
        ? `The endpoint is reachable but returned HTTP ${response.status}. ${providerDetail}`
        : `已连接到接口，但返回 HTTP ${response.status}。${providerDetail}`,
    };
  } catch (error) {
    throw new Error(await readableNetworkError(error, baseUrl, language, networkMode, proxyUrl));
  }
}

async function completeAI(payload) {
  const settings = await getSettings();
  const provider = payload.provider || settings.provider || inferProvider(payload.baseUrl || settings.baseUrl);
  const baseUrl = String(payload.baseUrl || settings.baseUrl || "").trim();
  const model = String(payload.model || settings.model || "").trim();
  const apiKey = payload.apiKey ?? settings.apiKey;
  const networkMode = payload.networkMode || settings.networkMode || "auto";
  const proxyUrl = payload.proxyUrl ?? settings.proxyUrl ?? "";
  if (!baseUrl || !model) throw new Error("请先填写 AI 接口地址和模型名称。");
  if (!apiKey && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(baseUrl)) {
    throw new Error("请先在设置中填写 API Key，或连接本地兼容模型。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let response;
  try {
    if (provider === "anthropic") {
      response = await fetchAIEndpoint(anthropicMessagesUrl(baseUrl), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: payload.json ? 4096 : 3072,
          temperature: payload.temperature ?? 0.25,
          system: payload.system,
          messages: [{ role: "user", content: payload.user }],
        }),
      }, networkMode, proxyUrl);
    } else {
      response = await fetchAIEndpoint(completionUrl(baseUrl), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          ...(!(provider === "openai" && /^gpt-5/i.test(model))
            ? { temperature: payload.temperature ?? 0.25 }
            : {}),
          messages: [
            { role: "system", content: payload.system },
            { role: "user", content: payload.user },
          ],
          ...(payload.json ? { response_format: { type: "json_object" } } : {}),
        }),
      }, networkMode, proxyUrl);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(settings.language === "en-US"
        ? "The AI request timed out after 90 seconds. Try again or use a faster model."
        : "AI 请求超过 90 秒，已自动停止。请重试或换用响应更快的模型。");
    }
    throw new Error(await readableNetworkError(error, baseUrl, settings.language, networkMode, proxyUrl));
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    const providerDetail = extractAPIError(detail).slice(0, 240);
    throw new Error(settings.language === "en-US"
      ? `AI request failed (${response.status}): ${providerDetail}`
      : `AI 请求失败（${response.status}）：${providerDetail}`);
  }
  const data = await response.json();
  if (provider === "anthropic") {
    return Array.isArray(data?.content)
      ? data.content.filter((item) => item?.type === "text").map((item) => item.text || "").join("\n")
      : "";
  }
  return data?.choices?.[0]?.message?.content || "";
}

async function searchAcademic(payload) {
  try {
    return await searchAcademicLiterature(
      payload,
      (url, options) => fetchAIEndpoint(url, options, "auto", "", 20_000),
    );
  } catch (error) {
    const english = payload?.language === "en-US";
    if (error?.status === 429) {
      throw new Error(english
        ? "This academic service is temporarily rate-limited. Try again shortly or open its official search page."
        : "该学术服务当前请求过多，请稍后重试，或打开它的官网检索页面。");
    }
    if (/timed? ?out|aborted/i.test(String(error?.message || ""))) {
      throw new Error(english
        ? "Academic search timed out. Check your network and try again."
        : "学术检索连接超时，请检查网络后重试。");
    }
    throw new Error(error?.message || (english ? "Academic search failed." : "学术检索失败。"));
  }
}

async function searchBooks(payload) {
  try {
    return await searchBookCatalogs(
      payload,
      (url, options) => fetchAIEndpoint(url, options, "auto", "", 20_000),
    );
  } catch (error) {
    const english = payload?.language === "en-US";
    if (error?.status === 429) {
      throw new Error(english
        ? "This book service is temporarily rate-limited. Try again shortly or open its official search page."
        : "该书籍服务当前请求过多，请稍后重试，或打开官网检索页面。");
    }
    if (/timed? ?out|aborted/i.test(String(error?.message || ""))) {
      throw new Error(english
        ? "Book search timed out. Check your network and try again."
        : "书籍检索连接超时，请检查网络后重试。");
    }
    throw new Error(error?.message || (english ? "Book search failed." : "书籍检索失败。"));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#f2efe8",
    title: "PaperLoom — 论文阅读工作台",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  getSettings().then((settings) => applyApplicationMenu(settings.language, settings.readingTheme));
}

app.whenReady().then(() => {
  app.configureHostResolver({
    enableBuiltInResolver: true,
    enableHappyEyeballs: true,
    secureDnsMode: "automatic",
    secureDnsServers: [
      "https://dns.alidns.com/dns-query",
      "https://cloudflare-dns.com/dns-query",
      "https://dns.google/dns-query",
    ],
  });

  ipcMain.handle("documents:open", async (_event, readingTheme = "academic") => {
    const bookMode = readingTheme === "books";
    const result = await dialog.showOpenDialog(mainWindow, {
      title: bookMode ? "导入书籍" : "导入论文",
      properties: ["openFile", "multiSelections"],
      filters: bookMode
        ? [
            { name: "电子书与文章", extensions: ["epub", "txt", "md", "markdown", "html", "htm", "fb2", "pdf", "docx"] },
            { name: "EPUB", extensions: ["epub"] },
            { name: "纯文本", extensions: ["txt", "md", "markdown"] },
            { name: "网页与 FB2", extensions: ["html", "htm", "fb2"] },
            { name: "PDF / Word", extensions: ["pdf", "docx"] },
          ]
        : [
            { name: "论文文档", extensions: ["pdf", "docx"] },
            { name: "PDF", extensions: ["pdf"] },
            { name: "Word", extensions: ["docx"] },
          ],
    });
    if (result.canceled) return [];
    return Promise.all(
      result.filePaths.map(async (filePath) => {
        const stat = await fs.stat(filePath);
        return {
          path: filePath,
          name: path.basename(filePath),
          type: ({ markdown: "md", htm: "html" })[path.extname(filePath).slice(1).toLowerCase()]
            || path.extname(filePath).slice(1).toLowerCase(),
          size: stat.size,
          modifiedAt: stat.mtimeMs,
        };
      }),
    );
  });

  ipcMain.handle("documents:read", async (_event, filePath) => {
    const data = await fs.readFile(filePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });

  ipcMain.handle("settings:get", getSettings);
  ipcMain.handle("settings:save", (_event, settings) => saveSettings(settings));
  ipcMain.handle("updates:status", () => updateManager?.getStatus() || ({
    phase: "disabled",
    supported: false,
    configured: false,
    portable: false,
    currentVersion: app.getVersion(),
    message: "更新服务尚未初始化。",
  }));
  ipcMain.handle("updates:check", () => updateManager?.check(true));
  ipcMain.handle("updates:download", () => updateManager?.download());
  ipcMain.handle("updates:install", () => updateManager?.install());
  ipcMain.handle("ai:test", (_event, payload) => testAIConnection(payload));
  ipcMain.handle("ai:complete", (_event, payload) => completeAI(payload));
  ipcMain.handle("translation:test", (_event, payload) => testTranslationConnection(payload));
  ipcMain.handle("translation:translate", (_event, payload) => translateText(payload));
  ipcMain.handle("academic:search", (_event, payload) => searchAcademic(payload));
  ipcMain.handle("books:search", (_event, payload) => searchBooks(payload));
  ipcMain.handle("research:resolve-reference", (_event, payload) => resolveReference(
    payload,
    (url, options) => fetchAIEndpoint(url, options, "auto", "", 20_000),
  ));
  ipcMain.handle("research:citation-graph", (_event, payload) => getCitationGraph(
    payload,
    (url, options) => fetchAIEndpoint(url, options, "auto", "", 20_000),
  ));
  ipcMain.handle("research:index-save", (_event, payload) => saveResearchIndex(payload));
  ipcMain.handle("research:index-read", (_event, payload) => readResearchIndexes(payload));
  ipcMain.handle("research:index-delete", (_event, documentId) => deleteResearchIndex(documentId));
  ipcMain.handle("external:open-academic", (_event, url) => openAcademicSearchUrl(url));
  ipcMain.handle("external:open-scholarly-result", (_event, url) => openScholarlyResultUrl(url));

  ipcMain.handle("gallery:capture", async (event, payload) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow || ownerWindow.isDestroyed()) throw new Error("The reader window is unavailable");
    const documentId = String(payload?.documentId || "");
    if (!documentId) throw new Error("A document is required for gallery capture");
    const clip = clampCaptureRectangle(payload?.rect, ownerWindow.getContentBounds());
    const image = await ownerWindow.webContents.capturePage(clip);
    if (image.isEmpty()) throw new Error("The selected area could not be captured");
    const captureId = randomUUID();
    const filePath = galleryCapturePath(documentId, captureId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const png = image.toPNG();
    await fs.writeFile(filePath, png);
    const size = image.getSize();
    return {
      id: captureId,
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      width: size.width,
      height: size.height,
    };
  });

  ipcMain.handle("gallery:read", async (_event, payload) => {
    try {
      const png = await fs.readFile(galleryCapturePath(payload?.documentId, payload?.captureId));
      return `data:image/png;base64,${png.toString("base64")}`;
    } catch (error) {
      if (error?.code === "ENOENT") return "";
      throw error;
    }
  });

  ipcMain.handle("gallery:delete", async (_event, payload) => {
    try {
      await fs.unlink(galleryCapturePath(payload?.documentId, payload?.captureId));
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      throw error;
    }
  });

  ipcMain.handle("gallery:delete-document", async (_event, documentId) => {
    const directory = galleryDocumentDirectory(documentId);
    const galleryRoot = path.join(app.getPath("userData"), "gallery");
    if (!directory.startsWith(`${galleryRoot}${path.sep}`)) throw new Error("Invalid gallery directory");
    await fs.rm(directory, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle("export:markdown", async (_event, { suggestedName, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出研究笔记",
      defaultPath: suggestedName || "论文笔记.md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, content, "utf8");
    return true;
  });

  createWindow();
  updateManager = createUpdateManager({
    app,
    getWindow: () => mainWindow,
    getSettings,
    configPath: path.join(__dirname, "update-config.json"),
  });
  void updateManager.initialize();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => updateManager?.dispose());
