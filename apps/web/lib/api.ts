import type {
  AddLocationPhotoDto,
  AddMediaCommentDto,
  AuthResponse,
  AuthUser,
  AvailableSlotsResponse,
  BookingStage,
  CreateAvailabilityRuleDto,
  CreateBookingDto,
  CreateCalendarBlockDto,
  CreateClientDto,
  CreateContractDto,
  CreateContractTemplateDto,
  CreateEquipmentDto,
  CreateExpenseDto,
  CreateInvoiceDto,
  CreateLocationDto,
  CreateQuestionnaireTemplateDto,
  LoginDto,
  PublicBookingRequestDto,
  QuestionnaireField,
  RegisterDto,
  SignContractDto,
  UpdateEquipmentDto,
  UpdateLocationDto,
  UpdateProfileDto,
  UploadInitResponse,
} from "@repo/shared";
import { clearToken, getToken } from "./auth";

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
  locationId: string | null;
  location?: Location | null;
  shootType: string;
  stage: BookingStage;
  scheduledAt: string | null;
  createdAt: string;
};

export type Equipment = {
  id: string;
  name: string;
  serialNumber: string | null;
  purchaseDate: string | null;
  lastServicedAt: string | null;
  nextServiceDue: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingEquipment = {
  id: string;
  bookingId: string;
  equipmentId: string;
  equipment: Equipment;
  createdAt: string;
};

export type LocationPhoto = {
  id: string;
  locationId: string;
  r2Key: string;
  caption: string | null;
  url: string;
  createdAt: string;
};

export type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  bestTimeOfDay: string | null;
  notes: string | null;
  createdAt: string;
  photos: LocationPhoto[];
};

export type GeocodeResult = {
  displayName: string;
  latitude: number;
  longitude: number;
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
  /** Client view only: the owner has released originals and this file has one. */
  canDownload?: boolean;
};

export type Gallery = {
  id: string;
  bookingId: string;
  downloadsEnabled?: boolean;
  media: Media[];
};

export type ContractTemplate = {
  id: string;
  name: string;
  bodyMarkdown: string;
  createdAt: string;
};

export type Contract = {
  id: string;
  bookingId: string;
  templateId: string;
  template?: ContractTemplate;
  renderedMarkdown: string;
  signedAt: string | null;
  signerName: string | null;
  createdAt: string;
};

export type PublicContract = {
  id: string;
  templateName: string;
  renderedMarkdown: string;
  signedAt: string | null;
  signerName: string | null;
};

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
};

export type Payment = {
  id: string;
  amountCents: number;
  method: string;
  paidAt: string;
};

export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

export type Invoice = {
  id: string;
  bookingId: string;
  status: InvoiceStatus;
  dueAt: string | null;
  lineItems: InvoiceLineItem[];
  payments: Payment[];
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  createdAt: string;
};

export type PublicInvoice = {
  id: string;
  status: InvoiceStatus;
  dueAt: string | null;
  lineItems: InvoiceLineItem[];
  stripeConfigured: boolean;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
};

export type Expense = {
  id: string;
  bookingId: string | null;
  description: string;
  category: string | null;
  amountCents: number;
  incurredAt: string;
};

export type QuestionnaireTemplate = {
  id: string;
  name: string;
  schema: QuestionnaireField[];
  createdAt: string;
};

export type QuestionnaireResponse = {
  id: string;
  bookingId: string;
  templateId: string;
  template: QuestionnaireTemplate;
  answers: Record<string, string | boolean>;
  submittedAt: string | null;
  createdAt: string;
};

export type PublicQuestionnaire = {
  id: string;
  templateName: string;
  fields: QuestionnaireField[];
  answers: Record<string, string | boolean>;
  submittedAt: string | null;
};

