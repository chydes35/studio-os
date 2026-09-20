import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;

@Injectable()
export class PdfService {
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
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

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
