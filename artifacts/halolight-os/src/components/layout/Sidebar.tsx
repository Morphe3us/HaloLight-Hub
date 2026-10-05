import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  Bell, LogOut, Menu, ChevronDown, Sun, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useId, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { createAdminNavigation, createClientNavigation, hasNotificationBadge, isNavItemActive, type NavItem } from "./sidebarNavigation";
import { preloadSidebarPage } from "@/lib/pageRoutes";

function NavLink({
  item,
  location,
  unreadCount,
  onClose,
}: {
  item: NavItem;
  location: string;
  unreadCount: number;
  onClose?: () => void;
}) {
  const submenuId = useId();
  const isActive = isNavItemActive(item, location);
  const [disclosure, setDisclosure] = useState({ location, open: isActive });
  // A new route reveals its ancestors, while manual toggles survive data/theme rerenders.
  const open = disclosure.location === location ? disclosure.open : isActive;
  if (disclosure.location !== location) setDisclosure({ location, open: isActive });
  const setOpen = (value: boolean) => setDisclosure({ location, open: value });
  const badge = hasNotificationBadge(item) && unreadCount > 0 ? (
    <span className="bg-foreground text-background text-[11px] font-medium leading-5 px-1.5 rounded-full min-w-5 text-center tabular-nums shrink-0">
      {unreadCount}
    </span>
  ) : null;

  if (item.children) {
    return (
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={submenuId}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex items-center justify-between gap-2 px-2.5 py-1.5 min-h-9 rounded-md text-[13.5px] transition-colors duration-150 cursor-pointer w-full group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <item.icon className={cn(
              "w-4 h-4 shrink-0 stroke-[1.75]",
              isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
            )} />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.title}</span>
          </span>
          {badge}
          <ChevronDown aria-hidden="true" className={cn("w-3.5 h-3.5 shrink-0 transition-transform duration-200 text-muted-foreground/70", open ? "rotate-180" : "")} />
        </button>
        <div id={submenuId} hidden={!open} className="ml-[17px] mt-0.5 mb-1 space-y-px border-l border-border pl-2">
          {item.children.map((child) => (
            <NavLink key={child.href} item={child} location={location} unreadCount={unreadCount} onClose={onClose} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Link href={item.href} onClick={onClose} aria-current={isActive ? "page" : undefined}
        onMouseEnter={() => preloadSidebarPage(item.href)}
        onFocus={() => preloadSidebarPage(item.href)}
        onTouchStart={() => preloadSidebarPage(item.href)}
        className={cn(
          "flex items-center justify-between gap-2 px-2.5 py-1.5 min-h-9 rounded-md text-[13.5px] transition-colors duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-sidebar-accent text-foreground font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
        )}
        data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <item.icon className={cn(
            "w-4 h-4 shrink-0 stroke-[1.75]",
            isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
          )} />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.title}</span>
        </span>
        {badge}
    </Link>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { data: user } = useGetCurrentUser();
  const { signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const { data: unreadMobile } = useGetUnreadNotificationCount();
  const unreadCount = unreadMobile?.count ?? 0;
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const navItems = createClientNavigation(t);

  const adminItems: NavItem[] = isAdmin ? createAdminNavigation(t) : [];

  const allItems: NavItem[] = [...navItems, ...adminItems];

  const handleSignOut = () => {
    void signOut();
  };

  const renderSidebarContent = (onClose?: () => void) => (
    <div className="flex flex-col h-full min-h-0 bg-sidebar border-r border-border">
      {/* Logo */}
      <div className="px-5 h-16 flex items-center shrink-0 overflow-hidden">
        <img src="/hub-logo-light.webp" alt="HaloLight Hub" className="w-[92px] h-auto object-contain dark:hidden" style={{ mixBlendMode: "multiply" }} />
        <img src="/hub-logo-dark-mode.webp" alt="HaloLight Hub" width={1920} height={1080} className="w-[104px] h-auto object-contain hidden dark:block" />
      </div>

      {/* Navigation */}
      <nav aria-label={t("nav.navigation")} className="flex-1 min-h-0 px-3 py-3 space-y-px overflow-y-auto">
        {allItems.map((item) => (
          <NavLink key={item.href} item={item} location={location} unreadCount={unreadCount} onClose={onClose} />
        ))}
      </nav>

      {/* Sign Out */}
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-2.5 py-1.5 min-h-9 rounded-md text-[13.5px] text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground transition-colors w-full cursor-pointer"
          data-testid="button-signout-sidebar"
        >
          <LogOut className="w-4 h-4 shrink-0 stroke-[1.75]" />
          {t("nav.sign_out")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[236px] flex-col h-screen sticky top-0 shrink-0">
        {renderSidebarContent()}
      </div>

      {/* Mobile header */}
      <div className="md:hidden flex items-center px-3 h-14 border-b border-border bg-background/85 backdrop-blur-md sticky top-0 z-20 gap-2">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              data-testid="button-mobile-menu"
              aria-label={t("nav.open_menu")}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[240px] max-w-[calc(100vw-2rem)] bg-background border-border" aria-describedby={undefined}>
            <SheetTitle className="sr-only">{t("nav.navigation")}</SheetTitle>
            {renderSidebarContent(() => setMobileOpen(false))}
          </SheetContent>
        </Sheet>
        <img src="/hub-logo-light.webp" alt="HaloLight Hub" className="w-[90px] h-auto object-contain dark:hidden" style={{ mixBlendMode: "multiply" }} />
        <img src="/hub-logo-dark-mode.webp" alt="HaloLight Hub" width={1920} height={1080} className="w-[120px] h-auto object-contain hidden dark:block" />
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={t("nav.toggle_theme")}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
            <Button asChild
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground relative"
            >
              <Link href="/notifications" aria-label={t("nav.notifications")}>
              <Bell className="h-4 w-4" />
              {!!unreadMobile?.count && unreadMobile.count > 0 && (
                <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {unreadMobile.count > 9 ? "9+" : unreadMobile.count}
                </span>
              )}
              </Link>
            </Button>
        </div>
      </div>
    </>
  );
}
