import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { LayoutDashboard, Bell, Settings as SettingsIcon, Shield, CheckCircle2, ChevronRight, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard
  },
  {
    title: "Onboarding",
    href: "/onboarding",
    icon: CheckCircle2
  },
  {
    title: "Notifications",
    href: "/notifications",
    icon: Bell,
    badge: true
  },
  {
    title: "Settings",
    href: "/settings",
    icon: SettingsIcon
  }
];

export function Sidebar() {
  const [location] = useLocation();
  const { data: user } = useGetCurrentUser();
  const { data: unreadData } = useGetUnreadNotificationCount();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const allItems = [...navItems, ...(isAdmin ? [{ title: "Admin", href: "/admin", icon: Shield }] : [])];

  const handleSignOut = () => {
    signOut({ redirectUrl: "/" });
  };

  const SidebarContent = () => (
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
        {allItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <div 
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" 
                    : "text-gray-400 hover:bg-sidebar-accent/50 hover:text-gray-200"
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
        })}
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
            <SidebarContent />
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
