import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;

// Resolves to apps/api/assets/fonts from both src/contracts (dev) and
// dist/contracts (built), since each is two levels below apps/api.
const FONT_DIR = new URL('../../assets/fonts/', import.meta.url);

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private fontCache?: Promise<{ regular: Buffer; bold: Buffer }>;

  /**
   * Noto Sans, not pdf-lib's built-in Helvetica: the standard PDF fonts only
   * encode WinAnsi, so a signer named e.g. "Nguyen Van An" (with diacritics),
   * "Lukasz" (with a slashed L) or any Cyrillic name threw
   * "WinAnsi cannot encode ..." and failed the whole signing request with a
   * 500. Noto Sans covers Latin/Greek/Cyrillic; see assets/fonts/README.md.
   */
  private loadFonts() {
    this.fontCache ??= Promise.all([
      readFile(new URL('NotoSans_400Regular.ttf', FONT_DIR)),
      readFile(new URL('NotoSans_700Bold.ttf', FONT_DIR)),
    ]).then(([regular, bold]) => ({ regular, bold }));
    return this.fontCache;
  }

  async generateContractPdf(params: {
    title: string;
    bodyText: string;
    signerName: string;
    signedAt: Date;
    signatureImageDataUrl: string;
    signerIp: string;
    signerUserAgent: string;
  }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const fontFiles = await this.loadFonts();
    // Embedded whole, NOT subset: pdf-lib's subsetter silently drops most
    // glyphs from this font — a signed contract rendered as scattered
    // fragments ("Client Nguyen" came out as "C e Ng"). Caught by looking at
    // a rendered page; the PDF still parses fine, so no test that only loads
    // it would notice. Costs ~630KB per contract PDF, which is worth it for
    // a document people sign. See pdf.service.spec.ts for the guard.
    const font = await doc.embedFont(fontFiles.regular, { subset: false });
    const boldFont = await doc.embedFont(fontFiles.bold, { subset: false });

    const unsupported = findUnsupportedCharacters(
      [params.title, params.bodyText, params.signerName].join(' '),
    );
    if (unsupported.length > 0) {
      // Rendered as blank glyphs rather than failing the signature; adding
      // CJK means bundling Noto Sans CJK (see assets/fonts/README.md).
      this.logger.warn(
        `Contract PDF contains characters the bundled font cannot render: ${unsupported.join(' ')}`,
      );
    }

    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    const lines = wrapText(params.bodyText, font, BODY_SIZE, maxWidth);

    let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    page.drawText(params.title, { x: MARGIN, y, size: 16, font: boldFont });
    y -= 28;

    for (const line of lines) {
      if (y < MARGIN + 160) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font });
      y -= LINE_HEIGHT;
    }

    // Signature block
    if (y < MARGIN + 160) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= 20;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 24;

    const pngBytes = dataUrlToBytes(params.signatureImageDataUrl);
    const signatureImage = await doc.embedPng(pngBytes);
    const sigDims = signatureImage.scaleToFit(180, 60);
    page.drawImage(signatureImage, { x: MARGIN, y: y - sigDims.height, width: sigDims.width, height: sigDims.height });
    y -= sigDims.height + 16;

    page.drawText(`Signed by: ${params.signerName}`, { x: MARGIN, y, size: 10, font: boldFont });
    y -= 14;
    page.drawText(`Date: ${params.signedAt.toISOString()}`, { x: MARGIN, y, size: 9, font });
    y -= 12;
    page.drawText(`IP address: ${params.signerIp}`, { x: MARGIN, y, size: 9, font });
    y -= 12;
    page.drawText(`User agent: ${params.signerUserAgent}`.slice(0, 110), { x: MARGIN, y, size: 9, font });

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }
}

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/**
 * Code points outside the bundled font's Latin/Greek/Cyrillic coverage, which
 * would be drawn as blank glyphs. Deliberately a coarse range check rather
 * than a real cmap lookup: it only drives a log line.
 */
function findUnsupportedCharacters(text: string): string[] {
  const unsupported = new Set<string>();
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const supported =
      code <= 0x058f || // Latin, Greek, Cyrillic, punctuation blocks
      (code >= 0x1e00 && code <= 0x1eff) || // Latin Extended Additional (Vietnamese)
      (code >= 0x2000 && code <= 0x206f) || // general punctuation
      (code >= 0x20a0 && code <= 0x20bf); // currency symbols
    if (!supported) unsupported.add(char);
  }
  return [...unsupported];
}
