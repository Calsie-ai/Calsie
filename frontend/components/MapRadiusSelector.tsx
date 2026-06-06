"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

declare global {
  interface Window {
    google?: any;
    applixGoogleMapsReady?: Promise<void>;
  }
}

const DEFAULT_CENTER = { lat: -33.8688, lng: 151.2093 };
const DEFAULT_MAP_QUERY = "Sydney NSW Australia";
const PUBLIC_MAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("Window is not available"));
  if (window.google?.maps) return Promise.resolve();
  if (window.applixGoogleMapsReady) return window.applixGoogleMapsReady;

  if (!PUBLIC_MAP_KEY) return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));

  window.applixGoogleMapsReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${PUBLIC_MAP_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Maps"));
    document.head.appendChild(script);
  });

  return window.applixGoogleMapsReady;
}

export default function MapRadiusSelector({ value, onChange }: Props) {
  const [addressInput, setAddressInput] = useState(value.selectedAddress || "");
  const [loading, setLoading] = useState(false);
  const [usingLocation, setUsingLocation] = useState(false);
  const [message, setMessage] = useState("Tap the map, use your location, or search an area so Applix knows where to look.");
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const hasLockedLocation = Boolean(value.latitude && value.longitude);

  const fallbackMapUrl = useMemo(() => {
    const query = hasLockedLocation
      ? encodeURIComponent(`${value.latitude},${value.longitude}`)
      : encodeURIComponent(DEFAULT_MAP_QUERY);
    const zoom = hasLockedLocation ? 12 : 10;
    return `https://www.google.com/maps?q=${query}&z=${zoom}&output=embed`;
  }, [hasLockedLocation, value.latitude, value.longitude]);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapElementRef.current || !window.google?.maps) return;

        const center = hasLockedLocation
          ? { lat: value.latitude, lng: value.longitude }
          : DEFAULT_CENTER;

        const map = new window.google.maps.Map(mapElementRef.current, {
          center,
          zoom: hasLockedLocation ? 12 : 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });

        mapRef.current = map;
        setMapReady(true);
        setMapError("");

        const marker = new window.google.maps.Marker({
          position: center,
          map,
          draggable: true,
          visible: hasLockedLocation,
          title: "Applix target area",
        });
        markerRef.current = marker;

        const circle = new window.google.maps.Circle({
          map,
          center,
          radius: value.radiusKm * 1000,
          strokeColor: "#ff8a3d",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#ff8a3d",
          fillOpacity: 0.16,
          visible: hasLockedLocation,
        });
        circleRef.current = circle;

        function lockPin(position: any, label = "Pinned on map") {
          const latitude = position.lat();
          const longitude = position.lng();
          marker.setPosition(position);
          marker.setVisible(true);
          circle.setCenter(position);
          circle.setVisible(true);
          map.panTo(position);
          onChange({
            ...value,
            selectedAddress: label,
            placeId: "map-pin",
            latitude,
            longitude,
          });
          setAddressInput(label);
          setMessage("Pin locked. You can drag it or tap another spot on the map.");
        }

        map.addListener("click", (event: any) => {
          if (event.latLng) lockPin(event.latLng);
        });

        marker.addListener("dragend", (event: any) => {
          if (event.latLng) lockPin(event.latLng, "Pinned from dragged map marker");
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(error?.message || "Interactive map unavailable");
          setMessage("Interactive pin map is unavailable. Search an area or use your location instead.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;

    const center = hasLockedLocation
      ? { lat: value.latitude, lng: value.longitude }
      : DEFAULT_CENTER;

    markerRef.current.setPosition(center);
    markerRef.current.setVisible(hasLockedLocation);
    circleRef.current.setCenter(center);
    circleRef.current.setRadius(value.radiusKm * 1000);
    circleRef.current.setVisible(hasLockedLocation);

    if (hasLockedLocation) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(12);
    }
  }, [hasLockedLocation, value.latitude, value.longitude, value.radiusKm]);

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
        setMessage("Location locked from your browser. You can drag the pin or search another area.");
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
      <p style={styles.helper}>Tap the map to drop a pin, drag the pin, use your location, or search a suburb.</p>

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
          {loading ? "Finding..." : "Find"}
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
        {mapError ? (
          <iframe title="Applix target map preview" src={fallbackMapUrl} style={styles.iframe} loading="lazy" />
        ) : (
          <div ref={mapElementRef} style={styles.interactiveMap} />
        )}

        {!hasLockedLocation && (
          <div style={styles.mapOverlay}>
            <strong>{mapReady ? "Tap the map to place your pin" : "Loading map..."}</strong>
            <span>{mapError ? "Fallback preview active. Search or use location to lock coordinates." : "Use your finger on phone. Drag the pin after placing it."}</span>
          </div>
        )}
      </div>

      <div style={styles.summaryBox}>
        <strong>{value.selectedAddress || "No target area selected yet"}</strong>
        <span>{value.latitude && value.longitude ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : "Tap the map, search, or use your location to lock coordinates."}</span>
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
    minWidth: 0,
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
    height: "min(62vw, 340px)",
    minHeight: 280,
    marginTop: 16,
    borderRadius: 18,
    overflow: "hidden",
    background: "#07101a",
    border: "1px solid rgba(255, 138, 61, 0.25)",
    touchAction: "pan-x pan-y",
  },
  interactiveMap: { width: "100%", height: "100%" },
  iframe: { width: "100%", height: "100%", border: 0, filter: "saturate(0.86) contrast(0.98) brightness(0.82)" },
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
  summaryBox: { marginTop: 14, padding: 14, borderRadius: 16, background: "rgba(15, 23, 42, 0.9)", color: "#cbd5e1", display: "grid", gap: 6, fontWeight: 800, border: "1px solid rgba(94, 231, 255, 0.16)" },
};
