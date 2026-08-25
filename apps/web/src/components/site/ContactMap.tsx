import type { SpContactMap } from "@windels/shared/sitePlatform";

function osmSrc(lat: number, lng: number, zoom: number) {
  const delta = Math.max(0.004, 0.18 / Math.max(1, zoom - 8));
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function ContactMap({ map }: { map: SpContactMap }) {
  const ready = Boolean(map.enabled && map.lat != null && map.lng != null);
  if (!ready) return null;
  const lat = map.lat!;
  const lng = map.lng!;
  const src = osmSrc(lat, lng, map.zoom);
  const place = [map.label, map.address, map.city, map.country].filter(Boolean).join(" · ");
  return (
    <section className="mt-10 overflow-hidden rounded-2xl border border-white/10">
      <div className="border-b border-white/10 bg-white/5 px-4 py-3">
        <div className="text-sm font-semibold text-text-bright">{map.label || "Location"}</div>
        {place ? <div className="text-xs text-text-muted">{place}</div> : null}
      </div>
      <iframe
        title="Office location map"
        src={src}
        className="h-72 w-full border-0 bg-navy-deep"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="px-4 py-2 text-[11px] text-text-muted">
        Map tiles: OpenStreetMap (no API key required). Super Admin sets the pin from the dashboard.
        {" "}<a className="text-azure" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${map.zoom}/${lat}/${lng}`} target="_blank" rel="noreferrer">Open in OpenStreetMap</a>
      </div>
    </section>
  );
}
