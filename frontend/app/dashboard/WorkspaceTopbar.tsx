"use client";

import { Bell } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import WorkspaceSearch from "./WorkspaceSearch";
import type { WorkspaceTab } from "./workspace-data";

type Props = {
  displayName: string;
  initial: string;
  avatarUrl?: string;
  onOpenProfile: () => void;
  onNavigate: (panel: WorkspaceTab) => void;
  onOpenTemplate: (slug: string) => void;
};

export default function WorkspaceTopbar({ displayName, initial, avatarUrl, onOpenProfile, onNavigate, onOpenTemplate }: Props) {
  return (
    <header className="ws-topbar">
      {/* Search renders on every panel, including Templates. The previous
          `hideSearch` branch swapped it for an empty #ws-topbar-left-slot
          div that nothing ever portaled into, so it only left a gap. */}
      <WorkspaceSearch onNavigate={onNavigate} onOpenTemplate={onOpenTemplate} />

      <div className="ws-topbar-right">
        <ThemeToggle />
        <button type="button" className="ws-icon-btn" aria-label="Notifications">
          <Bell size={19} strokeWidth={1.9} />
        </button>
        {/* The avatar was a decorative <span>. It is the conventional way
            into an account screen, so it is now a real button. */}
        <button
          type="button"
          className="ws-topbar-avatar"
          title={`${displayName} — open profile`}
          aria-label={`Open profile for ${displayName}`}
          onClick={onOpenProfile}
        >
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
        </button>
      </div>
    </header>
  );
}
