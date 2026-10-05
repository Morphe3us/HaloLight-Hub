import {
  useGetCurrentUser,
  useGetUnreadNotificationCount,
  useUpdateCurrentUser,
  type UserUpdateLanguage,
} from "@workspace/api-client-react";
import { useAuth } from "@/auth/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Sun, Moon, Globe, ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

const ROLE_LABEL_KEYS: Record<string, string> = {
  admin: "nav.role_admin",
  client: "nav.role_client",
  coach: "nav.role_coach",
  sales_rep: "nav.role_sales_rep",
};

export function Topbar() {
  const { data: apiUser } = useGetCurrentUser();
  const { user: authUser } = useAuth();
  const user = !!authUser?.id && !!apiUser?.authId && apiUser.authId === authUser.id ? apiUser : undefined;
  const { data: unreadData } = useGetUnreadNotificationCount();
  const updateUser = useUpdateCurrentUser();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { t, i18n: i18nInst } = useTranslation();
  const identity = resolveCurrentUserIdentity(user, authUser);

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

  const iconButton = "h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

  return (
    <header className="hidden md:flex h-16 border-b border-border bg-background/85 backdrop-blur-md items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-8 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase px-2 rounded-md hover:text-foreground hover:bg-muted transition-colors cursor-pointer select-none">
              <Globe className="w-3.5 h-3.5 stroke-[1.75]" />
              {currentLang}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {LANGUAGES.map(({ code, label }) => (
              <DropdownMenuItem
                key={code}
                onClick={() => handleLangChange(code)}
                className={currentLang === code ? "font-medium text-foreground" : ""}
              >
                <span className="text-xs uppercase text-muted-foreground w-7 inline-block shrink-0">{code}</span>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className={iconButton}
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={t("nav.toggle_theme")}
        >
          {isDark ? <Sun className="h-4 w-4 stroke-[1.75]" /> : <Moon className="h-4 w-4 stroke-[1.75]" />}
        </button>

        <Link href="/notifications" className={`${iconButton} relative`} data-testid="link-topbar-notifications" aria-label={t("nav.notifications")}>
          <Bell className="w-4 h-4 stroke-[1.75]" />
          {!!unreadData?.count && unreadData.count > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background tabular-nums ring-2 ring-background">
              {unreadData.count > 9 ? "9+" : unreadData.count}
            </span>
          )}
        </Link>

        <div className="h-5 w-px bg-border mx-2" aria-hidden="true" />

        <Link href="/settings" className="flex items-center gap-2.5 rounded-md pl-1 pr-2 py-1 hover:bg-muted transition-colors">
          <Avatar className="h-7 w-7" data-testid="avatar-topbar">
            <AvatarImage src={authUser?.avatarUrl ?? undefined} alt={identity.displayName} />
            <AvatarFallback className="bg-muted text-foreground font-medium text-[11px]">
              {identity.initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-left leading-tight">
            <div className="text-[13px] font-medium text-foreground">
              {identity.displayName}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {ROLE_LABEL_KEYS[user?.role ?? ""] ? t(ROLE_LABEL_KEYS[user?.role ?? ""]) : (user?.role?.replace("_", " ") ?? "")}
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
