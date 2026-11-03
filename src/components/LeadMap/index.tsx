import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = { id: string; name: string; lat: number; lng: number; subtitle?: string };

/** Browser-only: import lazily. Uses OpenFreeMap vector tiles. */
export default function LeadMap({
  points,
  selectedId,
  onSelect,
}: {
  points: MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-47.9, -15.8],
      zoom: 3.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    const color = getComputedStyle(document.documentElement).getPropertyValue("--marker").trim() || "red";
    markers.current = points.map((p) => {
      const m = new maplibregl.Marker({ color })
        .setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setText(p.name))
        .addTo(map);
      m.getElement().style.cursor = "pointer";
      m.getElement().addEventListener("click", () => onSelect?.(p.id));
      return m;
    });
    if (points.length) {
      const b = new maplibregl.LngLatBounds();
      points.forEach((p) => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 600 });
    }
  }, [points, onSelect]);

  useEffect(() => {
    const p = points.find((x) => x.id === selectedId);
    if (p && mapRef.current) mapRef.current.flyTo({ center: [p.lng, p.lat], zoom: 16 });
  }, [selectedId, points]);

  return <div ref={ref} className="h-full w-full overflow-hidden rounded-xl" />;
}
