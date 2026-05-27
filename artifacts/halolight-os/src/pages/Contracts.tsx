import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListContracts, useCreateContract, useDeleteContract, useListContractTemplates, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileSignature, Trash2, ChevronRight, CheckCircle2, AlertTriangle, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import CustomerSearchCombobox from "@/components/CustomerSearchCombobox";
import {
  type ContractFormData,
  type ProviderData,
  type ValidationResult,
  type ReadinessSection,
  computeReadiness,
  validateContract,
  fillAllVariables,
} from "@/lib/contractValidation";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  signed: "bg-success/8 text-success border-success/20",
  active: "bg-success/10 text-success border-green-200",
  expired: "bg-warning/8 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUS_KEYS = ["draft", "sent", "signed", "active", "expired", "cancelled"];

function formatDate(d: string | null | undefined, locale = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

function ReadinessRow({ section }: { section: ReadinessSection }) {
  const { t } = useTranslation();
  const label = t(`contract_validation.readiness_${section.key}`);
  if (section.status === "complete") {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
        <span className="text-xs text-success font-medium">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{t("contract_validation.readiness_complete")}</span>
      </div>
    );
  }
  if (section.status === "partial") {
    return (
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
        <span className="text-xs text-warning font-medium">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {section.presentCount}/{section.totalCount} {t("contract_validation.readiness_partial")}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
      <span className="text-xs text-destructive font-medium">{label}</span>
      <span className="text-xs text-muted-foreground ml-auto">{t("contract_validation.readiness_missing")}</span>
    </div>
  );
}

function ContractReadiness({ readiness }: { readiness: ReadinessSection[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {t("contracts.readiness_section")}
      </p>
      {readiness.map((s) => <ReadinessRow key={s.key} section={s} />)}
    </div>
  );
}

function MissingInfoDialog({
  open,
  validation,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  validation: ValidationResult | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (!validation) return null;
  const hasBlocking = validation.blocking.length > 0;
  const hasOptional = validation.optional.length > 0;
  const hasUnresolved = validation.unresolved.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className={cn("w-5 h-5", hasBlocking ? "text-destructive" : "text-warning")} />
            {t("contract_validation.missing_title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {hasBlocking && (
            <div className="space-y-2">
              <p className="text-sm text-destructive font-medium">{t("contract_validation.blocking_intro")}</p>
              <ul className="space-y-1">
                {validation.blocking.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    {t(`contract_validation.${f}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hasBlocking && (hasOptional || hasUnresolved) && (
            <div className="space-y-2">
              <p className="text-sm text-warning font-medium">{t("contract_validation.optional_intro")}</p>
              {hasOptional && (
                <ul className="space-y-1">
                  {validation.optional.map(({ field, placeholderKey }) => (
                    <li key={field} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                      <span>
                        {t(`contract_validation.${field}`)}
                        <span className="text-muted-foreground"> → "{t(`contract_validation.${placeholderKey}`)}"</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {hasUnresolved && (
                <>
                  <p className="text-sm text-warning font-medium mt-2">{t("contract_validation.unresolved_intro")}</p>
                  <ul className="space-y-1">
                    {validation.unresolved.map((v) => (
                      <li key={v} className="flex items-center gap-2 text-sm font-mono text-xs text-muted-foreground">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                        {v}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} className="sm:mr-auto">{t("common.cancel")}</Button>
          {!hasBlocking && (
            <Button onClick={onConfirm} variant="default">
              {t("contract_validation.continue_anyway")}
            </Button>
          )}
          <Button variant={hasBlocking ? "default" : "outline"} onClick={onCancel}>
            {t("contract_validation.complete_info")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Contracts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency, currency: currencyCode } = useCurrency();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showMissingDialog, setShowMissingDialog] = useState(false);
  const [pendingValidation, setPendingValidation] = useState<ValidationResult | null>(null);

  const EMPTY_CONTRACT_FORM: ContractFormData = {
    title: "", clientName: "", clientEmail: "", clientPhone: "", clientCompany: "", clientAddress: "",
    eventType: "", eventDate: "", eventLocation: "",
    serviceName: "", rentalDuration: "", includedPrints: "", equipmentDescription: "",
    value: "", currency: currencyCode ?? "EUR", depositAmount: "", paymentTerms: "",
    content: "", notes: "", templateId: "", leadId: "", quoteId: "",
  };

  const [form, setForm] = useState<ContractFormData>(EMPTY_CONTRACT_FORM);

  const { data: currentUserData } = useGetCurrentUser();
  const currentUser = currentUserData as any;

  const provider: ProviderData = {
    companyName: currentUser?.companyName,
    firstName: currentUser?.firstName,
    lastName: currentUser?.lastName,
    email: currentUser?.email,
    phone: currentUser?.phone,
  };

  const placeholders = {
    not_provided: t("contract_validation.placeholder_not_provided"),
    to_be_specified: t("contract_validation.placeholder_to_be_specified"),
    no_deposit: t("contract_validation.placeholder_no_deposit"),
  };

  const { data, isLoading } = useListContracts(
    { status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["contracts", filterStatus] } }
  );
  const { data: templatesData } = useListContractTemplates({ lang }, { query: { queryKey: ["contract-templates", lang] } });

  const createMutation = useCreateContract({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
        setShowCreate(false);
        setCustomerSearch("");
        setForm({ ...EMPTY_CONTRACT_FORM, currency: currencyCode ?? "EUR" });
        setShowMissingDialog(false);
        setPendingValidation(null);
        toast({ title: t("contracts.contract_created") });
      },
    },
  });

  const deleteMutation = useDeleteContract({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast({ title: t("contracts.contract_deleted") }); },
    },
  });

  const contracts = data?.items ?? [];
  const templates = templatesData?.items ?? [];

  const handleTemplateSelect = (id: string) => {
    const tpl = templates.find((tmpl) => tmpl.id === id);
    const raw = tpl?.content ?? "";
    const filled = fillAllVariables(raw, { ...form, templateId: id }, provider, lang, placeholders);
    setForm({ ...form, templateId: id, content: filled });
  };

  const doCreate = (filledContent: string) => {
    createMutation.mutate({
      data: {
        title: form.title,
        clientName: form.clientName,
        clientEmail: form.clientEmail || undefined,
        clientPhone: form.clientPhone || undefined,
        clientCompany: form.clientCompany || undefined,
        leadId: form.leadId || undefined,
        quoteId: form.quoteId || undefined,
        value: form.value || "0",
        templateId: form.templateId || undefined,
        content: filledContent,
        notes: form.notes || undefined,
      },
    });
  };

  const handleCreate = () => {
    const validation = validateContract(form, provider);
    if (validation.blocking.length > 0 || validation.optional.length > 0 || validation.unresolved.length > 0) {
      setPendingValidation(validation);
      setShowMissingDialog(true);
      return;
    }
    const filled = fillAllVariables(form.content, form, provider, lang, placeholders);
    doCreate(filled);
  };

  const handleConfirmCreate = () => {
    const filled = fillAllVariables(form.content, form, provider, lang, placeholders);
    doCreate(filled);
    setShowMissingDialog(false);
  };

  const handleMissingDialogCancel = () => {
    setShowMissingDialog(false);
    setPendingValidation(null);
  };

  const readiness = computeReadiness(form, provider);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contracts.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("contracts.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> {t("contracts.new_contract")}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("contracts.total_label"), value: String(contracts.length) },
          { label: t("contracts.signed_label"), value: String(contracts.filter((c) => c.status === "signed" || c.status === "active").length) },
          { label: t("contracts.pending_label"), value: String(contracts.filter((c) => c.status === "sent").length) },
          { label: t("contracts.contract_value"), value: formatCurrency(contracts.reduce((s, c) => s + Number(c.value), 0)) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("contracts.all_statuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("contracts.all_statuses")}</SelectItem>
            {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`contracts.status_${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("contracts.count", { count: contracts.length })}</span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">{t("contracts.loading")}</div>
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileSignature className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">{t("contracts.no_contracts")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("contracts.col_contract_num")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("contracts.col_client")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t("common.status")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t("contracts.col_signed")}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("contracts.value_section")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contracts.map((c) => {
                  const color = STATUS_COLORS[c.status];
                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/contracts/${c.id}`}>
                          <span className="font-mono text-sm font-medium hover:text-primary cursor-pointer">{c.contractNumber}</span>
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.title}</p>
                      </td>
                      <td className="px-4 py-3 font-medium">{c.clientName}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {color && <Badge variant="outline" className={cn("text-xs", color)}>{t(`contracts.status_${c.status}`)}</Badge>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{formatDate(c.signedAt, lang)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.value)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/contracts/${c.id}`}><Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="w-4 h-4" /></Button></Link>
                          <button onClick={() => deleteMutation.mutate({ id: c.id })} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={(open) => {
        setShowCreate(open);
        if (!open) { setCustomerSearch(""); setForm({ ...EMPTY_CONTRACT_FORM, currency: currencyCode ?? "EUR" }); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("contracts.new_contract")}</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">

            <div className="space-y-1.5">
              <Label>{t("sales_search.search_label")}</Label>
              <CustomerSearchCombobox
                value={customerSearch}
                onChange={setCustomerSearch}
                onSelect={(s) => {
                  setForm((f) => ({
                    ...f,
                    clientName: s.name,
                    clientEmail: s.email ?? f.clientEmail,
                    clientPhone: s.phone ?? f.clientPhone,
                    clientCompany: s.company ?? f.clientCompany,
                    clientAddress: s.address ?? f.clientAddress,
                    eventType: s.eventType ?? f.eventType,
                    eventDate: s.eventDate ? s.eventDate.slice(0, 10) : f.eventDate,
                    eventLocation: s.eventLocation ?? f.eventLocation,
                    currency: s.currency ?? f.currency,
                    leadId: s.leadId ?? f.leadId,
                    quoteId: s.quoteId ?? f.quoteId,
                  }));
                }}
                onClear={() => setCustomerSearch("")}
                existingEmail={form.clientEmail}
              />
              <p className="text-xs text-muted-foreground">{t("sales_search.or_create_new")}</p>
            </div>

            {templates.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("contracts.template_label")}</Label>
                <Select value={form.templateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder={t("contracts.template_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {templates.map((tmpl) => <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("contracts.title_label")} *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("contracts.title_placeholder")} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("contracts.client_section")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("contracts.client_name_label")} *</Label>
                  <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.client_email_label")} *</Label>
                  <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.client_phone_label")}</Label>
                  <Input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.client_company_label")}</Label>
                  <Input value={form.clientCompany} onChange={(e) => setForm({ ...form, clientCompany: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>{t("contracts.client_address_label")}</Label>
                  <Input value={form.clientAddress} onChange={(e) => setForm({ ...form, clientAddress: e.target.value })} placeholder="123 Main St, City, Country" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("contracts.event_section")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("contracts.event_type_label")}</Label>
                  <Input value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} placeholder="Wedding, Corporate…" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.event_date_label")}</Label>
                  <Input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>{t("contracts.event_location_label")}</Label>
                  <Input value={form.eventLocation} onChange={(e) => setForm({ ...form, eventLocation: e.target.value })} placeholder="Venue name, City" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("contracts.service_section")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>{t("contracts.service_name_label")}</Label>
                  <Input value={form.serviceName} onChange={(e) => setForm({ ...form, serviceName: e.target.value })} placeholder="Premium Photobooth Package" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.rental_duration_label")}</Label>
                  <Input value={form.rentalDuration} onChange={(e) => setForm({ ...form, rentalDuration: e.target.value })} placeholder="4 hours" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.included_prints_label")}</Label>
                  <Input value={form.includedPrints} onChange={(e) => setForm({ ...form, includedPrints: e.target.value })} placeholder="Unlimited" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>{t("contracts.equipment_description_label")}</Label>
                  <Input value={form.equipmentDescription} onChange={(e) => setForm({ ...form, equipmentDescription: e.target.value })} placeholder="Open-air booth, ring light, props" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("contracts.financial_section")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("contracts.value_dollar_label")} *</Label>
                  <Input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="1500" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.currency_label")}</Label>
                  <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="EUR" maxLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.deposit_amount_label")}</Label>
                  <Input type="number" min="0" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="300" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("contracts.payment_terms_label")}</Label>
                  <Input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="50% upfront, 50% on event day" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("contracts.content_label")}</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={10} placeholder={t("contracts.content_placeholder")} className="font-mono text-xs" />
            </div>

            <div className="space-y-1.5">
              <Label>{t("contracts.notes_label")}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            <ContractReadiness readiness={readiness} />

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !form.title}
            >
              {createMutation.isPending ? t("contracts.creating") : t("contracts.create_contract_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MissingInfoDialog
        open={showMissingDialog}
        validation={pendingValidation}
        onConfirm={handleConfirmCreate}
        onCancel={handleMissingDialogCancel}
      />
    </div>
  );
}
