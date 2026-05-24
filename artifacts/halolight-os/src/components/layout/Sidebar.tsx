import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Bell, Settings as SettingsIcon, Shield, CheckCircle2,
  ChevronRight, LogOut, Menu, GraduationCap, Calendar, TrendingUp,
  FileText, FileSignature, ReceiptText, ChevronDown, LifeBuoy, BookOpen,
  Sparkles, Users, Hash, BarChart3, UserCheck, DollarSign, Monitor, Package, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";
import { useState } from "react";
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
        data-testid={`link-sidebar-${item.title.toLowerCase()}`}
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

  const navItems: NavItem[] = [
    { title: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { title: t("nav.academy"), href: "/academy", icon: GraduationCap },
    { title: t("nav.events"), href: "/events", icon: Calendar },
    {
      title: "Sales",
      href: "/crm",
      icon: TrendingUp,
      children: [
        { title: "Leads", href: "/crm/leads", icon: TrendingUp },
        { title: "Quotes", href: "/quotes", icon: FileText },
        { title: "Contracts", href: "/contracts", icon: FileSignature },
        { title: "Invoices", href: "/invoices", icon: ReceiptText },
      ],
    },
    {
      title: "Support",
      href: "/support",
      icon: LifeBuoy,
      children: [
        { title: "Tickets", href: "/support", icon: LifeBuoy },
        { title: "Knowledge Base", href: "/kb", icon: BookOpen },
      ],
    },
    { title: "AI Assistant", href: "/ai", icon: Sparkles },
    { title: "Community", href: "/community", icon: Users },
    {
      title: "Hardware",
      href: "/equipment",
      icon: Monitor,
      children: [
        { title: "Equipment", href: "/equipment", icon: Monitor },
        { title: "Consumables", href: "/consumables", icon: Package },
      ],
    },
    { title: t("nav.onboarding"), href: "/onboarding", icon: CheckCircle2 },
    { title: t("nav.notifications"), href: "/notifications", icon: Bell, badge: true },
    { title: t("nav.settings"), href: "/settings", icon: SettingsIcon },
  ];

  const adminItems: NavItem[] = isAdmin
    ? [
        {
          title: "Admin",
          href: "/admin",
          icon: Shield,
          children: [
            { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
            { title: "Revenue", href: "/admin/revenue", icon: DollarSign },
            { title: "Clients", href: "/admin/clients", icon: UserCheck },
            { title: "Equipment", href: "/admin/equipment", icon: Monitor },
            { title: "Automation", href: "/admin/automation", icon: Zap },
            { title: "Users", href: "/admin", icon: Users },
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
        <div className="inline-block bg-foreground dark:bg-transparent rounded-lg px-3 py-2">
          <img src="/logo-hub.png" alt="HaloLight Hub" className="w-[100px] h-auto object-contain" />
        </div>
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
          Sign Out
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
      <div className="md:hidden flex items-center p-4 border-b border-border bg-background">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-3" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[240px] bg-background border-border">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="inline-block bg-foreground dark:bg-transparent rounded-lg px-2.5 py-1.5">
          <img src="/logo-hub.png" alt="HaloLight Hub" className="w-20 h-auto object-contain" />
        </div>
      </div>
    </>
  );
}
