"use client";

import { useEffect, useRef } from "react";
import { Bell, Search } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

type Props = {
  displayName: string;
  initial: string;
  hideSearch?: boolean;
};

export default function WorkspaceTopbar({ displayName, initial, hideSearch }: Props) {
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses search, matching the hint shown in the field.
  useEffect(() => {
    if (hideSearch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hideSearch]);

  return (
    <header className="ws-topbar">
      {hideSearch ? <div id="ws-topbar-left-slot" className="ws-topbar-left-slot" /> : (
        <label className="ws-search">
          <Search size={19} strokeWidth={1.9} />
          <input ref={searchRef} type="text" placeholder="Search anything..." aria-label="Search anything" />
          <span className="ws-kbd">⌘K</span>
        </label>
      )}

      <div className="ws-topbar-right">
        <ThemeToggle />
        <button type="button" className="ws-icon-btn" aria-label="Notifications">
          <Bell size={19} strokeWidth={1.9} />
        </button>
        <span className="ws-topbar-avatar" aria-label={displayName}>{initial}</span>
      </div>
    </header>
  );
}
