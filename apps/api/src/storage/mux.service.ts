import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mux from '@mux/mux-node';

@Injectable()
export class MuxService {
  private client: Mux | null = null;

  constructor(private readonly config: ConfigService) {
    const tokenId = this.config.get<string>('MUX_TOKEN_ID');
    const tokenSecret = this.config.get<string>('MUX_TOKEN_SECRET');
    if (tokenId && tokenSecret) {
      this.client = new Mux({ tokenId, tokenSecret });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Returns a direct upload URL plus Mux's *upload* id — not an asset id yet.
   * Mux creates the real asset asynchronously once the file lands; the
   * `video.asset.ready` webhook (not implemented — untestable without real
   * credentials) is what would resolve the upload id to a playback id.
   */
  async createDirectUpload(): Promise<{ uploadUrl: string; uploadId: string }> {
    if (!this.client) {
      throw new BadRequestException(
        'Video uploads require Mux to be configured (MUX_TOKEN_ID / MUX_TOKEN_SECRET). Ask the studio owner to add Mux credentials.',
      );
    }
    const upload = await this.client.video.uploads.create({
      cors_origin: '*',
      new_asset_settings: { playback_policy: ['public'] },
    });
    return { uploadUrl: upload.url, uploadId: upload.id };
  }
}
