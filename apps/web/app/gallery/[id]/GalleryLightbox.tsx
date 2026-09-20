"use client";

import { useState } from "react";
import { api, type Media } from "../../../lib/api";

export function GalleryLightbox({
  media,
  password,
  onClose,
  onUpdate,
}: {
  media: Media;
  password: string;
  onClose: () => void;
  onUpdate: (media: Media) => void;
}) {
  const [authorName, setAuthorName] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [comments, setComments] = useState(media.comments ?? []);
  const [submitting, setSubmitting] = useState(false);

  async function handleFavorite() {
    const updated = await api.toggleFavorite(media.id, password);
    onUpdate({ ...media, isFavorited: updated.isFavorited });
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!authorName || !commentBody) return;
    setSubmitting(true);
    try {
      const comment = await api.addComment(media.id, {
        password,
        authorName,
        body: commentBody,
      });
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {media.previewUrl && (
          <img
            src={media.previewUrl}
            alt=""
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full select-none rounded"
          />
        )}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={handleFavorite}
            className={`text-sm ${media.isFavorited ? "text-red-600" : "text-slate-500"}`}
          >
            {media.isFavorited ? "♥ Favorited" : "♡ Favorite"}
          </button>
          <button onClick={onClose} className="text-sm text-slate-500">
            Close
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Comments</h3>
          {comments.length === 0 ? (
            <p className="text-xs text-slate-400">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded bg-slate-50 p-2 text-sm">
                <span className="font-medium">{c.authorName}</span>: {c.body}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddComment} className="mt-3 space-y-2">
          <input
            required
            placeholder="Your name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <textarea
            required
            placeholder="Add a comment…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            rows={2}
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post comment"}
          </button>
        </form>
      </div>
    </div>
  );
}
