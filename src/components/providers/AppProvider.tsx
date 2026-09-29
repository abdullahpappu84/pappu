"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errMsg } from "@/lib/api";
import { iconFor } from "@/lib/icons";
import type { CatalogDTO, PromotionDTO, SessionUser } from "@/lib/types";
import type { Category, CategoryId, Game, HeroSlide, LiveTable } from "@/data/types";

export type ActiveGame = { title: string; url: string; mode: "real" | "demo" };
export type AuthMode = "login" | "register" | "forgot";
export type PublicSettingsDTO = {
  site: { name: string; tagline: string; logoUrl: string; iconUrl: string; faviconUrl: string; logoHeight: number; logoHeightMobile: number; contactEmail: string; contactPhone: string; address: string; socials: Record<string, string> };
  locale: { currency: string; currencySymbol: string; language: string; timezone: string };
  registration: { enabled: boolean; requirePhone: boolean };
  support: { liveChatEnabled: boolean; email: string; hours: string };
  referralEnabled: boolean;
  deposit: { min: number; max: number };
  withdrawal: { min: number; max: number; feePercent: number; feeFixed: number };
  oauth: { google: boolean; facebook: boolean };
};

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone?: "gold" | "success" | "info";
}

export type NotificationItem = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

interface AppState {
  games: Game[];
  categories: Category[];
  providers: string[];
  banners: HeroSlide[];
  promotions: PromotionDTO[];
  liveTables: LiveTable[];
  settings: PublicSettingsDTO;

  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;

  authMode: AuthMode | null;
  openAuth: (mode: AuthMode) => void;
  closeAuth: () => void;

  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;

  favorites: Set<string>;
  toggleFavorite: (id: string, title?: string) => void;
  recent: string[];
  playGame: (game: Game, mode?: "real" | "demo") => Promise<void>;
  activeGame: ActiveGame | null;
  closeGame: () => void;

  category: CategoryId;
  setCategory: (c: CategoryId) => void;
  search: string;
  setSearch: (s: string) => void;
  provider: string;
  setProvider: (p: string) => void;
  resetFilters: () => void;

  previewGame: Game | null;
  setPreviewGame: (g: Game | null) => void;
  previewTable: LiveTable | null;
  setPreviewTable: (t: LiveTable | null) => void;

  language: string;
  setLanguage: (code: string) => void;

  notifications: NotificationItem[];
  unread: number;
  loadNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;

  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;

  scrollTo: (id: string) => void;
  go: (href: string) => void;
  requireAuth: (then?: () => void) => boolean;
}

const AppContext = createContext<AppState | null>(null);
let toastId = 0;

