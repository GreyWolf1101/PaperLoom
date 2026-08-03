import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  CornerDownLeft,
  Delete as DeleteIcon,
  Download,
  FileText,
  Image as ImageIcon,
  Keyboard,
  LoaderCircle,
  MousePointer2,
  PenLine,
  Redo2,
  RotateCcw,
  Sigma,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  WandSparkles,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { AppLanguage } from "./models";
import { copyTextToClipboard } from "./clipboard";
import {
  countFormulaPlaceholders,
  DEFAULT_FORMULA,
  FORMULA_NUMBER_KEYS,
  FORMULA_OPERATOR_KEYS,
  FORMULA_SYMBOL_GROUPS,
  formulaLatexForPreview,
  formulaSnippetForVisualEditor,
  insertFormulaSnippet,
  normalizeFormulaLatex,
  type FormulaSymbol,
} from "./formula";
import type { VisualFormulaEditorHandle } from "./VisualFormulaEditor";
import PaperFormatter from "./PaperFormatter";

const VisualFormulaEditor = lazy(() => import("./VisualFormulaEditor"));

type FormulaMode = "image" | "describe" | "compose";
type UtilityTool = "formula" | "paper-format";

type UtilitiesWorkspaceProps = {
  language: AppLanguage;
  ensureAIReady: () => boolean;
  requestAI: (system: string, user: string, imageDataUrl?: string) => Promise<string>;
  notify: (message: string) => void;
};

const DRAFT_KEY = "paperloom.formula-workshop.v1";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function getInitialDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return {
      latex: typeof parsed.latex === "string" && parsed.latex.trim() ? parsed.latex : DEFAULT_FORMULA,
      equationNumber: typeof parsed.equationNumber === "string" ? parsed.equationNumber : "",
    };
  } catch {
    return { latex: DEFAULT_FORMULA, equationNumber: "" };
  }
}

async function prepareFormulaImage(file: File) {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("请选择 PNG、JPEG 或 WebP 图片");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法读取公式图片");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let dataUrl = canvas.toDataURL("image/png");
  if (Math.ceil(dataUrl.length * 0.75) > MAX_IMAGE_BYTES) dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  if (Math.ceil(dataUrl.length * 0.75) > MAX_IMAGE_BYTES) throw new Error("图片处理后仍超过 8 MB，请裁剪公式区域后重试");
  return { dataUrl, width: canvas.width, height: canvas.height };
}

function renderFormula(latex: string, output: "htmlAndMathml" | "mathml" = "htmlAndMathml") {
  return katex.renderToString(latex, {
    displayMode: true,
    output,
    throwOnError: true,
    strict: "ignore",
    trust: false,
  });
}

function extractMathElement(rendered: string) {
  const start = rendered.indexOf("<math");
  const end = rendered.indexOf("</math>");
  return start >= 0 && end > start ? rendered.slice(start, end + 7) : rendered;
}

function FormulaKeycap({ symbol, onClick }: { symbol: FormulaSymbol; onClick: () => void }) {
  let html = "";
  try {
    html = katex.renderToString(symbol.previewLatex || symbol.label, {
      displayMode: false,
      output: "html",
      throwOnError: true,
      strict: "ignore",
      trust: false,
    });
  } catch {
    html = "";
  }
  return (
    <button
      className={symbol.wide ? "wide" : ""}
      title={symbol.title || symbol.snippet}
      onClick={onClick}
      type="button"
    >
      {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{symbol.label}</span>}
    </button>
  );
}

function UtilityToolNavigation({
  active,
  onChange,
  tr,
}: {
  active: UtilityTool;
  onChange: (tool: UtilityTool) => void;
  tr: (cn: string, en: string) => string;
}) {
  return (
    <nav className="utility-tool-navigation" aria-label={tr("实用工具列表", "Utility tools")}>
      <div>
        <span className="eyebrow">PAPERLOOM UTILITIES</span>
        <strong>{tr("实用工具", "Utilities")}</strong>
      </div>
      <button type="button" className={active === "formula" ? "active" : ""} onClick={() => onChange("formula")}>
        <span><Sigma size={17} /></span><div><strong>{tr("公式工坊", "Formula Workshop")}</strong><small>{tr("识别、编写与 Word 导出", "Recognize, compose and export")}</small></div>
      </button>
      <button type="button" className={active === "paper-format" ? "active" : ""} onClick={() => onChange("paper-format")}>
        <span><FileText size={17} /></span><div><strong>{tr("论文格式编排", "Paper Formatting")}</strong><small>{tr("按格式说明修改 DOCX", "Apply requirements to DOCX")}</small></div>
      </button>
    </nav>
  );
}

