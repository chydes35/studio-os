"use client";

import { use, useState } from "react";
import { api, type Gallery, type Media } from "../../../lib/api";
import { GalleryLightbox } from "./GalleryLightbox";

export default function PublicGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [passwordInput, setPasswordInput] = useState("");
  const [password, setPassword] = useState<string | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Media | null>(null);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const g = await api.viewGallery(id, passwordInput);
      setGallery(g);
      setPassword(passwordInput);
    } catch (err) {
      setError("Incorrect password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateMedia(updated: Media) {
    setGallery((prev) =>
      prev
        ? { ...prev, media: prev.media.map((m) => (m.id === updated.id ? updated : m)) }
        : prev,
    );
    setSelected(updated);
  }

  if (!gallery || !password) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-xl font-semibold">Enter gallery password</h1>
        <form onSubmit={handleUnlock} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <input
            required
            type="password"
            placeholder="Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Checking…" : "View gallery"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Your gallery</h1>
      <p className="mb-4 text-xs text-slate-500">
        {gallery.downloadsEnabled
          ? "Open a photo to download the full-resolution original."
          : "These previews are watermarked. Your photographer will release the full-resolution files here."}
      </p>
      {gallery.media.length === 0 ? (
        <p className="text-sm text-slate-500">No photos yet — check back soon.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {gallery.media.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m)}
              className="overflow-hidden rounded-md border border-slate-200 bg-white text-left"
            >
              {m.previewUrl ? (
                <img
                  src={m.previewUrl}
                  alt=""
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  className="aspect-square w-full select-none object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-xs text-slate-400">
                  Processing…
                </div>
              )}
              {m.isFavorited && <div className="p-1.5 text-xs text-red-600">♥</div>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <GalleryLightbox
          media={selected}
          password={password}
          onClose={() => setSelected(null)}
          onUpdate={updateMedia}
        />
      )}
    </div>
  );
}
