import { buildReceiptSvg, DEFAULT_RECEIPT_SVG_OPTIONS, escapeXml } from '@/scripts/fixtures/receipt-svg';

describe('buildReceiptSvg', () => {
  it('sizes the canvas from the paper width, margins and number of lines', () => {
    const { width, height } = buildReceiptSvg(['A', 'B', 'C']);
    const { paperWidth, margin, padding, lineHeight } = DEFAULT_RECEIPT_SVG_OPTIONS;
    expect(width).toBe(paperWidth + margin * 2);
    expect(height).toBe(padding * 2 + 3 * lineHeight + margin * 2);
  });

  it('renders one monospace text element per line, preserving spaces', () => {
    const { svg } = buildReceiptSvg(['TOTAL  SAR 150.00', 'MADA **** 4471']);
    expect(svg.match(/<text /g)).toHaveLength(2);
    expect(svg).toContain('xml:space="preserve">TOTAL  SAR 150.00</text>');
    expect(svg).toContain('monospace');
  });

  it('escapes characters that would break the XML', () => {
    expect(buildReceiptSvg(['Fish & <Chips> "x" \'y\'']).svg).toContain(
      'Fish &amp; &lt;Chips&gt; &quot;x&quot; &apos;y&apos;',
    );
  });

  it('rotates the paper around the canvas centre', () => {
    const options = { ...DEFAULT_RECEIPT_SVG_OPTIONS, rotateDegrees: -2.5 };
    const { svg, width, height } = buildReceiptSvg(['A'], options);
    expect(svg).toContain(`rotate(-2.5 ${width / 2} ${height / 2})`);
  });

  it('handles an empty receipt', () => {
    expect(buildReceiptSvg([]).svg).not.toContain('<text');
  });
});

describe('escapeXml', () => {
  it('leaves plain text untouched', () => {
    expect(escapeXml('ALFANAR FUEL 04')).toBe('ALFANAR FUEL 04');
  });
});
