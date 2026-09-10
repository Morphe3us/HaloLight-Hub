import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import type { ConsentEvent } from "@/lib/userCompliance";

export function AdminConsentProof({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["admin-consent-proof", userId],
    queryFn: ({ signal }) => customFetch<{ items: ConsentEvent[] }>(`/api/users/${encodeURIComponent(userId)}/consent`, { signal }),
    staleTime: 0,
  });
  return <section className="border-t pt-4 space-y-3">
    <h3 className="text-sm font-semibold">{t("consent.proof", { defaultValue: "Acceptance history (latest 100)" })}</h3>
    {query.isPending ? <p>{t("common.loading")}</p> : query.isError ? <div role="alert">
      <p>{t("common.error")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("common.retry")}</Button>
    </div> : !query.data.items.length ? <p className="text-sm text-muted-foreground">{t("consent.no_proof", { defaultValue: "No acceptance recorded." })}</p> :
      <ul className="max-h-52 overflow-y-auto space-y-4 text-sm break-words">{query.data.items.map((event) => <li key={event.id} className="space-y-1">
        <p className="font-medium">{new Date(event.acceptedAt).toISOString()} (UTC)</p>
        <p>{event.userId}</p>
        <p><a href={event.termsUrl} target="_blank" rel="noopener noreferrer" className="underline">{t("consent.terms", { defaultValue: "Terms of use" })}</a>: {event.termsVersion}</p>
        <p><a href={event.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">{t("consent.privacy", { defaultValue: "Privacy policy and personal data processing" })}</a>: {event.privacyVersion}</p>
        <p>{t("consent.proof_choices", { defaultValue: "Optional consents: marketing {{marketing}}, analytics {{analytics}}, AI improvement {{ai}}", marketing: String(event.marketing), analytics: String(event.analytics), ai: String(event.aiImprovement) })}</p>
      </li>)}</ul>}
  </section>;
}
