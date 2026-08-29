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
        maxWidth: "400px",
        height: "80px",
        margin: "0 auto",
        padding: 0,
        overflow: "hidden",
        border: "1.5px solid #e4e4e7",
        borderRadius: "4px",
        background: "#f8f9fa",
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
              top: "50%",
              left: "50%",
              transform: isActive ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.95)",
              width: "auto",
              height: "40px",
              objectFit: "contain",
              opacity: isActive ? 1 : 0,
              transition: "opacity 300ms ease, transform 300ms ease",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </button>
  );
}
