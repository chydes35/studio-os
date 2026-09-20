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

export const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateClientDto = z.infer<typeof createClientSchema>;

export const createBookingSchema = z.object({
  clientId: z.string().min(1),
  shootType: z.string().min(1),
  locationId: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
  durationMins: z.number().int().positive().optional(),
  notes: z.string().optional(),
});
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

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

export const availableSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  durationMins: z.coerce.number().int().positive().default(60),
});
export type AvailableSlotsQuery = z.infer<typeof availableSlotsQuerySchema>;

export const publicBookingRequestSchema = z.object({
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  clientPhone: z.string().optional(),
  shootType: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMins: z.number().int().positive(),
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