export function AppProvider({
  children,
  catalog,
  settings,
  initialUser,
}: {
  children: ReactNode;
  catalog: CatalogDTO;
  settings: PublicSettingsDTO;
  initialUser: SessionUser | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUserState] = useState<SessionUser | null>(initialUser);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(initialUser?.favorites ?? []));
  const [recent, setRecent] = useState<string[]>(initialUser?.recent ?? []);
  const [category, setCategory] = useState<CategoryId>("all");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("All Providers");
  const [previewGame, setPreviewGame] = useState<Game | null>(null);
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [previewTable, setPreviewTable] = useState<LiveTable | null>(null);
  const [language, setLanguage] = useState(settings.locale.language || "EN");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(initialUser?.unread ?? 0);

  /* ------------------------------ catalog mapping ------------------------------ */
  const categories = useMemo<Category[]>(() => {
    const base = catalog.categories.map((c) => ({ ...c, icon: iconFor(c.icon) }));
    if (user && favorites.size) base.splice(1, 0, { id: "favorites", label: "Favourites", shortLabel: "Favs", icon: Heart, color: "#fb7185" });
    return base;
  }, [catalog.categories, user, favorites.size]);

  const liveTables = useMemo<LiveTable[]>(
    () =>
      catalog.games
        .filter((g) => g.displayType === "live_table" && g.live && g.image)
        .map((g) => ({ id: g.id, name: g.title, provider: g.provider, image: g.image!, players: g.live!.players, minBet: g.live!.minBet, maxBet: g.live!.maxBet, icon: iconFor(g.live!.icon), accent: g.live!.accent, tag: g.live!.tag, game: g })),
    [catalog.games],
  );

  /* ------------------------------ toasts ------------------------------ */
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++toastId;
      setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  /* ------------------------------ session ------------------------------ */
  const setUser = useCallback((u: SessionUser | null) => {
    setUserState(u);
    setFavorites(new Set(u?.favorites ?? []));
    setRecent(u?.recent ?? []);
    setUnread(u?.unread ?? 0);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const r = await api<{ user: SessionUser | null }>("/api/auth/session");
      setUser(r.user);
    } catch {
      /* ignore */
    }
  }, [setUser]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setNotifications([]);
    notify({ title: "Signed out", description: "See you soon!", tone: "info" });
    if (pathname?.startsWith("/account")) router.push("/");
    router.refresh();
  }, [notify, setUser, pathname, router]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api<{ items: NotificationItem[]; unread: number }>("/api/me/notifications?pageSize=8");
      setNotifications(r.items);
      setUnread(r.unread);
    } catch {
      /* ignore */
    }
  }, [user]);

  const markAllRead = useCallback(async () => {
    await api("/api/me/notifications/read", { body: {} }).catch(() => null);
    setUnread(0);
    setNotifications((n) => n.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
  }, []);

  // poll notifications & balance while signed in
  useEffect(() => {
    if (!user?.id) return;
    loadNotifications();
    const iv = window.setInterval(() => {
      loadNotifications();
      refreshUser();
    }, 45000);
    return () => window.clearInterval(iv);
  }, [user?.id, loadNotifications, refreshUser]);

  // referral links (?ref=CODE) and social-login errors
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ref = q.get("ref");
    if (ref) {
      localStorage.setItem("ar_ref", ref.toUpperCase());
      if (!user) setAuthMode("register");
    }
    const err = q.get("auth_error");
    if (err) notify({ title: "Sign-in failed", description: err, tone: "info" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ navigation ------------------------------ */
  const go = useCallback((href: string) => router.push(href), [router]);

  const scrollTo = useCallback(
    (id: string) => {
      if (id === "top") {
        if (pathname !== "/") return router.push("/");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else router.push(`/#${id}`);
    },
    [pathname, router],
  );

  const requireAuth = useCallback(
    (then?: () => void) => {
      if (user) {
        then?.();
        return true;
      }
      setAuthMode("login");
      return false;
    },
    [user],
  );

  /* ------------------------------ games ------------------------------ */
  const toggleFavorite = useCallback(
    (id: string, title?: string) => {
      if (!user) {
        notify({ title: "Sign in to save favourites", tone: "info" });
        setAuthMode("login");
        return;
      }
      const adding = !favorites.has(id);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (adding) next.add(id);
        else next.delete(id);
        return next;
      });
      api(adding ? "/api/me/favorites" : `/api/me/favorites/${encodeURIComponent(id)}`, adding ? { body: { slug: id } } : { method: "DELETE" })
        .then(() => title && notify({ title: adding ? "Added to favourites" : "Removed from favourites", description: title, tone: adding ? "gold" : "info" }))
        .catch((e) => {
          setFavorites((prev) => {
            const next = new Set(prev);
            if (adding) next.delete(id);
            else next.add(id);
            return next;
          });
          notify({ title: "Could not update favourites", description: errMsg(e), tone: "info" });
        });
    },
    [user, favorites, notify],
  );

  const playGame = useCallback(
    async (game: Game, mode: "real" | "demo" = "real") => {
      if (mode === "real" && !user) {
        setPreviewGame(null);
        setPreviewTable(null);
        setAuthMode("login");
        return;
      }
      try {
        const device = typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop";
        const r = await api<{ launchUrl: string; display: "iframe" | "redirect"; title: string; mode: "real" | "demo" }>("/api/games/launch", { body: { slug: game.id, mode, device } });
        if (r.mode === "real") setRecent((prev) => [game.id, ...prev.filter((x) => x !== game.id)].slice(0, 12));
        setPreviewGame(null);
        setPreviewTable(null);
        if (r.display === "redirect") window.location.href = r.launchUrl;
        else setActiveGame({ title: r.title, url: r.launchUrl, mode: r.mode });
      } catch (e) {
        notify({ title: "Unable to launch game", description: errMsg(e), tone: "info" });
      }
    },
    [user, notify],
  );

  const closeGame = useCallback(() => {
    setActiveGame(null);
    refreshUser();
  }, [refreshUser]);

  const resetFilters = useCallback(() => {
    setCategory("all");
    setSearch("");
    setProvider("All Providers");
  }, []);

  const value = useMemo<AppState>(
    () => ({
      games: catalog.games,
      categories,
      providers: catalog.providers,
      banners: catalog.banners,
      promotions: catalog.promotions,
      liveTables,
      settings,
      user,
      setUser,
      refreshUser,
      logout,
      authMode,
      openAuth: (mode) => {
        setMenuOpen(false);
        setAuthMode(mode);
      },
      closeAuth: () => setAuthMode(null),
      menuOpen,
      setMenuOpen,
      chatOpen,
      setChatOpen,
      favorites,
      toggleFavorite,
      recent,
      playGame,
      activeGame,
      closeGame,
      category,
      setCategory,
      search,
      setSearch,
      provider,
      setProvider,
      resetFilters,
      previewGame,
      setPreviewGame,
      previewTable,
      setPreviewTable,
      language,
      setLanguage,
      notifications,
      unread,
      loadNotifications,
      markAllRead,
      toasts,
      notify,
      dismissToast,
      scrollTo,
      go,
      requireAuth,
    }),
    [
      catalog, categories, liveTables, settings, user, setUser, refreshUser, logout, authMode, menuOpen, chatOpen, favorites, toggleFavorite, recent, playGame, activeGame, closeGame,
      category, search, provider, resetFilters, previewGame, previewTable, language, notifications, unread, loadNotifications, markAllRead, toasts, notify,
      dismissToast, scrollTo, go, requireAuth,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export const useOptionalApp = () => useContext(AppContext);
