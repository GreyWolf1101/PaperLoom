# 为 PaperLoom 贡献

感谢你愿意改进 PaperLoom。提交代码前，请先搜索现有 Issue，避免重复工作；较大的功能或架构调整建议先创建功能建议并说明使用场景、交互方案和兼容性影响。

## 本地环境

- Windows 10/11
- Node.js 22 或更高版本
- npm

```bash
npm install
npm run dev
```

## 提交前检查

```bash
npm test
npm run build
npm audit --omit=dev
```

请确保：

- 不提交 API Key、Token、密码、个人文献或用户数据。
- 不提交 `node_modules`、`dist`、安装包、便携版和 Release 文件。
- 新功能包含必要测试，并兼顾简体中文和英文界面。
- PDF、EPUB、DOCX 等长文档改动需要验证性能和阅读位置恢复。
- UI 改动应保持论文阅读与文章小说阅读两种主题的一致性。

## Pull Request

PR 应说明问题、解决方案、验证方式和界面变化；如涉及 UI，请附截图。一次 PR 尽量只解决一类问题。

提交贡献即表示你有权提交相关代码，并同意贡献内容以 `GPL-3.0-only` 许可证发布。
