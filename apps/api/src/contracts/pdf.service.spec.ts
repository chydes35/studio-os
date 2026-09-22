import { PDFDocument } from 'pdf-lib';
import { PdfService } from './pdf.service.js';

// A 1x1 transparent PNG — the canvas signature is embedded as a data URL.
const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const baseParams = {
  title: 'Portrait Session Agreement',
  bodyText: 'The studio agrees to deliver the gallery within 30 days.',
  signedAt: new Date('2026-09-22T15:00:00Z'),
  signatureImageDataUrl: SIGNATURE,
  signerIp: '203.0.113.7',
  signerUserAgent: 'Mozilla/5.0',
};

describe('PdfService', () => {
  const service = new PdfService();

  // Regression: pdf-lib's built-in Helvetica is WinAnsi-only, so any signer
  // name outside Latin-1 threw "WinAnsi cannot encode ..." and the signing
  // request failed with a 500 — the client simply could not sign.
  it.each([
    ['Vietnamese', 'Nguyễn Văn An'],
    ['Polish', 'Łukasz Kowalski'],
    ['Cyrillic', 'Дмитрий Иванов'],
    ['accented Latin', 'José Muñoz'],
    ['CJK (no glyphs, must still not throw)', '李明'],
  ])('signs with a %s name', async (_label, signerName) => {
    const pdf = await service.generateContractPdf({ ...baseParams, signerName });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders a non-Latin contract body across pages', async () => {
    const pdf = await service.generateContractPdf({
      ...baseParams,
      bodyText: 'Договор на фотосъёмку.\n\n'.repeat(200),
      signerName: 'Дмитрий Иванов',
    });

    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });

  // Regression guard for a bug that only showed up in a rendered page:
  // `embedFont(..., { subset: true })` dropped most glyphs, so contracts
  // rendered as fragments while still parsing as valid PDFs. Subset fonts
  // are tagged with a six-letter prefix ("ABCDEF+NotoSans"), so the absence
  // of that prefix is what proves the whole face is embedded.
  // Regression guard for a bug that only appeared in a *rendered* page:
  // `embedFont(..., { subset: true })` dropped most glyphs, so a contract
  // rendered as fragments ("Client Nguyen" as "C e Ng") while still parsing
  // as a valid PDF — no structural assertion noticed. pdf-lib neither tags
  // subsets with the usual "ABCDEF+" BaseFont prefix nor exposes the font
  // streams through the object graph here, so size is the reliable signal:
  // subsetted output is ~7KB, the two full faces are ~630KB.
  it('embeds the full font faces, not subsets', async () => {
    const pdf = await service.generateContractPdf({ ...baseParams, signerName: 'Ann Lee' });
    expect(pdf.length).toBeGreaterThan(400_000);
    expect(pdf.length).toBeLessThan(2_000_000);
  });
});
