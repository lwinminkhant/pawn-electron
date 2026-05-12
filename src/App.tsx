import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  PackagePlus,
  HandCoins,
  Percent,
  Users as UsersIcon,
  LineChart,
  UserCog,
  Settings as SettingsIcon,
  LogOut,
  Command,
  Search as SearchIcon,
  Camera,
  Ticket,
  TriangleAlert,
  X,
  CalendarDays,
  ChevronDown,
  Languages,
  Moon,
  RefreshCcw,
  Save,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import type { DashboardHeaderAction } from "./pages/Dashboard";
import Pawn from "./pages/Pawn";
import Redeem from "./pages/Redeem";
import InterestPayment from "./pages/InterestPayment";
import Customers from "./pages/Customers";
import Settings from "./pages/Settings";
import type { SettingsHeaderAction } from "./pages/Settings";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import SearchPage from "./pages/Search";
import BarcodeScanner from "./components/BarcodeScanner";
import { Button, Dialog } from "./components/ui";
import { getStoredTheme, initTheme, setTheme, type Theme } from "./utils/theme";
import { cn } from "./utils/format";
import {
  setCurrentBusinessDateYmd,
  useBusinessDate,
} from "./utils/businessDate";
import {
  normalizeAppSettings,
  syncAppSettingsToLocalCache,
} from "./utils/appSettings";
import { extractTicketIdFromScan, normalizeTicketDigits } from "./utils/ticketScan";
import { setCurrentPawnEmployeeId } from "./utils/itemTypes";
import {
  addSettlementCartTicket,
  clearSettlementCart,
  getSettlementCartIds,
  onSettlementCartChange,
  replaceSettlementCart,
} from "./utils/settlementCart";
import type { SettlementMode } from "../shared/contracts/settlement";
import "./print.css";

type PageId =
  | "dashboard"
  | "pawn"
  | "redeem"
  | "interest"
  | "customers"
  | "search"
  | "reports"
  | "users"
  | "settings";

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
}

interface AppUser {
  id: number;
  name?: string;
  level?: string;
}

const AUTH_STORAGE_KEY = "pawnAuthUser";
const NAV_COLLAPSED_STORAGE_KEY = "pawnNavCollapsed";

const loadStoredNavCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const loadStoredUser = (): AppUser | null => {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AppUser> | null;
    const id = Number(parsed?.id);
    if (!Number.isFinite(id) || id <= 0) return null;

    return {
      id,
      name: typeof parsed?.name === "string" ? parsed.name : undefined,
      level: typeof parsed?.level === "string" ? parsed.level : undefined,
    };
  } catch {
    return null;
  }
};

const persistUser = (user: AppUser | null): void => {
  if (!user) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
};

const OPERATIONS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pawn", label: "Pawn", icon: PackagePlus },
  { id: "redeem", label: "Redeem", icon: HandCoins },
  { id: "interest", label: "Interest", icon: Percent },
];

/** Admin: ticket search and customer directory */
const SEARCH_NAV: NavItem[] = [
  { id: "search", label: "Search", icon: SearchIcon, adminOnly: true },
  { id: "customers", label: "Customers", icon: UsersIcon, adminOnly: true },
];

const ADMIN: NavItem[] = [
  { id: "reports", label: "Reports", icon: LineChart, adminOnly: true },
  { id: "users", label: "Staff", icon: UserCog, adminOnly: true },
];

// PAGE_TITLE removed since we use i18n now

