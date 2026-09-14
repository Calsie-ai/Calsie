"use client";

import ThemeToggle from "./ThemeToggle";
import WorkspaceSearch from "./WorkspaceSearch";
import NotificationBell from "./NotificationBell";
import type { UserNotification } from "../../lib/notifications";
import type { WorkspaceTab } from "./workspace-data";

type Props = {
  displayName: string;
  initial: string;
  avatarUrl?: string;
  onOpenProfile: () => void;
  onNavigate: (panel: WorkspaceTab) => void;
  onOpenTemplate: (slug: string) => void;
  notifications?: UserNotification[];
  unreadNotificationCount?: number;
  notificationsLoading?: boolean;
  onOpenNotification?: (notification: UserNotification) => void;
  onOpenNotifications?: () => void;
  onMarkAllNotificationsRead?: () => void;
};

export default function WorkspaceTopbar({ displayName, initial, avatarUrl, onOpenProfile, onNavigate, onOpenTemplate, notifications = [], unreadNotificationCount = 0, notificationsLoading = false, onOpenNotification = () => {}, onOpenNotifications = () => {}, onMarkAllNotificationsRead = () => {} }: Props) {
  return (
    <header className="ws-topbar">
      {/* Search renders on every panel, including Templates. The previous
          `hideSearch` branch swapped it for an empty #ws-topbar-left-slot
          div that nothing ever portaled into, so it only left a gap. */}
      <WorkspaceSearch onNavigate={onNavigate} onOpenTemplate={onOpenTemplate} />

      <div className="ws-topbar-right">
        <ThemeToggle />
        <NotificationBell items={notifications} unreadCount={unreadNotificationCount} loading={notificationsLoading} onOpen={onOpenNotification} onViewAll={onOpenNotifications} onMarkAllRead={onMarkAllNotificationsRead} />
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
