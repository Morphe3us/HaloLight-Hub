import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { getGetOperationalReadinessQueryKey, useGetOperationalReadiness } from "@workspace/api-client-react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationPreferences } from "./Settings";

const titles = {
  general: "admin_settings.general",
  branding: "admin_settings.branding",
  notifications: "admin_settings.notifications",
} as const;

export function GeneralConfiguration() {
  const { t } = useTranslation();
  const query = useGetOperationalReadiness({ query: {
    queryKey: getGetOperationalReadinessQueryKey(), retry: false, staleTime: 0,
  } });
  const data = query.data;
  const valid = data?.configurationOnly === true && data.externalChecksPerformed === false &&
    [data.ai?.status, data.mail?.status, data.legal?.status].every(status =>
      ["disabled", "misconfigured", "configured_unverified", "demo"].includes(status ?? ""));

  return (
    <section className="space-y-4" aria-labelledby="service-configuration">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="service-configuration" className="text-lg font-semibold">{t("admin_settings.services")}</h2>
        <Button type="button" variant="outline" size="icon" disabled={query.isFetching}
          title={t("common.retry")} aria-label={t("common.retry")} onClick={() => void query.refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("admin_settings.configuration_only")}</p>
      {query.isFetching && <p role="status" className="text-sm">{t("common.loading")}</p>}
      {query.isError || (!query.isLoading && !valid) ? (
        <p role="alert" className="text-sm text-destructive">{t("common.error")}</p>
      ) : valid && data ? (
        <dl className="divide-y border-y" aria-live="polite">
          {(["ai", "mail", "legal"] as const).map(service => (
            <div key={service} className="grid gap-2 py-4 sm:grid-cols-2">
              <dt className="font-medium">{t(`admin_settings.${service}`)}</dt>
              <dd className="min-w-0 break-words text-sm text-muted-foreground">
                {t(`admin_settings.status_${data[service].status}`)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const section = location === "/admin/branding" ? "branding"
    : location === "/admin/notifications" ? "notifications" : "general";
  const base = import.meta.env.BASE_URL;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 break-words" data-testid={`admin-settings-${section}`}>
      <h1 className="text-2xl font-bold">{t(titles[section])}</h1>
      {section === "general" && <GeneralConfiguration />}
      {section === "notifications" && (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("admin_settings.personal_notifications")}</p>
          <NotificationPreferences />
        </section>
      )}
      {section === "branding" && (
        <section className="space-y-5" aria-labelledby="hub-branding">
          <div className="space-y-2">
            <h2 id="hub-branding" className="text-lg font-semibold">HaloLight Hub</h2>
            <p className="text-sm text-muted-foreground">{t("admin_settings.deployment_branding")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["light", "dark"] as const).map(mode => (
              <figure key={mode} className="min-w-0 space-y-2">
                <div className={`flex aspect-[3/2] items-center justify-center overflow-hidden rounded-md border p-6 ${mode === "light" ? "bg-white" : "bg-zinc-950"}`}>
                  <img src={`${base}logo-hub-${mode}-orig.png`} alt={`HaloLight Hub (${t(`admin_settings.${mode}`)})`}
                    className="h-full w-full object-contain" />
                </div>
                <figcaption className="text-sm text-muted-foreground">{t(`admin_settings.${mode}`)}</figcaption>
              </figure>
            ))}
          </div>
          <div className="border-t pt-4">
            <Link href="/settings#company-logo" className="inline-flex max-w-full items-center gap-2 text-sm font-medium underline underline-offset-4">
              <span>{t("admin_settings.own_logo")}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
