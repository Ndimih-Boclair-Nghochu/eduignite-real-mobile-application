"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { resolveMediaUrl } from "@/lib/media";
import { notificationsService } from "@/lib/api/services/notifications.service";

/**
 * App-wide mobile header: profile picture (opens Profile), translate button
 * and a notification bell showing the unseen-notification count. Reads the
 * existing /notifications/notifications/unread_count/ endpoint.
 */
export function MobileTopBar() {
  const { user, isAuthenticated } = useAuth();
  const { language } = useI18n();
  const avatar = resolveMediaUrl(user?.avatar);
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "";

  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsService.unreadCount(),
    enabled: Boolean(isAuthenticated),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const rawCount = Number(
    (unreadData as any)?.unread_count ?? (unreadData as any)?.count ?? 0
  );
  const unread = Number.isFinite(rawCount) ? rawCount : 0;

  return (
    <header
      className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-background/95 px-4 backdrop-blur-xl"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        paddingBottom: "10px",
      }}
    >
      <Link href="/dashboard/profile" className="flex min-w-0 items-center gap-3">
        <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/15">
          {avatar ? (
            <img src={avatar} alt={user?.name || "Profile"} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-black text-primary">
              {(user?.name || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {language === "en" ? "Signed in" : "Connecté"}
          </span>
          <span className="block max-w-[140px] truncate text-sm font-black tracking-tight text-primary">
            {firstName || user?.name}
          </span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        <LanguageSwitcher />
        <Link
          href="/dashboard/notifications"
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/5 active:scale-95"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
