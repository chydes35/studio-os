import type { BookingStage } from "@repo/shared";

// EXPO_PUBLIC_* vars are inlined at bundle time, same idea as Next's
// NEXT_PUBLIC_* — the web app's equivalent lives in apps/web/lib/api.ts.
// localhost resolves to the host Mac from both the iOS Simulator and the
// web preview; a physical device needs the host's LAN IP instead.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
};

export type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  bestTimeOfDay: string | null;
};

export type Equipment = {
  id: string;
  name: string;
  serialNumber: string | null;
};

export type BookingEquipment = {
  id: string;
  equipmentId: string;
  equipment: Equipment;
};

export type Booking = {
  id: string;
  client: Client;
  locationId: string | null;
  location?: Location | null;
  shootType: string;
  stage: BookingStage;
  scheduledAt: string | null;
  durationMins: number | null;
  notes: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  // Nest sends a genuinely empty body (not the text "null") for a handler
  // that returns null/undefined — res.json() would throw on that.
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  listBookings: () => request<Booking[]>("/bookings"),
  getBooking: (id: string) => request<Booking>(`/bookings/${id}`),
  updateBookingStage: (id: string, stage: BookingStage) =>
    request<Booking>(`/bookings/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    }),

  listClients: () => request<Client[]>("/clients"),

  listBookingEquipment: (bookingId: string) =>
    request<BookingEquipment[]>(`/bookings/${bookingId}/equipment`),
};
