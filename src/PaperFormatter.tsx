import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  AlignJustify,
  Check,
  Download,
  FileText,
  Image,
  Layers,
  LoaderCircle,
  RotateCcw,
  Ruler,
  Settings2,
  ShieldCheck,
  Sigma,
  Table2,
  Type,
  Upload,
  WandSparkles,
} from "lucide-react";
import type { AppLanguage } from "./models";

type PaperStructure = { paragraphs: number; tables: number; images: number; formulas: number; sections: number };
type SelectedPaper = { path: string; name: string; size: number; modifiedAt: number; structure: PaperStructure };
type LineSpacing = { mode: "multiple" | "exact"; value: number };
type StyleRule = {
  eastAsia?: string;
  latin?: string;
  sizePt?: number;
  bold?: boolean;
  color?: string;
  alignment?: "left" | "center" | "right" | "both" | "distribute";
  lineSpacing?: LineSpacing;
  firstLineChars?: number;
  leftIndentChars?: number;
  hangingChars?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  pageBreakBefore?: boolean;
  keepNext?: boolean;
  keepLines?: boolean;
  widowControl?: boolean;
};
type PageSpecification = {
  widthCm?: number; heightCm?: number; orientation?: "portrait" | "landscape"; singleSided?: boolean;
  marginTopCm?: number; marginBottomCm?: number; marginLeftCm?: number; marginRightCm?: number;
  headerDistanceCm?: number; footerDistanceCm?: number;
};
type HeaderSpecification = { mode?: string; text?: string; bottomBorder?: boolean; style?: StyleRule; candidates?: string[] };
type PaginationSpecification = {
  frontMatterRoman?: boolean; bodyArabic?: boolean; centered?: boolean;
  frontFormat?: string; bodyFormat?: string; alignment?: string; eastAsia?: string; latin?: string;
  sizePt?: number; frontStart?: number; bodyStart?: number;
};
type PaperSpecification = {
  profile?: string;
  page?: PageSpecification;
  header?: HeaderSpecification;
  pagination?: PaginationSpecification;
  figures?: { maxWidthCm?: number; maxHeightCm?: number; centered?: boolean };
  toc?: { levels?: number; excludeFrontMatter?: boolean; updateFields?: boolean };
  [key: string]: unknown;
};
type FormatReport = {
  structure: PaperStructure;
  rules: string[];
  checks?: string[];
  warnings: string[];
  applied?: Record<string, number>;
  semanticSections?: Record<string, number>;
  specification?: PaperSpecification;
};
type Props = { language: AppLanguage; notify: (message: string) => void };
type ConfigurationSource = "detected" | "imported" | null;

const THESIS_PRESET = "A4 纵向；页边距上下 2.54 厘米、左右 3 厘米；正文中文宋体、英文 Times New Roman、小四号，1.5 倍行距，首行缩进 2 字符，两端对齐；论文标题小二号黑体加粗居中，段后 18 磅；一级标题三号黑体加粗；二级标题四号黑体加粗；三级标题小四号黑体加粗。";
const JOURNAL_PRESET = "A4 纵向；页边距均为 2.2 厘米；正文中文宋体、英文 Times New Roman、五号，单倍行距，两端对齐；论文标题二号黑体加粗居中；一级标题四号黑体加粗；二级标题小四号黑体加粗；三级标题五号黑体加粗。";
const REVIEW_PRESET = "A4 纵向；页边距上下 2.5 厘米、左右 2.8 厘米；正文中文宋体、英文 Times New Roman、小四号，1.5 倍行距，首行缩进 2 字符，两端对齐；论文标题小二号黑体加粗居中；一级标题三号黑体加粗，段前 12 磅、段后 6 磅；二级标题四号黑体加粗；三级标题小四号楷体加粗。";
const FULL_DEGREE_PRESET = "A4 纵向单面打印；上边距 36mm，左边距 30mm，右边距 20mm。中文摘要字样小二黑体居中，摘要正文小四宋体、1.5倍行距，关键词字样小四黑体，关键词内容小四宋体。英文摘要题目及作者、导师姓名使用 Times New Roman；Abstract 小二号 Times New Roman 加粗居中，摘要内容小四 Times New Roman、1.5倍行距，Keywords 小四 Times New Roman 加粗。目录按三级标题，目录内容五号宋体、1.5倍行距，目录标题三号黑体加粗居中。正文小四宋体、1.5倍行距；章标题小二黑体加粗居中并独立分页，节标题小三黑体加粗左对齐，小节标题小四黑体加粗左对齐，节和小节不能位于一页最底部。摘要和目录页码用罗马数字，第一章起用阿拉伯数字，页码下端居中、五号宋体、下边距18mm。图表题注五号宋体居中，最大图尺寸不超过12×7cm。代码及注释五号 Times New Roman、单倍行距。附录Ⅰ英文原文五号 Times New Roman、单倍行距；附录中文翻译小四宋体、单倍行距；附录Ⅱ程序代码五号 Times New Roman、单倍行距。";
const PAPER_FORMAT_DRAFT_KEY = "paperloom.paper-format-draft.v1";
const EMPTY_STRUCTURE: PaperStructure = { paragraphs: 0, tables: 0, images: 0, formulas: 0, sections: 0 };

