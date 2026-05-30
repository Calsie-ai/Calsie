"use client";

import { useMemo, useState } from "react";

export type MapSelection = {
  selectedAddress: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
};

type Props = {
  value: MapSelection;
  onChange: (value: MapSelection) => void;
};

export default function MapRadiusSelector({ value, onChange }: Props) {
  const [addressInput, setAddressInput] = useState(value.selectedAddress || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Search an address or suburb to lock the campaign area.");

  const mapUrl = useMemo(() => {
    if (!value.latitude || !value.longitude) return "";
    const query = encodeURIComponent(`${value.latitude},${value.longitude}`);
    return `https://www.google.com/maps?q=${query}&z=11&output=embed`;
  }, [value.latitude, value.longitude]);

  const circleSize = useMemo(() => {
    const min = 72;
    const max = 240;
    const size = Math.round(min + (value.radiusKm / 50) * (max - min));
    return Math.min(max, Math.max(min, size));
  }, [value.radiusKm]);

  async function findLocation() {
    const address = addressInput.trim();
    if (!address) {
      setMessage("Type a suburb, city, or address first.");
      return;
    }

    setLoading(true);
    setMessage("Finding location...");

    try {
      const response = await fetch(`/api/maps/geocode?address=${encodeURIComponent(address)}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not find location");
      }

      onChange({
        ...value,
        selectedAddress: data.selectedAddress,
        placeId: data.placeId,
        latitude: data.latitude,
        longitude: data.longitude,
      });
      setAddressInput(data.selectedAddress);
      setMessage("Location locked. Applix will use these coordinates for scraping.");
    } catch (error: any) {
      setMessage(error?.message || "Could not find that location.");
    } finally {
      setLoading(false);
    }
  }

  function updateRadius(radiusKm: number) {
    onChange({ ...value, radiusKm });
  }

  return (
    <section style={styles.wrapper}>
      <p style={styles.title}>Select campaign area</p>
      <p style={styles.helper}>This creates the map boundary Python will use to scrape relevant nearby companies.</p>

      <div style={styles.searchRow}>
        <input
          style={styles.input}
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          placeholder="Example: Burwood NSW, Parramatta, Melbourne CBD"
        />
        <button type="button" style={styles.searchButton} onClick={findLocation} disabled={loading}>
          {loading ? "Searching..." : "Find area"}
        </button>
      </div>

      <label style={styles.label}>
        Search radius
        <select style={styles.select} value={value.radiusKm} onChange={(event) => updateRadius(Number(event.target.value))}>
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
          <option value={20}>20 km</option>
          <option value={30}>30 km</option>
          <option value={50}>50 km</option>
        </select>
      </label>

      <div style={styles.mapFrame}>
        {mapUrl ? <iframe title="Selected campaign area" src={mapUrl} style={styles.iframe} loading="lazy" /> : <p style={styles.mapMessage}>Map preview appears after location is found.</p>}
        {mapUrl && (
          <div style={{ ...styles.radiusCircle, width: circleSize, height: circleSize }}>
            <span style={styles.pin}>●</span>
            <span style={styles.radiusLabel}>{value.radiusKm} km</span>
          </div>
        )}
      </div>

      <div style={styles.summaryBox}>
        <strong>{value.selectedAddress || "No location selected yet"}</strong>
        <span>{value.latitude && value.longitude ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : "Coordinates not captured yet."}</span>
        <span>Radius: {value.radiusKm} km</span>
        <span>{message}</span>
      </div>
    </section>
  );
}

const styles = {
  wrapper: { marginTop: 20, padding: 18, borderRadius: 24, background: "#f8fafc", border: "1px solid #e5e7eb" },
  title: { margin: "0 0 8px", fontSize: 18, fontWeight: 900 },
  helper: { margin: 0, color: "#6b7280", lineHeight: 1.5, fontWeight: 700 },
  searchRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 14 },
  input: { width: "100%", border: "1px solid #d1d5db", borderRadius: 18, padding: "16px 18px", outline: "none", color: "#111827", background: "#ffffff", fontWeight: 700 },
  searchButton: { border: 0, borderRadius: 18, padding: "0 18px", background: "#111827", color: "white", fontWeight: 900, cursor: "pointer" },
  label: { display: "grid", gap: 8, marginTop: 14, color: "#374151", fontWeight: 900 },
  select: { width: "100%", border: "1px solid #d1d5db", borderRadius: 18, padding: "16px 18px", outline: "none", color: "#111827", background: "#ffffff", fontWeight: 700 },
  mapFrame: { position: "relative" as const, minHeight: 260, marginTop: 16, borderRadius: 22, overflow: "hidden", background: "linear-gradient(135deg, #dbeafe 0%, #ecfeff 48%, #dcfce7 100%)", display: "grid", placeItems: "center" },
  iframe: { width: "100%", height: 260, border: 0 },
  radiusCircle: { position: "absolute" as const, left: "50%", top: "50%", transform: "translate(-50%, -50%)", borderRadius: 9999, border: "3px solid rgba(124, 58, 237, 0.9)", background: "rgba(124, 58, 237, 0.16)", display: "grid", placeItems: "center", pointerEvents: "none" as const, boxShadow: "0 0 40px rgba(124, 58, 237, 0.35)" },
  pin: { width: 26, height: 26, borderRadius: 999, background: "#111827", color: "white", display: "grid", placeItems: "center", fontSize: 10, lineHeight: 1 },
  radiusLabel: { position: "absolute" as const, bottom: 12, padding: "6px 10px", borderRadius: 999, background: "white", color: "#111827", fontWeight: 900, fontSize: 12, boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)" },
  mapMessage: { padding: 18, color: "#374151", fontWeight: 900, textAlign: "center" as const },
  summaryBox: { marginTop: 14, padding: 14, borderRadius: 18, background: "#ffffff", color: "#374151", display: "grid", gap: 6, fontWeight: 800 },
};
