import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

const MAX_PREVIEW_DIMENSION = 1600;

@Injectable()
export class WatermarkService {
  async applyWatermark(original: Buffer): Promise<Buffer> {
    // Materialize the resize first: `metadata()` on a pipeline reports the
    // *input* image's dimensions, not the resized output's, so sizing the
    // overlay from it made it larger than the preview and sharp refused to
    // composite any photo over 1600px. Raw pixels avoid a lossy intermediate
    // JPEG encode between the two steps.
    const { data, info } = await sharp(original)
      .rotate() // respect EXIF orientation before we lose it in re-encoding
      .resize({
        width: MAX_PREVIEW_DIMENSION,
        height: MAX_PREVIEW_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const watermarkSvg = this.buildTiledWatermarkSvg(info.width, info.height);

    return sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .composite([{ input: Buffer.from(watermarkSvg), top: 0, left: 0 }])
      .jpeg({ quality: 82 })
      .toBuffer();
  }

  private buildTiledWatermarkSvg(width: number, height: number): string {
    const text = 'PREVIEW';
    const tiles: string[] = [];
    const stepX = 220;
    const stepY = 140;
    for (let y = -stepY; y < height + stepY; y += stepY) {
      for (let x = -stepX; x < width + stepX; x += stepX) {
        tiles.push(
          `<text x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})" font-size="28" font-family="sans-serif" fill="white" fill-opacity="0.35">${text}</text>`,
        );
      }
    }
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${tiles.join(
      '',
    )}</svg>`;
  }
}
