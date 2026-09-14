export type NotificationCategory = "attention" | "applications" | "campaigns" | "account";
export type NotificationPriority = "action_required" | "update" | "info";
export type NotificationStatus = "unread" | "read" | "archived";

export type UserNotification = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  status: NotificationStatus;
  action_url: string | null;
  action_label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
  archived_at: string | null;
};

export type NotificationFilter = "all" | "attention" | "applications" | "campaigns";

const SAFE_NOTIFICATION_DESTINATIONS = new Set([
  "overview", "templates", "resume", "buildResume", "gmail",
  "campaign", "approve", "tracker", "profile", "notifications",
]);

export function safeNotificationUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/dashboard?")) return null;
  try {
    const url = new URL(value, "https://calsie.invalid");
    if (url.origin !== "https://calsie.invalid" || url.pathname !== "/dashboard") return null;
    const panel = url.searchParams.get("panel");
    return panel && SAFE_NOTIFICATION_DESTINATIONS.has(panel) ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export function visibleNotifications(items: UserNotification[], filter: NotificationFilter) {
  return items.filter((item) => {
    if (item.status === "archived") return false;
    if (filter === "all") return true;
    if (filter === "attention") return item.priority === "action_required" && !item.resolved_at;
    return item.category === filter;
  });
}

export function unreadNotificationCount(items: UserNotification[]) {
  return items.filter((item) => item.status === "unread" && !item.archived_at).length;
}

export function notificationDateGroup(createdAt: string, now = new Date()) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Older";
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const itemStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((start - itemStart) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  return "Older";
}

export function relativeNotificationTime(createdAt: string, now = Date.now()) {
  const delta = Math.max(0, now - new Date(createdAt).getTime());
  if (!Number.isFinite(delta)) return "";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(createdAt));
}
