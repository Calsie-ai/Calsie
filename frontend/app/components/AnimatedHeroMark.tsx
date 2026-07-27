"use client";

import { useEffect, useState } from "react";

const heroMarks = [
  { src: "/branding/calsie-jobs.svg", alt: "Calsie Jobs" },
  { src: "/branding/smash-pass.svg", alt: "Smash Pass" },
] as const;

export default function AnimatedHeroMark() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % heroMarks.length);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  function showNextMark() {
    setActiveIndex((current) => (current + 1) % heroMarks.length);
  }

  return (
    <button
      type="button"
      onClick={showNextMark}
      aria-label={`Showing ${heroMarks[activeIndex].alt}. Click to show the next graphic.`}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        maxWidth: "560px",
        aspectRatio: "16 / 5",
        margin: "0 0 20px",
        padding: 0,
        overflow: "hidden",
        border: 0,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {heroMarks.map((mark, index) => {
        const isActive = index === activeIndex;

        return (
          <img
            key={mark.src}
            src={mark.src}
            alt={isActive ? mark.alt : ""}
            aria-hidden={!isActive}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "left center",
              opacity: isActive ? 1 : 0,
              transform: isActive ? "translateX(0)" : "translateX(18px)",
              transition: "opacity 500ms ease, transform 500ms ease",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </button>
  );
}