const CJK_FONTS = ["宋体", "黑体", "楷体", "仿宋", "微软雅黑", "等线", "华文中宋", "华文宋体", "华文楷体", "华文仿宋", "华文细黑", "方正小标宋简体"];
const LATIN_FONTS = ["Times New Roman", "Arial", "Calibri", "Cambria", "Georgia"];
const FONT_SIZES = [
  ["八号 · 5 pt", 5], ["七号 · 5.5 pt", 5.5], ["小六 · 6.5 pt", 6.5], ["六号 · 7.5 pt", 7.5],
  ["小五 · 9 pt", 9], ["五号 · 10.5 pt", 10.5], ["小四 · 12 pt", 12], ["四号 · 14 pt", 14],
  ["小三 · 15 pt", 15], ["三号 · 16 pt", 16], ["小二 · 18 pt", 18], ["二号 · 22 pt", 22],
  ["小一 · 24 pt", 24], ["一号 · 26 pt", 26], ["小初 · 36 pt", 36], ["初号 · 42 pt", 42],
] as const;
const STYLE_GROUPS = [
  {
    key: "core", title: "正文与标题", subtitle: "正文、论文题目和三级标题", open: true,
    roles: [
      ["body", "正文内容", "普通正文段落"], ["title", "论文题目", "封面或正文前的论文主标题"],
      ["heading1", "一级标题（章）", "章标题，可设置独立分页"], ["heading2", "二级标题（节）", "节标题"],
      ["heading3", "三级标题（小节）", "小节标题"],
    ],
  },
  {
    key: "abstract", title: "中英文摘要", subtitle: "摘要标题、正文、作者导师和关键词", open: true,
    roles: [
      ["chineseAbstractHeading", "中文摘要标题", "“中文摘要”字样"], ["chineseAbstractBody", "中文摘要正文", "中文摘要内容"],
      ["chineseKeywords", "中文关键词内容", "关键词列表"], ["chineseKeywordLabel", "“关键词”标签", "仅设置标签部分"],
      ["englishAbstractTitle", "英文论文题目", "英文摘要页的论文题目"], ["englishAbstractMeta", "英文作者与导师", "Author、Tutor 及姓名"],
      ["englishAbstractHeading", "Abstract 标题", "Abstract 字样"], ["englishAbstractBody", "英文摘要正文", "英文摘要内容"],
      ["englishKeywords", "英文关键词内容", "英文关键词列表"], ["englishKeywordLabel", "Keywords 标签", "仅设置 Keywords 标签"],
    ],
  },
  {
    key: "toc", title: "目录与参考文献", subtitle: "目录标题、各级目录和参考文献条目", open: false,
    roles: [
      ["tocTitle", "目录标题", "“目录”字样"], ["toc1", "一级目录", "章目录项"], ["toc2", "二级目录", "节目录项"],
      ["toc3", "三级目录", "小节目录项"], ["toc4", "四级目录", "第四级目录项"], ["toc5", "五级目录", "第五级目录项"], ["endMatterHeading", "结束语等章节标题", "结束语、致谢、参考文献等"],
      ["referenceEntry", "参考文献条目", "每一条参考文献"],
    ],
  },
  {
    key: "appendix", title: "附录、代码与图表", subtitle: "附录各区域、代码、图题和表题", open: false,
    roles: [
      ["appendixHeading", "附录标题", "附录Ⅰ、附录Ⅱ等标题"], ["appendixEnglish", "附录英文原文", "英文资料原文"],
      ["appendixTranslation", "附录中文翻译", "英文资料译文"], ["appendixCode", "附录程序代码", "附录中的代码和注释"],
      ["code", "正文程序代码", "正文中的代码段"], ["figureCaption", "图题", "图片下方的图号和说明"],
      ["tableCaption", "表题", "表格上方的表号和说明"],
    ],
  },
] as const;

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function cloneSpecification(value: PaperSpecification) {
  return JSON.parse(JSON.stringify(value)) as PaperSpecification;
}

function loadPaperFormatDraft() {
  const fallback = {
    paper: null as SelectedPaper | null,
    instructions: THESIS_PRESET,
    report: null as FormatReport | null,
    detectedSpecification: null as PaperSpecification | null,
    specification: null as PaperSpecification | null,
    configurationSource: null as ConfigurationSource,
    openGroups: ["page", "core", "abstract"],
  };
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PAPER_FORMAT_DRAFT_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    const paper = parsed.paper && typeof parsed.paper.path === "string" && typeof parsed.paper.name === "string" && parsed.paper.structure
      ? parsed.paper as SelectedPaper : null;
    const instructions = typeof parsed.instructions === "string" && parsed.instructions.trim() ? parsed.instructions.slice(0, 20_000) : THESIS_PRESET;
    const report = parsed.report && Array.isArray(parsed.report.rules) && Array.isArray(parsed.report.warnings) ? parsed.report as FormatReport : null;
    const specification = parsed.specification && typeof parsed.specification === "object" ? parsed.specification as PaperSpecification : null;
    const detectedSpecification = parsed.detectedSpecification && typeof parsed.detectedSpecification === "object" ? parsed.detectedSpecification as PaperSpecification : null;
    const configurationSource = parsed.configurationSource === "detected" || parsed.configurationSource === "imported" ? parsed.configurationSource as ConfigurationSource : null;
    const openGroups = Array.isArray(parsed.openGroups) ? parsed.openGroups.filter((value: unknown) => typeof value === "string").slice(0, 10) : fallback.openGroups;
    return { paper, instructions, report, detectedSpecification, specification, configurationSource, openGroups };
  } catch {
    return fallback;
  }
}

function setOptional<T extends object>(value: T, key: keyof T, next: unknown) {
  const copy = { ...value } as T;
  if (next === "" || next === undefined || next === null) delete copy[key];
  else (copy as Record<string, unknown>)[String(key)] = next;
  return copy;
}

