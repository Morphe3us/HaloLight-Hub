import { useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useGetLead, type Lead } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useToast } from "./use-toast";
import { creationLeadId } from "../lib/prospectCreation";

export function useProspectCreation(open: (lead: Lead) => void) {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const leadId = creationLeadId(search);
  const consumed = useRef<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data, isError } = useGetLead(leadId ?? "", {
    query: { queryKey: ["lead", leadId], enabled: Boolean(leadId), retry: false },
  });

  useEffect(() => {
    if (!leadId) { consumed.current = null; return; }
    if (consumed.current === search || (!data && !isError)) return;
    consumed.current = search;
    if (isError) toast({ title: t("common.error"), variant: "destructive" });
    else if (data?.id === leadId) open(data);
    const remaining = new URLSearchParams(search);
    remaining.delete("create");
    remaining.delete("leadId");
    navigate(`${location}${remaining.size ? `?${remaining}` : ""}`, { replace: true });
  }, [data, isError, leadId, location, navigate, open, search, t, toast]);
}
