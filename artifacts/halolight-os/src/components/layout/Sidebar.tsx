import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Bell, Settings as SettingsIcon, Shield, CheckCircle2,
  ChevronRight, LogOut, Menu, GraduationCap, Calendar, TrendingUp,
  FileText, FileSignature, ReceiptText, ChevronDown, LifeBuoy, BookOpen,
  Sparkles, Users, Hash, BarChart3, UserCheck, DollarSign, Monitor, Package, Zap,
  LibraryBig, Search, Languages, FolderUp, Brain, HardDrive, Sun, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
  children?: NavItem[];
};

function NavLink({ item, location, onClose }: { item: NavItem; location: string; onClose?: () => void }) {
  const [open, setOpen] = useState(() => item.children?.some((c) => location.startsWith(c.href)) ?? false);
  const { data: unreadData } = useGetUnreadNotificationCount();

  if (item.children) {
    const isGroupActive = item.children.some((c) => location.startsWith(c.href));
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer w-full group",
            isGroupActive
              ? "text-foreground"
              : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          )}
        >
          <div className="flex items-center gap-3">
            <item.icon className={cn(
              "w-4 h-4 shrink-0",
              isGroupActive ? "text-accent-foreground" : "text-muted-foreground group-hover:text-foreground"
            )} />
            <span>{item.title}</span>
          </div>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform text-muted-foreground", open ? "rotate-180" : "")} />
        </button>
        {open && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
            {item.children.map((child) => {
              const isActive = location === child.href;
              return (
                <Link key={child.href} href={child.href} onClick={onClose}>
                  <div className={cn(
                    "flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer",
                    isActive
                      ? "bg-accent/15 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/8"
                  )}>
                    <child.icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />
                    {child.title}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const isActive = location === item.href;
  return (
    <Link href={item.href} onClick={onClose}>
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer group",
          isActive
            ? "bg-accent/15 text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
        )}
        data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-3">
          <item.icon className={cn(
            "w-4 h-4 shrink-0",
            isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
          )} />
          <span>{item.title}</span>
        </div>
        {item.badge && unreadData?.count ? (
          <span className="bg-accent text-foreground text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
            {unreadData.count}
          </span>
        ) : (
          <ChevronRight className={cn(
            "w-3.5 h-3.5 opacity-0 transition-opacity",
            isActive ? "opacity-60" : "group-hover:opacity-40"
          )} />
        )}
      </div>
    </Link>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { data: user } = useGetCurrentUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const { data: unreadMobile } = useGetUnreadNotificationCount();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const navItems: NavItem[] = [
    { title: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { title: t("nav.academy"), href: "/academy", icon: GraduationCap },
    { title: t("nav.events"), href: "/events", icon: Calendar },
    {
      title: t("nav.sales"),
      href: "/crm",
      icon: TrendingUp,
      children: [
        { title: t("nav.leads"), href: "/crm/leads", icon: TrendingUp },
        { title: t("nav.quotes"), href: "/quotes", icon: FileText },
        { title: t("nav.contracts"), href: "/contracts", icon: FileSignature },
        { title: t("nav.invoices"), href: "/invoices", icon: ReceiptText },
      ],
    },
    {
      title: t("nav.support"),
      href: "/support",
      icon: LifeBuoy,
      children: [
        { title: t("nav.tickets"), href: "/support", icon: LifeBuoy },
        { title: t("nav.kb"), href: "/kb", icon: BookOpen },
      ],
    },
    { title: t("nav.ai_assistant"), href: "/ai", icon: Sparkles },
    { title: t("nav.community"), href: "/community", icon: Users },
    {
      title: t("nav.hardware"),
      href: "/equipment",
      icon: Monitor,
      children: [
        { title: t("nav.equipment"), href: "/equipment", icon: Monitor },
        { title: t("nav.consumables"), href: "/consumables", icon: Package },
      ],
    },
    { title: t("nav.onboarding"), href: "/onboarding", icon: CheckCircle2 },
    { title: t("nav.notifications"), href: "/notifications", icon: Bell, badge: true },
    { title: t("nav.settings"), href: "/settings", icon: SettingsIcon },
  ];

  const adminItems: NavItem[] = isAdmin
    ? [
        {
          title: t("nav.admin_section"),
          href: "/admin",
          icon: Shield,
          children: [
            { title: t("nav.analytics"), href: "/admin/analytics", icon: BarChart3 },
            { title: t("nav.revenue"), href: "/admin/revenue", icon: DollarSign },
            { title: t("nav.clients"), href: "/admin/clients", icon: UserCheck },
            { title: t("nav.equipment"), href: "/admin/equipment", icon: Monitor },
            { title: t("nav.automation"), href: "/admin/automation", icon: Zap },
            { title: t("nav.academy"), href: "/admin/academy", icon: GraduationCap },
            { title: t("nav.resources"), href: "/admin/resources", icon: LibraryBig },
            { title: t("nav.search_admin"), href: "/admin/search", icon: Search },
            { title: t("nav.translations"), href: "/admin/translations", icon: Languages },
            { title: t("nav.uploads"), href: "/admin/uploads", icon: FolderUp },
            { title: t("nav.ai_knowledge"), href: "/admin/ai-knowledge", icon: Brain },
            { title: t("nav.backup"), href: "/admin/backup", icon: HardDrive },
            { title: t("nav.users"), href: "/admin", icon: Users },
          ],
        },
      ]
    : [];

  const allItems: NavItem[] = [...navItems, ...adminItems];

  const handleSignOut = () => {
    signOut({ redirectUrl: "/" });
  };

  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <img src="/logo-hub-light-orig.png" alt="HaloLight Hub" className="w-[110px] h-auto object-contain dark:hidden" style={{ mixBlendMode: "multiply" }} />
        <img src="/logo-hub-dark-orig.png" alt="HaloLight Hub" className="w-[110px] h-auto object-contain hidden dark:block" style={{ mixBlendMode: "screen" }} />
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {allItems.map((item) => (
          <NavLink key={item.href} item={item} location={location} onClose={onClose} />
        ))}
      </div>

      {/* Sign Out */}
      <div className="px-3 py-4 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/8 hover:text-destructive transition-colors w-full cursor-pointer"
          data-testid="button-signout-sidebar"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {t("nav.sign_out")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[240px] flex-col h-screen sticky top-0 shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile header */}
      <div className="md:hidden flex items-center px-3 py-3 border-b border-border bg-background gap-2">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[240px] bg-background border-border">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <img src="/logo-hub-light-orig.png" alt="HaloLight Hub" className="w-[90px] h-auto object-contain dark:hidden" style={{ mixBlendMode: "multiply" }} />
        <img src="/logo-hub-dark-orig.png" alt="HaloLight Hub" className="w-[90px] h-auto object-contain hidden dark:block" style={{ mixBlendMode: "screen" }} />
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Link href="/notifications">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground relative">
              <Bell className="h-4 w-4" />
              {!!unreadMobile?.count && unreadMobile.count > 0 && (
                <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {unreadMobile.count > 9 ? "9+" : unreadMobile.count}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