function lineSpacingValue(rule: StyleRule) {
  if (!rule.lineSpacing) return "";
  return `${rule.lineSpacing.mode}:${rule.lineSpacing.value}`;
}

function indentValue(rule: StyleRule) {
  if (rule.hangingChars) return `hanging:${rule.hangingChars}`;
  if (rule.firstLineChars === 0) return "none";
  if (rule.firstLineChars) return `first:${rule.firstLineChars}`;
  return "";
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="paper-format-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function NumberField({ label, value, min, max, step = 0.1, suffix, onChange }: { label: string; value?: number; min: number; max: number; step?: number; suffix: string; onChange: (value?: number) => void }) {
  return <label className="paper-format-field"><span>{label}</span><span className="paper-format-number"><input type="number" value={value ?? ""} min={min} max={max} step={step} placeholder="保留" onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} /><small>{suffix}</small></span></label>;
}

function StyleRuleEditor({ label, description, rule, count, advanced, onChange }: { label: string; description: string; rule: StyleRule; count?: number; advanced?: boolean; onChange: (rule: StyleRule) => void }) {
  const setField = (key: keyof StyleRule, value: unknown) => onChange(setOptional(rule, key, value));
  const setIndent = (value: string) => {
    const next = { ...rule };
    delete next.firstLineChars; delete next.leftIndentChars; delete next.hangingChars;
    if (value === "none") next.firstLineChars = 0;
    else if (value.startsWith("first:")) next.firstLineChars = Number(value.split(":")[1]);
    else if (value.startsWith("hanging:")) {
      const amount = Number(value.split(":")[1]);
      next.firstLineChars = 0; next.leftIndentChars = amount; next.hangingChars = amount;
    }
    onChange(next);
  };
  const setLineSpacing = (value: string) => {
    if (!value) return setField("lineSpacing", undefined);
    const [mode, amount] = value.split(":");
    setField("lineSpacing", { mode, value: Number(amount) } as LineSpacing);
  };
  return (
    <article className="paper-format-rule-editor">
      <header><div><strong>{label}</strong><small>{description}</small></div><span className={count ? "detected" : "undetected"}>{count ? `识别到 ${count} 处` : "未识别到"}</span></header>
      <div className="paper-format-select-grid">
        <SelectField label="中文字体" value={rule.eastAsia || ""} onChange={(value) => setField("eastAsia", value)}>
          <option value="">保留原字体</option>{CJK_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
        </SelectField>
        <SelectField label="西文字体" value={rule.latin || ""} onChange={(value) => setField("latin", value)}>
          <option value="">保留原字体</option>{LATIN_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
        </SelectField>
        <SelectField label="字号" value={rule.sizePt === undefined ? "" : String(rule.sizePt)} onChange={(value) => setField("sizePt", value ? Number(value) : undefined)}>
          <option value="">保留原字号</option>{FONT_SIZES.map(([labelText, points]) => <option key={points} value={points}>{labelText}</option>)}
        </SelectField>
        <SelectField label="字形" value={rule.bold === undefined ? "" : String(rule.bold)} onChange={(value) => setField("bold", value === "" ? undefined : value === "true")}>
          <option value="">保留原字形</option><option value="true">加粗</option><option value="false">不加粗</option>
        </SelectField>
        <SelectField label="对齐方式" value={rule.alignment || ""} onChange={(value) => setField("alignment", value)}>
          <option value="">保留原对齐</option><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="both">两端对齐</option><option value="distribute">分散对齐</option>
        </SelectField>
        <SelectField label="特殊缩进" value={indentValue(rule)} onChange={setIndent}>
          <option value="">保留原缩进</option><option value="none">无缩进</option><option value="first:1">首行缩进 1 字符</option><option value="first:2">首行缩进 2 字符</option><option value="hanging:1">悬挂缩进 1 字符</option><option value="hanging:2">悬挂缩进 2 字符</option>
        </SelectField>
        <SelectField label="行距" value={lineSpacingValue(rule)} onChange={setLineSpacing}>
          <option value="">保留原行距</option><option value="multiple:1">单倍行距</option><option value="multiple:1.15">1.15 倍</option><option value="multiple:1.25">1.25 倍</option><option value="multiple:1.5">1.5 倍</option><option value="multiple:2">2 倍</option><option value="exact:18">固定 18 磅</option><option value="exact:20">固定 20 磅</option><option value="exact:22">固定 22 磅</option><option value="exact:24">固定 24 磅</option>
        </SelectField>
        <SelectField label="字体颜色" value={rule.color || ""} onChange={(value) => setField("color", value)}>
          <option value="">保留原颜色</option><option value="000000">黑色</option><option value="333333">深灰</option><option value="1F4E79">学术深蓝</option>
        </SelectField>
        <SelectField label="段前间距" value={rule.spaceBeforePt === undefined ? "" : String(rule.spaceBeforePt)} onChange={(value) => setField("spaceBeforePt", value ? Number(value) : undefined)}>
          <option value="">保留</option>{[0, 3, 6, 9, 12, 18, 24].map((value) => <option key={value} value={value}>{value} 磅</option>)}
        </SelectField>
        <SelectField label="段后间距" value={rule.spaceAfterPt === undefined ? "" : String(rule.spaceAfterPt)} onChange={(value) => setField("spaceAfterPt", value ? Number(value) : undefined)}>
          <option value="">保留</option>{[0, 3, 6, 9, 12, 18, 24].map((value) => <option key={value} value={value}>{value} 磅</option>)}
        </SelectField>
        {advanced && <>
          <SelectField label="章节分页" value={rule.pageBreakBefore === undefined ? "" : String(rule.pageBreakBefore)} onChange={(value) => setField("pageBreakBefore", value === "" ? undefined : value === "true")}>
            <option value="">保留</option><option value="true">标题前独立分页</option><option value="false">连续排版</option>
          </SelectField>
          <SelectField label="与下段同页" value={rule.keepNext === undefined ? "" : String(rule.keepNext)} onChange={(value) => setField("keepNext", value === "" ? undefined : value === "true")}>
            <option value="">保留</option><option value="true">防止标题落在页底</option><option value="false">允许分页分离</option>
          </SelectField>
        </>}
      </div>
    </article>
  );
}

export default function PaperFormatter({ language, notify }: Props) {
  const zh = language === "zh-CN";
  const tr = (cn: string, en: string) => zh ? cn : en;
  const initialDraft = useMemo(loadPaperFormatDraft, []);
  const [paper, setPaper] = useState<SelectedPaper | null>(initialDraft.paper);
  const [instructions, setInstructions] = useState(initialDraft.instructions);
  const [report, setReport] = useState<FormatReport | null>(initialDraft.report);
  const [detectedSpecification, setDetectedSpecification] = useState<PaperSpecification | null>(initialDraft.detectedSpecification);
  const [specification, setSpecification] = useState<PaperSpecification | null>(initialDraft.specification);
  const [configurationSource, setConfigurationSource] = useState<ConfigurationSource>(initialDraft.configurationSource);
  const [busy, setBusy] = useState<"select" | "analyze" | "export" | "config-import" | "config-export" | null>(null);
  const [openGroups, setOpenGroups] = useState(() => new Set(initialDraft.openGroups));

  useEffect(() => {
    try {
      sessionStorage.setItem(PAPER_FORMAT_DRAFT_KEY, JSON.stringify({
        paper,
        instructions,
        report,
        detectedSpecification,
        specification,
        configurationSource,
        openGroups: [...openGroups],
      }));
    } catch {
      // Session draft persistence is best-effort and never blocks formatting.
    }
  }, [paper, instructions, report, detectedSpecification, specification, configurationSource, openGroups]);

  const canUseDesktop = Boolean(window.paperLoom?.selectPaperForFormatting);
  const structureItems = useMemo(() => paper ? [
    { icon: FileText, label: tr("段落", "Paragraphs"), value: paper.structure.paragraphs },
    { icon: Table2, label: tr("表格", "Tables"), value: paper.structure.tables },
    { icon: Image, label: tr("图片", "Images"), value: paper.structure.images },
    { icon: Sigma, label: tr("公式", "Equations"), value: paper.structure.formulas },
    { icon: Layers, label: tr("节", "Sections"), value: paper.structure.sections },
  ] : [], [paper, language]);

  const resetAnalysis = () => { setReport(null); setSpecification(null); setDetectedSpecification(null); setConfigurationSource(null); };
  const selectPaper = async () => {
    if (!window.paperLoom?.selectPaperForFormatting || busy) {
      if (!canUseDesktop) notify(tr("论文格式编排仅在桌面版中可用", "Paper formatting is available in the desktop app"));
      return;
    }
    setBusy("select");
    try {
      const selected = await window.paperLoom.selectPaperForFormatting();
      if (!selected) return;
      setPaper(selected);
      if (configurationSource === "imported" && specification) {
        setReport((current) => current ? { ...current, structure: selected.structure } : {
          structure: selected.structure,
          rules: [tr("已载入共享格式配置，可直接导出或继续调整", "Shared formatting configuration loaded")],
          checks: [tr("配置与论文已就绪", "Configuration and paper are ready")],
          warnings: [tr("共享配置会另存为新 DOCX，不覆盖原论文。", "The shared configuration exports a new DOCX without overwriting the original.")],
          semanticSections: {},
          specification,
        });
      } else {
        resetAnalysis();
      }
      notify(tr("论文已导入，原文件不会被修改", "Paper imported; the original file will not be changed"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("论文导入失败", "Could not import the paper"));
    } finally { setBusy(null); }
  };

  const analyzeFormatting = async () => {
    if (!paper || !instructions.trim() || !window.paperLoom?.analyzePaperFormatting || busy) return;
    setBusy("analyze");
    try {
      const next = await window.paperLoom.analyzePaperFormatting({ path: paper.path, instructions });
      const detected = cloneSpecification(next.specification || {});
      setReport(next); setDetectedSpecification(detected); setSpecification(cloneSpecification(detected));
      setConfigurationSource("detected");
      notify(tr("已生成逐项格式建议，请用下拉菜单确认", "Formatting suggestions are ready for review"));
    } catch (error) {
      resetAnalysis();
      notify(error instanceof Error ? error.message : tr("无法解析格式说明", "Could not parse the formatting instructions"));
    } finally { setBusy(null); }
  };

  const exportPaper = async () => {
    if (!paper || !specification || !window.paperLoom?.exportFormattedPaper || busy) return;
    setBusy("export");
    try {
      const result = await window.paperLoom.exportFormattedPaper({ path: paper.path, instructions, suggestedName: paper.name, specification });
      setReport(result.report);
      if (result.saved) notify(tr("已按确认后的选项导出 Word 论文", "The formatted Word paper was exported"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("论文排版导出失败", "Could not export the formatted paper"));
    } finally { setBusy(null); }
  };

  const applyPreset = (preset: string) => { setInstructions(preset); resetAnalysis(); };

  const importConfiguration = async () => {
    if (!window.paperLoom?.importPaperFormatConfiguration || busy) return;
    setBusy("config-import");
    try {
      const imported = await window.paperLoom.importPaperFormatConfiguration();
      if (!imported) return;
      const nextSpecification = cloneSpecification(imported.specification);
      setInstructions(imported.instructions);
      setSpecification(nextSpecification);
      setDetectedSpecification(cloneSpecification(nextSpecification));
      setConfigurationSource("imported");
      setReport({
        structure: paper?.structure || EMPTY_STRUCTURE,
        rules: [tr(`共享配置“${imported.name}”已载入`, `Shared configuration “${imported.name}” loaded`)],
        checks: [paper ? tr("配置与论文已就绪，可以一键导出", "Configuration and paper are ready to export") : tr("请再导入一篇 DOCX 论文", "Now import a DOCX paper")],
        warnings: [tr("配置只包含排版规则，不包含原作者的论文正文或文件路径。", "The configuration contains formatting rules only, not paper text or file paths.")],
        semanticSections: {},
        specification: nextSpecification,
      });
      notify(tr("共享格式配置已导入", "Shared formatting configuration imported"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("格式配置导入失败", "Could not import the formatting configuration"));
    } finally { setBusy(null); }
  };

  const exportConfiguration = async () => {
    if (!specification || !window.paperLoom?.exportPaperFormatConfiguration || busy) return;
    setBusy("config-export");
    try {
      const result = await window.paperLoom.exportPaperFormatConfiguration({
        name: paper ? paper.name.replace(/\.docx$/i, "-格式配置") : tr("论文格式配置", "Paper formatting configuration"),
        instructions,
        specification,
      });
      if (result.saved) notify(tr("格式配置已导出，可以发送给其他 PaperLoom 用户", "Formatting configuration exported and ready to share"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("格式配置导出失败", "Could not export the formatting configuration"));
    } finally { setBusy(null); }
  };
  const updateRule = (key: string, rule: StyleRule) => setSpecification((current) => current ? { ...current, [key]: rule } : current);
  const page = specification?.page || {};
  const header = specification?.header || { style: {} };
  const pagination = specification?.pagination || {};
  const toc = specification?.toc || {};
  const figures = specification?.figures || {};
  const updatePage = (next: PageSpecification) => setSpecification((current) => current ? { ...current, page: next } : current);
  const updateHeader = (next: HeaderSpecification) => setSpecification((current) => current ? { ...current, header: next } : current);
  const updatePagination = (next: PaginationSpecification) => setSpecification((current) => current ? { ...current, pagination: next } : current);
  const pageSize = Math.abs((page.widthCm || 0) - 21) < 0.1 && Math.abs((page.heightCm || 0) - 29.7) < 0.1 ? "a4"
    : Math.abs((page.widthCm || 0) - 14.8) < 0.1 && Math.abs((page.heightCm || 0) - 21) < 0.1 ? "a5"
      : Math.abs((page.widthCm || 0) - 17.6) < 0.1 && Math.abs((page.heightCm || 0) - 25) < 0.1 ? "b5" : "custom";
  const selectedCount = report?.semanticSections ? Object.values(report.semanticSections).reduce((sum, value) => sum + value, 0) : 0;
  const toggleGroup = (key: string, open: boolean) => setOpenGroups((current) => {
    if (current.has(key) === open) return current;
    const next = new Set(current);
    if (open) next.add(key); else next.delete(key);
    return next;
  });

  return (
    <div className="paper-formatter">
      <header className="utilities-hero paper-format-hero">
        <div className="paper-format-hero-mark"><WandSparkles size={30} /></div>
        <div><span className="eyebrow">PAPER FORMAT STUDIO · {tr("论文格式编排", "PAPER FORMAT STUDIO")}</span><h1>{tr("识别结构，逐项确认，再安全排版", "Detect, review and safely format")}</h1><p>{tr("先根据格式说明生成建议，再用下拉菜单精确确认每个论文区域。导出完全以确认后的选项为准。", "Generate suggestions from the requirements, then confirm every paper section with precise controls.")}</p></div>
        <span className="formula-local-badge"><ShieldCheck size={14} />{tr("本地暂存 · 切换不丢失", "Locally saved · safe to switch tools")}</span>
      </header>

      <div className="paper-format-layout">
        <div className="paper-format-main">
          <section className="paper-format-card import-card">
            <header><span className="paper-format-step">01</span><div><span className="eyebrow">SOURCE DOCUMENT</span><h2>{tr("导入论文文件", "Import the paper")}</h2></div><FileText size={22} /></header>
            {!paper ? <button className="paper-format-drop-zone" type="button" onClick={() => void selectPaper()} disabled={Boolean(busy)}>{busy === "select" ? <LoaderCircle size={27} className="spin" /> : <Upload size={27} />}<strong>{tr("选择需要修改格式的 DOCX 论文", "Choose a DOCX paper to format")}</strong><small>{tr("当前版本仅处理可编辑 Word 文件 · 最大 200 MB", "Editable Word files only · up to 200 MB")}</small></button> :
              <div className="paper-format-file"><span className="paper-format-file-icon"><FileText size={24} /></span><div className="paper-format-file-meta"><strong>{paper.name}</strong><small>{formatBytes(paper.size)} · {tr("原文件只读", "Original stays untouched")}</small></div><button type="button" onClick={() => void selectPaper()} disabled={Boolean(busy)}>{tr("更换文件", "Change")}</button><div className="paper-format-structure">{structureItems.map((item) => { const Icon = item.icon; return <span key={item.label}><Icon size={14} /><strong>{item.value}</strong><small>{item.label}</small></span>; })}</div></div>}
          </section>

          <section className="paper-format-card instructions-card">
            <header><span className="paper-format-step">02</span><div><span className="eyebrow">FORMAT REQUIREMENTS</span><h2>{tr("提供格式说明并自动识别", "Provide and detect requirements")}</h2></div><Type size={22} /></header>
            <div className="paper-format-presets"><span>{tr("快速模板", "Quick presets")}</span><button type="button" onClick={() => applyPreset(THESIS_PRESET)}>{tr("中文学位论文", "Chinese thesis")}</button><button type="button" onClick={() => applyPreset(`${FULL_DEGREE_PRESET} 使用二本页眉，二本为“太原科技大学学士学位论文”。`)}>{tr("太原科大本科", "TYUST bachelor")}</button><button type="button" onClick={() => applyPreset(`${FULL_DEGREE_PRESET} 使用三本页眉，三本为“太原科技大学华科学院学士学位论文”。`)}>{tr("华科学院本科", "Huake bachelor")}</button><button type="button" onClick={() => applyPreset(JOURNAL_PRESET)}>{tr("期刊简洁格式", "Compact journal")}</button><button type="button" onClick={() => applyPreset(REVIEW_PRESET)}>{tr("综述论文", "Review paper")}</button></div>
            <div className="paper-format-share-panel">
              <div><strong>{tr("共享格式配置", "Share formatting configuration")}</strong><small>{tr("导入别人调好的 .plformat 配置，或把当前配置导出给其他用户。配置文件不包含论文正文。", "Import a reviewed .plformat file or export the current rules. Paper text is never included.")}</small></div>
              <div>
                <button type="button" onClick={() => void importConfiguration()} disabled={Boolean(busy)}>{busy === "config-import" ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{tr("导入配置", "Import configuration")}</button>
                <button type="button" className="accent" onClick={() => void exportConfiguration()} disabled={!specification || Boolean(busy)}>{busy === "config-export" ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}{tr("导出当前配置", "Export current configuration")}</button>
              </div>
            </div>
            <textarea value={instructions} onChange={(event) => { setInstructions(event.target.value); resetAnalysis(); }} placeholder={tr("粘贴学校或期刊的完整格式要求……", "Paste the complete formatting requirements…")} rows={8} />
            <div className="paper-format-supported"><span><Ruler size={14} />{tr("页面与页边距", "Page and margins")}</span><span><Type size={14} />{tr("字体字号", "Fonts and sizes")}</span><span><AlignJustify size={14} />{tr("行距缩进与对齐", "Spacing and alignment")}</span><span><Layers size={14} />{tr("目录与三级标题", "TOC and headings")}</span><span><FileText size={14} />{tr("摘要、页眉和页码", "Abstracts, header and pages")}</span><span><Image size={14} />{tr("图表、附录和代码", "Figures, appendices and code")}</span></div>
            <div className="paper-format-card-actions"><p><ShieldCheck size={14} />{tr("自动识别只生成初始建议，下一步的下拉选项才是最终执行标准。", "Detection creates suggestions; the controls in the next step are authoritative.")}</p><button className="primary" type="button" disabled={!paper || !instructions.trim() || Boolean(busy)} onClick={() => void analyzeFormatting()}>{busy === "analyze" ? <LoaderCircle size={16} className="spin" /> : <WandSparkles size={16} />}{tr("识别并生成格式清单", "Detect formatting checklist")}</button></div>
          </section>

          {report && specification && <section className="paper-format-card paper-format-configurator">
            <header><span className="paper-format-step complete"><Settings2 size={15} /></span><div><span className="eyebrow">REVIEW & CONFIRM</span><h2>{tr("逐项确认最终格式", "Review every final setting")}</h2></div><button className="paper-format-reset" type="button" disabled={!detectedSpecification} onClick={() => detectedSpecification && setSpecification(cloneSpecification(detectedSpecification))}><RotateCcw size={15} />{configurationSource === "imported" ? tr("恢复导入配置", "Reset imported configuration") : tr("恢复识别建议", "Reset suggestions")}</button></header>
            <div className="paper-format-config-summary"><div><strong>{selectedCount}</strong><span>{tr("个文档区域已分类", "document areas classified")}</span></div><p><Check size={15} />{tr("每个下拉菜单都可选择“保留原格式”；未识别到的区域也可以手动指定。", "Every control can preserve the original; undetected sections remain configurable.")}</p></div>

            <details className="paper-format-config-group" open={openGroups.has("page")} onToggle={(event) => toggleGroup("page", event.currentTarget.open)}>
              <summary><div><Ruler size={18} /><span><strong>{tr("页面、页眉与页码", "Page, header and page numbers")}</strong><small>{tr("纸张、方向、页边距、目录层级、分节页码和图片尺寸", "Paper, margins, TOC depth, numbering and figures")}</small></span></div><span>12+ {tr("项设置", "settings")}</span></summary>
              <div className="paper-format-page-grid">
                <SelectField label="纸张大小" value={pageSize} onChange={(value) => { const sizes: Record<string, [number, number]> = { a4: [21, 29.7], a5: [14.8, 21], b5: [17.6, 25] }; updatePage(value === "custom" ? setOptional(setOptional(page, "widthCm", undefined), "heightCm", undefined) : { ...page, widthCm: sizes[value][0], heightCm: sizes[value][1] }); }}><option value="custom">保留/自定义</option><option value="a4">A4 · 210 × 297 mm</option><option value="a5">A5 · 148 × 210 mm</option><option value="b5">B5 · 176 × 250 mm</option></SelectField>
                <SelectField label="页面方向" value={page.orientation || ""} onChange={(value) => updatePage(setOptional(page, "orientation", value))}><option value="">保留原方向</option><option value="portrait">纵向</option><option value="landscape">横向</option></SelectField>
                <SelectField label="单双面版式" value={page.singleSided === undefined ? "" : String(page.singleSided)} onChange={(value) => updatePage(setOptional(page, "singleSided", value === "" ? undefined : value === "true"))}><option value="">保留原设置</option><option value="true">单面（取消镜像页边距）</option><option value="false">双面/允许镜像页边距</option></SelectField>
                <SelectField label="目录显示级别" value={toc.levels ? String(toc.levels) : ""} onChange={(value) => setSpecification((current) => current ? { ...current, toc: { ...toc, levels: value ? Number(value) : undefined, updateFields: true } } : current)}><option value="">保留现有目录</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level} 级标题</option>)}</SelectField>
                <NumberField label="纸张宽度" value={page.widthCm} min={10} max={60} suffix="cm" onChange={(value) => updatePage(setOptional(page, "widthCm", value))} />
                <NumberField label="纸张高度" value={page.heightCm} min={10} max={60} suffix="cm" onChange={(value) => updatePage(setOptional(page, "heightCm", value))} />
                <NumberField label="上边距" value={page.marginTopCm} min={0.5} max={10} suffix="cm" onChange={(value) => updatePage(setOptional(page, "marginTopCm", value))} />
                <NumberField label="下边距" value={page.marginBottomCm} min={0.5} max={10} suffix="cm" onChange={(value) => updatePage(setOptional(page, "marginBottomCm", value))} />
                <NumberField label="左边距" value={page.marginLeftCm} min={0.5} max={10} suffix="cm" onChange={(value) => updatePage(setOptional(page, "marginLeftCm", value))} />
                <NumberField label="右边距" value={page.marginRightCm} min={0.5} max={10} suffix="cm" onChange={(value) => updatePage(setOptional(page, "marginRightCm", value))} />
                <NumberField label="页眉距边界" value={page.headerDistanceCm} min={0.2} max={8} suffix="cm" onChange={(value) => updatePage(setOptional(page, "headerDistanceCm", value))} />
                <NumberField label="页脚距边界" value={page.footerDistanceCm} min={0.2} max={8} suffix="cm" onChange={(value) => updatePage(setOptional(page, "footerDistanceCm", value))} />
              </div>
              <div className="paper-format-subsection"><h3>{tr("页眉", "Header")}</h3><div className="paper-format-page-grid">
                <SelectField label="页眉处理" value={header.mode || (header.text ? "text" : "style")} onChange={(value) => updateHeader(value === "preserve" ? { mode: "preserve", style: {} } : value === "remove" ? { mode: "remove", style: {} } : { ...header, mode: value as HeaderSpecification["mode"] })}><option value="preserve">完全保留原页眉</option><option value="style">保留文字，仅调整样式</option><option value="text">使用指定页眉文字</option><option value="remove">删除页眉</option></SelectField>
                <SelectField label="页眉横线" value={header.bottomBorder === undefined ? "" : String(header.bottomBorder)} onChange={(value) => updateHeader(setOptional(header, "bottomBorder", value === "" ? undefined : value === "true"))}><option value="">保留</option><option value="true">显示横线</option><option value="false">不显示横线</option></SelectField>
                {(header.mode === "text" || (!header.mode && header.text)) && <label className="paper-format-field span-two"><span>页眉文字</span><input value={header.text || ""} maxLength={200} onChange={(event) => updateHeader({ ...header, mode: "text", text: event.target.value })} placeholder="输入学校要求的页眉" /></label>}
              </div>{header.mode !== "remove" && header.mode !== "preserve" && <StyleRuleEditor label="页眉文字格式" description="页眉字体、字号、对齐和行距" rule={header.style || {}} onChange={(style) => updateHeader({ ...header, style })} />}</div>
              <div className="paper-format-subsection"><h3>{tr("分节页码", "Section page numbers")}</h3><div className="paper-format-page-grid">
                <SelectField label="正文前页码" value={pagination.frontFormat || (pagination.frontMatterRoman ? "lowerRoman" : "preserve")} onChange={(value) => { const next = { ...pagination, frontFormat: value }; delete next.frontMatterRoman; updatePagination(next); }}><option value="preserve">保留原页码</option><option value="none">不显示页码</option><option value="lowerRoman">小写罗马 · i</option><option value="upperRoman">大写罗马 · I</option><option value="decimal">阿拉伯数字 · 1</option><option value="upperLetter">大写字母 · A</option></SelectField>
                <SelectField label="正文页码" value={pagination.bodyFormat || (pagination.bodyArabic ? "decimal" : "preserve")} onChange={(value) => { const next = { ...pagination, bodyFormat: value }; delete next.bodyArabic; updatePagination(next); }}><option value="preserve">保留原页码</option><option value="none">不显示页码</option><option value="decimal">阿拉伯数字 · 1</option><option value="lowerRoman">小写罗马 · i</option><option value="upperRoman">大写罗马 · I</option><option value="upperLetter">大写字母 · A</option></SelectField>
                <SelectField label="页码位置" value={pagination.alignment || (pagination.centered ? "center" : "")} onChange={(value) => updatePagination(setOptional(pagination, "alignment", value))}><option value="">保留</option><option value="left">底端左侧</option><option value="center">底端居中</option><option value="right">底端右侧</option></SelectField>
                <SelectField label="页码字号" value={pagination.sizePt ? String(pagination.sizePt) : ""} onChange={(value) => updatePagination(setOptional(pagination, "sizePt", value ? Number(value) : undefined))}><option value="">保留</option>{FONT_SIZES.map(([labelText, points]) => <option key={points} value={points}>{labelText}</option>)}</SelectField>
                <SelectField label="页码中文字体" value={pagination.eastAsia || ""} onChange={(value) => updatePagination(setOptional(pagination, "eastAsia", value))}><option value="">保留</option>{CJK_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}</SelectField>
                <SelectField label="页码西文字体" value={pagination.latin || ""} onChange={(value) => updatePagination(setOptional(pagination, "latin", value))}><option value="">保留</option>{LATIN_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}</SelectField>
                <NumberField label="正文前起始页码" value={pagination.frontStart} min={1} max={9999} step={1} suffix="" onChange={(value) => updatePagination(setOptional(pagination, "frontStart", value))} />
                <NumberField label="正文起始页码" value={pagination.bodyStart} min={1} max={9999} step={1} suffix="" onChange={(value) => updatePagination(setOptional(pagination, "bodyStart", value))} />
              </div></div>
              <div className="paper-format-subsection"><h3>{tr("图片限制", "Figure limits")}</h3><div className="paper-format-page-grid"><NumberField label="最大宽度" value={figures.maxWidthCm} min={1} max={50} suffix="cm" onChange={(value) => setSpecification((current) => current ? { ...current, figures: setOptional(figures, "maxWidthCm", value) } : current)} /><NumberField label="最大高度" value={figures.maxHeightCm} min={1} max={50} suffix="cm" onChange={(value) => setSpecification((current) => current ? { ...current, figures: setOptional(figures, "maxHeightCm", value) } : current)} /><SelectField label="图片对齐" value={figures.centered === undefined ? "" : String(figures.centered)} onChange={(value) => setSpecification((current) => current ? { ...current, figures: setOptional(figures, "centered", value === "" ? undefined : value === "true") } : current)}><option value="">保留</option><option value="true">居中</option><option value="false">保留原位置</option></SelectField></div></div>
            </details>

            {STYLE_GROUPS.map((group) => <details className="paper-format-config-group" open={openGroups.has(group.key)} onToggle={(event) => toggleGroup(group.key, event.currentTarget.open)} key={group.key}><summary><div><Type size={18} /><span><strong>{tr(group.title, group.title)}</strong><small>{tr(group.subtitle, group.subtitle)}</small></span></div><span>{group.roles.length} {tr("类内容", "roles")}</span></summary><div className="paper-format-rule-stack">{group.roles.map(([key, label, description]) => <StyleRuleEditor key={key} label={tr(label, label)} description={tr(description, description)} count={report.semanticSections?.[key]} advanced={["heading1", "heading2", "heading3", "endMatterHeading", "appendixHeading"].includes(key)} rule={(specification[key] as StyleRule | undefined) || {}} onChange={(rule) => updateRule(key, rule)} />)}</div></details>)}

            {!!report.checks?.length && <div className="paper-format-checks">{report.checks.map((check) => <p key={check}><Check size={14} />{check}</p>)}</div>}
            <div className="paper-format-warnings">{report.warnings.map((warning) => <p key={warning}><AlertTriangle size={14} />{warning}</p>)}</div>
          </section>}
        </div>

        <aside className="paper-format-export"><section><span className="eyebrow">SAFE OUTPUT</span><h2>{tr("导出确认后的结果", "Export confirmed settings")}</h2><div className="paper-format-output-preview"><span><FileText size={29} /></span><strong>{paper ? paper.name.replace(/\.docx$/i, "-已排版.docx") : tr("等待导入论文", "Waiting for a paper")}</strong><small>.DOCX · {tr("保持可编辑", "remains editable")}</small></div><ul><li><Check size={14} />{tr("不会覆盖原论文", "Never overwrites the original")}</li><li><Check size={14} />{tr("以逐项确认结果为准", "Uses reviewed settings")}</li><li><Check size={14} />{tr("保留图片、表格和公式", "Preserves images, tables and equations")}</li></ul><button className="paper-format-export-button" type="button" disabled={!paper || !specification || Boolean(busy)} onClick={() => void exportPaper()}>{busy === "export" ? <LoaderCircle size={18} className="spin" /> : <Download size={18} />}{busy === "export" ? tr("正在生成已排版论文…", "Formatting the paper…") : tr("按确认设置导出 DOCX", "Export reviewed DOCX")}</button>{paper && !specification && <p className="paper-format-export-hint">{tr("请先识别要求并逐项确认格式。", "Detect and review the formatting settings first.")}</p>}</section><section className="paper-format-future"><span className="eyebrow">HOW IT WORKS</span><h3>{tr("识别负责起点，选项决定结果", "Suggestions first, controls final")}</h3><p>{tr("当自动识别不准确时，无需反复修改说明文字；直接在相应论文区域选择正确的字体、字号、缩进、行距、分页或页码格式即可。", "If detection misses a detail, simply correct that section with the controls instead of rewriting the requirements.")}</p></section></aside>
      </div>
    </div>
  );
}
