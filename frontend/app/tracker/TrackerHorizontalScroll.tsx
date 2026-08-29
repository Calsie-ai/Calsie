"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function TrackerHorizontalScroll() {
  const [mount, setMount] = useState<Element | null>(null);

  useEffect(() => {
    const findMount = () => setMount(document.querySelector(".sheet-title-actions"));
    findMount();
    const timer = window.setInterval(findMount, 400);
    return () => window.clearInterval(timer);
  }, []);

  function scrollSheet(direction: "left" | "right") {
    const tableWrap = document.querySelector<HTMLElement>(".agent-table-wrap");
    if (!tableWrap) return;
    const distance = Math.max(240, Math.round(tableWrap.clientWidth * 0.65));
    tableWrap.scrollBy({ left: direction === "left" ? -distance : distance, behavior: "smooth" });
  }

  if (!mount) return null;

  return createPortal(
    <div className="sheet-scroll-actions" aria-label="Move application sheet horizontally">
      <button type="button" className="sheet-scroll-button" aria-label="Move sheet left" title="Move sheet left" onClick={() => scrollSheet("left")}>←</button>
      <button type="button" className="sheet-scroll-button" aria-label="Move sheet right" title="Move sheet right" onClick={() => scrollSheet("right")}>→</button>
    </div>,
    mount,
  );
}
