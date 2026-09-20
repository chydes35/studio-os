import type {
  BookingStage,
  CreateAvailabilityRuleDto,
  CreateBookingDto,
  CreateCalendarBlockDto,
  CreateClientDto,
  PublicBookingRequestDto,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
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
};
