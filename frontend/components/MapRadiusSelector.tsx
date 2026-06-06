"use client";

import { useState } from "react";

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
  const [city, setCity] = useState(value.selectedAddress || "");
  const [areaNote, setAreaNote] = useState("");
  const [usingLocation, setUsingLocation] = useState(false);
  const [message, setMessage] = useState("Add a city/suburb, or use your phone location. No Google Maps billing needed.");

  function buildAddress(nextCity = city, nextNote = areaNote) {
    return [nextCity.trim(), nextNote.trim()].filter(Boolean).join(" — ");
  }

  function updateArea(nextCity: string, nextNote = areaNote) {
    setCity(nextCity);
    onChange({
      ...value,
      selectedAddress: buildAddress(nextCity, nextNote),
      placeId: "manual-area",
    });
  }

  function updateNote(nextNote: string) {
    setAreaNote(nextNote);
    onChange({
      ...value,
      selectedAddress: buildAddress(city, nextNote),
      placeId: "manual-area",
    });
  }

  function updateRadius(radiusKm: number) {
    onChange({ ...value, radiusKm });
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("Your browser does not support location access. Type your city/suburb instead.");
      return;
    }

    setUsingLocation(true);
    setMessage("Asking your browser for your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const label = city.trim() || "My current area";
        onChange({
          ...value,
          selectedAddress: buildAddress(label, areaNote),
          placeId: "browser-geolocation",
          latitude,
          longitude,
        });
        setCity(label);
        setMessage("Location saved from your phone/browser. You can still edit the suburb name.");
        setUsingLocation(false);
      },
      () => {
        setMessage("Location permission was not allowed. Type your suburb or city instead.");
        setUsingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  return (
    <section style={styles.wrapper}>
      <p style={styles.title}>Target area</p>
      <p style={styles.helper}>Tell Applix where to look. Keep it simple: city, suburb, or a nearby landmark.</p>

      <div style={styles.areaCard}>
        <div style={styles.radiusVisual}>
          <span style={styles.centerDot} />
          <span style={styles.radiusRing} />
          <strong style={styles.radiusNumber}>{value.radiusKm}km</strong>
        </div>
        <div style={styles.areaCopy}>
          <strong>{value.selectedAddress || "Choose an area"}</strong>
          <span>{value.latitude && value.longitude ? `${value.latitude.toFixed(4)}, ${value.longitude.toFixed(4)}` : "Coordinates optional. Text area still works."}</span>
        </div>
      </div>

      <label style={styles.label}>
        City or suburb
        <input
          style={styles.input}
          value={city}
          onChange={(event) => updateArea(event.target.value)}
          placeholder="Burwood NSW, Parramatta, Melbourne CBD"
        />
      </label>

      <label style={styles.label}>
        Address or landmark, optional
        <input
          style={styles.input}
          value={areaNote}
          onChange={(event) => updateNote(event.target.value)}
          placeholder="near Burwood Station, around Westfield, CBD area"
        />
      </label>

      <div style={styles.quickRow}>
        <button type="button" style={styles.locationButton} onClick={useMyLocation} disabled={usingLocation}>
          {usingLocation ? "Finding you..." : "Use my location"}
        </button>
        <span style={styles.orText}>free browser location, no map API</span>
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

      <div style={styles.summaryBox}>
        <strong>{value.selectedAddress || "No target area selected yet"}</strong>
        <span>Radius: {value.radiusKm} km</span>
        <span>{message}</span>
      </div>
    </section>
  );
}

const styles = {
  wrapper: { marginTop: 20, padding: 16, borderRadius: 18, background: "rgba(2, 6, 23, 0.55)", border: "1px solid rgba(94, 231, 255, 0.2)" },
  title: { margin: "0 0 8px", color: "#ffffff", fontSize: 18, fontWeight: 900 },
  helper: { margin: 0, color: "#9ca3af", lineHeight: 1.5, fontWeight: 700 },
  areaCard: { display: "grid", gridTemplateColumns: "92px 1fr", gap: 14, alignItems: "center", marginTop: 16, padding: 14, borderRadius: 18, background: "linear-gradient(135deg, rgba(255,138,61,0.12), rgba(94,231,255,0.08))", border: "1px solid rgba(255, 138, 61, 0.26)" },
  radiusVisual: { position: "relative" as const, width: 78, height: 78, display: "grid", placeItems: "center" },
  radiusRing: { position: "absolute" as const, inset: 0, borderRadius: 999, border: "2px solid rgba(255, 138, 61, 0.75)", background: "rgba(255, 138, 61, 0.12)", boxShadow: "0 0 28px rgba(255, 138, 61, 0.2)" },
  centerDot: { position: "absolute" as const, width: 14, height: 14, borderRadius: 999, background: "#5ee7ff", boxShadow: "0 0 22px rgba(94,231,255,0.75)" },
  radiusNumber: { position: "absolute" as const, bottom: -8, padding: "4px 8px", borderRadius: 999, background: "#0b0f19", color: "#ffd08a", fontSize: 11 },
  areaCopy: { display: "grid", gap: 6, color: "#ffffff", fontWeight: 900 },
  label: { display: "grid", gap: 8, marginTop: 14, color: "#e5e7eb", fontWeight: 900 },
  input: { width: "100%", minWidth: 0, border: "1px solid rgba(255, 138, 61, 0.28)", borderRadius: 14, padding: "15px 16px", outline: "none", color: "#ffffff", background: "rgba(2, 6, 23, 0.75)", fontWeight: 800 },
  quickRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" as const },
  locationButton: { border: "1px solid rgba(94, 231, 255, 0.35)", borderRadius: 999, padding: "11px 14px", background: "rgba(94, 231, 255, 0.12)", color: "#dffbff", fontWeight: 900, cursor: "pointer" },
  orText: { color: "#9ca3af", fontWeight: 800, fontSize: 12 },
  select: { width: "100%", border: "1px solid rgba(255, 138, 61, 0.28)", borderRadius: 14, padding: "15px 16px", outline: "none", color: "#ffffff", background: "rgba(2, 6, 23, 0.75)", fontWeight: 800 },
  summaryBox: { marginTop: 14, padding: 14, borderRadius: 16, background: "rgba(15, 23, 42, 0.9)", color: "#cbd5e1", display: "grid", gap: 6, fontWeight: 800, border: "1px solid rgba(94, 231, 255, 0.16)" },
};
