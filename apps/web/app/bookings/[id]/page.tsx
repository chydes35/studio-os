"use client";

import { use, useEffect, useState } from "react";
import { api, type Booking, type Gallery } from "../../../lib/api";
import { BookingContractSection } from "./BookingContractSection";
import { BookingInvoicesSection } from "./BookingInvoicesSection";

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [passwordInput, setPasswordInput] = useState("");
  const [justCreatedPassword, setJustCreatedPassword] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.getBooking(id), api.getGalleryForBooking(id)])
      .then(([b, g]) => {
        setBooking(b);
        setGallery(g);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  async function handleCreateGallery(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.createGallery(id, passwordInput);
      setJustCreatedPassword(passwordInput);
      setGallery({ ...created, media: created.media ?? [] });
      setPasswordInput("");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!gallery || !e.target.files) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(e.target.files)) {
        await api.uploadPhoto(gallery.id, file);
      }
      const refreshed = await api.getGalleryForBooking(id);
      setGallery(refreshed);
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!booking) return <p className="text-sm text-red-600">Booking not found.</p>;

  const galleryUrl =
    typeof window !== "undefined" && gallery
      ? `${window.location.origin}/gallery/${gallery.id}`
      : "";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">{booking.client.name}</h1>
        <p className="text-sm text-slate-500">
          {booking.shootType}
          {booking.scheduledAt &&
            ` · ${new Date(booking.scheduledAt).toLocaleString()}`}
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <BookingContractSection bookingId={id} booking={booking} />

      <BookingInvoicesSection bookingId={id} />

      {!gallery ? (
        <form
          onSubmit={handleCreateGallery}
          className="max-w-sm space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold">Create a gallery</h2>
          <p className="text-xs text-slate-500">
            Choose a password the client will use to view their photos.
          </p>
          <input
            required
            minLength={6}
            type="text"
            placeholder="Gallery password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Create gallery
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {justCreatedPassword && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Gallery created. Password: <strong>{justCreatedPassword}</strong>{" "}
              — write it down, it won&apos;t be shown again.
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Share with your client</p>
            <p className="mt-1 break-all text-sm text-slate-600">{galleryUrl}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block text-sm font-semibold">Upload photos</label>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={handleUpload}
              className="mt-2 text-sm"
            />
            {uploading && (
              <p className="mt-2 text-xs text-slate-500">Uploading…</p>
            )}
          </div>

          {gallery.media.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {gallery.media.map((m) => (
                <div
                  key={m.id}
                  className="overflow-hidden rounded-md border border-slate-200 bg-white"
                >
                  {m.previewUrl ? (
                    <img
                      src={m.previewUrl}
                      alt={m.fileName ?? ""}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-xs text-slate-400">
                      {m.processingStatus === "pending" ? "Processing…" : "Failed"}
                    </div>
                  )}
                  <div className="p-1.5 text-xs text-slate-500">
                    {m.isFavorited && "♥ "}
                    {m.comments?.length ? `${m.comments.length} comment(s)` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
