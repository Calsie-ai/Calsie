"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { relativeNotificationTime, type UserNotification } from "../../lib/notifications";

type Props = {
  items: UserNotification[];
  unreadCount: number;
  loading: boolean;
  onOpen: (notification: UserNotification) => void;
  onViewAll: () => void;
  onMarkAllRead: () => void;
};

export default function NotificationBell({ items, unreadCount, loading, onOpen, onViewAll, onMarkAllRead }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const recent = items.filter((item) => item.status !== "archived").slice(0, 5);
  const countLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="ws-notification-bell" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ws-icon-btn"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} strokeWidth={1.9} />
        {unreadCount > 0 ? <span className="ws-notification-badge" aria-hidden="true">{countLabel}</span> : null}
      </button>

      {open ? (
        <section className="ws-notification-popover" aria-label="Recent notifications">
          <header>
            <div><small>Inbox</small><h2>Notifications</h2></div>
            {unreadCount > 0 ? <button type="button" onClick={onMarkAllRead}><CheckCheck size={15} /> Mark all read</button> : null}
          </header>
          <div className="ws-notification-popover-list" role="status">
            {loading && recent.length === 0 ? <p className="ws-notification-empty">Loading notifications…</p> : null}
            {!loading && recent.length === 0 ? <p className="ws-notification-empty">You’re all caught up.</p> : null}
            {recent.map((item) => (
              <button type="button" className={`ws-notification-mini${item.status === "unread" ? " is-unread" : ""}`} key={item.id} onClick={() => { setOpen(false); onOpen(item); }}>
                <span className={`ws-notification-dot is-${item.priority}`} />
                <span><strong>{item.title}</strong><small>{item.message}</small><time dateTime={item.created_at}>{relativeNotificationTime(item.created_at)}</time></span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          <button type="button" className="ws-notification-view-all" onClick={() => { setOpen(false); onViewAll(); }}>View all notifications <ChevronRight size={15} /></button>
        </section>
      ) : null}
    </div>
  );
}
