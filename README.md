# PaperLoom

[![Latest Release](https://img.shields.io/github/v/release/GreyWolf1101/PaperLoom-Releases?label=最新版&color=c65d45)](https://github.com/GreyWolf1101/PaperLoom-Releases/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-2f6f9f)](https://github.com/GreyWolf1101/PaperLoom-Releases/releases/latest)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-58705d.svg)](./LICENSE)

PaperLoom 是一款本地优先的 Windows 桌面阅读与研究工作台，面向论文研究、长文阅读、书籍管理和 AI 辅助创作。

## 下载 PaperLoom

软件下载、便携版、安装版、校验文件和更新说明统一发布在独立的 Releases 仓库。下面的永久入口会自动指向最新版本，无需随版本号修改：

### **[打开“全部版本与更新说明”官方下载页面](https://github.com/GreyWolf1101/PaperLoom-Releases/releases/latest)**

进入页面后，在最新版本的 **Assets** 区域选择便携版 ZIP 或 Windows 安装包即可。

系统要求：Windows 10 / 11，64 位。应用暂未配置商业代码签名证书，因此 Windows 首次运行时可能显示“未知发布者”。

安装版可以在“设置中心 → 版本与更新”中自动检查、下载并安装新版本。便携版也可以检查更新，完成更新时会迁移到正式安装版；本地文献、笔记、阅读位置和设置不会因此丢失。

## PaperLoom 能做什么

### 论文与文献阅读

- 支持 PDF 和 DOCX，PDF 按原始页面渲染，保留图片、图表、公式和版式。
- 读取原始目录；没有目录时自动识别三级标题，并绑定到准确的文中位置。
- 支持全文搜索、阅读位置恢复、页面缩放、重点标记和文本复制。
- 选中文本后可以翻译、生成选段总结或保存为研究证据。
- 翻译和选段总结可显示在原文下方或页面侧边，并可点击笔记返回原文。
- 支持框选文献区域截图，按文献保存到图库并跳回截图位置。

### AI 阅读助手与研究工作台

- 生成全文总结，并以 Markdown 友好格式显示标题、列表和重点内容。
- 研究项目可以组织研究问题、项目文献、证据卡片和论文对比矩阵。
- 支持跨文献本地检索、引用导航、可追溯综合报告和 Markdown 研究包导出。
- AI 只处理用户主动提交的文本，不会自动上传整篇论文或书籍。

### 论文格式编排

- 导入可编辑 DOCX 论文，根据学校或期刊说明生成逐项可确认的排版清单。
- 分别设置正文、各级标题、摘要、目录、参考文献、附录、代码、图题和表题。
- 支持字体、字号、行距、缩进、对齐、分页、页边距、页眉、分节页码、目录级数和图表编号。
- 工具切换期间保留论文和当前设置，前往公式工坊后返回不会恢复初始状态。
- 可导入或导出 `.plformat` 格式配置；配置不包含论文正文和本地路径，适合在同学、课题组或学院模板之间共享。

### 公式工坊

- 上传、拖入或粘贴印刷公式和手写公式截图，识别为可编辑 LaTeX。
- 使用自然语言描述生成公式，或通过可视化公式键盘编写上下标、分式、根式、求和、积分、分段函数和矩阵。
- 所见即所得数学画布与 LaTeX 源码实时同步，点击公式中的数字、符号或空位即可编辑。
- 支持复制 LaTeX、MathML，以及导出包含 Word 原生 OMML 公式和公式编号的 DOCX。
- 公式编辑、排版和 Word 导出均在本地完成；只有主动识别图片时才调用用户配置的 AI 服务。

### 书籍与小说阅读

- 支持 EPUB、TXT、Markdown、HTML、FB2、PDF 和 DOCX。
- 读取 EPUB 书名、作者、出版社、原生章节目录和书内注释链接。
- 没有原生目录的文本书籍会按章节标题自动生成目录。
- 按书保存阅读位置，重启后恢复上次阅读的书籍和位置。
- 可重排格式分别提供文字缩放与页面缩放，PDF 使用页面缩放。

### AI 小说创作

- 每部作品拥有独立书稿和会话，可在多部正在创作的作品之间切换。
- 创作、讨论和重写选段相互独立，但围绕同一部作品工作。
- 支持停止生成、继续输入新指令、选段提问和一键替换重写内容。
- AI 生成书名后自动命名作品，正文以书页形式排版，并支持文字与页面双缩放。

### 学术发现与书籍搜索

- 在软件内检索 OpenAlex、Crossref、Semantic Scholar 和 PubMed 的公开文献元数据。
- 保留中国知网、万方、Google Scholar、arXiv、IEEE Xplore、ScienceDirect 和 Springer Nature 的官网入口。
- 书籍搜索支持 Open Library、Google Books、Project Gutenberg 和 Internet Archive。
- PaperLoom 不绕过付费墙、机构权限、版权限制或下载权限，阅读与下载仍由对应官网决定。

## AI、翻译与隐私

- AI 功能支持 OpenAI 兼容接口，也可以连接本机 Ollama 或 LM Studio。
- 翻译支持 AI 模型翻译，以及 MyMemory、百度翻译、网易有道翻译、DeepL API Free、Microsoft Translator 和 Google Cloud Translation。
- API Key 使用 Electron `safeStorage` 加密保存在当前电脑，AI Key 与翻译密钥相互独立。
- PDF、Word、EPUB 和其他原文件默认只在本地解析。
- 只有用户主动执行总结、翻译、公式识别或 AI 创作时，相应内容才会发送到用户选择的服务商。

## 0.9.5 更新重点

- 新增论文格式编排工具与逐项格式确认界面。
- 新增 `.plformat` 配置导入、导出和安全共享。
- 修复切换实用工具后论文与格式设置丢失的问题。
- 放大格式工具的文字和操作控件，并保持响应式布局。
- 0.9.4 → 0.9.5 支持基于 blockmap 的小版本差分更新。

完整更新记录和历史安装包请查看 [PaperLoom Releases](https://github.com/GreyWolf1101/PaperLoom-Releases/releases)。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
git clone https://github.com/GreyWolf1101/PaperLoom.git
cd PaperLoom
npm install
npm run dev
```

运行测试：

```bash
npm test
```

构建未安装的 Windows 应用目录：

```bash
npm run dist:portable
```

构建 NSIS 安装包和自动更新文件：

```bash
npm run dist:update
```

发布流程和差分更新要求见 [自动更新发布指南](./自动更新发布指南.md)。

## 仓库说明

- 当前仓库保存 PaperLoom 源码、测试和开发文档。
- 安装包、便携版、blockmap 与 `latest.yml` 发布在独立的 [PaperLoom-Releases](https://github.com/GreyWolf1101/PaperLoom-Releases) 仓库。
- `release/`、`dist/`、依赖目录、本地配置、日志和打包产物不会提交到源码仓库。

## 参与贡献

欢迎提交 Issue 和 Pull Request。开始前请阅读：

- [贡献指南](./CONTRIBUTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)
- [安全政策](./SECURITY.md)

## 开源许可

PaperLoom 以 [GNU General Public License v3.0 only](./LICENSE) 发布。你可以使用、研究、修改和再分发源码；发布修改版或衍生版时，需要继续遵守 GPL-3.0-only 的源码提供与同许可证要求。

第三方组件仍遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
