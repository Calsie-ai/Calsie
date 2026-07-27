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
        width: "min(760px, 100%)",
        aspectRatio: "16 / 5",
        margin: "0 auto 22px",
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
              left: "50%",
              top: "50%",
              width: "365%",
              height: "365%",
              maxWidth: "none",
              objectFit: "contain",
              objectPosition: "center",
              opacity: isActive ? 1 : 0,
              transform: isActive
                ? "translate(-50%, -50%) scale(1)"
                : "translate(-47%, -50%) scale(.98)",
              transition: "opacity 500ms ease, transform 500ms ease",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </button>
  );
}
