import {
  useGetCurrentUser,
  useGetUnreadNotificationCount,
  useUpdateCurrentUser,
  type UserUpdateLanguage,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Sun, Moon, Home, Globe, ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "@/i18n";
import { syncLanguageCaches } from "@/lib/languageQueries";
import { resolveCurrentUserIdentity } from "@/lib/currentUserIdentity";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGUAGES: Array<{ code: UserUpdateLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pl", label: "Polski" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  client: "Member",
  coach: "Coach",
  sales_rep: "Sales Rep",
};

export function Topbar() {
  const { data: apiUser } = useGetCurrentUser();
  const { user: clerkUser } = useUser();
  const user = apiUser?.clerkId === clerkUser?.id ? apiUser : undefined;
  const { data: unreadData } = useGetUnreadNotificationCount();
  const updateUser = useUpdateCurrentUser();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { t, i18n: i18nInst } = useTranslation();
  const identity = resolveCurrentUserIdentity(user, clerkUser);

  const isDark = theme === "dark";
  const currentLang = i18nInst.language?.split("-")[0] ?? "en";

  const handleLangChange = (code: string) => {
    void setAppLanguage(code);
    if (user && user.language !== code) {
      updateUser.mutate(
        { data: { language: code as UserUpdateLanguage } },
        {
          onSuccess: () => {
            syncLanguageCaches(queryClient, code as UserUpdateLanguage);
          },
        },
      );
    }
  };

  return (
    <header className="hidden md:flex h-16 border-b border-border bg-background items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex-1" />

      <div className="flex items-center gap-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted px-2.5 py-1.5 rounded-md hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer select-none">
              <Globe className="w-3 h-3" />
              {currentLang}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {LANGUAGES.map(({ code, label }) => (
              <DropdownMenuItem
                key={code}
                onClick={() => handleLangChange(code)}
                className={currentLang === code ? "font-semibold text-foreground" : ""}
              >
                <span className="text-xs uppercase text-muted-foreground w-7 inline-block shrink-0">{code}</span>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors" aria-label={t("nav.dashboard")}>
          <Home className="w-4 h-4" />
        </Link>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={t("nav.toggle_theme")}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Link href="/notifications" className="relative text-muted-foreground hover:text-foreground transition-colors" data-testid="link-topbar-notifications" aria-label={t("nav.notifications")}>
          <Bell className="w-5 h-5" />
          {!!unreadData?.count && unreadData.count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground border-2 border-background">
              {unreadData.count}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3 border-l border-border pl-5">
          <div className="text-right">
            <div className="text-sm font-medium text-foreground">
              {identity.displayName}
            </div>
            <div className="text-xs text-muted-foreground">
              {ROLE_LABELS[user?.role ?? ""] ?? user?.role?.replace("_", " ") ?? ""}
            </div>
          </div>
          <Link href="/settings">
            <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-accent transition-all" data-testid="avatar-topbar">
              <AvatarImage src={clerkUser?.imageUrl} alt={identity.displayName} />
              <AvatarFallback className="bg-accent/20 text-foreground font-semibold text-sm">
                {identity.initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
