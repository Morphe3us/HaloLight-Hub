import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const roles = ["admin", "client", "coach", "sales_rep"] as const;

// Fixed route policies, not editable grants. See the permissions audit of cc64ccc.
export const permissionRows = [
  { key: "own_records", admin: "own", standard: "own" },
  { key: "sales_search", admin: "all", standard: "own" },
  { key: "support", admin: "all", standard: "own" },
  { key: "administration", admin: "allowed", standard: "denied" },
  { key: "academy", admin: "published", standard: "published" },
  { key: "knowledge", admin: "drafts", standard: "published" },
  { key: "downloads", admin: "ready", standard: "visible" },
  { key: "community", admin: "moderation", standard: "public_channels" },
] as const;

export default function AdminRoles() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold break-words">{t("admin_roles.title")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("admin_roles.fixed")}</p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/admin"><Users className="mr-2 h-4 w-4" aria-hidden="true" />{t("nav.users")}</Link>
        </Button>
      </header>
      <div role="region" aria-labelledby="permissions-caption" tabIndex={0}
        className="max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
          <caption id="permissions-caption" className="pb-3 text-left text-sm font-medium">
            {t("admin_roles.caption")}
          </caption>
          <thead className="border-y bg-muted/50">
            <tr>
              <th scope="col" className="w-[19%] p-3 text-left font-medium">{t("admin_roles.capability")}</th>
              {roles.map(role => <th key={role} scope="col" className="w-[13%] p-3 text-left font-medium break-words">{t(`admin.role_${role}`)}</th>)}
              <th scope="col" className="w-[29%] p-3 text-left font-medium">{t("admin_roles.scope")}</th>
            </tr>
          </thead>
          <tbody>
            {permissionRows.map(row => (
              <tr key={row.key} className="border-b align-top">
                <th scope="row" className="p-3 text-left font-medium break-words">{t(`admin_roles.${row.key}`)}</th>
                {roles.map(role => <td key={role} className="p-3 break-words">{t(`admin_roles.${role === "admin" ? row.admin : row.standard}`)}</td>)}
                <td className="p-3 text-muted-foreground break-words">{t(`admin_roles.${row.key}_scope`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="space-y-2 text-sm text-muted-foreground">
        <p>{t("admin_roles.no_delegation")}</p>
        <p>{t("admin_roles.conditions")}</p>
        <p>{t("admin_roles.reviewed", { date: "2026-09-11", revision: "cc64ccc" })}</p>
      </footer>
    </div>
  );
}
