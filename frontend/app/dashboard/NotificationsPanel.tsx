"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Archive, Bell, BriefcaseBusiness, CheckCheck, MailCheck, Megaphone, MoreHorizontal, RefreshCw } from "lucide-react";
import { notificationDateGroup, relativeNotificationTime, visibleNotifications, type NotificationFilter, type UserNotification } from "../../lib/notifications";

type Props = {
  items: UserNotification[];
  unreadCount: number;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onOpen: (notification: UserNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onMarkAllRead: () => void;
  onArchive: (id: string) => void;
};

const FILTERS: Array<[NotificationFilter, string]> = [["all", "All"], ["attention", "Needs attention"], ["applications", "Applications"], ["campaigns", "Campaigns"]];
const GROUPS = ["Today", "Yesterday", "Earlier this week", "Older"];

function NotificationIcon({ item }: { item: UserNotification }) {
  if (item.priority === "action_required") return <AlertCircle />;
  if (item.category === "applications") return <MailCheck />;
  if (item.category === "campaigns") return <Megaphone />;
  return <BriefcaseBusiness />;
}

export default function NotificationsPanel(props: Props) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [menuId, setMenuId] = useState("");
  const visible = useMemo(() => visibleNotifications(props.items, filter), [filter, props.items]);
  const grouped = useMemo(() => GROUPS.map((label) => [label, visible.filter((item) => notificationDateGroup(item.created_at) === label)] as const).filter(([, items]) => items.length), [visible]);
  const attentionCount = props.items.filter((item) => item.priority === "action_required" && !item.resolved_at && item.status !== "archived").length;
  const applicationCount = props.items.filter((item) => item.category === "applications" && item.status !== "archived").length;

  return (
    <div className="ws-panel ws-notifications-page">
      <header className="ws-panel-head ws-notifications-head">
        <div><p className="ws-panel-eyebrow ws-panel-eyebrow-icon"><Bell size={13} /> Attention centre</p><h1 className="ws-panel-title">Notifications</h1><p className="ws-panel-sub">Updates and actions from your campaigns.</p></div>
        <div className="ws-notification-head-actions">
          <button type="button" className="ws-btn-outline" onClick={props.onRefresh} disabled={props.loading}><RefreshCw size={15} /> Refresh</button>
          <button type="button" className="ws-btn-primary" onClick={props.onMarkAllRead} disabled={!props.unreadCount}><CheckCheck size={15} /> Mark all read</button>
        </div>
      </header>

      <div className="ws-notification-summary">
        <button type="button" onClick={() => setFilter("attention")}><span className="is-attention"><AlertCircle /></span><strong>{attentionCount}</strong><small>Needs attention</small></button>
        <button type="button" onClick={() => setFilter("applications")}><span className="is-applications"><MailCheck /></span><strong>{applicationCount}</strong><small>Application updates</small></button>
        <button type="button" onClick={() => setFilter("campaigns")}><span className="is-campaigns"><Megaphone /></span><strong>{props.items.filter((item) => item.category === "campaigns" && item.status !== "archived").length}</strong><small>Campaign updates</small></button>
      </div>

      <div className="ws-notification-filters" aria-label="Notification filters">
        {FILTERS.map(([id, label]) => <button type="button" key={id} className={filter === id ? "is-active" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>

      {props.error ? <div className="ws-panel-message ws-panel-message-alert" role="alert">{props.error} <button type="button" onClick={props.onRefresh}>Try again</button></div> : null}
      {props.loading && props.items.length === 0 ? <div className="ws-notification-state" role="status"><RefreshCw className="is-spinning" /><h2>Loading notifications</h2><p>Checking your campaigns and applications…</p></div> : null}
      {!props.loading && !props.error && visible.length === 0 ? <div className="ws-notification-state"><CheckCheck /><h2>{filter === "all" ? "You’re all caught up" : "Nothing in this view"}</h2><p>{filter === "all" ? "New campaign and application updates will appear here." : "Try another filter to see more notifications."}</p></div> : null}

      <div className="ws-notification-groups" aria-live="polite">
        {grouped.map(([label, items]) => <section key={label}><h2>{label}</h2><div className="ws-notification-list">
          {items.map((item) => <article className={`ws-notification-row${item.status === "unread" ? " is-unread" : ""}`} key={item.id}>
            <span className={`ws-notification-icon is-${item.priority}`}><NotificationIcon item={item} /></span>
            <button type="button" className="ws-notification-content" onClick={() => props.onOpen(item)}>
              <span><strong>{item.title}</strong>{item.status === "unread" ? <i>New</i> : null}</span>
              <p>{item.message}</p>
              <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString("en-AU")}>{relativeNotificationTime(item.created_at)}</time>
            </button>
            {item.action_label ? <button type="button" className="ws-notification-action" onClick={() => props.onOpen(item)}>{item.action_label}</button> : null}
            <div className="ws-notification-more">
              <button type="button" aria-label={`More actions for ${item.title}`} aria-expanded={menuId === item.id} onClick={() => setMenuId((current) => current === item.id ? "" : item.id)}><MoreHorizontal /></button>
              {menuId === item.id ? <div><button type="button" onClick={() => { (item.status === "unread" ? props.onMarkRead : props.onMarkUnread)(item.id); setMenuId(""); }}>{item.status === "unread" ? "Mark as read" : "Mark as unread"}</button><button type="button" onClick={() => { props.onArchive(item.id); setMenuId(""); }}><Archive size={14} /> Archive</button></div> : null}
            </div>
          </article>)}
        </div></section>)}
      </div>
    </div>
  );
}
