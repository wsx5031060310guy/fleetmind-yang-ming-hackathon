export function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[,"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(...cells) {
  return `${cells.map(csvCell).join(",")}\n`;
}
