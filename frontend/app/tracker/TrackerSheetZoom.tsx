"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.3;
const STEP = 0.1;

export default function TrackerSheetZoom() {
  const [mount, setMount] = useState<Element | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const findMount = () => setMount(document.querySelector(".sheet-title-actions"));
    findMount();
    const timer = window.setInterval(findMount, 300);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const table = document.querySelector<HTMLElement>(".editable-sheet-table");
    if (!table) return;
    table.style.setProperty("--sheet-zoom", zoom.toFixed(2));
  }, [zoom, mount]);

  if (!mount) return null;

  const zoomOut = () => setZoom((value) => Math.max(MIN_ZOOM, Number((value - STEP).toFixed(2))));
  const zoomIn = () => setZoom((value) => Math.min(MAX_ZOOM, Number((value + STEP).toFixed(2))));

  return createPortal(
    <div className="sheet-zoom-controls" aria-label="Application sheet zoom controls">
      <button
        type="button"
        className="sheet-zoom-button"
        onClick={zoomOut}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Zoom out application sheet"
        title="Zoom out application sheet"
      >
        −
      </button>
      <span className="sheet-zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        className="sheet-zoom-button"
        onClick={zoomIn}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in application sheet"
        title="Zoom in application sheet"
      >
        +
      </button>
    </div>,
    mount,
  );
}
