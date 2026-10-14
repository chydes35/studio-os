import { z } from "zod";

export const bookingStageSchema = z.enum([
  "INQUIRY",
  "BOOKED",
  "SHOT",
  "EDITING",
  "DELIVERED",
  "CLOSED",
]);
export type BookingStage = z.infer<typeof bookingStageSchema>;

/**
 * Email addresses are stored lowercase so lookups are case-insensitive:
 * User.email and Client(ownerId, email) are unique, and without this
 * "Foo@x.com" and "foo@x.com" became two accounts / two client records,
 * and a login with different casing failed against an existing account.
 */
const emailSchema = z.string().trim().toLowerCase().email();

export const createClientSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  phone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateClientDto = z.infer<typeof createClientSchema>;
export const updateClientSchema = createClientSchema.partial().extend({
  phone: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateClientDto = z.infer<typeof updateClientSchema>;

export const createBookingSchema = z.object({
  clientId: z.string().min(1),
  shootType: z.string().min(1),
  locationId: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
  durationMins: z.number().int().min(30).max(120).multipleOf(30).optional(),
  notes: z.string().max(5000).optional(),
}).refine((value) => !value.scheduledAt || value.durationMins !== undefined, {
  message: "durationMins is required when a booking is scheduled",
  path: ["durationMins"],
}).refine((value) => value.scheduledAt !== undefined || value.durationMins === undefined, {
  message: "durationMins requires a scheduled time",
  path: ["durationMins"],
});
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
  clientId: z.string().min(1).optional(),
  shootType: z.string().trim().min(1).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  durationMins: z.number().int().min(30).max(120).multipleOf(30).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).refine((value) => {
  if (value.scheduledAt === null) return value.durationMins === undefined || value.durationMins === null;
  if (value.scheduledAt instanceof Date) return value.durationMins !== undefined && value.durationMins !== null;
  return value.durationMins === undefined;
}, {
  message: "scheduledAt and durationMins must be updated together",
  path: ["scheduledAt"],
});
export type UpdateBookingDto = z.infer<typeof updateBookingSchema>;

export const updateBookingStageSchema = z.object({
  stage: bookingStageSchema,
});
export type UpdateBookingStageDto = z.infer<typeof updateBookingStageSchema>;

// Blanket sanity ceiling shared by photo + video; the API enforces a
// tighter, type-specific limit on top of this (see MediaService).
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

export const uploadInitSchema = z.object({
  galleryId: z.string().min(1),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().positive().max(MAX_UPLOAD_BYTES),
  mimeType: z.string().min(1),
});
export type UploadInitDto = z.infer<typeof uploadInitSchema>;

export const uploadInitResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mux"),
    mediaId: z.string(),
    uploadUrl: z.string().url(),
  }),
  z.object({
    kind: z.literal("r2_put"),
    mediaId: z.string(),
    uploadUrl: z.string().url(),
  }),
]);
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>;

// ---------- Scheduling (Phase 2) ----------

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)");

export const createAvailabilityRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    bufferMinutes: z.number().int().min(0).default(0),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: "startTime must be before endTime",
    path: ["endTime"],
  });
export type CreateAvailabilityRuleDto = z.infer<
  typeof createAvailabilityRuleSchema
>;

export const createCalendarBlockSchema = z
  .object({
    title: z.string().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((v) => v.startsAt < v.endsAt, {
    message: "startsAt must be before endsAt",
    path: ["endsAt"],
  });
export type CreateCalendarBlockDto = z.infer<typeof createCalendarBlockSchema>;

/**
 * Session lengths a client can pick on the public booking page. The API
 * enforces the same list: it used to accept any positive number, so a client
 * could request a 1-minute slot (fitting anywhere) or a 10,000-minute one.
 * Owner-defined packages with their own durations should replace this.
 */
export const PUBLIC_BOOKING_DURATIONS = [30, 60, 90, 120] as const;
const isPublicBookingDuration = (mins: number) =>
  (PUBLIC_BOOKING_DURATIONS as readonly number[]).includes(mins);
const publicDurationMessage = `Duration must be one of ${PUBLIC_BOOKING_DURATIONS.join(", ")} minutes`;

export const availableSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  durationMins: z.coerce
    .number()
    .int()
    .refine(isPublicBookingDuration, publicDurationMessage)
    .default(60),
});
export type AvailableSlotsQuery = z.infer<typeof availableSlotsQuerySchema>;

export const ownerAvailableSlotsQuerySchema = availableSlotsQuerySchema.extend({
  excludeBookingId: z.string().min(1).optional(),
});
export type OwnerAvailableSlotsQuery = z.infer<typeof ownerAvailableSlotsQuerySchema>;

export const publicBookingRequestSchema = z.object({
  clientName: z.string().min(1),
  clientEmail: emailSchema,
  clientPhone: z.string().optional(),
  shootType: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMins: z.number().int().refine(isPublicBookingDuration, publicDurationMessage),
  notes: z.string().optional(),
});
export type PublicBookingRequestDto = z.infer<
  typeof publicBookingRequestSchema
>;

// ---------- Media / Galleries (Phase 3) ----------

export const createGallerySchema = z.object({
  password: z.string().min(6),
});
export type CreateGalleryDto = z.infer<typeof createGallerySchema>;

export const unlockGallerySchema = z.object({
  password: z.string().min(1),
});
export type UnlockGalleryDto = z.infer<typeof unlockGallerySchema>;

