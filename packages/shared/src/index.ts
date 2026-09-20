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
  bookingId: z.string().min(1),
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
    kind: z.literal("r2_multipart"),
    mediaId: z.string(),
    uploadId: z.string(),
    key: z.string(),
    partUrls: z.array(z.object({ partNumber: z.number(), url: z.string().url() })),
  }),
]);
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>;
