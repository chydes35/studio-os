import type {
  BookingStage,
  CreateBookingDto,
  CreateClientDto,
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
};
