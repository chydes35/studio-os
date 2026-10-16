import {
  GetObjectCommand,
  HeadObjectCommand,
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
  /**
   * Signs the URLs handed to browsers. Usually the same store as `client`, but
   * when storage sits behind a tunnel the browser must reach it by its public
   * address (the address is part of the signature) and with a key that can only
   * read and write objects, never the store's admin login.
   */
  private readonly presignClient: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string | undefined;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('R2_ENDPOINT');
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    this.bucket = this.config.get<string>('R2_BUCKET_NAME') ?? '';

    const resolvedEndpoint = endpoint || `https://${accountId}.r2.cloudflarestorage.com`;
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '';
    this.client = StorageService.createClient(resolvedEndpoint, Boolean(endpoint), accessKeyId, secretAccessKey);

    const publicEndpoint = this.config.get<string>('R2_PUBLIC_ENDPOINT');
    const presignAccessKeyId = this.config.get<string>('R2_PRESIGN_ACCESS_KEY_ID');
    const presignSecret = this.config.get<string>('R2_PRESIGN_SECRET_ACCESS_KEY');
    if (Boolean(presignAccessKeyId) !== Boolean(presignSecret)) {
      throw new Error('Set both R2_PRESIGN_ACCESS_KEY_ID and R2_PRESIGN_SECRET_ACCESS_KEY, or neither');
    }
    if (publicEndpoint && !presignAccessKeyId) {
      // Without the limited key, browsers would be handed admin-signed links.
      throw new Error('R2_PUBLIC_ENDPOINT requires R2_PRESIGN_ACCESS_KEY_ID and R2_PRESIGN_SECRET_ACCESS_KEY');
    }
    this.presignClient =
      presignAccessKeyId && presignSecret
        ? StorageService.createClient(
            publicEndpoint || resolvedEndpoint,
            // The media gateway only understands path-style URLs.
            Boolean(endpoint) || Boolean(publicEndpoint),
            presignAccessKeyId,
            presignSecret,
          )
        : this.client;

    // Browsers load public previews from the same host the gateway serves, so
    // it is derived rather than configured twice.
    this.publicUrlBase = publicEndpoint
      ? `${publicEndpoint.replace(/\/+$/, '')}/${this.bucket}`
      : this.config.get<string>('R2_PUBLIC_URL');
  }

  private static createClient(
    endpoint: string,
    forcePathStyle: boolean,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    return new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle, // MinIO (local dev) needs path-style; real R2 doesn't
      // Since SDK v3.729 a presigned PUT bakes in a CRC32 of the (empty) body it
      // was signed with. MinIO ignored it, but S3-compatible stores that verify
      // it (Cloudflare R2 documents this) reject every real upload with a
      // checksum mismatch. Only compute checksums when an operation requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId, secretAccessKey },
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
      this.presignClient,
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
    return getSignedUrl(this.presignClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    });
  }

  /**
   * A time-limited link that saves the object under `fileName` instead of
   * opening it in the browser. The bytes stream straight from storage to the
   * client, so the API never handles a full-resolution file — the same reason
   * uploads are presigned PUTs.
   */
  async getPresignedDownloadUrl(key: string, fileName: string): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // Quotes and backslashes would otherwise break out of the header.
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\]/g, '')}"`,
      }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS },
    );
  }

  /** Byte size of a stored object, for showing the download size up front. */
  async getObjectSize(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  contractKey(contractId: string) {
    return `contracts/${contractId}.pdf`;
  }

  locationPhotoKey(locationId: string, photoId: string, fileName: string) {
    return `locations/${locationId}/${photoId}-${fileName}`;
  }
}
