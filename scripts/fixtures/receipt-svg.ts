export const DEFAULT_RECEIPT_SVG_OPTIONS: ReceiptSvgOptions = {
  paperWidth: 560,
  margin: 20,
  padding: 28,
  fontSize: 22,
  lineHeight: 34,
  paper: '#ffffff',
  ink: '#1a1a1a',
  background: '#ffffff',
  rotateDegrees: 0,
};

export interface ReceiptSvgOptions {
  paperWidth: number;
  margin: number;
  padding: number;
  fontSize: number;
  lineHeight: number;
  paper: string;
  ink: string;
  background: string;
  rotateDegrees: number;
}

export interface ReceiptSvg {
  svg: string;
  width: number;
  height: number;
}

/** A receipt as an SVG: monospace lines on a paper rectangle, optionally rotated on a background. */
export function buildReceiptSvg(
  lines: readonly string[],
  options: ReceiptSvgOptions = DEFAULT_RECEIPT_SVG_OPTIONS,
): ReceiptSvg {
  const paperHeight = options.padding * 2 + lines.length * options.lineHeight;
  const width = options.paperWidth + options.margin * 2;
  const height = paperHeight + options.margin * 2;
  const centre = `${width / 2} ${height / 2}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<rect width="100%" height="100%" fill="${options.background}"/>`,
    `<g transform="rotate(${options.rotateDegrees} ${centre})">`,
    `<rect x="${options.margin}" y="${options.margin}" width="${options.paperWidth}" height="${paperHeight}" fill="${options.paper}"/>`,
    ...lines.map((line, index) => textLine(line, index, options)),
    '</g>',
    '</svg>',
  ].join('');
  return { svg, width, height };
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textLine(line: string, index: number, options: ReceiptSvgOptions): string {
  const x = options.margin + options.padding;
  const y = options.margin + options.padding + (index + 1) * options.lineHeight - options.lineHeight / 4;
  const style = `font-family="Courier New, Courier, monospace" font-size="${options.fontSize}" fill="${options.ink}"`;
  return `<text x="${x}" y="${y}" ${style} xml:space="preserve">${escapeXml(line)}</text>`;
}