export default function UtilitiesWorkspace({
  language,
  ensureAIReady,
  requestAI,
  notify,
}: UtilitiesWorkspaceProps) {
  const zh = language === "zh-CN";
  const tr = (cn: string, en: string) => zh ? cn : en;
  const initialDraft = useMemo(getInitialDraft, []);
  const [activeTool, setActiveTool] = useState<UtilityTool>("formula");
  const [mode, setMode] = useState<FormulaMode>("image");
  const [latex, setLatex] = useState(initialDraft.latex);
  const [equationNumber, setEquationNumber] = useState(initialDraft.equationNumber);
  const [description, setDescription] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageSize, setImageSize] = useState("");
  const [symbolGroupId, setSymbolGroupId] = useState("main");
  const [angleMode, setAngleMode] = useState<"radian" | "degree">("radian");
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [busy, setBusy] = useState<"image" | "describe" | "export" | null>(null);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visualEditorRef = useRef<VisualFormulaEditorHandle>(null);
  const selectionRef = useRef({ start: initialDraft.latex.length, end: initialDraft.latex.length });

  const preview = useMemo(() => {
    if (!latex.trim()) return { html: "", error: "" };
    try {
      return { html: renderFormula(formulaLatexForPreview(latex)), error: "" };
    } catch (error) {
      return {
        html: "",
        error: error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/i, "") : tr("公式语法有误", "Invalid formula syntax"),
      };
    }
  }, [latex, language]);
  const placeholderCount = useMemo(() => countFormulaPlaceholders(latex), [latex]);
  const formulaComplete = Boolean(latex.trim()) && !preview.error && placeholderCount === 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ latex, equationNumber }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [latex, equationNumber]);

  const focusEditorAt = (position: number) => {
    selectionRef.current = { start: position, end: position };
    window.requestAnimationFrame(() => {
      const editor = textareaRef.current;
      editor?.focus();
      editor?.setSelectionRange(position, position);
    });
  };

  const commitLatex = (next: string, cursor?: number, focus = true) => {
    const nextCursor = typeof cursor === "number" ? cursor : next.length;
    selectionRef.current = { start: nextCursor, end: nextCursor };
    if (next === latex) {
      if (focus && typeof cursor === "number") focusEditorAt(cursor);
      return;
    }
    setUndoStack((history) => [...history.slice(-79), latex]);
    setRedoStack([]);
    setLatex(next);
    if (focus && typeof cursor === "number") focusEditorAt(cursor);
  };

  const undoFormula = () => {
    const previous = undoStack.at(-1);
    if (previous === undefined) return;
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history.slice(-79), latex]);
    setLatex(previous);
    focusEditorAt(previous.length);
  };

  const redoFormula = () => {
    const next = redoStack.at(-1);
    if (next === undefined) return;
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history.slice(-79), latex]);
    setLatex(next);
    focusEditorAt(next.length);
  };

  const moveFormulaCaret = (delta: number) => {
    if (visualEditorRef.current) {
      visualEditorRef.current.executeCommand(delta < 0 ? "moveToPreviousChar" : "moveToNextChar");
      visualEditorRef.current.focus();
      return;
    }
    const position = selectionRef.current.start;
    focusEditorAt(Math.max(0, Math.min(latex.length, position + delta)));
  };

  const eraseFormulaCharacter = () => {
    if (visualEditorRef.current) {
      visualEditorRef.current.executeCommand("deleteBackward");
      visualEditorRef.current.focus();
      return;
    }
    const start = selectionRef.current.start;
    const end = selectionRef.current.end;
    if (start === 0 && end === 0) return;
    const removeFrom = start === end ? start - 1 : start;
    commitLatex(`${latex.slice(0, removeFrom)}${latex.slice(end)}`, removeFrom);
  };

  const acceptImage = async (file?: File) => {
    if (!file) return;
    try {
      const prepared = await prepareFormulaImage(file);
      setImageDataUrl(prepared.dataUrl);
      setImageName(file.name || tr("剪贴板截图", "Clipboard image"));
      setImageSize(`${prepared.width} × ${prepared.height}`);
      setMode("image");
      notify(tr("公式图片已载入，可以开始识别", "Formula image loaded and ready"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("图片读取失败", "Could not read the image"));
    }
  };

  const recognizeImage = async () => {
    if (!imageDataUrl || busy || !ensureAIReady()) return;
    setBusy("image");
    try {
      const result = await requestAI(
        "You are a precise mathematical formula OCR engine. Transcribe every visible formula into valid KaTeX-compatible LaTeX. Preserve fractions, roots, matrices, accents, indices, limits, summation bounds, Greek letters and brackets exactly. If the image contains several aligned lines, use an aligned environment. Return only the LaTeX expression without dollar signs, prose or code fences.",
        "Recognize the mathematical expression in this image and return only editable LaTeX.",
        imageDataUrl,
      );
      const next = normalizeFormulaLatex(result);
      if (!next) throw new Error(tr("模型没有返回可用公式", "The model returned no usable formula"));
      commitLatex(next);
      notify(tr("公式识别完成，已转为可编辑格式", "Formula recognized and converted to editable form"));
    } catch (error) {
      notify(error instanceof Error
        ? `${error.message} ${tr("请确认当前模型支持图片识别。", "Make sure the selected model supports images.")}`
        : tr("公式识别失败，请确认当前模型支持图片", "Recognition failed; make sure the model supports images"));
    } finally {
      setBusy(null);
    }
  };

  const generateFromDescription = async () => {
    const prompt = description.trim();
    if (!prompt || busy || !ensureAIReady()) return;
    setBusy("describe");
    try {
      const result = await requestAI(
        "You convert natural-language mathematical descriptions into accurate, concise, KaTeX-compatible LaTeX. Use conventional academic notation. Return only one LaTeX expression without dollar signs, prose or code fences.",
        `Create the requested formula:\n${prompt}`,
      );
      const next = normalizeFormulaLatex(result);
      if (!next) throw new Error(tr("模型没有返回可用公式", "The model returned no usable formula"));
      commitLatex(next);
      notify(tr("描述已转换为可编辑公式", "Description converted to an editable formula"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("公式生成失败", "Formula generation failed"));
    } finally {
      setBusy(null);
    }
  };

  const insertSymbol = (symbol: FormulaSymbol) => {
    if (visualEditorRef.current?.insert(formulaSnippetForVisualEditor(symbol))) return;
    const start = selectionRef.current.start;
    const end = selectionRef.current.end;
    const next = insertFormulaSnippet(latex, start, end, symbol);
    commitLatex(next.value, next.cursor);
  };

  const copyLatex = async () => {
    if (!formulaComplete) return;
    await copyTextToClipboard(latex.trim());
    notify(tr("LaTeX 已复制", "LaTeX copied"));
  };

  const copyMathML = async () => {
    if (!formulaComplete) return;
    try {
      await copyTextToClipboard(extractMathElement(renderFormula(latex, "mathml")));
      notify(tr("MathML 已复制", "MathML copied"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("复制失败", "Copy failed"));
    }
  };

  const copyForWord = async () => {
    if (!formulaComplete) return;
    try {
      if (window.paperLoom?.copyWordFormula) {
        const copied = await window.paperLoom.copyWordFormula({ latex: latex.trim() });
        if (!copied) throw new Error(tr("系统剪贴板未接受公式格式", "The system clipboard rejected the equation format"));
        notify(tr("已复制为 Word 原生数学格式，可直接粘贴并继续编辑", "Copied as native Word math; paste directly and keep editing"));
        return;
      }
      await copyTextToClipboard(latex.trim());
      notify(tr("已复制线性公式：在 Word 中按 Alt+= 后粘贴", "Linear equation copied: press Alt+= in Word, then paste"));
    } catch (error) {
      await copyTextToClipboard(latex.trim());
      notify(error instanceof Error
        ? `${error.message}；${tr("已改为复制 LaTeX 备用格式", "LaTeX fallback copied")}`
        : tr("已改为复制 LaTeX 备用格式", "LaTeX fallback copied"));
    }
  };

  const exportWord = async () => {
    if (!formulaComplete || busy) return;
    if (!window.paperLoom?.exportWordFormula) {
      notify(tr("Word 公式导出仅在桌面版中可用", "Word equation export is available in the desktop app"));
      return;
    }
    setBusy("export");
    try {
      const saved = await window.paperLoom.exportWordFormula({
        latex: latex.trim(),
        equationNumber: equationNumber.trim(),
        suggestedName: `PaperLoom-${tr("公式", "Formula")}.docx`,
      });
      if (saved) notify(tr("已导出可编辑的 Word 标准公式", "Editable Word equation exported"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("Word 导出失败", "Word export failed"));
    } finally {
      setBusy(null);
    }
  };

  const modes: Array<{ id: FormulaMode; icon: typeof ImageIcon; title: string; detail: string }> = [
    { id: "image", icon: ImageIcon, title: tr("图片识别", "Image recognition"), detail: tr("印刷或手写截图", "Printed or handwritten") },
    { id: "describe", icon: WandSparkles, title: tr("描述生成", "Describe"), detail: tr("用自然语言说出公式", "Describe the equation") },
    { id: "compose", icon: Keyboard, title: tr("公式编写", "Compose"), detail: tr("点击符号自由组合", "Build with symbols") },
  ];
  const activeSymbolGroup = FORMULA_SYMBOL_GROUPS.find((group) => group.id === symbolGroupId) || FORMULA_SYMBOL_GROUPS[0];

  if (activeTool === "paper-format") {
    return (
      <section className="utilities-workspace paper-format-workshop">
        <UtilityToolNavigation active={activeTool} onChange={setActiveTool} tr={tr} />
        <PaperFormatter language={language} notify={notify} />
      </section>
    );
  }

  return (
    <section className="utilities-workspace formula-workshop">
      <UtilityToolNavigation active={activeTool} onChange={setActiveTool} tr={tr} />
      <header className="utilities-hero formula-hero">
        <div className="formula-hero-mark"><Sigma size={31} /></div>
        <div>
          <span className="eyebrow">FORMULA WORKSHOP · {tr("公式工坊", "FORMULA WORKSHOP")}</span>
          <h1>{tr("识别、编写并导出专业公式", "Recognize, compose and export equations")}</h1>
          <p>{tr(
            "从公式截图、手写笔记或一句描述开始，也可以像使用公式键盘一样自行编写；所有结果都能继续编辑并导出为 Word 原生公式。",
            "Start from a screenshot, handwriting or a description, or compose with the formula keyboard. Every result remains editable and exports as a native Word equation.",
          )}</p>
        </div>
        <span className="formula-local-badge"><Check size={14} />{tr("编辑与导出本地完成", "Local editing & export")}</span>
      </header>

      <div className="formula-studio">
        <nav className="formula-mode-tabs" aria-label={tr("公式输入方式", "Formula input method")}>
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
                <span><Icon size={18} /></span>
                <div><strong>{item.title}</strong><small>{item.detail}</small></div>
              </button>
            );
          })}
        </nav>

        <div className="formula-workbench">
          <div className="formula-input-column">
            {mode === "image" && (
              <section className="formula-method-panel">
                <header><div><span className="eyebrow">AI FORMULA OCR</span><h2>{tr("上传公式或手写截图", "Upload a formula image")}</h2></div><ImageIcon size={22} /></header>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void acceptImage(event.target.files?.[0])} />
                <div
                  className={`formula-drop-zone ${imageDataUrl ? "has-image" : ""} ${dragging ? "dragging" : ""}`}
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void acceptImage(event.dataTransfer.files?.[0]);
                  }}
                  onPaste={(event) => {
                    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
                    if (image) { event.preventDefault(); void acceptImage(image); }
                  }}
                  role="button"
                  aria-label={tr("上传或粘贴公式图片", "Upload or paste a formula image")}
                >
                  {imageDataUrl ? (
                    <>
                      <img src={imageDataUrl} alt={tr("待识别公式", "Formula to recognize")} />
                      <div className="formula-image-meta"><span><strong>{imageName}</strong><small>{imageSize}</small></span><button title={tr("移除图片", "Remove image")} onClick={(event) => { event.stopPropagation(); setImageDataUrl(""); setImageName(""); }}><Trash2 size={15} /></button></div>
                    </>
                  ) : (
                    <>
                      <span className="formula-upload-icon"><Upload size={25} /></span>
                      <strong>{tr("点击、拖入或粘贴公式截图", "Click, drop or paste a formula image")}</strong>
                      <small>{tr("支持印刷公式与清晰手写内容 · PNG / JPEG / WebP", "Printed or clear handwriting · PNG / JPEG / WebP")}</small>
                    </>
                  )}
                </div>
                <div className="formula-method-actions">
                  <p><Sparkles size={14} />{tr("识别需要当前 AI 模型支持图片输入；图片仅发送到你配置的模型服务。", "Recognition requires a vision-capable model; the image is sent only to your configured AI service.")}</p>
                  <button className="primary" disabled={!imageDataUrl || Boolean(busy)} onClick={() => void recognizeImage()}>{busy === "image" ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}{tr("开始识别", "Recognize")}</button>
                </div>
              </section>
            )}

            {mode === "describe" && (
              <section className="formula-method-panel">
                <header><div><span className="eyebrow">TEXT TO FORMULA</span><h2>{tr("描述你需要的公式", "Describe the equation")}</h2></div><Sparkles size={22} /></header>
                <textarea className="formula-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={tr("例如：写出均值为 μ、标准差为 σ 的正态分布概率密度函数……", "For example: write the probability density function of a normal distribution with mean μ and standard deviation σ…")} />
                <div className="formula-description-examples">
                  <span>{tr("试试：", "Try:")}</span>
                  {[tr("二维卷积求和公式", "2D convolution sum"), tr("从 0 到无穷的高斯积分", "Gaussian integral from zero to infinity"), tr("带约束条件的分段函数", "A constrained piecewise function")].map((item) => <button key={item} onClick={() => setDescription(item)}>{item}</button>)}
                </div>
                <div className="formula-method-actions"><p><PenLine size={14} />{tr("生成结果会进入下方编辑器，仍可逐项修改。", "The result enters the editor below and remains fully editable.")}</p><button className="primary" disabled={!description.trim() || Boolean(busy)} onClick={() => void generateFromDescription()}>{busy === "describe" ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}{tr("生成公式", "Generate")}</button></div>
              </section>
            )}

            {mode === "compose" && (
              <section className="formula-method-panel formula-composer">
                <header><div><span className="eyebrow">ADVANCED EQUATION KEYBOARD</span><h2>{tr("可视化公式键盘", "Visual equation keyboard")}</h2></div><Keyboard size={22} /></header>
                <div className="formula-keyboard">
                  <div className="formula-keyboard-toolbar">
                    <div className="formula-symbol-groups">
                      {FORMULA_SYMBOL_GROUPS.map((group) => <button type="button" key={group.id} className={symbolGroupId === group.id ? "active" : ""} onClick={() => setSymbolGroupId(group.id)}>{group.label[zh ? 0 : 1]}</button>)}
                    </div>
                    <div className="formula-keyboard-tools">
                      <div className="formula-angle-switch" title={tr("选择角度单位插入方式", "Choose angle unit insertion")}>
                        <button type="button" className={angleMode === "radian" ? "active" : ""} onClick={() => setAngleMode("radian")}>{tr("弧度", "rad")}</button>
                        <button type="button" className={angleMode === "degree" ? "active" : ""} onClick={() => setAngleMode("degree")}>{tr("角度", "deg")}</button>
                      </div>
                      <button type="button" title={tr("撤销", "Undo")} disabled={!undoStack.length} onClick={undoFormula}><Undo2 size={17} /></button>
                      <button type="button" title={tr("重做", "Redo")} disabled={!redoStack.length} onClick={redoFormula}><Redo2 size={17} /></button>
                      <button type="button" className="clear" title={tr("清除全部", "Clear all")} disabled={!latex} onClick={() => commitLatex("", 0)}><Trash2 size={16} /><span>{tr("清空", "Clear")}</span></button>
                    </div>
                  </div>

                  <div className="formula-keyboard-body">
                    <div className={`formula-key-palette ${activeSymbolGroup.id === "matrix" ? "matrix" : ""}`}>
                      {activeSymbolGroup.symbols.map((symbol, index) => <FormulaKeycap key={`${symbol.label}-${index}`} symbol={symbol} onClick={() => insertSymbol(symbol)} />)}
                    </div>
                    <div className="formula-number-pad">
                      {FORMULA_NUMBER_KEYS.map((symbol, index) => <FormulaKeycap key={`${symbol.label}-${index}`} symbol={symbol} onClick={() => insertSymbol(symbol)} />)}
                      <FormulaKeycap symbol={{ label: "ans", snippet: "\\mathrm{ans}", previewLatex: "\\mathrm{ans}" }} onClick={() => insertSymbol({ label: "ans", snippet: "\\mathrm{ans}" })} />
                    </div>
                    <div className="formula-operator-pad">
                      {FORMULA_OPERATOR_KEYS.map((symbol, index) => <FormulaKeycap key={`${symbol.label}-${index}`} symbol={symbol} onClick={() => insertSymbol(symbol)} />)}
                    </div>
                    <div className="formula-control-pad">
                      <FormulaKeycap symbol={{ label: "分数", snippet: "\\frac{}{}", cursorOffset: 6, previewLatex: "\\frac{a}{b}", title: tr("分数", "Fraction") }} onClick={() => insertSymbol({ label: "分数", snippet: "\\frac{}{}", cursorOffset: 6 })} />
                      <FormulaKeycap symbol={{ label: "上下标", snippet: "_{}^{}", cursorOffset: 2, previewLatex: "a_i^j", title: tr("上下标", "Subscript and superscript") }} onClick={() => insertSymbol({ label: "上下标", snippet: "_{}^{}", cursorOffset: 2 })} />
                      <button type="button" title={tr("光标左移", "Move cursor left")} onClick={() => moveFormulaCaret(-1)}><ChevronLeft size={21} /></button>
                      <button type="button" title={tr("光标右移", "Move cursor right")} onClick={() => moveFormulaCaret(1)}><ChevronRight size={21} /></button>
                      <button type="button" className="wide" title={tr("退格", "Backspace")} onClick={eraseFormulaCharacter}><DeleteIcon size={20} /></button>
                      <button type="button" className="wide accent" title={tr("插入公式换行", "Insert equation line break")} onClick={() => insertSymbol({ label: "换行", snippet: " \\\\ " })}><CornerDownLeft size={22} /></button>
                      <button type="button" className="wide unit" title={tr("插入当前角度单位", "Insert selected angle unit")} onClick={() => insertSymbol(angleMode === "degree" ? { label: "角度", snippet: "^{\\circ}" } : { label: "弧度", snippet: "\\,\\mathrm{rad}" })}>{angleMode === "degree" ? "°" : "rad"}</button>
                    </div>
                  </div>
                </div>
                <p className="formula-compose-hint"><Braces size={14} />{tr("支持上下标、分式、求和、积分、分段函数以及 2×2 / 3×3 矩阵；选中下方内容后再点结构键，可以直接包住所选公式。", "Supports scripts, fractions, n-ary operators, cases and 2×2 / 3×3 matrices. Select source text first to wrap it in a structure.")}</p>
              </section>
            )}

            <section className="formula-editor-panel">
              <header>
                <div><span className="eyebrow">VISUAL EQUATION CANVAS</span><h2>{tr("直接在公式上编辑", "Edit directly on the equation")}</h2></div>
                <div><button onClick={() => commitLatex(DEFAULT_FORMULA, DEFAULT_FORMULA.length)}><RotateCcw size={14} />{tr("示例", "Example")}</button><button onClick={() => commitLatex("", 0)}><Trash2 size={14} />{tr("清空", "Clear")}</button></div>
              </header>
              <div className="formula-visual-canvas">
                <div className="formula-visual-canvas-label"><span><MousePointer2 size={15} />{tr("点击任意数字、符号或蓝色空位即可定位", "Click any symbol or blue placeholder to position the caret")}</span><small>{tr("方向键和 Tab 也可以在空位之间移动", "Arrow keys and Tab also move between slots")}</small></div>
                <Suspense fallback={<div className="formula-visual-loading"><LoaderCircle className="spin" size={19} />{tr("正在载入可视化公式画布…", "Loading the visual equation canvas…")}</div>}>
                  <VisualFormulaEditor
                    ref={visualEditorRef}
                    value={latex}
                    ariaLabel={tr("可视化公式编辑器", "Visual equation editor")}
                    placeholder={tr("\\text{点击这里开始编写公式}", "\\text{Click here to start an equation}")}
                    onChange={(value) => commitLatex(value, undefined, false)}
                  />
                </Suspense>
                <div className={`formula-slot-status ${placeholderCount ? "pending" : "complete"}`}>
                  {placeholderCount
                    ? <><span>{placeholderCount}</span>{tr(" 个待填写空位：点击蓝色方框后输入内容", " open slots: click a blue box and enter a value")}</>
                    : <><Check size={14} />{tr("公式结构完整，可以复制或导出", "The equation is complete and ready to export")}</>}
                </div>
              </div>
              <div className="formula-source-heading"><span><strong>LaTeX</strong>{tr("同步源码（高级用户可直接修改）", "synchronized source (advanced users can edit it directly)")}</span><small>{tr("画布与源码实时同步", "Live two-way sync")}</small></div>
              <textarea
                ref={textareaRef}
                className={preview.error ? "invalid" : ""}
                spellCheck={false}
                value={latex}
                onChange={(event) => commitLatex(event.target.value, event.target.selectionStart, false)}
                onSelect={(event) => {
                  const editor = event.currentTarget;
                  selectionRef.current = { start: editor.selectionStart, end: editor.selectionEnd };
                }}
                aria-label={tr("LaTeX 公式源码", "LaTeX equation source")}
              />
              <footer><span>{tr("普通用户只需使用上方画布和键盘；这里用于查看、复制或精确修改源码。", "Use the visual canvas and keyboard for normal editing; this area remains available for exact source changes.")}</span><strong>{latex.length} {tr("字符", "characters")}</strong></footer>
            </section>
          </div>

          <aside className="formula-output-column">
            <section className="formula-preview-card">
              <header><div><span className="eyebrow">LIVE PREVIEW</span><h2>{tr("专业排版预览", "Professional preview")}</h2></div><span className={preview.error ? "formula-status error" : "formula-status"}>{preview.error ? tr("需要修正", "Fix syntax") : tr("格式有效", "Valid")}</span></header>
              <div className={`formula-preview-surface ${preview.error ? "has-error" : ""}`}>
                {preview.error ? <div className="formula-preview-error"><Braces size={24} /><strong>{tr("暂时无法排版", "Cannot render yet")}</strong><p>{preview.error}</p></div> : latex.trim() ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <div className="formula-preview-empty"><Sigma size={30} /><span>{tr("输入公式后在这里预览", "Your equation preview appears here")}</span></div>}
              </div>
              <label className="formula-number-field"><span><strong>{tr("公式编号", "Equation number")}</strong><small>{tr("导出 Word 时显示在公式右侧", "Placed to the right in Word")}</small></span><input value={equationNumber} onChange={(event) => setEquationNumber(event.target.value.slice(0, 80))} placeholder="(2-1)" /></label>
            </section>

            <section className="formula-export-card">
              <header><div><span className="eyebrow">ACADEMIC OUTPUT</span><h2>{tr("复制与导出", "Copy and export")}</h2></div><FileText size={21} /></header>
              <button className="formula-word-action" disabled={!formulaComplete} onClick={() => void copyForWord()}><span><Clipboard size={18} /></span><div><strong>{tr("复制为 Word 原生公式", "Copy as native Word equation")}</strong><small>{placeholderCount ? tr("请先填完可视化画布中的蓝色空位", "Complete all blue placeholders first") : tr("直接粘贴即可，无需先按 Alt+=", "Paste directly without opening an equation box first")}</small></div></button>
              <button className="formula-word-action accent" disabled={!formulaComplete || Boolean(busy)} onClick={() => void exportWord()}><span>{busy === "export" ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}</span><div><strong>{tr("导出 Word 标准公式", "Export Word equation")}</strong><small>{placeholderCount ? tr("填完所有空位后即可导出", "Complete all placeholders to export") : tr("生成含原生 OMML 公式的 .docx 文件", "Creates a .docx with native OMML math")}</small></div></button>
              <div className="formula-secondary-actions"><button disabled={!formulaComplete} onClick={() => void copyLatex()}><Copy size={14} />LaTeX</button><button disabled={!formulaComplete} onClick={() => void copyMathML()}><Copy size={14} />MathML</button></div>
              <p className="formula-word-note"><Check size={14} />{tr("导出的公式不是图片，可在 Microsoft Word 中继续修改上下标、分式、矩阵和符号。", "The exported equation is not an image; fractions, matrices, scripts and symbols remain editable in Microsoft Word.")}</p>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