export type EmailLog = {
  id: string;
  bookingId: string | null;
  booking?: { client: Client } | null;
  type: string;
  recipientEmail: string;
  subject: string;
  status: string;
  createdAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    // A stale/expired token on an owner-only route — clear it and bounce to
    // login rather than leaving the page stuck showing a raw error.
    if (res.status === 401 && token) {
      clearToken();
      if (typeof window !== "undefined") window.location.assign("/login");
    }
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
  createPublicBookingRequest: (ownerId: string, dto: PublicBookingRequestDto) =>
    request<Booking>(`/bookings/public-request/${ownerId}`, {
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

  getAvailableSlots: (ownerId: string, date: string, durationMins: number) =>
    request<AvailableSlotsResponse>(
      `/availability/slots/${ownerId}?date=${date}&durationMins=${durationMins}`,
    ),

  createGallery: (bookingId: string, password: string) =>
    request<Gallery>(`/bookings/${bookingId}/gallery`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  getGalleryForBooking: (bookingId: string) =>
    request<Gallery | null>(`/bookings/${bookingId}/gallery`),
  setGalleryDownloads: (galleryId: string, enabled: boolean) =>
    request<{ id: string; downloadsEnabled: boolean }>(`/gallery/${galleryId}/downloads`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  /** Owner's own copy; no gallery password, and not gated by the client release switch. */
  getOwnerMediaDownloadUrl: (mediaId: string) =>
    request<{ url: string; fileName: string; sizeBytes: number | null }>(
      `/media/${mediaId}/original`,
    ),
  getMediaDownloadUrl: (mediaId: string, password: string) =>
    request<{ url: string; fileName: string; sizeBytes: number | null }>(
      `/media/${mediaId}/download`,
      { method: "POST", body: JSON.stringify({ password }) },
    ),
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

  listContractTemplates: () => request<ContractTemplate[]>("/contract-templates"),
  createContractTemplate: (dto: CreateContractTemplateDto) =>
    request<ContractTemplate>("/contract-templates", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  deleteContractTemplate: (id: string) =>
    request<{ id: string }>(`/contract-templates/${id}`, { method: "DELETE" }),

  createContract: (bookingId: string, dto: CreateContractDto) =>
    request<Contract>(`/bookings/${bookingId}/contract`, {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  getContractForBooking: (bookingId: string) =>
    request<Contract | null>(`/bookings/${bookingId}/contract`),
  getPublicContract: (id: string) => request<PublicContract>(`/contracts/${id}`),
  signContract: (id: string, dto: SignContractDto) =>
    request<Contract>(`/contracts/${id}/sign`, {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  getContractDownloadUrl: (id: string) =>
    request<{ url: string }>(`/contracts/${id}/download`),

  createInvoice: (bookingId: string, dto: CreateInvoiceDto) =>
    request<Invoice>(`/bookings/${bookingId}/invoices`, {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  listInvoicesForBooking: (bookingId: string) =>
    request<Invoice[]>(`/bookings/${bookingId}/invoices`),
  markInvoiceSent: (id: string) =>
    request<Invoice>(`/invoices/${id}/send`, { method: "PATCH" }),
  markInvoicePaid: (id: string, amountCents: number) =>
    request<Invoice>(`/invoices/${id}/mark-paid`, {
      method: "POST",
      body: JSON.stringify({ amountCents }),
    }),
  getPublicInvoice: (id: string) => request<PublicInvoice>(`/invoices/${id}`),
  createInvoiceCheckoutSession: (id: string) =>
    request<{ url: string }>(`/invoices/${id}/checkout`, { method: "POST" }),

  listExpenses: () => request<Expense[]>("/expenses"),
  createExpense: (dto: CreateExpenseDto) =>
    request<Expense>("/expenses", { method: "POST", body: JSON.stringify(dto) }),
  deleteExpense: (id: string) =>
    request<{ id: string }>(`/expenses/${id}`, { method: "DELETE" }),

  listQuestionnaireTemplates: () =>
    request<QuestionnaireTemplate[]>("/questionnaire-templates"),
  createQuestionnaireTemplate: (dto: CreateQuestionnaireTemplateDto) =>
    request<QuestionnaireTemplate>("/questionnaire-templates", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  deleteQuestionnaireTemplate: (id: string) =>
    request<{ id: string }>(`/questionnaire-templates/${id}`, { method: "DELETE" }),

  assignQuestionnaire: (bookingId: string, templateId: string) =>
    request<QuestionnaireResponse>(`/bookings/${bookingId}/questionnaires`, {
      method: "POST",
      body: JSON.stringify({ templateId }),
    }),
  listQuestionnairesForBooking: (bookingId: string) =>
    request<QuestionnaireResponse[]>(`/bookings/${bookingId}/questionnaires`),
  getPublicQuestionnaire: (id: string) =>
    request<PublicQuestionnaire>(`/questionnaire-responses/${id}`),
  submitQuestionnaire: (id: string, answers: Record<string, string | boolean>) =>
    request<QuestionnaireResponse>(`/questionnaire-responses/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  listEmailLogs: () => request<EmailLog[]>("/notifications/email-log"),
  runNotificationsNow: () =>
    request<{
      remindersSent: number;
      overdueProcessed: number;
      equipmentAlertsSent: number;
    }>("/notifications/run-now", { method: "POST" }),

  listEquipment: () => request<Equipment[]>("/equipment"),
  createEquipment: (dto: CreateEquipmentDto) =>
    request<Equipment>("/equipment", { method: "POST", body: JSON.stringify(dto) }),
  updateEquipment: (id: string, dto: UpdateEquipmentDto) =>
    request<Equipment>(`/equipment/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    }),
  deleteEquipment: (id: string) =>
    request<{ id: string }>(`/equipment/${id}`, { method: "DELETE" }),

  listBookingEquipment: (bookingId: string) =>
    request<BookingEquipment[]>(`/bookings/${bookingId}/equipment`),
  assignEquipmentToBooking: (bookingId: string, equipmentId: string) =>
    request<BookingEquipment>(`/bookings/${bookingId}/equipment`, {
      method: "POST",
      body: JSON.stringify({ equipmentId }),
    }),
  unassignEquipmentFromBooking: (bookingId: string, equipmentId: string) =>
    request<{ bookingId: string; equipmentId: string }>(
      `/bookings/${bookingId}/equipment/${equipmentId}`,
      { method: "DELETE" },
    ),

  listLocations: () => request<Location[]>("/locations"),
  createLocation: (dto: CreateLocationDto) =>
    request<Location>("/locations", { method: "POST", body: JSON.stringify(dto) }),
  updateLocation: (id: string, dto: UpdateLocationDto) =>
    request<Location>(`/locations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    }),
  deleteLocation: (id: string) =>
    request<{ id: string }>(`/locations/${id}`, { method: "DELETE" }),
  geocodeAddress: (query: string) =>
    request<GeocodeResult[]>(`/locations/geocode?q=${encodeURIComponent(query)}`),
  deleteLocationPhoto: (locationId: string, photoId: string) =>
    request<{ id: string }>(`/locations/${locationId}/photos/${photoId}`, {
      method: "DELETE",
    }),

  /** Same direct-to-storage presigned PUT pattern as gallery uploads. */
  async uploadLocationPhoto(
    locationId: string,
    file: File,
    caption?: string,
  ): Promise<{ photoId: string }> {
    const dto: AddLocationPhotoDto = {
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
      caption,
    };
    const { photoId, uploadUrl } = await request<{ photoId: string; uploadUrl: string }>(
      `/locations/${locationId}/photos`,
      { method: "POST", body: JSON.stringify(dto) },
    );
    const res = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!res.ok) throw new Error("Upload failed");
    return { photoId };
  },

  updateBookingLocation: (bookingId: string, locationId: string | null) =>
    request<Booking>(`/bookings/${bookingId}/location`, {
      method: "PATCH",
      body: JSON.stringify({ locationId }),
    }),

  register: (dto: RegisterDto) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(dto) }),
  login: (dto: LoginDto) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(dto) }),
  getMe: () => request<AuthUser>("/auth/me"),
  updateMe: (dto: UpdateProfileDto) =>
    request<AuthUser>("/auth/me", { method: "PATCH", body: JSON.stringify(dto) }),
};
