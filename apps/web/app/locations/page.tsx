"use client";

import { useEffect, useState } from "react";
import { LocationsMap } from "../../components/LocationsMap";
import { api, type GeocodeResult, type Location } from "../../lib/api";

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [draftPosition, setDraftPosition] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [form, setForm] = useState({ name: "", bestTimeOfDay: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const [addressQuery, setAddressQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([]);

  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listLocations()
      .then(setLocations)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const selected = locations.find((l) => l.id === selectedId) ?? null;

  function startAdding() {
    setAdding(true);
    setSelectedId(null);
    setDraftPosition(null);
    setGeocodeResults([]);
    setAddressQuery("");
    setForm({ name: "", bestTimeOfDay: "", notes: "" });
  }

  function cancelAdding() {
    setAdding(false);
    setDraftPosition(null);
  }

  async function handleSearchAddress() {
    if (!addressQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setGeocodeResults(await api.geocodeAddress(addressQuery));
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  }

  function handlePickResult(result: GeocodeResult) {
    setDraftPosition({ lat: result.latitude, lng: result.longitude });
    if (!form.name) {
      setForm({ ...form, name: result.displayName.split(",")[0] ?? result.displayName });
    }
    setGeocodeResults([]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!draftPosition) {
      setError("Click the map (or search an address) to set the location's position first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createLocation({
        name: form.name,
        latitude: draftPosition.lat,
        longitude: draftPosition.lng,
        bestTimeOfDay: form.bestTimeOfDay || undefined,
        notes: form.notes || undefined,
      });
      setLocations([...locations, created]);
      setAdding(false);
      setDraftPosition(null);
      setSelectedId(created.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteLocation(id);
      if (selectedId === id) setSelectedId(null);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleUploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected || !e.target.files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(e.target.files)) {
        await api.uploadLocationPhoto(selected.id, file);
      }
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!selected) return;
    setError(null);
    try {
      await api.deleteLocationPhoto(selected.id, photoId);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Locations</h1>
        {!adding && (
          <button
            onClick={startAdding}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Add location
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-xs text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="h-[480px]">
          <LocationsMap
            locations={locations}
            selectedId={selectedId}
            draftPosition={draftPosition}
            onSelect={(id) => {
              if (!adding) setSelectedId(id);
            }}
            onMapClick={(lat, lng) => {
              if (adding) setDraftPosition({ lat, lng });
            }}
          />
          {adding && (
            <p className="mt-2 text-xs text-slate-500">
              Click the map to drop a pin, or search an address below.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {adding ? (
            <form
              onSubmit={handleCreate}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <h2 className="text-sm font-semibold">New location</h2>

              <div className="flex gap-2">
                <input
                  placeholder="Search an address…"
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchAddress();
                    }
                  }}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={handleSearchAddress}
                  disabled={searching}
                  className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {searching ? "…" : "Search"}
                </button>
              </div>
              {geocodeResults.length > 0 && (
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded border border-slate-200 text-xs">
                  {geocodeResults.map((r, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => handlePickResult(r)}
                        className="w-full px-2 py-1.5 text-left hover:bg-slate-50"
                      >
                        {r.displayName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <input
                required
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
              <input
                placeholder="Best time of day (optional)"
                value={form.bestTimeOfDay}
                onChange={(e) => setForm({ ...form, bestTimeOfDay: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
              <textarea
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
              {draftPosition && (
                <p className="text-xs text-slate-500">
                  Pin at {draftPosition.lat.toFixed(5)}, {draftPosition.lng.toFixed(5)}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Save location"}
                </button>
                <button
                  type="button"
                  onClick={cancelAdding}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : selected ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold">{selected.name}</h2>
                  <p className="text-xs text-slate-500">
                    {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
              {selected.bestTimeOfDay && (
                <p className="text-xs text-slate-600">
                  Best time: {selected.bestTimeOfDay}
                </p>
              )}
              {selected.notes && <p className="text-xs text-slate-600">{selected.notes}</p>}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Reference photos
                </label>
                {selected.photos.length > 0 && (
                  <div className="mb-2 grid grid-cols-3 gap-1.5">
                    {selected.photos.map((p) => (
                      <div key={p.id} className="group relative">
                        <img
                          src={p.url}
                          alt={p.caption ?? ""}
                          className="aspect-square w-full rounded object-cover"
                        />
                        <button
                          onClick={() => handleDeletePhoto(p.id)}
                          className="absolute right-0.5 top-0.5 hidden rounded bg-black/60 px-1 text-[10px] text-white group-hover:block"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={handleUploadPhoto}
                  className="text-xs"
                />
                {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {loading
                ? "Loading…"
                : locations.length === 0
                  ? "No locations scouted yet."
                  : "Select a pin or list item to see details."}
            </p>
          )}

          {!adding && locations.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100 text-sm">
                {locations.map((loc) => (
                  <li key={loc.id}>
                    <button
                      onClick={() => setSelectedId(loc.id)}
                      className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${
                        loc.id === selectedId ? "bg-slate-50 font-medium" : ""
                      }`}
                    >
                      {loc.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
