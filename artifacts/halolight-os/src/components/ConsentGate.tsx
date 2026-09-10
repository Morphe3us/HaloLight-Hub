import { useEffect, useState, type ReactNode } from "react";
import { useClerk } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { consentKey, getConsent, saveConsent, type ConsentStatus } from "@/lib/userCompliance";

export function ConsentForm({ status, userId, onSaved }: { status: ConsentStatus; userId: string; onSaved?: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const [optional, setOptional] = useState({
    marketing: status.required ? false : status.acceptance?.marketing ?? false,
    analytics: status.required ? false : status.acceptance?.analytics ?? false,
    aiImprovement: status.required ? false : status.acceptance?.aiImprovement ?? false,
  });
  const mutation = useMutation({
    mutationFn: saveConsent,
    onSuccess: (result) => { client.setQueryData(consentKey(userId), result); onSaved?.(); },
    onError: () => { void client.invalidateQueries({ queryKey: consentKey(userId) }); },
  });
  const documents = status.documents;
  if (!status.configured || !documents) return (
    <p role="status" className="text-sm text-muted-foreground">{t("consent.not_configured", { defaultValue: "Approved legal documents have not been published in the Hub yet. No acceptance is being recorded." })}</p>
  );
  const labels = {
    marketing: t("consent.marketing", { defaultValue: "Marketing communications (optional)" }),
    analytics: t("consent.analytics", { defaultValue: "Optional usage analytics" }),
    aiImprovement: t("consent.ai_improvement", { defaultValue: "Use of my data to improve AI (optional)" }),
  };
  return <form className="space-y-5" onSubmit={(event) => {
    event.preventDefault();
    if (!accepted || mutation.isPending) return;
    mutation.mutate({ accepted: true, ...documents, ...optional });
  }}>
    <div className="space-y-2 text-sm break-words">
      <p><a className="underline" href={documents.termsUrl} target="_blank" rel="noopener noreferrer">{t("consent.terms", { defaultValue: "Terms of use" })}</a> ({documents.termsVersion})</p>
      <p><a className="underline" href={documents.privacyUrl} target="_blank" rel="noopener noreferrer">{t("consent.privacy", { defaultValue: "Privacy policy and personal data processing" })}</a> ({documents.privacyVersion})</p>
    </div>
    <label className="flex items-start gap-3 text-sm leading-relaxed">
      <Checkbox required aria-required="true" checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} disabled={mutation.isPending} className="mt-1 shrink-0" />
      <span>{t("consent.accept", { defaultValue: "I have read and accept these versions of the terms of use and privacy policy." })}</span>
    </label>
    <fieldset className="space-y-3 border-t pt-4" disabled={mutation.isPending}>
      <legend className="text-sm font-medium">{t("consent.optional", { defaultValue: "Optional choices" })}</legend>
      {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <label key={key} className="flex items-start gap-3 text-sm">
        <Checkbox checked={optional[key]} onCheckedChange={(value) => setOptional((previous) => ({ ...previous, [key]: value === true }))} className="shrink-0" />
        <span>{labels[key]}</span>
      </label>)}
    </fieldset>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{t("consent.save_error", { defaultValue: "Acceptance was not saved. Review the current documents and try again." })}</p>}
    <Button type="submit" disabled={!accepted || mutation.isPending}>{mutation.isPending ? t("common.loading") : t("consent.save", { defaultValue: "Save my choices" })}</Button>
  </form>;
}

export function ConsentGate({ children }: { children: ReactNode }) {
  const { data: user } = useGetCurrentUser();
  const { t } = useTranslation();
  const { signOut } = useClerk();
  const client = useQueryClient();
  const query = useQuery({ queryKey: consentKey(user?.id ?? ""), queryFn: ({ signal }) => getConsent(signal), enabled: !!user, staleTime: 0, refetchOnWindowFocus: true });
  useEffect(() => {
    const refreshOnRequired = (error: unknown) => {
      if (error && typeof error === "object" && "status" in error && error.status === 428)
        void client.invalidateQueries({ queryKey: consentKey(user?.id ?? "") });
    };
    const unsubscribeQueries = client.getQueryCache().subscribe((event) => {
      if (event.type === "updated") refreshOnRequired(event.query.state.error);
    });
    const unsubscribeMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === "updated") refreshOnRequired(event.mutation.state.error);
    });
    return () => { unsubscribeQueries(); unsubscribeMutations(); };
  }, [client, user?.id]);
  if (query.isPending) return <p role="status" className="p-8 text-center">{t("common.loading")}</p>;
  if (query.isError) return <div role="alert" className="p-8 text-center space-y-4">
    <p>{t("common.error")}</p><Button onClick={() => void query.refetch()}>{t("common.retry")}</Button>
    <Button variant="outline" onClick={() => void signOut()}>{t("nav.sign_out")}</Button>
  </div>;
  if (!query.data.required) return children;
  return <main className="mx-auto w-full max-w-2xl px-5 py-12 space-y-6">
    <h1 className="text-2xl font-semibold">{t("consent.title", { defaultValue: "Terms and privacy" })}</h1>
    <ConsentForm key={JSON.stringify(query.data.documents)} status={query.data} userId={user!.id} />
    <Button variant="outline" onClick={() => void signOut()}>{t("nav.sign_out")}</Button>
  </main>;
}
