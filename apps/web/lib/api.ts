import type {
  AddMediaCommentDto,
  BookingStage,
  CreateAvailabilityRuleDto,
  CreateBookingDto,
  CreateCalendarBlockDto,
  CreateClientDto,
  CreateContractDto,
  CreateContractTemplateDto,
  CreateExpenseDto,
  CreateInvoiceDto,
  CreateQuestionnaireTemplateDto,
  PublicBookingRequestDto,
  QuestionnaireField,
  SignContractDto,
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
    request<{ remindersSent: number; overdueProcessed: number }>(
      "/notifications/run-now",
      { method: "POST" },
    ),
};
