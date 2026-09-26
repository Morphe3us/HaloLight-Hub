import { useState, type ReactNode } from "react";
import { useGetMyAccess } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Clock, ShieldCheck, RefreshCw, LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AccountAccessGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const access = useGetMyAccess({ query: {
    queryKey: ["/api/users/me/access"],
    staleTime: 0, retry: false, refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  } });
  const tr = (key: string, fallback: string) => t(`auth.${key}`, { defaultValue: fallback });
  if (access.isPending) return <main className="flex min-h-[100dvh] items-center justify-center" role="status">
    <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />{t("common.loading")}
  </main>;
  if (!access.isError && access.data?.status === "approved" && !leaving) return children;
  const status = access.data?.status;
  const failed = access.isError || logoutFailed || !["pending", "rejected", "disabled", "approved"].includes(status ?? "");
  const pending = !failed && status === "pending";
  const title = failed ? tr("access_error_title", "Unable to check your access")
    : pending ? tr("pending_title", "Awaiting validation of your account")
    : status === "rejected" ? tr("rejected_title", "Your access request was not approved")
    : tr("disabled_title", "Your account is disabled");
  const message = failed ? tr("access_error_message", "Please try again. Your access status could not be confirmed.")
    : pending ? tr("pending_message", "Your email is confirmed. Our team will verify your purchase before opening your access.")
    : status === "rejected" ? tr("rejected_message", "Contact your account administrator if you believe this is a mistake.")
    : tr("disabled_message", "Contact your account administrator to restore access.");
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10" data-testid="account-access-gate">
    <section className="w-full max-w-[460px] rounded-lg border border-border bg-card p-6 text-center shadow-xl sm:p-8">
      <img src={`${base}/logo-hub-light-orig.png`} alt="HaloLight Hub" className="mx-auto mb-8 h-auto w-[132px] dark:brightness-0 dark:invert" />
      {pending ? <Clock className="mx-auto mb-5 h-9 w-9 text-primary" aria-hidden="true" /> : <ShieldCheck className="mx-auto mb-5 h-9 w-9 text-muted-foreground" aria-hidden="true" />}
      <div role={failed ? "alert" : "status"} aria-live="polite">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        {pending && <p className="mt-3 text-sm font-medium">{tr("review_time_max", "An administrator will validate your account within 12 hours maximum.")}</p>}
      </div>
      {access.data?.email && <div className="mt-6 border-y border-border py-4">
        <p className="text-xs text-muted-foreground">{tr("registered_email", "Account email")}</p>
        <p className="mt-1 break-all text-sm font-medium">{access.data.email}</p>
      </div>}
      {pending && <p className="mt-4 text-sm text-muted-foreground">{tr("purchase_email_hint", "Use the email address used for your HaloLight purchase.")}</p>}
      <div className="mt-6 space-y-2">
        <Button className="min-h-11 w-full gap-2 whitespace-normal" disabled={access.isFetching || leaving} onClick={() => void access.refetch()}>
          <RefreshCw className={`h-4 w-4 shrink-0 ${access.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          {tr("refresh_status", "Refresh status")}
        </Button>
        <Button variant="ghost" className="min-h-11 w-full gap-2 whitespace-normal" disabled={leaving} onClick={async () => {
          setLeaving(true); setLogoutFailed(false);
          try { await signOut(); } catch { setLogoutFailed(true); setLeaving(false); }
        }}>
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />{tr("switch_account", "Sign out and switch account")}
        </Button>
      </div>
    </section>
  </main>;
}
