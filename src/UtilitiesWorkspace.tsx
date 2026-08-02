import { Plus, Wrench } from "lucide-react";
import type { AppLanguage } from "./models";

type UtilitiesWorkspaceProps = {
  language: AppLanguage;
};

export default function UtilitiesWorkspace({ language }: UtilitiesWorkspaceProps) {
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);

  return (
    <section className="utilities-workspace">
      <header className="utilities-hero">
        <div>
          <span className="eyebrow">{tr("RESEARCH TOOLBOX · 实用工具", "RESEARCH TOOLBOX · UTILITIES")}</span>
          <h1>{tr("实用工具", "Utilities")}</h1>
          <p>{tr(
            "这里用于集中放置轻量、独立的研究辅助工具，不会与文献库或研究项目数据混在一起。",
            "This space is reserved for lightweight, standalone research utilities, separate from your library and research projects.",
          )}</p>
        </div>
      </header>

      <div className="utilities-empty-state">
        <span className="utilities-empty-icon"><Wrench size={28} /></span>
        <span className="eyebrow">{tr("TOOLBOX READY", "TOOLBOX READY")}</span>
        <h2>{tr("工具箱暂时为空", "The toolbox is empty for now")}</h2>
        <p>{tr(
          "后续新增的小工具会从这里进入。当前页面只保留清晰的扩展入口，不提供尚未成熟或意义不明确的功能。",
          "Future utilities will appear here. For now, this page remains a clear extension point without unfinished or ambiguous features.",
        )}</p>
        <div className="utilities-coming-soon">
          <Plus size={15} />
          <span>{tr("等待添加下一项实用工具", "Ready for the next utility")}</span>
        </div>
      </div>
    </section>
  );
}
