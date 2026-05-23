import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Bell, Settings as SettingsIcon, Shield, CheckCircle2,
  ChevronRight, LogOut, Menu, GraduationCap, Calendar, TrendingUp,
  FileText, FileSignature, ReceiptText, ChevronDown, LifeBuoy, BookOpen,
  Sparkles, Users, Hash,
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
            "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer w-full group",
            isGroupActive ? "text-gray-100" : "text-gray-400 hover:bg-sidebar-accent/50 hover:text-gray-200"
          )}
        >
          <div className="flex items-center gap-3">
            <item.icon className={cn("w-5 h-5", isGroupActive ? "text-primary" : "text-gray-400 group-hover:text-gray-300")} />
            {item.title}
          </div>
          <ChevronDown className={cn("w-4 h-4 transition-transform text-gray-500", open ? "rotate-180" : "")} />
        </button>
        {open && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
            {item.children.map((child) => {
              const isActive = location === child.href;
              return (
                <Link key={child.href} href={child.href} onClick={onClose}>
                  <div className={cn(
                    "flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-gray-400 hover:text-gray-200 hover:bg-sidebar-accent/30"
                  )}>
                    <child.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-gray-400")} />
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
      <div className={cn(
        "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "text-gray-400 hover:bg-sidebar-accent/50 hover:text-gray-200"
      )}
        data-testid={`link-sidebar-${item.title.toLowerCase()}`}
      >
        <div className="flex items-center gap-3">
          <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-gray-400 group-hover:text-gray-300")} />
          {item.title}
        </div>
        {item.badge && unreadData?.count ? (
          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
            {unreadData.count}
          </span>
        ) : (
          <ChevronRight className={cn("w-4 h-4 opacity-0 transition-opacity", isActive ? "opacity-100 text-primary" : "group-hover:opacity-100 text-gray-500")} />
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
    { title: t("nav.onboarding"), href: "/onboarding", icon: CheckCircle2 },
    { title: t("nav.notifications"), href: "/notifications", icon: Bell, badge: true },
    { title: t("nav.settings"), href: "/settings", icon: SettingsIcon },
  ];

  const allItems: NavItem[] = [
    ...navItems,
    ...(isAdmin ? [{ title: t("nav.admin"), href: "/admin", icon: Shield }] : []),
  ];

  const handleSignOut = () => {
    signOut({ redirectUrl: "/" });
  };

  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
            HL
          </div>
          <span className="font-semibold text-lg tracking-tight">HaloLight OS</span>
        </div>
      </div>

      <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        {allItems.map((item) => (
          <NavLink key={item.href} item={item} location={location} onClose={onClose} />
        ))}
      </div>

      <div className="p-4 mt-auto">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-sidebar-accent hover:text-red-400 transition-colors w-full cursor-pointer"
          data-testid="button-signout-sidebar"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:flex w-[260px] flex-col h-screen sticky top-0 shrink-0">
        <SidebarContent />
      </div>

      <div className="md:hidden flex items-center p-4 border-b bg-white">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-2" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[260px] bg-sidebar border-sidebar-border">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm mr-3">
          HL
        </div>
        <span className="font-semibold text-lg tracking-tight">HaloLight OS</span>
      </div>
    </>
  );
}
