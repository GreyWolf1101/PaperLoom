const fs = require("node:fs");
const path = require("node:path");

const outputPath = path.resolve(
  process.argv[2] || path.join(__dirname, "fixtures", "long-reading-performance.txt"),
);
const paragraphCount = Math.max(100, Number(process.argv[3]) || 6000);
const paragraphs = Array.from({ length: paragraphCount }, (_, index) => {
  const chapter = Math.floor(index / 120) + 1;
  if (index % 120 === 0) return `第 ${chapter} 章 长文档性能测试`;
  return `第 ${index + 1} 段：这是用于验证 PaperLoom 长篇文档虚拟渲染、滚动、目录跳转、搜索和阅读位置恢复的测试文字。段落编号 ${index + 1}，章节编号 ${chapter}。`;
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, paragraphs.join("\n\n"), "utf8");
console.log(JSON.stringify({
  outputPath,
  paragraphCount,
  bytes: fs.statSync(outputPath).size,
}));
