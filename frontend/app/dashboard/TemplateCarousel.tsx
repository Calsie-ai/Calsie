"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { shouldAutoAdvance, slideLabel, stepIndex, wrapIndex } from "../../lib/carousel";
import { templateCategoryIcon, type CampaignTemplate } from "./workspace-data";

type Props = {
  templates: CampaignTemplate[];
  loading?: boolean;
  /** Opens the template's detail view on the Browse Templates panel. */
  onOpenTemplate: (template: CampaignTemplate) => void;
  onBrowseTemplates: () => void;
  /** Milliseconds between automatic slides. */
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 4500;

export default function TemplateCarousel({
  templates,
  loading,
  onOpenTemplate,
  onBrowseTemplates,
  intervalMs = DEFAULT_INTERVAL_MS,
}: Props) {
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);

  const count = templates.length;

  // Keep the index valid if the list shrinks underneath us.
  useEffect(() => {
    setIndex((current) => wrapIndex(current, count));
  }, [count]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const running = shouldAutoAdvance({ slideCount: count, interacting, reducedMotion });

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setIndex((current) => stepIndex(current, count, 1));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [count, intervalMs, running]);

  const go = useCallback((direction: 1 | -1) => {
    setIndex((current) => stepIndex(current, count, direction));
  }, [count]);

  // Left/right arrows move between slides while the carousel has focus.
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
  }, [go]);

  if (loading) {
    return (
      <div className="ws-carousel is-loading" aria-hidden="true">
        <span className="ws-skeleton ws-carousel-skel" />
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="ws-carousel is-empty">
        <span className="ws-carousel-empty-icon" aria-hidden="true"><Layers size={22} strokeWidth={1.9} /></span>
        <h2 className="ws-preview-title">Template preview</h2>
        <p className="ws-preview-text">No templates are available right now.</p>
        <button type="button" className="ws-btn-outline" onClick={onBrowseTemplates}>Browse templates</button>
      </div>
    );
  }

  const active = templates[wrapIndex(index, count)];

  return (
    <div
      ref={regionRef}
      className="ws-carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label="Campaign templates"
      tabIndex={0}
      onKeyDown={onKeyDown}
      // Pausing on hover and on focus-within is what makes an auto-rotating
      // carousel usable: without it the slide moves out from under the
      // pointer just as someone goes to click it.
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false);
      }}
    >
      <div className="ws-carousel-viewport">
        {templates.map((template, slide) => {
          const CategoryIcon = templateCategoryIcon(template.category);
          const isActive = slide === wrapIndex(index, count);
          return (
            <button
              key={template.id}
              type="button"
              className={`ws-carousel-slide${isActive ? " is-active" : ""}`}
              // Off-screen slides are removed from the tab order and the
              // accessibility tree, so keyboard and screen-reader users are
              // not walked through cards they cannot see.
              aria-hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onOpenTemplate(template)}
            >
              {template.imageUrl ? (
                <img src={template.imageUrl} alt="" className="ws-carousel-img" loading="lazy" />
              ) : (
                <span className="ws-carousel-fallback" aria-hidden="true">
                  <CategoryIcon size={30} strokeWidth={1.6} />
                </span>
              )}
              <span className="ws-carousel-body">
                <small>{template.category}</small>
                <strong>{template.title}</strong>
                <span>{template.role} · {template.location}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="ws-carousel-nav is-prev"
        aria-label="Previous template"
        onClick={() => go(-1)}
      >
        <ChevronLeft size={18} strokeWidth={2.3} />
      </button>
      <button
        type="button"
        className="ws-carousel-nav is-next"
        aria-label="Next template"
        onClick={() => go(1)}
      >
        <ChevronRight size={18} strokeWidth={2.3} />
      </button>

      <div className="ws-carousel-dots" role="tablist" aria-label="Choose a template to preview">
        {templates.map((template, slide) => (
          <button
            key={template.id}
            type="button"
            role="tab"
            className={slide === wrapIndex(index, count) ? "is-active" : ""}
            aria-selected={slide === wrapIndex(index, count)}
            aria-label={template.title}
            onClick={() => setIndex(slide)}
          />
        ))}
      </div>

      {/* Announces the slide without the visual label taking up room. */}
      <span className="ws-acct-sr-only" aria-live="polite">
        {slideLabel(index, count)}: {active.title}
      </span>
    </div>
  );
}
