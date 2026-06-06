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

const DEFAULT_MAP_QUERY = "Sydney NSW Australia";

export default function MapRadiusSelector({ value, onChange }: Props) {
  const [addressInput, setAddressInput] = useState(value.selectedAddress || "");
  const [loading, setLoading] = useState(false);
  const [usingLocation, setUsingLocation] = useState(false);
  const [message, setMessage] = useState("Search an area or use your location so Applix knows where to look.");

  const hasLockedLocation = Boolean(value.latitude && value.longitude);

  const mapUrl = useMemo(() => {
    const query = hasLockedLocation
      ? encodeURIComponent(`${value.latitude},${value.longitude}`)
      : encodeURIComponent(DEFAULT_MAP_QUERY);
    const zoom = hasLockedLocation ? 11 : 10;
    return `https://www.google.com/maps?q=${query}&z=${zoom}&output=embed`;
  }, [hasLockedLocation, value.latitude, value.longitude]);

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
    setMessage("Finding that area on Google Maps...");

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
      setMessage("Target area locked. Applix will look around this location.");
    } catch (error: any) {
      setMessage(error?.message || "Could not find that location.");
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("Your browser does not support location access. Search your suburb instead.");
      return;
    }

    setUsingLocation(true);
    setMessage("Asking your browser for your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        onChange({
          ...value,
          selectedAddress: "My current location",
          placeId: "browser-geolocation",
          latitude,
          longitude,
        });
        setAddressInput("My current location");
        setMessage("Location locked from your browser. You can still search another area if you want.");
        setUsingLocation(false);
      },
      () => {
        setMessage("Location permission was not allowed. Search your suburb or address instead.");
        setUsingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function updateRadius(radiusKm: number) {
    onChange({ ...value, radiusKm });
  }

  return (
    <section style={styles.wrapper}>
      <p style={styles.title}>Target location</p>
      <p style={styles.helper}>Use your current location or search the suburb where Applix should start looking.</p>

      <div style={styles.quickRow}>
        <button type="button" style={styles.locationButton} onClick={useMyLocation} disabled={usingLocation}>
          {usingLocation ? "Finding you..." : "Use my location"}
        </button>
        <span style={styles.orText}>or search manually</span>
      </div>

      <div style={styles.searchRow}>
        <input
          style={styles.input}
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              findLocation();
            }
          }}
          placeholder="Burwood NSW, Parramatta, Melbourne CBD"
        />
        <button type="button" style={styles.searchButton} onClick={findLocation} disabled={loading}>
          {loading ? "Finding..." : "Find on map"}
        </button>
      </div>

      <label style={styles.label}>
        How far should Applix look?
        <select style={styles.select} value={value.radiusKm} onChange={(event) => updateRadius(Number(event.target.value))}>
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
          <option value={20}>20 km</option>
          <option value={30}>30 km</option>
          <option value={50}>50 km</option>
        </select>
      </label>

      <div style={styles.mapFrame}>
        <iframe title="Applix target map" src={mapUrl} style={styles.iframe} loading="lazy" />
        {!hasLockedLocation && (
          <div style={styles.mapOverlay}>
            <strong>Map is ready</strong>
            <span>Use your location or search a suburb to lock Applix there.</span>
          </div>
        )}
        {hasLockedLocation && (
          <div style={{ ...styles.radiusCircle, width: circleSize, height: circleSize }}>
            <span style={styles.pin}>●</span>
            <span style={styles.radiusLabel}>{value.radiusKm} km</span>
          </div>
        )}
      </div>

      <div style={styles.summaryBox}>
        <strong>{value.selectedAddress || "Previewing Sydney map"}</strong>
        <span>{value.latitude && value.longitude ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : "Use your location or search your real target area to lock coordinates."}</span>
        <span>Radius: {value.radiusKm} km</span>
        <span>{message}</span>
      </div>
    </section>
  );
}

const styles = {
  wrapper: {
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    background: "rgba(2, 6, 23, 0.55)",
    border: "1px solid rgba(94, 231, 255, 0.2)",
  },
  title: { margin: "0 0 8px", color: "#ffffff", fontSize: 18, fontWeight: 900 },
  helper: { margin: 0, color: "#9ca3af", lineHeight: 1.5, fontWeight: 700 },
  quickRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" as const },
  locationButton: {
    border: "1px solid rgba(94, 231, 255, 0.35)",
    borderRadius: 999,
    padding: "11px 14px",
    background: "rgba(94, 231, 255, 0.12)",
    color: "#dffbff",
    fontWeight: 900,
    cursor: "pointer",
  },
  orText: { color: "#9ca3af", fontWeight: 800, fontSize: 12 },
  searchRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 12 },
  input: {
    width: "100%",
    border: "1px solid rgba(255, 138, 61, 0.28)",
    borderRadius: 14,
    padding: "15px 16px",
    outline: "none",
    color: "#ffffff",
    background: "rgba(2, 6, 23, 0.75)",
    fontWeight: 800,
  },
  searchButton: {
    border: 0,
    borderRadius: 14,
    padding: "0 16px",
    background: "linear-gradient(135deg, #ff8a3d, #ffd08a)",
    color: "#0b0f19",
    fontWeight: 900,
    cursor: "pointer",
  },
  label: { display: "grid", gap: 8, marginTop: 14, color: "#e5e7eb", fontWeight: 900 },
  select: {
    width: "100%",
    border: "1px solid rgba(255, 138, 61, 0.28)",
    borderRadius: 14,
    padding: "15px 16px",
    outline: "none",
    color: "#ffffff",
    background: "rgba(2, 6, 23, 0.75)",
    fontWeight: 800,
  },
  mapFrame: {
    position: "relative" as const,
    minHeight: 260,
    marginTop: 16,
    borderRadius: 18,
    overflow: "hidden",
    background: "#07101a",
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(255, 138, 61, 0.25)",
  },
  iframe: { width: "100%", height: 260, border: 0, filter: "saturate(0.86) contrast(0.98) brightness(0.82)" },
  mapOverlay: {
    position: "absolute" as const,
    left: 14,
    right: 14,
    bottom: 14,
    display: "grid",
    gap: 4,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(2, 6, 23, 0.82)",
    border: "1px solid rgba(94, 231, 255, 0.22)",
    color: "#ffffff",
    fontWeight: 900,
    pointerEvents: "none" as const,
  },
  radiusCircle: {
    position: "absolute" as const,
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    borderRadius: 9999,
    border: "3px solid rgba(255, 138, 61, 0.95)",
    background: "rgba(255, 138, 61, 0.16)",
    display: "grid",
    placeItems: "center",
    pointerEvents: "none" as const,
    boxShadow: "0 0 42px rgba(255, 138, 61, 0.36)",
  },
  pin: { width: 26, height: 26, borderRadius: 999, background: "#0b0f19", color: "#5ee7ff", display: "grid", placeItems: "center", fontSize: 10, lineHeight: 1 },
  radiusLabel: { position: "absolute" as const, bottom: 12, padding: "6px 10px", borderRadius: 999, background: "#0b0f19", color: "#ffd08a", fontWeight: 900, fontSize: 12, boxShadow: "0 8px 20px rgba(0, 0, 0, 0.25)" },
  summaryBox: { marginTop: 14, padding: 14, borderRadius: 16, background: "rgba(15, 23, 42, 0.9)", color: "#cbd5e1", display: "grid", gap: 6, fontWeight: 800, border: "1px solid rgba(94, 231, 255, 0.16)" },
};
