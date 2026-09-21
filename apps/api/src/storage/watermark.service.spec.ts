import sharp from 'sharp';
import { WatermarkService } from './watermark.service.js';

function solidImage(width: number, height: number, channels: 3 | 4 = 3) {
  return sharp({
    create: { width, height, channels, background: { r: 120, g: 120, b: 120, alpha: 1 } },
  });
}

describe('WatermarkService', () => {
  const service = new WatermarkService();

  it('watermarks a full-size camera photo, downscaled to 1600px', async () => {
    const original = await solidImage(6000, 4000).jpeg().toBuffer();

    const preview = await service.applyWatermark(original);
    const meta = await sharp(preview).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1067);
  });

  it('applies EXIF rotation before sizing the overlay (portrait phone photo)', async () => {
    // Stored landscape, EXIF orientation 6 = displayed rotated 90° to portrait.
    const original = await solidImage(4032, 3024).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const meta = await sharp(await service.applyWatermark(original)).metadata();

    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1600);
  });

  it('does not enlarge an image already under the preview size', async () => {
    const original = await solidImage(800, 600).jpeg().toBuffer();

    const meta = await sharp(await service.applyWatermark(original)).metadata();

    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('handles a PNG with an alpha channel', async () => {
    const original = await solidImage(3000, 2000, 4).png().toBuffer();

    const meta = await sharp(await service.applyWatermark(original)).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1600);
  });

  it('actually draws the watermark (output differs from a plain resize)', async () => {
    const original = await solidImage(2000, 2000).jpeg().toBuffer();

    const watermarked = await sharp(await service.applyWatermark(original)).stats();
    const plain = await sharp(original).resize(1600, 1600).stats();

    expect(watermarked.channels[0]!.max).toBeGreaterThan(plain.channels[0]!.max);
  });
});
