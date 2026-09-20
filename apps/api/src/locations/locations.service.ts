import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { AddLocationPhotoDto, CreateLocationDto, UpdateLocationDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { StorageService } from '../storage/storage.service.js';

// Reference photos of a scouted location, not a client deliverable — a
// smaller ceiling than the 100MB gallery-photo cap is plenty.
const MAX_LOCATION_PHOTO_BYTES = 25 * 1024 * 1024; // 25MB

// Free substitute for a paid/key-gated geocoder (e.g. Google Geocoding API):
// OpenStreetMap's Nominatim needs no API key, just a good-faith User-Agent
// and Referer per its usage policy (https://operations.osmfoundation.org/policies/nominatim/),
// and on-demand single-owner lookups are well within its "no heavy use" limits.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'StudioOS/1.0 (local self-hosted studio management app)';

export type GeocodeResult = {
  displayName: string;
  latitude: number;
  longitude: number;
};

@Injectable()
export class LocationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
    private readonly storage: StorageService,
  ) {}

  async list() {
    const ownerId = await this.ownerContext.getOwnerId();
    const locations = await this.prisma.location.findMany({
      where: { ownerId },
      include: { photos: true },
      orderBy: { name: 'asc' },
    });
    return Promise.all(locations.map((loc) => this.withPhotoUrls(loc)));
  }

  /**
   * Location photos are private owner reference material, not a client
   * deliverable — unlike gallery previews (whose bucket prefix is
   * public-read so they can be embedded without auth), so these need a
   * time-limited presigned GET rather than `storage.publicUrl()`, the same
   * pattern used for contract PDFs.
   */
  private async withPhotoUrls<T extends { photos: { r2Key: string }[] }>(location: T) {
    return {
      ...location,
      photos: await Promise.all(
        location.photos.map(async (p) => ({
          ...p,
          url: await this.storage.getPresignedGetUrl(p.r2Key),
        })),
      ),
    };
  }

  private async getOwned(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const location = await this.prisma.location.findFirst({ where: { id, ownerId } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async create(dto: CreateLocationDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    const location = await this.prisma.location.create({
      data: { ...dto, ownerId },
      include: { photos: true },
    });
    return await this.withPhotoUrls(location);
  }

  async update(id: string, dto: UpdateLocationDto) {
    await this.getOwned(id);
    const location = await this.prisma.location.update({
      where: { id },
      data: dto,
      include: { photos: true },
    });
    return await this.withPhotoUrls(location);
  }

  async delete(id: string) {
    await this.getOwned(id);
    // LocationPhoto has a restrictive FK to Location, so its rows must go first.
    await this.prisma.locationPhoto.deleteMany({ where: { locationId: id } });
    await this.prisma.location.delete({ where: { id } });
    return { id };
  }

  async initPhotoUpload(locationId: string, dto: AddLocationPhotoDto) {
    await this.getOwned(locationId);

    if (dto.fileSizeBytes > MAX_LOCATION_PHOTO_BYTES) {
      throw new BadRequestException(
        `File exceeds the ${Math.round(MAX_LOCATION_PHOTO_BYTES / (1024 * 1024))}MB limit for location photos`,
      );
    }

    const photo = await this.prisma.locationPhoto.create({
      data: { locationId, r2Key: '', caption: dto.caption },
    });
    const key = this.storage.locationPhotoKey(locationId, photo.id, dto.fileName);
    const uploadUrl = await this.storage.createPresignedPutUrl(
      key,
      dto.mimeType,
      dto.fileSizeBytes,
    );
    await this.prisma.locationPhoto.update({ where: { id: photo.id }, data: { r2Key: key } });

    return { photoId: photo.id, uploadUrl };
  }

  async deletePhoto(locationId: string, photoId: string) {
    await this.getOwned(locationId);
    const photo = await this.prisma.locationPhoto.findFirst({
      where: { id: photoId, locationId },
    });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.prisma.locationPhoto.delete({ where: { id: photoId } });
    return { id: photoId };
  }

  async geocode(query: string): Promise<GeocodeResult[]> {
    const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        Referer: 'https://studio-os.local/',
      },
    });
    if (!res.ok) {
      throw new BadRequestException('Address lookup failed, try a more specific search');
    }
    const results = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;
    return results.map((r) => ({
      displayName: r.display_name,
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
    }));
  }
}
