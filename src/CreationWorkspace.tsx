import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  LoaderCircle,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { copyTextToClipboard } from "./clipboard";
import MarkdownContent from "./MarkdownContent";
import {
  appendManuscript,
  filterCreationMessages,
  manuscriptWordCount,
  normalizeManuscript,
  prepareGeneratedManuscript,
  replaceManuscriptRange,
  splitManuscriptBlocks,
} from "./creation";

type CreationIntent = "write" | "discuss" | "rewrite";
type CreationPanelSide = "left" | "right";
type CreationDrafts = Record<string, Partial<Record<CreationIntent, string>>>;
type ActiveCreationRequest = {
  id: string;
  projectId: string;
  intent: CreationIntent;
  cancelled: boolean;
};

type ManuscriptSelection = {
  start: number;
  end: number;
  text: string;
};

type ReplacementSuggestion = ManuscriptSelection & {
  replacement: string;
};

type CreationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent: CreationIntent;
  createdAt: number;
  replacement?: ReplacementSuggestion;
  applied?: boolean;
  generatedWordCount?: number;
  writingReceipt?: {
    title: string;
    task: string;
    summary: string;
  };
};

type CreationProject = {
  id: string;
  title: string;
  manuscript: string;
  messages: CreationMessage[];
  createdAt: number;
  updatedAt: number;
};

type StoredCreationWorkspace = {
  projects: CreationProject[];
  activeProjectId: string;
  chatCollapsed: boolean;
  panelSide: CreationPanelSide;
  textZoom: number;
  pageZoom: number;
};

type LegacyCreationProject = {
  title?: string;
  manuscript?: string;
  messages?: CreationMessage[];
  updatedAt?: number;
};

type Props = {
  language: "zh-CN" | "en-US";
  ensureAIReady: () => boolean;
  requestAI: (system: string, user: string, requestId: string) => Promise<string>;
  cancelAI: (requestId: string) => Promise<boolean>;
  notify: (message: string) => void;
};

const STORAGE_KEY = "paperloom.creation-workspace.v2";
const LEGACY_STORAGE_KEY = "paperloom.creation-project.v1";
const MIN_ZOOM = 80;
const MAX_ZOOM = 140;

function normalizeZoom(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(numeric / 10) * 10));
}

function isPlaceholderTitle(value: string) {
  return !value.trim()
    || /^(?:未命名作品|Untitled work)(?:\s+\d+)?$/i.test(value.trim());
}

function createProject(title = ""): CreationProject {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    manuscript: "",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isCreationMessage(value: unknown): value is CreationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<CreationMessage>;
  return typeof message.id === "string"
    && (message.role === "user" || message.role === "assistant")
    && typeof message.content === "string"
    && (message.intent === "write" || message.intent === "discuss" || message.intent === "rewrite");
}

function normalizeProject(value: Partial<CreationProject>, fallbackTitle = ""): CreationProject {
  const now = Date.now();
  const storedTitle = typeof value.title === "string" ? value.title.trim() : fallbackTitle;
  return {
    id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
    title: isPlaceholderTitle(storedTitle) ? "" : storedTitle,
    manuscript: typeof value.manuscript === "string" ? value.manuscript : "",
    messages: Array.isArray(value.messages) ? value.messages.filter(isCreationMessage).slice(-80) : [],
    createdAt: Number.isFinite(value.createdAt) ? Number(value.createdAt) : now,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : now,
  };
}

function loadCreationWorkspace(): StoredCreationWorkspace {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<StoredCreationWorkspace>;
    const projects = Array.isArray(stored.projects)
      ? stored.projects.map((project) => normalizeProject(project)).filter(Boolean)
      : [];
    if (projects.length) {
      const activeProjectId = projects.some((project) => project.id === stored.activeProjectId)
        ? String(stored.activeProjectId)
        : projects[0].id;
      return {
        projects,
        activeProjectId,
        chatCollapsed: stored.chatCollapsed === true,
        panelSide: stored.panelSide === "right" ? "right" : "left",
        textZoom: normalizeZoom(stored.textZoom),
        pageZoom: normalizeZoom(stored.pageZoom),
      };
    }
  } catch {
    // Fall through to the legacy project migration.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "{}") as LegacyCreationProject;
    if (legacy.title || legacy.manuscript || legacy.messages?.length) {
      const project = normalizeProject({
        ...legacy,
        id: crypto.randomUUID(),
        createdAt: legacy.updatedAt,
      });
      return {
        projects: [project],
        activeProjectId: project.id,
        chatCollapsed: false,
        panelSide: "left",
        textZoom: 100,
        pageZoom: 100,
      };
    }
  } catch {
    // A malformed legacy draft should not prevent opening the writing workspace.
  }

  const project = createProject();
  return {
    projects: [project],
    activeProjectId: project.id,
    chatCollapsed: false,
    panelSide: "left",
    textZoom: 100,
    pageZoom: 100,
  };
}

function closestManuscriptBlock(node: Node | null, root: HTMLElement) {
  const element = node instanceof Element ? node : node?.parentElement;
  const block = element?.closest<HTMLElement>("[data-manuscript-start]");
  return block && root.contains(block) ? block : null;
}

