const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paperLoom", {
  openDocuments: (readingTheme) => ipcRenderer.invoke("documents:open", readingTheme),
  readFile: (filePath) => ipcRenderer.invoke("documents:read", filePath),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getUpdateStatus: () => ipcRenderer.invoke("updates:status"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  },
  testAI: (payload) => ipcRenderer.invoke("ai:test", payload),
  completeAI: (payload) => ipcRenderer.invoke("ai:complete", payload),
  testTranslation: (payload) => ipcRenderer.invoke("translation:test", payload),
  translateText: (payload) => ipcRenderer.invoke("translation:translate", payload),
  searchAcademic: (payload) => ipcRenderer.invoke("academic:search", payload),
  searchBooks: (payload) => ipcRenderer.invoke("books:search", payload),
  resolveReference: (payload) => ipcRenderer.invoke("research:resolve-reference", payload),
  getCitationGraph: (payload) => ipcRenderer.invoke("research:citation-graph", payload),
  saveResearchIndex: (payload) => ipcRenderer.invoke("research:index-save", payload),
  readResearchIndexes: (payload) => ipcRenderer.invoke("research:index-read", payload),
  deleteResearchIndex: (documentId) => ipcRenderer.invoke("research:index-delete", documentId),
  openExternal: (url) => ipcRenderer.invoke("external:open-academic", url),
  openScholarlyResult: (url) => ipcRenderer.invoke("external:open-scholarly-result", url),
  captureGalleryRegion: (payload) => ipcRenderer.invoke("gallery:capture", payload),
  readGalleryCapture: (payload) => ipcRenderer.invoke("gallery:read", payload),
  deleteGalleryCapture: (payload) => ipcRenderer.invoke("gallery:delete", payload),
  deleteGalleryDocument: (documentId) => ipcRenderer.invoke("gallery:delete-document", documentId),
  exportMarkdown: (payload) => ipcRenderer.invoke("export:markdown", payload),
  copyWordFormula: (payload) => ipcRenderer.invoke("formula:copy-word", payload),
  exportWordFormula: (payload) => ipcRenderer.invoke("formula:export-word", payload),
  onMenuOpenDocuments: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:open-documents", listener);
    return () => ipcRenderer.removeListener("menu:open-documents", listener);
  },
  onMenuExportNotes: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:export-notes", listener);
    return () => ipcRenderer.removeListener("menu:export-notes", listener);
  },
  platform: process.platform,
});
