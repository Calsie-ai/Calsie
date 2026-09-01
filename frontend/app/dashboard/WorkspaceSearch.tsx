"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  DASHBOARD_PAGE_ITEMS,
  DASHBOARD_SECTION_ITEMS,
  SEARCH_GROUP_LABELS,
  searchDashboard,
  type SearchItem,
  type SearchItemKind,
} from "../../lib/dashboardSearch";
import { CAMPAIGN_TEMPLATES, type WorkspaceTab } from "./workspace-data";

type Props = {
  onNavigate: (panel: WorkspaceTab) => void;
  onOpenTemplate: (slug: string) => void;
};

// Static template list — always available regardless of which panel is
// open, so search works everywhere without adding a Supabase fetch to
// every dashboard load.
const TEMPLATE_ITEMS: SearchItem[] = CAMPAIGN_TEMPLATES.map((template) => ({
  id: `template:${template.slug || template.id}`,
  kind: "template" as const,
  label: template.title,
  sublabel: template.category,
  keywords: [template.role, template.category, template.campaignName || ""].filter(Boolean),
  panel: "templates" as WorkspaceTab,
  templateSlug: template.slug || template.id,
}));

const ALL_ITEMS: SearchItem[] = [...DASHBOARD_PAGE_ITEMS, ...DASHBOARD_SECTION_ITEMS, ...TEMPLATE_ITEMS];

const GROUP_ORDER: SearchItemKind[] = ["page", "section", "template"];

export default function WorkspaceSearch({ onNavigate, onOpenTemplate }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchDashboard(query, ALL_ITEMS), [query]);

  // Results are rendered grouped, but arrow keys move through one flat
  // list — this keeps the rendered order and the keyboard order identical.
  const ordered = useMemo(() => {
    const out: SearchItem[] = [];
    for (const kind of GROUP_ORDER) out.push(...results.filter((item) => item.kind === kind));
    return out;
  }, [results]);

  useEffect(() => setActiveIndex(0), [query]);

  // ⌘K / Ctrl+K focuses search, matching the hint shown in the field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close when focus or a click goes elsewhere. Uses pointerdown rather
  // than click so the panel closes before a click lands on whatever is
  // underneath it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(item: SearchItem) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (item.kind === "template" && item.templateSlug) onOpenTemplate(item.templateSlug);
    else onNavigate(item.panel);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (query) setQuery("");
      else inputRef.current?.blur();
      setOpen(false);
      return;
    }
    if (!ordered.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % ordered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + ordered.length) % ordered.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = ordered[activeIndex];
      if (item) choose(item);
    }
  }

  const showPanel = open && query.trim().length > 0;
  const activeId = ordered[activeIndex] ? `ws-search-opt-${ordered[activeIndex].id}` : undefined;

  return (
    <div className="ws-search-root" ref={rootRef}>
      <label className="ws-search">
        <Search size={19} strokeWidth={1.9} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search anything..."
          title="Search pages, sections and templates (Ctrl+K)"
          aria-label="Search pages, sections and templates"
          aria-keyshortcuts="Control+K Meta+K"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="ws-search-results"
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {/* The ⌘K badge is replaced by the Calsie mark. The shortcut still
            works, so its hint moves to the input's title rather than being
            lost entirely. */}
        <img className="ws-search-mark" src="/applix-logo.svg" alt="" aria-hidden="true" />
      </label>

      {showPanel ? (
        <div className="ws-search-panel" id="ws-search-results" role="listbox" aria-label="Search results">
          {ordered.length === 0 ? (
            <p className="ws-search-empty">No matches for &ldquo;{query.trim()}&rdquo;</p>
          ) : (
            GROUP_ORDER.map((kind) => {
              const group = results.filter((item) => item.kind === kind);
              if (!group.length) return null;
              return (
                <div className="ws-search-group" key={kind}>
                  <p className="ws-search-group-label">{SEARCH_GROUP_LABELS[kind]}</p>
                  {group.map((item) => {
                    const index = ordered.indexOf(item);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        id={`ws-search-opt-${item.id}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        className={`ws-search-option${index === activeIndex ? " is-active" : ""}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(item)}
                      >
                        <span className="ws-search-option-label">{item.label}</span>
                        {item.sublabel ? <span className="ws-search-option-sub">{item.sublabel}</span> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