function textOffsetWithin(element: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(element);
  try {
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 80) || "PaperLoom-AI-作品";
}

export default function CreationWorkspace({
  language,
  ensureAIReady,
  requestAI,
  cancelAI,
  notify,
}: Props) {
  const initialWorkspace = useMemo(loadCreationWorkspace, []);
  const [projects, setProjects] = useState(initialWorkspace.projects);
  const [activeProjectId, setActiveProjectId] = useState(initialWorkspace.activeProjectId);
  const [chatCollapsed, setChatCollapsed] = useState(initialWorkspace.chatCollapsed);
  const [panelSide, setPanelSide] = useState<CreationPanelSide>(initialWorkspace.panelSide);
  const [textZoom, setTextZoom] = useState(initialWorkspace.textZoom);
  const [pageZoom, setPageZoom] = useState(initialWorkspace.pageZoom);
  const [intent, setIntent] = useState<CreationIntent>("write");
  const [drafts, setDrafts] = useState<CreationDrafts>({});
  const [busyByProject, setBusyByProject] = useState<Record<string, CreationIntent>>({});
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [selection, setSelection] = useState<ManuscriptSelection | null>(null);
  const manuscriptRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const projectSwitcherRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const activeRequestsRef = useRef(new Map<string, ActiveCreationRequest>());
  const activeProjectIdRef = useRef(activeProjectId);
  const isChinese = language === "zh-CN";
  const tr = (zh: string, en: string) => (isChinese ? zh : en);
  const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0];
  activeProjectIdRef.current = activeProject?.id || activeProjectId;
  const activeProjectIndex = Math.max(0, projects.findIndex((project) => project.id === activeProject?.id));
  const title = activeProject?.title || "";
  const displayTitle = title.trim() || tr(`新作品 ${activeProjectIndex + 1}`, `New work ${activeProjectIndex + 1}`);
  const manuscript = activeProject?.manuscript || "";
  const messages = activeProject?.messages || [];
  const visibleMessages = useMemo(
    () => filterCreationMessages(messages, intent),
    [intent, messages],
  );
  const prompt = drafts[activeProject?.id || ""]?.[intent] || "";
  const busyIntent = activeProject?.id ? busyByProject[activeProject.id] || null : null;
  const busy = busyIntent !== null;
  const blocks = useMemo(() => splitManuscriptBlocks(manuscript), [manuscript]);
  const wordCount = useMemo(() => manuscriptWordCount(manuscript), [manuscript]);

  const setPrompt = useCallback((value: string) => {
    if (!activeProject?.id) return;
    setDrafts((current) => ({
      ...current,
      [activeProject.id]: {
        ...current[activeProject.id],
        [intent]: value,
      },
    }));
  }, [activeProject?.id, intent]);

  const focusComposer = () => {
    window.requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
  };

  const updateProject = useCallback((
    projectId: string,
    updater: (project: CreationProject) => CreationProject,
  ) => {
    setProjects((current) => current.map((project) => (
      project.id === projectId
        ? { ...updater(project), updatedAt: Date.now() }
        : project
    )));
  }, []);

  const updateCurrentProject = useCallback((
    updater: (project: CreationProject) => CreationProject,
  ) => updateProject(activeProjectId, updater), [activeProjectId, updateProject]);

  const setCurrentTitle = (nextTitle: string) => {
    updateCurrentProject((project) => ({ ...project, title: nextTitle }));
  };

  const setCurrentManuscript = (next: string | ((current: string) => string)) => {
    updateCurrentProject((project) => ({
      ...project,
      manuscript: typeof next === "function" ? next(project.manuscript) : next,
    }));
  };

  const setCurrentMessages = (
    next: CreationMessage[] | ((current: CreationMessage[]) => CreationMessage[]),
  ) => {
    updateCurrentProject((project) => ({
      ...project,
      messages: (typeof next === "function" ? next(project.messages) : next).slice(-80),
    }));
  };

  const setProjectMessages = useCallback((
    projectId: string,
    next: CreationMessage[] | ((current: CreationMessage[]) => CreationMessage[]),
  ) => {
    updateProject(projectId, (project) => ({
      ...project,
      messages: (typeof next === "function" ? next(project.messages) : next).slice(-80),
    }));
  }, [updateProject]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const workspace: StoredCreationWorkspace = {
        projects,
        activeProjectId,
        chatCollapsed,
        panelSide,
        textZoom,
        pageZoom,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, chatCollapsed, pageZoom, panelSide, projects, textZoom]);

  useEffect(() => {
    setSelection(null);
    setIntent("write");
    setProjectMenuOpen(false);
    window.getSelection()?.removeAllRanges();
  }, [activeProjectId]);

  useEffect(() => {
    const scroll = messagesRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [busyIntent, visibleMessages]);

  useEffect(() => {
    if (!projectMenuOpen) return undefined;
    const closeProjectMenu = (event: PointerEvent) => {
      if (!projectSwitcherRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeProjectMenu);
    return () => document.removeEventListener("pointerdown", closeProjectMenu);
  }, [projectMenuOpen]);

  const captureManuscriptSelection = () => {
    window.setTimeout(() => {
      const nativeSelection = window.getSelection();
      const root = manuscriptRef.current;
      if (!nativeSelection || !root || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = nativeSelection.getRangeAt(0);
      const startBlock = closestManuscriptBlock(range.startContainer, root);
      const endBlock = closestManuscriptBlock(range.endContainer, root);
      if (!startBlock || !endBlock) {
        setSelection(null);
        return;
      }
      const rawStart = Number(startBlock.dataset.manuscriptStart)
        + textOffsetWithin(startBlock, range.startContainer, range.startOffset);
      const rawEnd = Number(endBlock.dataset.manuscriptStart)
        + textOffsetWithin(endBlock, range.endContainer, range.endOffset);
      const start = Math.min(rawStart, rawEnd);
      const end = Math.max(rawStart, rawEnd);
      const rawText = manuscript.slice(start, end);
      const leading = rawText.length - rawText.trimStart().length;
      const trailing = rawText.length - rawText.trimEnd().length;
      const nextSelection = {
        start: start + leading,
        end: Math.max(start + leading, end - trailing),
        text: rawText.trim(),
      };
      if (nextSelection.text.length < 2) {
        setSelection(null);
        return;
      }
      setSelection(nextSelection);
      setIntent("discuss");
    }, 0);
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const buildPrompt = (instruction: string, activeIntent: CreationIntent) => {
    const selectedContext = selection
      ? `\n\n${tr("用户选中的原文", "Selected manuscript text")}：\n${selection.text}`
      : "";
    const manuscriptContext = manuscript
      ? selection
        ? manuscript.slice(Math.max(0, selection.start - 6_000), Math.min(manuscript.length, selection.end + 6_000))
        : manuscript.slice(-18_000)
      : tr("（当前尚无正文）", "(The manuscript is currently empty.)");
    const recentConversation = messages
      .filter((message) => message.intent === activeIntent)
      .slice(-6)
      .map((message) => `${message.role === "user" ? tr("用户", "User") : "AI"}：${message.content.slice(0, 1_500)}`)
      .join("\n\n");

    return [
      `${tr("当前作品名", "Current work title")}：${title.trim() || tr("尚未命名——请在本次输出中生成书名", "Not named yet—generate a title in this response")}`,
      `${tr("当前书稿上下文", "Current manuscript context")}：\n${manuscriptContext}`,
      selectedContext,
      recentConversation ? `${tr("近期对话", "Recent conversation")}：\n${recentConversation}` : "",
      `${tr("本次要求", "Current instruction")}：\n${instruction}`,
      activeIntent === "write"
        ? tr(
          `严格按以下结构输出，三个标记都必须保留：
【书名】${title.trim() || "根据本次创作内容生成一个简洁、有辨识度的书名"}
【剧情概述】用 60—120 字概括本次生成内容的主要人物、目标、冲突和情节推进，不要复制正文
【正文】
从这里开始只写可直接进入书稿的章节标题和正文。人物设定、提纲、创作说明以及上面的书名和概述都不能重复到正文中。`,
          `Use exactly this structure and keep all three markers:
[Title] ${title.trim() || "Generate a concise, distinctive title from this writing request"}
[Plot Summary] In 40–90 words, summarize the characters, goal, conflict and plot movement in this generation without copying the prose
[Manuscript]
From here onward output only chapter headings and prose that can enter the book. Do not repeat the title, summary, character sheets, outlines or process notes in the manuscript.`,
        )
        : activeIntent === "rewrite"
          ? tr("请只输出用于替换选中原文的新版本，不加标题、说明或引号。", "Output only the replacement text, without labels, explanations or quotation marks.")
          : tr("请直接回答问题；除非用户明确要求，否则不要续写或改动书稿。", "Answer the question directly. Do not continue or alter the manuscript unless explicitly asked."),
    ].filter(Boolean).join("\n\n");
  };

  const sendPrompt = async () => {
    const instruction = prompt.trim();
    const requestProjectId = activeProject?.id;
    if (!requestProjectId || !instruction || busy || !ensureAIReady()) return;
    if (intent === "rewrite" && !selection) {
      notify(tr("请先在右侧书稿中选中需要重写的文字", "Select manuscript text before requesting a rewrite"));
      return;
    }

    const activeIntent = intent;
    const requestTask: ActiveCreationRequest = {
      id: crypto.randomUUID(),
      projectId: requestProjectId,
      intent: activeIntent,
      cancelled: false,
    };
    activeRequestsRef.current.set(requestProjectId, requestTask);
    const message: CreationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: instruction,
      intent: activeIntent,
      createdAt: Date.now(),
    };
    setProjectMessages(requestProjectId, (current) => [...current, message]);
    setPrompt("");
    setBusyByProject((current) => ({ ...current, [requestProjectId]: activeIntent }));
    focusComposer();

    try {
      const system = activeIntent === "write"
        ? tr(
          "你是专业的中文小说与长文创作搭档，也是负责为作品命名的文学编辑。遵守用户设定的人物、世界观、视角、时代和文风；保持情节连续。每次创作必须按【书名】【剧情概述】【正文】三段输出；书名简洁且具有辨识度，剧情概述只用于应用中的创作卡片，正文采用自然的实体书段落。正文中不得混入人物设定、故事冲突、提纲、分隔线、Markdown 标记或创作说明。",
          "You are a professional fiction and long-form writing partner and the literary editor responsible for naming the work. Follow the user's characters, world, viewpoint, era and voice while maintaining continuity. Every writing response must contain [Title], [Plot Summary], and [Manuscript] sections. The title must be concise and distinctive; the plot summary is only for the app's writing card; the manuscript must read like a printed book and must not include character sheets, conflict notes, outlines, separators, Markdown markers or process notes.",
        )
        : activeIntent === "rewrite"
          ? tr(
            "你是严谨的文学编辑。只改写用户选中的原文，保留既定事实、人物关系、视角和上下文连续性。只输出替换文字。",
            "You are a rigorous literary editor. Rewrite only the selected text while preserving facts, relationships, viewpoint and continuity. Output replacement text only.",
          )
          : tr(
            "你是小说作者的创作顾问。根据书稿与选中文本回答任何创作问题，可以分析人物、情节、节奏、逻辑或语言；回答要具体、可执行，不擅自修改书稿。",
            "You are a creative consultant for an author. Answer questions about characters, plot, pacing, logic or prose using the manuscript and selected text. Be concrete and actionable, and do not modify the manuscript without permission.",
          );
      const response = await requestAI(system, buildPrompt(instruction, activeIntent), requestTask.id);
      if (requestTask.cancelled || activeRequestsRef.current.get(requestProjectId) !== requestTask) return;
      const prepared = activeIntent === "write" ? prepareGeneratedManuscript(response) : null;
      const normalized = activeIntent === "discuss"
        ? response.trim()
        : activeIntent === "write"
          ? prepared?.manuscript || ""
          : normalizeManuscript(response);
      if (!normalized) throw new Error(tr("AI 没有返回可用内容", "The AI returned no usable content"));

      const generatedCount = activeIntent === "write" ? manuscriptWordCount(normalized) : undefined;
      let resolvedTitle = prepared?.title.trim() || title.trim();
      let resolvedSummary = prepared?.summary.trim() || "";
      if (activeIntent === "write" && (!resolvedTitle || !resolvedSummary)) {
        try {
          const metadataResponse = await requestAI(
            tr(
              "你是文学编辑。只根据用户任务与小说片段补全作品元数据，不续写正文。严格输出两行：第一行“书名：”，第二行“剧情概述：”。书名简洁、有辨识度；剧情概述用 60—120 字概括本次片段的人物、目标、冲突和情节推进。",
              "You are a literary editor. Complete only the work metadata from the user's request and prose excerpt; do not continue the manuscript. Output exactly two lines: 'Title:' and 'Plot Summary:'. Use a concise, distinctive title and a 40–90 word summary of the characters, goal, conflict and plot movement.",
            ),
            [
              `${tr("用户任务", "User task")}：${instruction}`,
              title.trim() ? `${tr("已有书名", "Existing title")}：${title.trim()}` : "",
              `${tr("正文片段", "Prose excerpt")}：\n${normalized.slice(0, 2_500)}`,
            ].filter(Boolean).join("\n\n"),
            requestTask.id,
          );
          if (requestTask.cancelled || activeRequestsRef.current.get(requestProjectId) !== requestTask) return;
          const metadata = prepareGeneratedManuscript(metadataResponse);
          if (!resolvedTitle) resolvedTitle = metadata.title.trim();
          if (!resolvedSummary) resolvedSummary = metadata.summary.trim();
        } catch {
          // The main prose is still useful if a provider refuses the small metadata follow-up.
        }
      }
      if (activeIntent === "write" && !resolvedSummary) {
        resolvedSummary = tr(
          "AI 已按照本次任务推进人物与情节，完整内容已写入右侧书稿。",
          "The AI advanced the characters and plot for this task; the complete prose is in the manuscript.",
        );
      }
      if (requestTask.cancelled || activeRequestsRef.current.get(requestProjectId) !== requestTask) return;
      const assistantMessage: CreationMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: activeIntent === "write"
          ? tr(`已写入右侧书稿 · ${generatedCount?.toLocaleString()} 字`, `Added to the manuscript · ${generatedCount?.toLocaleString()} words`)
          : normalized,
        intent: activeIntent,
        createdAt: Date.now(),
        generatedWordCount: generatedCount,
        writingReceipt: activeIntent === "write"
          ? {
            title: resolvedTitle || displayTitle,
            task: instruction.slice(0, 180),
            summary: resolvedSummary.slice(0, 260),
          }
          : undefined,
        replacement: activeIntent === "rewrite" && selection
          ? { ...selection, replacement: normalized }
          : undefined,
      };
      setProjectMessages(requestProjectId, (current) => [...current, assistantMessage]);
      if (activeIntent === "write") {
        updateProject(requestProjectId, (project) => ({
          ...project,
          title: resolvedTitle && isPlaceholderTitle(project.title) ? resolvedTitle : project.title,
          manuscript: appendManuscript(project.manuscript, normalized),
        }));
        notify(tr(`“${resolvedTitle || displayTitle}”已完成本次生成`, `“${resolvedTitle || displayTitle}” finished generating`));
      }
    } catch (error) {
      if (!requestTask.cancelled) {
        notify(error instanceof Error ? error.message : tr("AI 创作失败", "AI writing failed"));
      }
    } finally {
      if (activeRequestsRef.current.get(requestProjectId) === requestTask) {
        activeRequestsRef.current.delete(requestProjectId);
        setBusyByProject((current) => {
          const next = { ...current };
          delete next[requestProjectId];
          return next;
        });
        if (activeProjectIdRef.current === requestProjectId) focusComposer();
      }
    }
  };

  const stopProjectGeneration = (projectId: string, showNotice = true) => {
    const requestTask = activeRequestsRef.current.get(projectId);
    if (!requestTask) return;
    requestTask.cancelled = true;
    activeRequestsRef.current.delete(projectId);
    setBusyByProject((current) => {
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    void cancelAI(requestTask.id).catch(() => false);
    if (activeProjectIdRef.current === projectId) focusComposer();
    if (showNotice) notify(tr("已终止本次生成，可以输入新的指令", "Generation stopped. You can enter a new instruction."));
  };

  const stopGeneration = () => {
    if (activeProject?.id) stopProjectGeneration(activeProject.id);
  };

  const applyReplacement = (messageId: string, suggestion: ReplacementSuggestion) => {
    let start = suggestion.start;
    let end = suggestion.end;
    if (manuscript.slice(start, end) !== suggestion.text) {
      const relocated = manuscript.indexOf(suggestion.text);
      if (relocated < 0) {
        notify(tr("原文已经变化，请重新选择后再重写", "The source text changed. Select it again before rewriting"));
        return;
      }
      start = relocated;
      end = relocated + suggestion.text.length;
    }
    setCurrentManuscript((current) => replaceManuscriptRange(
      current,
      start,
      end,
      suggestion.replacement,
    ));
    setCurrentMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, applied: true } : message
    )));
    clearSelection();
    notify(tr("选中内容已替换，可继续向 AI 调整", "Selected text replaced; you can keep refining it"));
  };

  const copyManuscript = async () => {
    if (!manuscript) return;
    try {
      await copyTextToClipboard(`${title.trim() || tr("AI 创作作品", "AI-created work")}\n\n${manuscript}`);
      notify(tr("作品全文已复制", "The full work was copied"));
    } catch {
      notify(tr("复制失败，请重试", "Copy failed. Please try again"));
    }
  };

  const exportManuscript = () => {
    if (!manuscript) return;
    const exportTitle = title.trim() || tr("AI 创作作品", "AI-created work");
    const blob = new Blob([`${exportTitle}\n\n${manuscript}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(exportTitle)}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    notify(tr("作品已导出为 TXT", "The work was exported as TXT"));
  };

  const startNewProject = () => {
    const project = createProject();
    setProjects((current) => [project, ...current]);
    setActiveProjectId(project.id);
    setSelection(null);
    setIntent("write");
    setProjectMenuOpen(false);
    notify(tr("已创建新作品，旧作品和对话仍保留在会话列表中", "New work created; earlier works and chats remain in the project list"));
  };

  const deleteCurrentProject = () => {
    if (!window.confirm(tr(
      `确定删除“${displayTitle}”及其对话吗？`,
      `Delete “${displayTitle}” and its conversation?`,
    ))) return;
    stopProjectGeneration(activeProjectId, false);
    const remaining = projects.filter((project) => project.id !== activeProjectId);
    setProjectMenuOpen(false);
    setDrafts((current) => {
      const next = { ...current };
      delete next[activeProjectId];
      return next;
    });
    if (remaining.length) {
      setProjects(remaining);
      setActiveProjectId(remaining[0].id);
      return;
    }
    const project = createProject();
    setProjects([project]);
    setActiveProjectId(project.id);
  };

  const useQuickAction = (nextIntent: CreationIntent, text: string) => {
    setIntent(nextIntent);
    if (!activeProject?.id) return;
    setDrafts((current) => ({
      ...current,
      [activeProject.id]: {
        ...current[activeProject.id],
        [nextIntent]: text,
      },
    }));
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (busy) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void sendPrompt();
  };

  const keepSelectionOpen = (event: ReactMouseEvent) => event.stopPropagation();

  return (
    <section className={`creation-workspace panel-${panelSide} ${chatCollapsed ? "chat-collapsed" : ""}`}>
      {chatCollapsed ? (
        <aside className="creation-chat-rail">
          <button
            type="button"
            onClick={() => setChatCollapsed(false)}
            title={tr("展开 AI 创作", "Show AI writing")}
            aria-label={tr("展开 AI 创作", "Show AI writing")}
          >
            {panelSide === "left" ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
          <Sparkles size={17} />
          <span>{tr("AI 创作", "AI writing")}</span>
        </aside>
      ) : (
        <aside className="creation-chat-panel">
          <header className="creation-chat-header">
            <div className="creation-chat-brand">
              <span className="eyebrow">AI WRITING STUDIO</span>
              <strong><Sparkles size={18} />{tr("AI 创作", "AI writing")}</strong>
            </div>
            <div className="creation-chat-header-actions">
              <div className="creation-side-selector" role="group" aria-label={tr("AI 创作工具位置", "AI writing panel position")}>
                <button
                  type="button"
                  className={panelSide === "left" ? "active" : ""}
                  onClick={() => setPanelSide("left")}
                  title={tr("AI 创作工具放在左侧", "Place AI writing tools on the left")}
                  aria-label={tr("AI 创作工具放在左侧", "Place AI writing tools on the left")}
                  aria-pressed={panelSide === "left"}
                >
                  <PanelLeft size={15} />
                </button>
                <button
                  type="button"
                  className={panelSide === "right" ? "active" : ""}
                  onClick={() => setPanelSide("right")}
                  title={tr("AI 创作工具放在右侧", "Place AI writing tools on the right")}
                  aria-label={tr("AI 创作工具放在右侧", "Place AI writing tools on the right")}
                  aria-pressed={panelSide === "right"}
                >
                  <PanelRight size={15} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setChatCollapsed(true)}
                title={tr("收起创作栏", "Hide writing panel")}
                aria-label={tr("收起创作栏", "Hide writing panel")}
              >
                {panelSide === "left" ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
              </button>
              <button type="button" onClick={startNewProject} title={tr("新建作品", "New work")} aria-label={tr("新建作品", "New work")}>
                <Plus size={17} />
              </button>
            </div>
          </header>

          <div ref={projectSwitcherRef} className="creation-project-switcher">
            <div>
              <span>{tr("作品会话", "Saved works")}</span>
              <button
                type="button"
                className="creation-project-trigger"
                onClick={() => setProjectMenuOpen((open) => !open)}
                aria-label={tr("切换作品会话", "Switch writing project")}
                aria-haspopup="listbox"
                aria-expanded={projectMenuOpen}
              >
                <span>{displayTitle}</span>
                <span className="creation-project-trigger-icons">
                  {busy && <LoaderCircle size={13} className="spin" />}
                  <ChevronDown size={15} />
                </span>
              </button>
              {projectMenuOpen && (
                <div className="creation-project-menu" role="listbox" aria-label={tr("作品列表", "Writing projects")}>
                  {projects.map((project, index) => {
                    const projectLabel = project.title.trim() || tr(`新作品 ${index + 1}`, `New work ${index + 1}`);
                    const selected = project.id === activeProject?.id;
                    const generating = Boolean(busyByProject[project.id]);
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? "active" : ""}
                        key={project.id}
                        onClick={() => {
                          setActiveProjectId(project.id);
                          setProjectMenuOpen(false);
                        }}
                      >
                        <span>{projectLabel}</span>
                        <span className="creation-project-option-status">
                          {generating && <em><LoaderCircle size={12} className="spin" />{tr("生成中", "Generating")}</em>}
                          {selected && <Check size={14} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="button" onClick={startNewProject} title={tr("新建作品", "New work")}>
              <Plus size={15} />
            </button>
          </div>

          <div className="creation-intent-tabs">
            <button className={intent === "write" ? "active" : ""} onClick={() => setIntent("write")}>
              <Pencil size={14} />{tr("创作", "Write")}
            </button>
            <button className={intent === "discuss" ? "active" : ""} onClick={() => setIntent("discuss")}>
              <MessageSquare size={14} />{tr("讨论", "Discuss")}
            </button>
            <button className={intent === "rewrite" ? "active" : ""} onClick={() => setIntent("rewrite")}>
              <Sparkles size={14} />{tr("重写选段", "Rewrite")}
            </button>
          </div>

          <div ref={messagesRef} className="creation-messages">
            {!visibleMessages.length && (
              <div className="creation-welcome">
                <span><BookOpen size={24} /></span>
                <strong>{intent === "write"
                  ? tr("从一个想法开始写作", "Start with an idea")
                  : intent === "discuss"
                    ? tr("围绕当前作品单独讨论", "Discuss this work separately")
                    : tr("选中书稿后开始重写", "Select manuscript text to rewrite")}</strong>
                <p>{tr(
                  intent === "write"
                    ? "告诉 AI 题材、人物、时代、视角和文风。这里只显示创作任务与生成概述。"
                    : intent === "discuss"
                      ? "讨论区只保留你和 AI 对当前作品的分析，不会混入创作或重写记录。"
                      : "在右侧选中文字后提出重写要求；这里只显示原要求与重写结果。",
                  intent === "write"
                    ? "Tell the AI the genre, characters, era, viewpoint and voice. Only writing tasks and generated summaries appear here."
                    : intent === "discuss"
                      ? "Discussion keeps analysis about this work separate from writing and rewrite history."
                      : "Select text on the right and request a rewrite. Only rewrite requests and results appear here.",
                )}</p>
                {intent === "write" && <div className="creation-starters">
                  <button onClick={() => useQuickAction("write", tr(
                    "创作一部悬疑长篇小说。先根据我的主题设计书名、核心人物和故事冲突，然后写出第一章。",
                    "Begin a suspense novel. Establish the title, central characters and conflict, then write chapter one.",
                  ))}>{tr("悬疑长篇", "Suspense novel")}</button>
                  <button onClick={() => useQuickAction("write", tr(
                    "写一篇现实主义短篇小说，以一个看似平常但改变人物命运的夜晚为主题。",
                    "Write a realist short story about an ordinary-looking night that changes a character's life.",
                  ))}>{tr("现实短篇", "Realist story")}</button>
                  <button onClick={() => useQuickAction("write", tr(
                    "根据我接下来提供的主题，先写一个有画面感的开场，使用第三人称限知视角。",
                    "Use the theme I provide next to write a vivid opening in third-person limited viewpoint.",
                  ))}>{tr("写一个开场", "Write an opening")}</button>
                </div>}
              </div>
            )}
            {visibleMessages.map((message) => {
              const isWriteReceipt = message.role === "assistant" && message.intent === "write";
              return (
                <article key={message.id} className={`creation-message ${message.role} ${isWriteReceipt ? "write-receipt" : ""}`}>
                  <span className="creation-message-role">
                    {message.role === "user" ? tr("你", "You") : "AI"}
                  </span>
                  {isWriteReceipt ? (
                    <div className="creation-write-receipt">
                      <div className="creation-receipt-status">
                        <Check size={15} />
                        <span>{tr(
                          `正文已写入右侧${message.generatedWordCount ? ` · ${message.generatedWordCount.toLocaleString()} 字` : ""}`,
                          `Prose added on the right${message.generatedWordCount ? ` · ${message.generatedWordCount.toLocaleString()} words` : ""}`,
                        )}</span>
                      </div>
                      {message.writingReceipt && (
                        <>
                          <strong className="creation-receipt-title">
                            <BookOpen size={15} />
                            {message.writingReceipt.title}
                          </strong>
                          <dl className="creation-receipt-details">
                            <div>
                              <dt>{tr("本次任务", "Task")}</dt>
                              <dd>{message.writingReceipt.task}</dd>
                            </div>
                            <div>
                              <dt>{tr("剧情概述", "Plot")}</dt>
                              <dd>{message.writingReceipt.summary}</dd>
                            </div>
                          </dl>
                        </>
                      )}
                    </div>
                  ) : message.role === "assistant" ? (
                    <MarkdownContent content={message.content} compact className="creation-message-markdown" />
                  ) : (
                    <div>{message.content}</div>
                  )}
                  {message.replacement && (
                    <button
                      className={`apply-rewrite-button ${message.applied ? "applied" : ""}`}
                      onClick={() => !message.applied && applyReplacement(message.id, message.replacement!)}
                      disabled={message.applied}
                    >
                      {message.applied ? <Check size={14} /> : <Sparkles size={14} />}
                      {message.applied ? tr("已替换到书稿", "Applied") : tr("用此版本替换选段", "Replace selection")}
                    </button>
                  )}
                </article>
              );
            })}
            {busyIntent === intent && (
              <article className="creation-message assistant pending">
                <span className="creation-message-role">AI</span>
                <div className="creation-pending-card">
                  <span><LoaderCircle size={15} className="spin" />{intent === "write"
                    ? tr("正在续写书稿…", "Writing the manuscript…")
                    : intent === "rewrite"
                      ? tr("正在重写选段…", "Rewriting the selection…")
                      : tr("正在思考你的问题…", "Thinking about your question…")}</span>
                  <button type="button" onClick={stopGeneration}>
                    <Square size={12} fill="currentColor" />{tr("终止", "Stop")}
                  </button>
                </div>
              </article>
            )}
          </div>

          <div className="creation-composer">
            {selection && (
              <div className="creation-selection-context" onMouseDown={keepSelectionOpen}>
                <div><strong>{tr("已选择书稿", "Manuscript selected")}</strong><button onClick={clearSelection}><X size={13} /></button></div>
                <p>“{selection.text.slice(0, 140)}{selection.text.length > 140 ? "…" : ""}”</p>
                <div>
                  <button onClick={() => useQuickAction("rewrite", tr("润色这段文字，使语言更自然、有画面感，但不要改变事实。", "Polish this passage for natural, vivid prose without changing facts."))}>{tr("润色", "Polish")}</button>
                  <button onClick={() => useQuickAction("rewrite", tr("重写这段文字，增强节奏和情绪张力。", "Rewrite this passage with stronger pacing and emotional tension."))}>{tr("重写", "Rewrite")}</button>
                  <button onClick={() => useQuickAction("discuss", tr("分析这段文字目前的问题，并给出具体修改建议。", "Analyze this passage and give specific revision advice."))}>{tr("分析", "Analyze")}</button>
                </div>
              </div>
            )}
            <textarea
              ref={composerRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onBlur={() => { composingRef.current = false; }}
              onFocus={() => document.body.classList.remove("resizing-insight")}
              onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
              placeholder={intent === "write"
                ? tr("描述你想创作的主题、人物或下一段情节…", "Describe the theme, characters or next scene…")
                : intent === "rewrite"
                  ? tr("说明希望如何重写选中的文字…", "Explain how to rewrite the selection…")
                  : tr("询问人物、情节、节奏或任何创作问题…", "Ask about characters, plot, pacing or anything else…")}
              rows={3}
            />
            <div className="creation-composer-footer">
              <span>{busy
                ? tr("生成期间仍可输入 · 点击方块终止", "You can keep typing · click the square to stop")
                : tr("Enter 发送 · Shift+Enter 换行", "Enter to send · Shift+Enter for a new line")}</span>
              <button
                className={busy ? "stop-generation" : ""}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => busy ? stopGeneration() : void sendPrompt()}
                disabled={!busy && !prompt.trim()}
                aria-label={busy ? tr("终止 AI 生成", "Stop AI generation") : tr("发送给 AI", "Send to AI")}
                title={busy ? tr("终止 AI 生成", "Stop AI generation") : tr("发送给 AI", "Send to AI")}
              >
                {busy ? <Square size={13} fill="currentColor" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </aside>
      )}

      <main className="creation-manuscript-panel">
        <header className="creation-manuscript-toolbar">
          <div className="creation-title-field">
            <span className="eyebrow">MANUSCRIPT</span>
            <input
              value={title}
              onChange={(event) => setCurrentTitle(event.target.value)}
              placeholder={tr("书名将由 AI 根据正文生成", "AI will name the work from its prose")}
              aria-label={tr("作品名称", "Work title")}
            />
          </div>
          <div className="creation-manuscript-meta">
            <span>{tr(`${wordCount.toLocaleString()} 字`, `${wordCount.toLocaleString()} words`)}</span>
            <span><Check size={13} />{tr("已本地保存", "Saved locally")}</span>
          </div>
          <div className="creation-manuscript-zoom-controls">
            <div
              className="zoom-control zoom-control-labeled text-zoom-control"
              title={tr("书稿文字缩放：只调整书名、章节与正文", "Manuscript text zoom: changes the title, chapters and body text")}
            >
              <span className="zoom-kind">{tr("字", "T")}</span>
              <button
                type="button"
                onClick={() => setTextZoom((value) => Math.max(MIN_ZOOM, value - 10))}
                aria-label={tr("缩小书稿文字", "Decrease manuscript text size")}
                disabled={textZoom <= MIN_ZOOM}
              >
                <ZoomOut size={14} />
              </button>
              <span className="zoom-value">{textZoom}%</span>
              <button
                type="button"
                onClick={() => setTextZoom((value) => Math.min(MAX_ZOOM, value + 10))}
                aria-label={tr("放大书稿文字", "Increase manuscript text size")}
                disabled={textZoom >= MAX_ZOOM}
              >
                <ZoomIn size={14} />
              </button>
            </div>
            <div
              className="zoom-control zoom-control-labeled page-zoom-control"
              title={tr("书稿页面缩放：整体放大或缩小纸张", "Manuscript page zoom: scales the whole page")}
            >
              <span className="zoom-kind">{tr("页", "P")}</span>
              <button
                type="button"
                onClick={() => setPageZoom((value) => Math.max(MIN_ZOOM, value - 10))}
                aria-label={tr("缩小书稿页面", "Zoom manuscript page out")}
                disabled={pageZoom <= MIN_ZOOM}
              >
                <ZoomOut size={14} />
              </button>
              <span className="zoom-value">{pageZoom}%</span>
              <button
                type="button"
                onClick={() => setPageZoom((value) => Math.min(MAX_ZOOM, value + 10))}
                aria-label={tr("放大书稿页面", "Zoom manuscript page in")}
                disabled={pageZoom >= MAX_ZOOM}
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>
          <div className="creation-manuscript-actions">
            <button onClick={() => void copyManuscript()} disabled={!manuscript} title={tr("复制全文", "Copy manuscript")}><Copy size={15} />{tr("复制全文", "Copy")}</button>
            <button onClick={exportManuscript} disabled={!manuscript} title={tr("导出 TXT", "Export TXT")}><Download size={15} />{tr("导出 TXT", "Export TXT")}</button>
            <button className="danger" onClick={deleteCurrentProject} title={tr("删除作品", "Delete work")}><Trash2 size={15} />{tr("删除作品", "Delete")}</button>
          </div>
        </header>

        <div className="creation-page-stage">
          <article
            className="creation-book-page"
            style={{
              "--creation-text-scale": textZoom / 100,
              "--creation-page-scale": pageZoom / 100,
            } as React.CSSProperties}
          >
            {title.trim() && <h1 className="creation-book-title">{title.trim()}</h1>}
            {!manuscript ? (
              <div className="creation-empty-page">
                <BookOpen size={34} />
                <strong>{tr("从故事开始，书名交给 AI", "Start with the story; AI will name it")}</strong>
                <span>{tr(
                  "描述题材、人物和情节。AI 首次创作时会同时生成书名、剧情概述与正文。",
                  "Describe the genre, characters and plot. The first AI response will create a title, plot summary and manuscript.",
                )}</span>
              </div>
            ) : (
              <div
                ref={manuscriptRef}
                className="creation-manuscript"
                onMouseUp={captureManuscriptSelection}
              >
                {blocks.map((block) => {
                  if (block.kind === "chapter") {
                    return <h2 key={block.start} data-manuscript-start={block.start}>{block.text}</h2>;
                  }
                  if (block.kind === "section") {
                    return <h3 key={block.start} data-manuscript-start={block.start}>{block.text}</h3>;
                  }
                  return <p key={block.start} data-manuscript-start={block.start}>{block.text}</p>;
                })}
              </div>
            )}
          </article>
        </div>
      </main>
    </section>
  );
}