export const addMediaCommentSchema = z.object({
  password: z.string().min(1),
  authorName: z.string().min(1),
  body: z.string().min(1),
  timestampSeconds: z.number().nonnegative().optional(),
});
export type AddMediaCommentDto = z.infer<typeof addMediaCommentSchema>;

/** Clients re-send the gallery password with each action; there is no session. */
export const downloadMediaSchema = z.object({
  password: z.string().min(1),
});
export type DownloadMediaDto = z.infer<typeof downloadMediaSchema>;

export const setGalleryDownloadsSchema = z.object({
  enabled: z.boolean(),
});
export type SetGalleryDownloadsDto = z.infer<typeof setGalleryDownloadsSchema>;

export const toggleFavoriteSchema = z.object({
  password: z.string().min(1),
});
export type ToggleFavoriteDto = z.infer<typeof toggleFavoriteSchema>;

// ---------- Contracts (Phase 4) ----------

export const createContractTemplateSchema = z.object({
  name: z.string().min(1),
  bodyMarkdown: z.string().min(1),
});
export type CreateContractTemplateDto = z.infer<typeof createContractTemplateSchema>;

export const createContractSchema = z.object({
  templateId: z.string().min(1),
  variables: z.record(z.string(), z.string()),
});
export type CreateContractDto = z.infer<typeof createContractSchema>;

export const signContractSchema = z.object({
  signerName: z.string().min(1),
  signatureImage: z.string().startsWith("data:image/png"),
});
export type SignContractDto = z.infer<typeof signContractSchema>;

// ---------- Financials (Phase 5) ----------

export const invoiceLineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitAmountCents: z.number().int().positive(),
});
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemInputSchema>;

export const createInvoiceSchema = z.object({
  dueAt: z.coerce.date().optional(),
  lineItems: z.array(invoiceLineItemInputSchema).min(1),
});
export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

export const markInvoicePaidSchema = z.object({
  amountCents: z.number().int().positive(),
});
export type MarkInvoicePaidDto = z.infer<typeof markInvoicePaidSchema>;

export const createExpenseSchema = z.object({
  description: z.string().min(1),
  category: z.string().optional(),
  amountCents: z.number().int().positive(),
  incurredAt: z.coerce.date().optional(),
  bookingId: z.string().optional(),
});
export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;

// ---------- Automated workflows & questionnaires (Phase 6) ----------

export const questionnaireFieldTypeSchema = z.enum(["text", "textarea", "select", "checkbox"]);
export type QuestionnaireFieldType = z.infer<typeof questionnaireFieldTypeSchema>;

export const questionnaireFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: questionnaireFieldTypeSchema,
  options: z.array(z.string()).optional(),
});
export type QuestionnaireField = z.infer<typeof questionnaireFieldSchema>;

export const createQuestionnaireTemplateSchema = z.object({
  name: z.string().min(1),
  fields: z.array(questionnaireFieldSchema).min(1),
});
export type CreateQuestionnaireTemplateDto = z.infer<typeof createQuestionnaireTemplateSchema>;

export const assignQuestionnaireSchema = z.object({
  templateId: z.string().min(1),
});
export type AssignQuestionnaireDto = z.infer<typeof assignQuestionnaireSchema>;

export const submitQuestionnaireSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.boolean()])),
});
export type SubmitQuestionnaireDto = z.infer<typeof submitQuestionnaireSchema>;

// ---------- Equipment & Locations (Phase 7) ----------

export const createEquipmentSchema = z.object({
  name: z.string().min(1),
  serialNumber: z.string().optional(),
  purchaseDate: z.coerce.date().optional(),
  lastServicedAt: z.coerce.date().optional(),
  nextServiceDue: z.coerce.date().optional(),
  notes: z.string().optional(),
});
export type CreateEquipmentDto = z.infer<typeof createEquipmentSchema>;

export const updateEquipmentSchema = createEquipmentSchema.partial();
export type UpdateEquipmentDto = z.infer<typeof updateEquipmentSchema>;

export const assignEquipmentToBookingSchema = z.object({
  equipmentId: z.string().min(1),
});
export type AssignEquipmentToBookingDto = z.infer<typeof assignEquipmentToBookingSchema>;

export const createLocationSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bestTimeOfDay: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateLocationDto = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationDto = z.infer<typeof updateLocationSchema>;

export const addLocationPhotoSchema = z.object({
  fileName: z.string().min(1),
  fileSizeBytes: z.number().positive().max(MAX_UPLOAD_BYTES),
  mimeType: z.string().min(1).startsWith("image/"),
  caption: z.string().optional(),
});
export type AddLocationPhotoDto = z.infer<typeof addLocationPhotoSchema>;

export const setBookingLocationSchema = z.object({
  locationId: z.string().min(1).nullable(),
});
export type SetBookingLocationDto = z.infer<typeof setBookingLocationSchema>;

// ---------- Auth (Phase 9) ----------

/** True for any IANA zone name the runtime's Intl knows (e.g. "America/Chicago"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The studio's own time zone. Availability rules ("Mon 09:00-17:00") are
 * wall-clock times in this zone — never the API server's zone, which is
 * typically UTC in production.
 */
export const timeZoneSchema = z
  .string()
  .min(1)
  .refine(isValidTimeZone, { message: "Unknown time zone" });

export const registerSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  password: z.string().min(8),
  timezone: timeZoneSchema.optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["OWNER", "STAFF"]),
  timezone: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const updateProfileSchema = z.object({
  timezone: timeZoneSchema,
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

/** Public booking portal: slot start times (ISO UTC) plus the studio zone to display them in. */
export type AvailableSlotsResponse = {
  timezone: string;
  slots: string[];
};

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
