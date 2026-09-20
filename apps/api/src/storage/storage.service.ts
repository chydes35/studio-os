import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PRESIGN_EXPIRY_SECONDS = 60 * 60;

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string | undefined;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('R2_ENDPOINT');
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    this.bucket = this.config.get<string>('R2_BUCKET_NAME') ?? '';
    this.publicUrlBase = this.config.get<string>('R2_PUBLIC_URL');

    this.client = new S3Client({
      region: 'auto',
      endpoint: endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: Boolean(endpoint), // MinIO (local dev) needs path-style; real R2 doesn't
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID') ?? '',
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '',
      },
    });
  }

  originalKey(galleryId: string, mediaId: string, fileName: string) {
    return `originals/${galleryId}/${mediaId}-${fileName}`;
  }

  previewKey(galleryId: string, mediaId: string) {
    return `previews/${galleryId}/${mediaId}.jpg`;
  }

  publicUrl(key: string) {
    return `${this.publicUrlBase}/${key}`;
  }

  /**
   * A single presigned PUT, not chunked multipart: the browser still uploads
   * directly to storage, bypassing the app server entirely, which is the
   * architectural requirement. True multipart (needed for resumable 50GB+
   * uploads) was dropped for the photo/raw path because reading each part's
   * ETag back from the browser requires the bucket to expose that header via
   * CORS, which this local MinIO build's PutBucketCors API doesn't support
   * (real Cloudflare R2 does, so multipart could be reinstated for very large
   * raw files later). Video already avoids this entirely via Mux.
   *
   * `contentLength`, when passed, is signed into the URL so the storage
   * backend rejects any PUT whose actual `Content-Length` doesn't match it —
   * this is what enforces the declared upload size, since nothing else stops
   * a client from streaming more bytes than it claimed at init time.
   */
  async createPresignedPutUrl(
    key: string,
    contentType: string,
    contentLength?: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS },
    );
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async putObjectBuffer(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** For private objects (contracts, originals) that need a time-limited link. */
  async getPresignedGetUrl(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    });
  }

  contractKey(contractId: string) {
    return `contracts/${contractId}.pdf`;
  }
}
