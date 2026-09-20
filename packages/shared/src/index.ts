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

export const uploadInitSchema = z.object({
  galleryId: z.string().min(1),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().positive(),
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
