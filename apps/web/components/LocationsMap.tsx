"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Location } from "../lib/api";

// Free substitute for a paid/key-gated map (e.g. Google Maps JS API):
// OpenStreetMap tiles need no API key and work fully locally, consistent
// with this app's pattern of swapping free/local infra in wherever a real
// working substitute exists (see also: MinIO for R2, cron for Trigger.dev).
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]; // NYC — arbitrary fallback when there's nothing to show yet

type LeafletModule = typeof import("leaflet");

export function LocationsMap({
  locations,
  selectedId,
  draftPosition,
  onSelect,
  onMapClick,
}: {
  locations: Location[];
  selectedId?: string | null;
  draftPosition?: { lat: number; lng: number } | null;
  onSelect?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const draftMarkerRef = useRef<import("leaflet").Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      // Bundler asset resolution breaks Leaflet's default marker icon paths —
      // point them at the CDN copies instead of fighting Turbopack for them.
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 11);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const loc of locations) {
      const marker = L.marker([loc.latitude, loc.longitude]).addTo(map);
      marker.bindPopup(loc.name);
      marker.on("click", () => onSelectRef.current?.(loc.id));
      markersRef.current.set(loc.id, marker);
    }

    if (locations.length > 0 && !draftPosition) {
      const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude]));
      map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
    }
  }, [locations, draftPosition]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;

    if (draftPosition) {
      draftMarkerRef.current = L.marker([draftPosition.lat, draftPosition.lng], {
        opacity: 0.75,
      }).addTo(map);
      map.setView([draftPosition.lat, draftPosition.lng], Math.max(map.getZoom(), 13));
    }
  }, [draftPosition]);

  useEffect(() => {
    for (const [id, marker] of markersRef.current.entries()) {
      marker.setOpacity(!selectedId || id === selectedId ? 1 : 0.5);
    }
  }, [selectedId, locations]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[320px] w-full rounded-lg border border-slate-200"
    />
  );
}
