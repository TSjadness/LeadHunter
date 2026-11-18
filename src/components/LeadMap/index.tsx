import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = { id: string; name: string; lat: number; lng: number; subtitle?: string };

const STYLE = (dark: boolean) =>
  `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;
const isDark = () => document.documentElement.classList.contains("dark");

/** Browser-only: import lazily (see Lazy.tsx). Uses OpenFreeMap vector tiles. */
export default function LeadMap({
  points,
  selectedId,
  onSelect,
}: {
  points: MapPoint[];
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE(isDark()),
      center: [-47.9, -15.8],
      zoom: 3.5,
      attributionControl: { compact: true },
      fadeDuration: reduced ? 0 : 300,
      cooperativeGestures: window.matchMedia("(pointer: coarse)").matches, // two-finger pan on phones: page scroll keeps working
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    // Follow light/dark theme changes.
    const obs = new MutationObserver(() => map.setStyle(STYLE(isDark())));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);
    return () => {
      obs.disconnect();
      ro.disconnect();
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    const color =
      getComputedStyle(document.documentElement).getPropertyValue("--marker").trim() || "red";
    for (const p of points) {
      const m = new maplibregl.Marker({ color })
        .setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 24, closeButton: false }).setText(p.name))
        .addTo(map);
      const el = m.getElement();
      el.style.cursor = "pointer";
      el.setAttribute("aria-label", p.name);
      el.addEventListener("click", () => onSelectRef.current?.(p.id));
      markers.current.set(p.id, m);
    }
    if (points.length) {
      const b = new maplibregl.LngLatBounds();
      points.forEach((p) => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 600 });
    }
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach((m, id) => {
      m.getElement().style.zIndex = id === selectedId ? "10" : "";
      const svg = m.getElement().querySelector("svg");
      if (svg) {
        svg.style.transition = "transform 150ms ease";
        svg.style.transformOrigin = "bottom center";
        svg.style.transform = id === selectedId ? "scale(1.35)" : "";
      }
    });
    const p = points.find((x) => x.id === selectedId);
    if (p && map) {
      map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), essential: false });
      markers.current.get(p.id)?.togglePopup();
    }
  }, [selectedId, points]);

  return (
    <div
      ref={ref}
      className="h-full w-full overflow-hidden rounded-xl"
      role="region"
      aria-label="Mapa dos resultados"
    />
  );
}
