export function createDocumentExcerpt(text: string, maxLength: number) {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return normalized;

  const divider = "\n\n[…论文中间内容已智能抽样…]\n\n";
  const segmentLength = Math.floor((maxLength - divider.length * 2) / 3);
  const middleStart = Math.max(segmentLength, Math.floor(normalized.length / 2 - segmentLength / 2));

  return [
    normalized.slice(0, segmentLength),
    normalized.slice(middleStart, middleStart + segmentLength),
    normalized.slice(-segmentLength),
  ].join(divider);
}

export function createParagraphExcerpt(paragraphs: string[], maxLength: number) {
  const values = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!values.length || maxLength <= 0) return "";
  const totalLength = values.reduce((total, paragraph) => total + paragraph.length + 2, 0);
  if (totalLength <= maxLength) return values.join("\n\n");

  const divider = "\n\n[…长文档中间内容已智能抽样…]\n\n";
  const segmentLength = Math.max(200, Math.floor((maxLength - divider.length * 2) / 3));
  const collect = (startIndex: number, direction: 1 | -1) => {
    const selected: string[] = [];
    let length = 0;
    for (
      let index = startIndex;
      index >= 0 && index < values.length && length < segmentLength;
      index += direction
    ) {
      const value = values[index];
      const remaining = segmentLength - length;
      selected.push(value.length > remaining ? value.slice(0, remaining) : value);
      length += Math.min(value.length, remaining) + 2;
    }
    return direction === 1 ? selected.join("\n\n") : selected.reverse().join("\n\n");
  };

  let accumulated = 0;
  let middleIndex = Math.floor(values.length / 2);
  for (let index = 0; index < values.length; index += 1) {
    accumulated += values[index].length + 2;
    if (accumulated >= totalLength / 2) {
      middleIndex = index;
      break;
    }
  }

  return [
    collect(0, 1),
    collect(middleIndex, 1),
    collect(values.length - 1, -1),
  ].join(divider).slice(0, maxLength);
}