function App() {
  const [user, setUser] = useState<AppUser | null>(() => loadStoredUser());
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() =>
    loadStoredNavCollapsed(),
  );
  const [currentPage, setCurrentPage] = useState<PageId>("dashboard");
  const [titleTicketId, setTitleTicketId] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [ticketError, setTicketError] = useState(false);
  const [ticketErrorMessage, setTicketErrorMessage] = useState<string | null>(
    null,
  );
  const [ticketWarningRemark, setTicketWarningRemark] = useState<string | null>(
    null,
  );
  const [ticketLoading, setTicketLoading] = useState(false);
  const [cartCounts, setCartCounts] = useState<Record<SettlementMode, number>>(
    () => ({
      redeem: getSettlementCartIds("redeem").length,
      interest: getSettlementCartIds("interest").length,
    }),
  );
  const { t, i18n } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [dashboardHeaderAction, setDashboardHeaderAction] =
    useState<DashboardHeaderAction | null>(null);
  const [settingsHeaderAction, setSettingsHeaderAction] =
    useState<SettingsHeaderAction | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const businessDateYmd = useBusinessDate();
  const isAdmin = user?.level === "Admin";
  const showTicketLoader =
    currentPage === "redeem" || currentPage === "interest";
  const currentSettlementMode: SettlementMode | null =
    currentPage === "redeem"
      ? "redeem"
      : currentPage === "interest"
        ? "interest"
        : null;

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAppSettings = async () => {
      try {
        const result = await window.electron.api.settings.getAppSettings();
        if (!cancelled && result?.success) {
          syncAppSettingsToLocalCache(normalizeAppSettings(result.settings));
        }
      } catch (error) {
        console.error("Failed to load app settings", error);
      }
    };
    void loadAppSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    persistUser(user);
    setCurrentPawnEmployeeId(user?.id ?? null);
  }, [user]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        NAV_COLLAPSED_STORAGE_KEY,
        navCollapsed ? "1" : "0",
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }, [navCollapsed]);

  const handleLogin = (nextUser: AppUser) => {
    setProfileMenuOpen(false);
    setUser(nextUser);
  };

  const handleLogout = () => {
    setProfileMenuOpen(false);
    setUser(null);
  };

  const handleToggleLanguage = () => {
    const nextLang = i18n.language === "en" ? "my" : "en";
    void i18n.changeLanguage(nextLang);
    setProfileMenuOpen(false);
  };

  const handleToggleTheme = () => {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    setThemeState(nextTheme);
    setProfileMenuOpen(false);
  };

  const handleOpenSettings = () => {
    navigateToPage("settings");
    setProfileMenuOpen(false);
  };

  useEffect(() => {
    const unsubRedeem = onSettlementCartChange("redeem", (ids) =>
      setCartCounts((current) => ({ ...current, redeem: ids.length })),
    );
    const unsubInterest = onSettlementCartChange("interest", (ids) =>
      setCartCounts((current) => ({ ...current, interest: ids.length })),
    );
    return () => {
      unsubRedeem();
      unsubInterest();
    };
  }, []);

  const navigateToPage = (page: PageId) => {
    const nextSettlementMode: SettlementMode | null =
      page === "redeem"
        ? "redeem"
        : page === "interest"
          ? "interest"
          : null;

    if (
      currentSettlementMode &&
      nextSettlementMode &&
      currentSettlementMode !== nextSettlementMode
    ) {
      const sourceCartIds = getSettlementCartIds(currentSettlementMode);
      const targetCartIds = getSettlementCartIds(nextSettlementMode);

      if (sourceCartIds.length > 0 && targetCartIds.length === 0) {
        replaceSettlementCart(nextSettlementMode, sourceCartIds);
      }
    }

    setTitleTicketId("");
    setTicketError(false);
    if (page !== "dashboard") {
      setDashboardHeaderAction(null);
    }
    if (page !== "settings") {
      setSettingsHeaderAction(null);
    }
    setCurrentPage(page);
  };

  const showInvalidTicketDialog = (message: string) => {
    setTicketError(true);
    setTicketErrorMessage(message);
  };

  const loadTicketIntoSettlementCart = async (ticketId: number) => {
    if (!currentSettlementMode || ticketLoading) return false;
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      showInvalidTicketDialog(t("common.invalidTicketNumber"));
      return false;
    }

    setTicketLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke("get-pawn", {
        pawnId: ticketId,
        includeInactive: true,
      });
      if (!result?.success || !result.pawn) {
        showInvalidTicketDialog(
          result?.message || t("common.ticketNotFound"),
        );
        return false;
      }
      const status = String(result.pawn.status || "");
      if (status === "REDEEMED") {
        showInvalidTicketDialog(t("common.ticketAlreadyRedeemed"));
        return false;
      }
      if (status === "EXPIRED") {
        showInvalidTicketDialog(t("common.ticketExpired"));
        return false;
      }

      setTicketError(false);
      setTicketErrorMessage(null);
      addSettlementCartTicket(currentSettlementMode, ticketId);
      const remark = typeof result.pawn.note === "string" ? result.pawn.note.trim() : "";
      if (remark) {
        setTicketWarningRemark(remark);
      }
      setTitleTicketId("");
      return true;
    } catch (error) {
      console.error("Error loading ticket:", error);
      showInvalidTicketDialog(t("common.ticketCouldNotBeLoaded"));
      return false;
    } finally {
      setTicketLoading(false);
    }
  };

  const handleTitleLoadTicket = () => {
    const n = parseInt(normalizeTicketDigits(titleTicketId).trim(), 10);
    void loadTicketIntoSettlementCart(n);
  };

  const handleScanSuccess = (decodedText: string) => {
    const ticketId = extractTicketIdFromScan(decodedText);
    if (ticketId == null) {
      showInvalidTicketDialog(t("common.scannedCodeInvalid"));
      return false;
    }
    void loadTicketIntoSettlementCart(ticketId).then((loaded) => {
      if (loaded) setShowScanner(false);
    });
    return true;
  };

  useEffect(() => {
    if (!isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigateToPage("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard onHeaderActionChange={setDashboardHeaderAction} />;
      case "pawn":
        return <Pawn />;
      case "redeem":
        return <Redeem />;
      case "interest":
        return <InterestPayment />;
      case "customers":
        return isAdmin ? (
          <Customers onNavigate={(p) => navigateToPage(p)} />
        ) : (
          <Dashboard />
        );
      case "search":
        return isAdmin ? (
          <SearchPage onNavigate={(p) => navigateToPage(p)} />
        ) : (
          <Dashboard />
        );
      case "reports":
        return isAdmin ? <Reports /> : <Dashboard />;
      case "settings":
        return isAdmin ? (
          <Settings onHeaderActionChange={setSettingsHeaderAction} />
        ) : (
          <Dashboard />
        );
      case "users":
        return isAdmin ? <Users /> : <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div
      className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      style={{
        display: "grid",
        gridTemplateColumns: navCollapsed ? "72px 1fr" : "232px 1fr",
        gridTemplateRows: "56px 1fr",
        height: "100vh",
      }}
    >
      {/* Sidebar */}
      <aside
        className="row-span-2 border-r border-[var(--hairline)] bg-[var(--surface-raised)] flex flex-col transition-[width] duration-200"
        aria-label="Primary navigation"
      >
        {/* Logo */}
        <div
          className={cn(
            "h-14 flex items-center border-b border-[var(--hairline)]",
            navCollapsed ? "justify-center px-0" : "px-5 gap-2.5",
          )}
        >
          <button
            type="button"
            onClick={() => setNavCollapsed((current) => !current)}
            aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            title={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="w-7 h-7 rounded-[5px] bg-[var(--brass)] flex items-center justify-center hover:bg-[var(--brass-hover)] transition-colors shrink-0"
          >
            <span className="text-[var(--brass-text-on)] text-[13px] font-bold mono">
              P
            </span>
          </button>
          {!navCollapsed && (
            <div className="leading-none">
              <div className="text-[14px] font-semibold tracking-tight">
                Pawn
              </div>
              <div className="text-[10px] mono text-[var(--text-muted)] mt-0.5">
                Counter Ledger
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto",
            navCollapsed ? "py-4 px-2" : "py-4 px-3",
          )}
        >
          {!navCollapsed && <p className="eyebrow px-3 mb-2">Operations</p>}
          <ul className="space-y-0.5">
            {OPERATIONS.map((item) => (
              <NavRow
                key={item.id}
                item={{...item, label: t(`nav.${item.id}`)}}
                active={currentPage === item.id}
                onClick={() => navigateToPage(item.id)}
                collapsed={navCollapsed}
              />
            ))}
          </ul>

          {isAdmin && (
            <>
              {!navCollapsed && (
                <p className="eyebrow px-3 mt-6 mb-2">{t('nav.search')}</p>
              )}
              <ul className={cn("space-y-0.5", !navCollapsed && "mt-0")}>
                {SEARCH_NAV.map((item) => (
                  <NavRow
                    key={item.id}
                    item={{...item, label: t(`nav.${item.id}`)}}
                    active={currentPage === item.id}
                    onClick={() => navigateToPage(item.id)}
                    collapsed={navCollapsed}
                  />
                ))}
              </ul>
              {!navCollapsed && (
                <p className="eyebrow px-3 mt-6 mb-2">{t('nav.admin')}</p>
              )}
              <ul className="space-y-0.5">
                {ADMIN.map((item) => (
                  <NavRow
                    key={item.id}
                    item={{...item, label: t(`nav.${item.id}`)}}
                    active={currentPage === item.id}
                    onClick={() => navigateToPage(item.id)}
                    collapsed={navCollapsed}
                  />
                ))}
              </ul>
            </>
          )}
        </nav>

      </aside>

      {/* Top bar */}
      <header
        className={cn(
          "relative border-b border-[var(--hairline)] bg-[var(--surface-raised)]/80 backdrop-blur-md flex items-center justify-between px-6 gap-4",
          profileMenuOpen && "z-[70]",
        )}
        style={{ gridColumn: 2 }}
      >
        <div className="flex items-center gap-2 min-w-0 shrink">
          <h2 className="text-[14px] font-semibold tracking-tight truncate shrink min-w-0 max-w-[min(100%,14rem)]">
            {t(`nav.${currentPage}`)}
          </h2>
        </div>
        {showTicketLoader && (
          <div
            className="flex flex-1 items-center justify-center gap-2 min-w-0"
            aria-live="polite"
          >
            {currentSettlementMode &&
              cartCounts[currentSettlementMode] > 0 && (
              <span
                className="inline-flex items-center gap-1.5 h-8 pl-2 pr-1 rounded-full border border-[var(--brass)]/40 bg-[var(--brass)]/10 text-[12px] text-[var(--text-primary)] shrink-0"
                aria-label={`${cartCounts[currentSettlementMode]} tickets in cart`}
              >
                <Ticket size={13} className="text-[var(--brass)]" aria-hidden />
                <span className="text-[var(--text-muted)]">Cart</span>
                <span className="mono font-semibold">
                  {cartCounts[currentSettlementMode]} ticket(s)
                </span>
                <button
                  type="button"
                  onClick={() => clearSettlementCart(currentSettlementMode)}
                  aria-label="Clear ticket cart"
                  title="Clear ticket cart"
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--brass)]/20 transition-colors"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            )}
            <div
              className="flex items-center gap-1.5 min-w-0 shrink"
              aria-label="Add ticket to settlement cart"
              role="group"
            >
              <div
                className={cn(
                  "flex items-center h-8 px-2 rounded-[6px] border bg-[var(--surface-canvas)] transition-colors",
                  ticketError
                    ? "border-[var(--danger)]"
                    : "border-[var(--hairline)] focus-within:border-[var(--brass)]"
                )}
              >
                <Ticket
                  size={13}
                  className="text-[var(--text-muted)] mr-1.5 shrink-0"
                  aria-hidden
                />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={titleTicketId}
                  onChange={(e) => {
                    const digits = normalizeTicketDigits(e.target.value).replace(
                      /\D+/g,
                      "",
                    );
                    setTitleTicketId(digits);
                    if (ticketError) setTicketError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleTitleLoadTicket();
                    }
                  }}
                  placeholder="Ticket #"
                  aria-label="Ticket ID"
                  className="mono bg-transparent outline-none text-[13px] w-24 min-w-0 placeholder:text-[var(--text-muted)]"
                />
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleTitleLoadTicket}
                disabled={ticketLoading}
              >
                {ticketLoading ? t("common.loading") : "Add ticket"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leadingIcon={<Camera size={14} />}
                onClick={() => setShowScanner(true)}
                aria-label="Scan ticket"
              >
                Scan
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {currentPage === "dashboard" && dashboardHeaderAction && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leadingIcon={<RefreshCcw size={14} />}
              onClick={dashboardHeaderAction.onClick}
            >
              {dashboardHeaderAction.label}
            </Button>
          )}
          {currentPage === "settings" && settingsHeaderAction && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              leadingIcon={<Save size={14} />}
              loading={settingsHeaderAction.loading}
              onClick={settingsHeaderAction.onClick}
            >
              {settingsHeaderAction.label}
            </Button>
          )}
          <div className="flex items-center gap-1.5 h-8 px-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-canvas)]">
            <CalendarDays
              size={13}
              className="text-[var(--text-muted)] shrink-0"
              aria-hidden
            />
            <input
              type="date"
              value={businessDateYmd}
              onChange={(e) => {
                setCurrentBusinessDateYmd(e.target.value);
              }}
              aria-label="Business date"
              title="Business date"
              className="bg-transparent outline-none text-[12px] mono text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => {
                setCurrentBusinessDateYmd("");
              }}
              className="h-6 px-1.5 rounded-[6px] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              Today
            </button>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigateToPage("search")}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 h-8 rounded-[6px] border border-[var(--hairline)] text-[12px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <Command size={12} />
              <span className="mono">K</span>
              <span className="ml-1">Search</span>
            </button>
          )}
          <div
            ref={profileMenuRef}
            className={cn(
              "ml-2 pl-2 border-l border-[var(--hairline)] relative",
              profileMenuOpen && "z-[70]",
            )}
          >
            <button
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              className="flex items-center gap-2 min-w-0 rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-hover)] transition-colors"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
            >
              <div
                className="w-8 h-8 rounded-full bg-[var(--brass-soft)] text-[var(--brass)] flex items-center justify-center text-[13px] font-semibold shrink-0"
                aria-hidden
              >
                {user.name?.charAt(0)?.toUpperCase() ?? "U"}
              </div>
              <div className="min-w-0 leading-tight hidden text-left">
                <div className="text-[13px] font-medium truncate">
                  {user.name}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mono">
                  {user.level}
                </div>
              </div>
              <ChevronDown
                size={14}
                className={cn(
                  "text-[var(--text-muted)] shrink-0 transition-transform",
                  profileMenuOpen && "rotate-180",
                )}
              />
            </button>
            {profileMenuOpen && (
              <div
                className="absolute right-0 top-[calc(100%+8px)] z-[70] w-56 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-canvas)] shadow-[var(--shadow-lg)] p-1.5"
                role="menu"
              >
                <button
                  type="button"
                  onClick={handleToggleLanguage}
                  className="w-full flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[13px] text-left text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                  role="menuitem"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Languages size={14} className="text-[var(--text-muted)]" />
                    Language
                  </span>
                  <span
                    lang={i18n.language === "en" ? "my" : "en"}
                    className={cn(
                      "shrink-0 text-[12px] text-[var(--text-muted)]",
                      i18n.language === "en" ? "myanmar" : "mono",
                    )}
                  >
                    {i18n.language === "en" ? "မြန်မာ" : "EN"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className="w-full flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[13px] text-left text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                  role="menuitem"
                >
                  <span className="inline-flex items-center gap-2">
                    {theme === "dark" ? (
                      <Sun size={14} className="text-[var(--text-muted)]" />
                    ) : (
                      <Moon size={14} className="text-[var(--text-muted)]" />
                    )}
                    Theme
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {theme === "dark" ? "Light" : "Dark"}
                  </span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="w-full flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-left text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                    role="menuitem"
                  >
                    <SettingsIcon size={14} className="text-[var(--text-muted)]" />
                    {t("nav.settings")}
                  </button>
                )}
                <div className="my-1 h-px bg-[var(--hairline)]" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-left text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
                  role="menuitem"
                >
                  <LogOut size={14} />
                  {t("common.signOut")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showScanner && (
        <BarcodeScanner
          onScanSuccess={handleScanSuccess}
          onClose={() => setShowScanner(false)}
        />
      )}

      <Dialog
        open={Boolean(ticketErrorMessage)}
        onClose={() => {
          setTicketError(false);
          setTicketErrorMessage(null);
        }}
        size="sm"
        closeOnBackdrop={false}
        title={t("common.ticketError")}
        footer={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setTicketError(false);
              setTicketErrorMessage(null);
            }}
          >
            {t("common.ok")}
          </Button>
        }
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
            <TriangleAlert size={20} aria-hidden />
          </span>
          <span className="text-[13px] font-medium text-[var(--danger)]">
            {ticketErrorMessage}
          </span>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(ticketWarningRemark)}
        onClose={() => setTicketWarningRemark(null)}
        size="sm"
        closeOnBackdrop={false}
        title={t("common.ticketRemark")}
        footer={
          <Button
            type="button"
            variant="primary"
            onClick={() => setTicketWarningRemark(null)}
          >
            {t("common.ok")}
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--warning-soft)] text-[var(--warning)]">
            <TriangleAlert size={20} aria-hidden />
          </span>
          <p className="text-[13px] font-medium text-[var(--text-primary)] whitespace-pre-wrap">
            {ticketWarningRemark}
          </p>
        </div>
      </Dialog>

      {/* Main content */}
      <main
        className="overflow-y-auto"
        style={{ gridColumn: 2 }}
      >
        <div className="w-full px-8 py-8">{renderPage()}</div>
      </main>
    </div>
  );
}

/* ---------- NavRow ---------- */

interface NavRowProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

const NavRow: React.FC<NavRowProps> = ({
  item,
  active,
  onClick,
  collapsed = false,
}) => {
  const Icon = item.icon;
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex items-center rounded-[6px]",
          "text-[13.5px] font-medium transition-colors duration-100",
          collapsed
            ? "justify-center w-10 h-10 mx-auto px-0"
            : "w-full h-9 gap-2.5 px-3",
          active
            ? "bg-[var(--surface-hover)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
        )}
      >
        {active && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--brass)] rounded-full"
          />
        )}
        <Icon
          size={16}
          className={cn(
            "shrink-0",
            active ? "text-[var(--brass)]" : "text-[var(--text-muted)]"
          )}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    </li>
  );
};

export default App;
