import type {
  AddMediaCommentDto,
  BookingStage,
  CreateAvailabilityRuleDto,
  CreateBookingDto,
  CreateCalendarBlockDto,
  CreateClientDto,
  PublicBookingRequestDto,
  UploadInitResponse,
} from "@repo/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  source: string | null;
  createdAt: string;
};

export type Booking = {
  id: string;
  clientId: string;
  client: Client;
  shootType: string;
  stage: BookingStage;
  scheduledAt: string | null;
  createdAt: string;
};

export type AvailabilityRule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  bufferMinutes: number;
};

export type CalendarBlock = {
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  source: string;
};

export type MediaComment = {
  id: string;
  authorName: string;
  body: string;
  timestampSeconds: number | null;
  createdAt: string;
};

export type Media = {
  id: string;
  type: "PHOTO" | "VIDEO" | "RAW";
  fileName: string | null;
  isFavorited: boolean;
  processingStatus: string;
  previewUrl: string | null;
  muxPlaybackId: string | null;
  createdAt: string;
  comments?: MediaComment[];
};

export type Gallery = {
  id: string;
  bookingId: string;
  media: Media[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  // Nest sends an empty body (not literal "null") for a handler that returns
  // null/undefined — res.json() would throw on that, so treat empty as null.
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  listClients: () => request<Client[]>("/clients"),
  createClient: (dto: CreateClientDto) =>
    request<Client>("/clients", { method: "POST", body: JSON.stringify(dto) }),

  listBookings: () => request<Booking[]>("/bookings"),
  createBooking: (dto: CreateBookingDto) =>
    request<Booking>("/bookings", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  updateBookingStage: (id: string, stage: BookingStage) =>
    request<Booking>(`/bookings/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    }),
  createPublicBookingRequest: (dto: PublicBookingRequestDto) =>
    request<Booking>("/bookings/public-request", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  getBooking: (id: string) => request<Booking>(`/bookings/${id}`),

  listAvailabilityRules: () => request<AvailabilityRule[]>("/availability/rules"),
  createAvailabilityRule: (dto: CreateAvailabilityRuleDto) =>
    request<AvailabilityRule>("/availability/rules", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  deleteAvailabilityRule: (id: string) =>
    request<{ id: string }>(`/availability/rules/${id}`, { method: "DELETE" }),

  listCalendarBlocks: () => request<CalendarBlock[]>("/availability/blocks"),
  createCalendarBlock: (dto: CreateCalendarBlockDto) =>
    request<CalendarBlock>("/availability/blocks", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  deleteCalendarBlock: (id: string) =>
    request<{ id: string }>(`/availability/blocks/${id}`, { method: "DELETE" }),

  getAvailableSlots: (date: string, durationMins: number) =>
    request<string[]>(
      `/availability/slots?date=${date}&durationMins=${durationMins}`,
    ),

  createGallery: (bookingId: string, password: string) =>
    request<Gallery>(`/bookings/${bookingId}/gallery`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  getGalleryForBooking: (bookingId: string) =>
    request<Gallery | null>(`/bookings/${bookingId}/gallery`),
  viewGallery: (galleryId: string, password: string) =>
    request<Gallery>(`/gallery/${galleryId}/view`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  initUpload: (galleryId: string, file: File) =>
    request<UploadInitResponse>("/media/upload-init", {
      method: "POST",
      body: JSON.stringify({
        galleryId,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
      }),
    }),
  completeUpload: (mediaId: string) =>
    request<Media>(`/media/${mediaId}/complete`, { method: "POST" }),
  toggleFavorite: (mediaId: string, password: string) =>
    request<Media>(`/media/${mediaId}/favorite`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  addComment: (mediaId: string, dto: AddMediaCommentDto) =>
    request<MediaComment>(`/media/${mediaId}/comments`, {
      method: "POST",
      body: JSON.stringify(dto),
    }),

  /**
   * Uploads a file directly to R2 via a presigned PUT URL — the app server
   * only ever sees the presigned URL, never the file bytes.
   */
  async uploadPhoto(galleryId: string, file: File): Promise<Media> {
    const init = await api.initUpload(galleryId, file);
    if (init.kind !== "r2_put") {
      throw new Error("Only photo uploads are supported until Mux is configured.");
    }

    const res = await fetch(init.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!res.ok) throw new Error("Upload failed");

    return api.completeUpload(init.mediaId);
  },
};
