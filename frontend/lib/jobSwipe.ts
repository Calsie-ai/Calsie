export type SwipeAction = "approved" | "skipped" | "details" | null;

// A deliberate gesture must travel far enough and have a clear axis.
export function swipeAction(dx: number, dy: number): SwipeAction {
  if (Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 1.4) return dx < 0 ? "approved" : "skipped";
  if (dy <= -60 && Math.abs(dy) > Math.abs(dx) * 1.4) return "details";
  return null;
}

export function postedLabel(value?: string | null, now = Date.now()) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not listed";
  const days = Math.max(0, Math.floor((now - Date.parse(value)) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
}
