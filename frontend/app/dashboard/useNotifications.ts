"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { unreadNotificationCount, type UserNotification } from "../../lib/notifications";

const SELECT_FIELDS = "id,user_id,campaign_id,type,category,priority,title,message,status,action_url,action_label,metadata,created_at,read_at,resolved_at,archived_at";

export function useNotifications(userId?: string) {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (!navigator.onLine) {
      setError("You’re offline. Existing notifications remain available; reconnect to refresh them.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: readError } = await getSupabaseClient()
      .from("user_notifications")
      .select(SELECT_FIELDS)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (readError) {
      setError("Notifications could not be loaded. Try again shortly.");
      return;
    }
    setError("");
    setItems((data || []) as UserNotification[]);
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onOnline = () => void refresh();
    const onOffline = () => setError("You’re offline. Existing notifications remain available; reconnect to refresh them.");
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const updateOne = useCallback(async (id: string, patch: Record<string, string | null>) => {
    if (!userId) return false;
    const { error: updateError } = await getSupabaseClient().from("user_notifications").update(patch).eq("id", id).eq("user_id", userId);
    if (updateError) {
      setError("That notification could not be updated.");
      return false;
    }
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } as UserNotification : item));
    return true;
  }, [userId]);

  const markRead = useCallback((id: string) => updateOne(id, { status: "read", read_at: new Date().toISOString() }), [updateOne]);
  const markUnread = useCallback((id: string) => updateOne(id, { status: "unread", read_at: null }), [updateOne]);
  const archive = useCallback((id: string) => updateOne(id, { status: "archived", archived_at: new Date().toISOString() }), [updateOne]);

  const markAllRead = useCallback(async () => {
    if (!userId) return false;
    const now = new Date().toISOString();
    const { error: updateError } = await getSupabaseClient().from("user_notifications").update({ status: "read", read_at: now }).eq("user_id", userId).eq("status", "unread");
    if (updateError) {
      setError("Notifications could not be marked as read.");
      return false;
    }
    setItems((current) => current.map((item) => item.status === "unread" ? { ...item, status: "read", read_at: now } : item));
    return true;
  }, [userId]);

  return useMemo(() => ({ items, loading, error, unreadCount: unreadNotificationCount(items), refresh, markRead, markUnread, markAllRead, archive }), [archive, error, items, loading, markAllRead, markRead, markUnread, refresh]);
}
