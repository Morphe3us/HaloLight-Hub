import { useGetCurrentUser, useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { Bell, Sun, Moon } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function Topbar() {
  const { data: user } = useGetCurrentUser();
  const { data: unreadData } = useGetUnreadNotificationCount();
  const { theme, setTheme } = useTheme();

  const initials = user?.fullName
    ? user.fullName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)
    : user?.email.substring(0, 2).toUpperCase();

  const isDark = theme === "dark";

  return (
    <header className="hidden md:flex h-16 border-b border-border bg-background items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex-1" />

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted px-2 py-1 rounded-md">
            {user?.language.toUpperCase()}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Link href="/notifications" className="relative text-muted-foreground hover:text-foreground transition-colors" data-testid="link-topbar-notifications">
          <Bell className="w-5 h-5" />
          {!!unreadData?.count && unreadData.count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground border-2 border-background">
              {unreadData.count}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3 border-l border-border pl-5">
          <div className="text-right">
            <div className="text-sm font-medium text-foreground">{user?.fullName || "User"}</div>
            <div className="text-xs text-muted-foreground capitalize">{user?.role.replace("_", " ")}</div>
          </div>
          <Link href="/settings">
            <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-accent transition-all" data-testid="avatar-topbar">
              <AvatarFallback className="bg-accent/20 text-foreground font-semibold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
