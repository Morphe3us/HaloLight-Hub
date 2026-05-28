import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useListContracts,
  useCreateContract,
  useDeleteContract,
  useListContractTemplates,
  useGetCurrentUser,
  useGetEquipment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  FileSignature,
  Trash2,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  Eye,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import CustomerSearchCombobox from "@/components/CustomerSearchCombobox";
import {
  type ContractFormData,
  type ProviderData,
  type ValidationResult,
  type ReadinessSection,
  type PlaceholderSet,
  computeReadiness,
  computePricing,
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
          {section.presentCount}/{section.totalCount} — {t("contract_validation.readiness_partial")}
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
      {readiness.map((s) => (
        <ReadinessRow key={s.key} section={s} />
      ))}
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md flex flex-col max-h-[80vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className={cn("w-5 h-5 shrink-0", hasBlocking ? "text-destructive" : "text-warning")} />
            {t("contract_validation.missing_title")}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 py-2 space-y-4">
          {hasBlocking && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">{t("contract_validation.blocking_intro")}</p>
              <ul className="space-y-1.5">
                {validation.blocking.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <span>{t(`contract_validation.${f}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasBlocking && hasOptional && (
            <div className="space-y-3">
              <p className="text-sm text-warning font-medium">{t("contract_validation.optional_summary")}</p>
              <ul className="space-y-1.5 border rounded-lg p-3 bg-warning/5">
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
              <p className="text-xs text-muted-foreground">{t("contract_validation.optional_intro")}</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4 flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} className="sm:mr-auto">
            {t("common.cancel")}
          </Button>
          {!hasBlocking && (
            <Button onClick={onConfirm}>{t("contract_validation.continue_anyway")}</Button>
          )}
          <Button variant={hasBlocking ? "default" : "outline"} onClick={onCancel}>
            {t("contract_validation.complete_info")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1 pb-0.5 border-b mb-1">
      {children}
    </p>
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

  // rawTemplate stores the unfilled template content — form.content is NOT used for saving
  const [rawTemplate, setRawTemplate] = useState("");

  const EMPTY_FORM = (): ContractFormData => ({
    title: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientCompany: "",
    clientAddress: "",
    eventType: "",
    eventDate: "",
    eventStartTime: "",
    eventEndTime: "",
    eventLocation: "",
    serviceName: "",
    rentalDuration: "",
    includedPrints: "",
    equipmentDescription: "",
    optionsList: "",
    value: "",
    optionsPrice: "",
    deliveryFees: "",
    discountAmount: "",
    currency: currencyCode ?? "EUR",
    taxRate: "0",
    depositAmount: "",
    depositMethod: "",
    depositConditions: "",
    depositReturn: "",
    paymentTerms: "",
    cancellationTerms: "",
    signaturePlace: "",
    content: "",
    notes: "",
    templateId: "",
    leadId: "",
    quoteId: "",
    setupTime: "",
    pickupTime: "",
    digitalGallery: false,
    customTemplate: false,
    deliveryIncluded: false,
    setupIncluded: false,
    operatorIncluded: false,
    equipmentIds: [],
  });

  const [form, setForm] = useState<ContractFormData>(EMPTY_FORM);

  const { data: currentUserData } = useGetCurrentUser();
  const currentUser = currentUserData as any;

  const { data: equipmentListData } = useGetEquipment();
  const equipmentItems = (equipmentListData as any[]) ?? [];

  const provider: ProviderData = {
    companyName: currentUser?.companyName,
    firstName: currentUser?.firstName,
    lastName: currentUser?.lastName,
    email: currentUser?.email,
    phone: currentUser?.phone,
    signature: currentUser?.providerSignature,
    signerTitle: currentUser?.providerSignerTitle,
  };

  const placeholders: PlaceholderSet = {
    not_provided: t("contract_validation.placeholder_not_provided"),
    to_be_specified: t("contract_validation.placeholder_to_be_specified"),
    no_deposit: t("contract_validation.placeholder_no_deposit"),
    not_included: t("contract_validation.placeholder_not_included"),
    no_options: t("contract_validation.placeholder_no_options"),
    no_delivery_fees: t("contract_validation.placeholder_no_delivery_fees"),
    not_applicable: t("contract_validation.placeholder_not_applicable"),
  };

  // Live preview: recomputed every time form fields change.
  // {{contract_number}} is preserved by fillAllVariables (server injects real number on save),
  // so we replace it here with a friendly placeholder for display only.
  const livePreview = useMemo(() => {
    if (!rawTemplate) return "";
    const filled = fillAllVariables(rawTemplate, form, provider, lang, placeholders);
    return filled.replace(/\{\{contract_number\}\}/g, "[Auto-generated on save]");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTemplate, form, provider.companyName, provider.firstName, provider.lastName, provider.email, provider.phone, provider.signature, provider.signerTitle, lang]);

  const { data, isLoading } = useListContracts(
    { status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["contracts", filterStatus] } }
  );
  const { data: templatesData } = useListContractTemplates(
    { lang },
    { query: { queryKey: ["contract-templates", lang] } }
  );

  const createMutation = useCreateContract({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
        setShowCreate(false);
        setCustomerSearch("");
        setRawTemplate("");
        setForm(EMPTY_FORM());
        setShowMissingDialog(false);
        setPendingValidation(null);
        toast({ title: t("contracts.contract_created") });
      },
    },
  });

  const deleteMutation = useDeleteContract({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
        toast({ title: t("contracts.contract_deleted") });
      },
    },
  });

  const contracts = data?.items ?? [];
  const templates = (templatesData as any)?.items ?? [];

  // Auto-select default template for user's language when dialog opens and templates load
  useEffect(() => {
    if (showCreate && templates.length > 0 && !form.templateId) {
      const preferred =
        templates.find((t: any) => t.language === lang) ??
        templates.find((t: any) => t.language === "en") ??
        templates[0];
      if (preferred) {
        setRawTemplate(preferred.content);
        setForm((f) => ({ ...f, templateId: preferred.id }));
      }
    }
  }, [showCreate, templates.length, lang]);

  const handleTemplateSelect = (id: string) => {
    const tpl = templates.find((t: any) => t.id === id);
    if (tpl) {
      setRawTemplate(tpl.content);
      setForm((f) => ({ ...f, templateId: id }));
    }
  };

  // The final content to save = fillAllVariables applied to raw template at save time
  const getFinalContent = () => {
    if (!rawTemplate) return form.content || "";
    return fillAllVariables(rawTemplate, form, provider, lang, placeholders);
  };

  const doCreate = () => {
    const finalContent = getFinalContent();
    // Compute total from the full pricing breakdown to store as the contract's value
    const { total } = computePricing(form);
    createMutation.mutate({
      data: {
        title: form.title,
        clientName: form.clientName,
        clientEmail: form.clientEmail || undefined,
        clientPhone: form.clientPhone || undefined,
        clientCompany: form.clientCompany || undefined,
        clientAddress: form.clientAddress || undefined,
        eventType: form.eventType || undefined,
        eventDate: form.eventDate || undefined,
        currency: form.currency || undefined,
        leadId: form.leadId || undefined,
        quoteId: form.quoteId || undefined,
        value: total > 0 ? String(total) : (form.value || "0"),
        templateId: form.templateId || undefined,
        content: finalContent,
        notes: form.notes || undefined,
        equipmentIds: form.equipmentIds.length > 0 ? form.equipmentIds : undefined,
      } as any,
    });
  };

  const handleCreate = () => {
    const validation = validateContract(form, provider);
    if (validation.blocking.length > 0 || validation.optional.length > 0) {
      setPendingValidation(validation);
      setShowMissingDialog(true);
      return;
    }
    doCreate();
  };

  const handleConfirmCreate = () => {
    doCreate();
    setShowMissingDialog(false);
  };

  const readiness = computeReadiness(form, provider);

  const f =
    (key: keyof ContractFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value } as ContractFormData));

  const flag =
    (key: "digitalGallery" | "customTemplate" | "deliveryIncluded" | "setupIncluded" | "operatorIncluded") =>
    (checked: boolean) =>
      setForm((prev) => ({ ...prev, [key]: checked }));

  const handleEquipmentToggle = (id: string, checked: boolean) => {
    setForm((prev) => {
      const ids = checked ? [...prev.equipmentIds, id] : prev.equipmentIds.filter((eid) => eid !== id);
      const names = equipmentItems
        .filter((e: any) => ids.includes(e.id))
        .map((e: any) => {
          const parts: string[] = [e.productModel].filter(Boolean);
          if (e.serialNumber) parts.push(`SN: ${e.serialNumber}`);
          return parts.join(" — ");
        })
        .join(", ");
      return { ...prev, equipmentIds: ids, equipmentDescription: names || prev.equipmentDescription };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contracts.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("contracts.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> {t("contracts.new_contract")}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("contracts.total_label"), value: String(contracts.length) },
          {
            label: t("contracts.signed_label"),
            value: String(contracts.filter((c) => c.status === "signed" || c.status === "active").length),
          },
          { label: t("contracts.pending_label"), value: String(contracts.filter((c) => c.status === "sent").length) },
          {
            label: t("contracts.contract_value"),
            value: formatCurrency(contracts.reduce((s, c) => s + Number(c.value), 0)),
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("contracts.all_statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("contracts.all_statuses")}</SelectItem>
            {STATUS_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`contracts.status_${k}`)}
              </SelectItem>
            ))}
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
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    {t("contracts.col_contract_num")}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("contracts.col_client")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                    {t("common.status")}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    {t("contracts.col_signed")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    {t("contracts.value_section")}
                  </th>
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
                          <span className="font-mono text-sm font-medium hover:text-primary cursor-pointer">
                            {c.contractNumber}
                          </span>
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.title}</p>
                      </td>
                      <td className="px-4 py-3 font-medium">{c.clientName}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {color && (
                          <Badge variant="outline" className={cn("text-xs", color)}>
                            {t(`contracts.status_${c.status}`)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {formatDate(c.signedAt, lang)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.value)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/contracts/${c.id}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </Link>
                          <button
                            onClick={() => deleteMutation.mutate({ id: c.id })}
                            className="text-muted-foreground hover:text-destructive p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* ── Creation dialog ── */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) {
            setCustomerSearch("");
            setRawTemplate("");
            setForm(EMPTY_FORM());
          }
        }}
      >
        <DialogContent className="max-w-3xl flex flex-col max-h-[94vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("contracts.new_contract")}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="form" className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="shrink-0 mx-auto mb-2">
              <TabsTrigger value="form" className="gap-1.5">
                <FileText className="w-3.5 h-3.5" /> {t("contracts.tab_form")}
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5" disabled={!rawTemplate}>
                <Eye className="w-3.5 h-3.5" /> {t("contracts.tab_preview")}
              </TabsTrigger>
            </TabsList>

            {/* ── FORM TAB ── */}
            <TabsContent value="form" className="overflow-y-auto flex-1 space-y-5 py-1 pr-1 mt-0">

              {/* Customer search */}
              <div className="space-y-1.5">
                <Label>{t("sales_search.search_label")}</Label>
                <CustomerSearchCombobox
                  value={customerSearch}
                  onChange={setCustomerSearch}
                  onSelect={(s) => {
                    setForm((prev) => ({
                      ...prev,
                      clientName: s.name || prev.clientName,
                      clientEmail: s.email ?? prev.clientEmail,
                      clientPhone: s.phone ?? prev.clientPhone,
                      clientCompany: s.company ?? prev.clientCompany,
                      clientAddress: s.address ?? prev.clientAddress,
                      eventType: s.eventType ?? prev.eventType,
                      eventDate: s.eventDate ? s.eventDate.slice(0, 10) : prev.eventDate,
                      eventLocation: s.eventLocation ?? prev.eventLocation,
                      currency: s.currency ?? prev.currency,
                      leadId: s.leadId ?? prev.leadId,
                      quoteId: s.quoteId ?? prev.quoteId,
                    }));
                  }}
                  onClear={() => setCustomerSearch("")}
                  existingEmail={form.clientEmail}
                />
                <p className="text-xs text-muted-foreground">{t("sales_search.or_create_new")}</p>
              </div>

              {/* Template */}
              {templates.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t("contracts.template_label")}</Label>
                  <Select value={form.templateId} onValueChange={handleTemplateSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("contracts.template_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((tmpl: any) => (
                        <SelectItem key={tmpl.id} value={tmpl.id}>
                          {tmpl.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rawTemplate && (
                    <p className="text-xs text-success flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Template loaded — preview updates as you fill the form.
                    </p>
                  )}
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <Label>{t("contracts.title_label")} *</Label>
                <Input
                  value={form.title}
                  onChange={f("title")}
                  placeholder={t("contracts.title_placeholder")}
                />
              </div>

              {/* Client */}
              <div className="space-y-2">
                <SectionLabel>{t("contracts.client_section")}</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("contracts.client_name_label")} *</Label>
                    <Input value={form.clientName} onChange={f("clientName")} placeholder="Full name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.client_email_label")} *</Label>
                    <Input type="email" value={form.clientEmail} onChange={f("clientEmail")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.client_phone_label")}</Label>
                    <Input value={form.clientPhone} onChange={f("clientPhone")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.client_company_label")}</Label>
                    <Input value={form.clientCompany} onChange={f("clientCompany")} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("contracts.client_address_label")}</Label>
                    <Input
                      value={form.clientAddress}
                      onChange={f("clientAddress")}
                      placeholder="123 Main St, City, Country"
                    />
                  </div>
                </div>
              </div>

              {/* Event */}
              <div className="space-y-2">
                <SectionLabel>{t("contracts.event_section")}</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("contracts.event_type_label")}</Label>
                    <Input value={form.eventType} onChange={f("eventType")} placeholder="Wedding, Corporate…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.event_date_label")}</Label>
                    <Input type="date" value={form.eventDate} onChange={f("eventDate")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.event_start_time_label")}</Label>
                    <Input type="time" value={form.eventStartTime} onChange={f("eventStartTime")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.event_end_time_label")}</Label>
                    <Input type="time" value={form.eventEndTime} onChange={f("eventEndTime")} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("contracts.event_location_label")}</Label>
                    <Input value={form.eventLocation} onChange={f("eventLocation")} placeholder="Venue name, City" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.setup_time_label", { defaultValue: "Setup Time (optional)" })}</Label>
                    <Input type="time" value={form.setupTime} onChange={f("setupTime")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.pickup_time_label", { defaultValue: "Pickup Time (optional)" })}</Label>
                    <Input type="time" value={form.pickupTime} onChange={f("pickupTime")} />
                  </div>
                </div>
              </div>

              {/* Service */}
              <div className="space-y-2">
                <SectionLabel>{t("contracts.service_section")}</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("contracts.service_name_label")}</Label>
                    <Input
                      value={form.serviceName}
                      onChange={f("serviceName")}
                      placeholder="Premium Photobooth Package"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.rental_duration_label")}</Label>
                    <Input value={form.rentalDuration} onChange={f("rentalDuration")} placeholder="4 hours" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.included_prints_label")}</Label>
                    <Input value={form.includedPrints} onChange={f("includedPrints")} placeholder="Unlimited" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("contracts.equipment_description_label")}</Label>
                    <Input
                      value={form.equipmentDescription}
                      onChange={f("equipmentDescription")}
                      placeholder="Open-air booth, ring light, props"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("contracts.options_list_label")}</Label>
                    <Input
                      value={form.optionsList}
                      onChange={f("optionsList")}
                      placeholder="Custom template, digital gallery, USB key…"
                    />
                  </div>
                </div>

                {/* Service option checkboxes */}
                <div className="pt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {t("contracts.service_options_label", { defaultValue: "Service Options" })}
                  </p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {(
                      [
                        ["digitalGallery", t("contracts.digital_gallery_label", { defaultValue: "Digital Gallery" })],
                        ["customTemplate", t("contracts.custom_template_label", { defaultValue: "Custom Template" })],
                        ["deliveryIncluded", t("contracts.delivery_included_label", { defaultValue: "Delivery Included" })],
                        ["setupIncluded", t("contracts.setup_included_label", { defaultValue: "Setup Included" })],
                        ["operatorIncluded", t("contracts.operator_included_label", { defaultValue: "On-site Operator" })],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={`flag-${key}`}
                          checked={form[key]}
                          onCheckedChange={flag(key)}
                        />
                        <label htmlFor={`flag-${key}`} className="text-sm cursor-pointer select-none">
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Equipment selector */}
                <div className="pt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {t("contracts.equipment_select_label", { defaultValue: "Select Equipment (optional)" })}
                  </p>
                  {equipmentItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      {t("contracts.equipment_empty", { defaultValue: "No equipment registered yet. You can add equipment in Hardware." })}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-y-2 max-h-36 overflow-y-auto pr-1">
                      {equipmentItems.map((eq: any) => (
                        <div key={eq.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`eq-${eq.id}`}
                            checked={form.equipmentIds.includes(eq.id)}
                            onCheckedChange={(checked) =>
                              handleEquipmentToggle(eq.id, Boolean(checked))
                            }
                          />
                          <label htmlFor={`eq-${eq.id}`} className="text-sm cursor-pointer select-none">
                            {eq.productModel}
                            {eq.serialNumber ? ` — SN: ${eq.serialNumber}` : ""}
                            {eq.status && eq.status !== "active" ? ` (${eq.status})` : ""}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Financial */}
              <div className="space-y-2">
                <SectionLabel>{t("contracts.financial_section")}</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("contracts.rental_price_label")} *</Label>
                    <Input type="number" min="0" value={form.value} onChange={f("value")} placeholder="700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.currency_label")} *</Label>
                    <Input value={form.currency} onChange={f("currency")} placeholder="EUR" maxLength={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.options_price_label")}</Label>
                    <Input type="number" min="0" value={form.optionsPrice} onChange={f("optionsPrice")} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.delivery_fees_label")}</Label>
                    <Input type="number" min="0" value={form.deliveryFees} onChange={f("deliveryFees")} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.discount_label")}</Label>
                    <Input type="number" min="0" value={form.discountAmount} onChange={f("discountAmount")} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.tax_rate_label")}</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={form.taxRate}
                      onChange={f("taxRate")}
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.payment_terms_label")}</Label>
                    <Input
                      value={form.paymentTerms}
                      onChange={f("paymentTerms")}
                      placeholder="50% upfront, 50% on event day"
                    />
                  </div>
                </div>
              </div>

              {/* Deposit */}
              <div className="space-y-2">
                <SectionLabel>{t("contracts.deposit_section")}</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("contracts.deposit_amount_label")}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.depositAmount}
                      onChange={f("depositAmount")}
                      placeholder="1500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.deposit_method_label")}</Label>
                    <Input
                      value={form.depositMethod}
                      onChange={f("depositMethod")}
                      placeholder="Bank transfer, cheque…"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("contracts.deposit_conditions_label")}</Label>
                    <Input
                      value={form.depositConditions}
                      onChange={f("depositConditions")}
                      placeholder="May be retained in case of damage or loss…"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("contracts.deposit_return_label")}</Label>
                    <Input
                      value={form.depositReturn}
                      onChange={f("depositReturn")}
                      placeholder="Returned after equipment inspection…"
                    />
                  </div>
                </div>
              </div>

              {/* Cancellation */}
              <div className="space-y-2">
                <SectionLabel>{t("contracts.cancellation_section")}</SectionLabel>
                <Textarea
                  value={form.cancellationTerms}
                  onChange={f("cancellationTerms")}
                  rows={2}
                  placeholder="e.g. Full refund if cancelled 30+ days before event…"
                />
              </div>

              {/* Signature */}
              <div className="space-y-2">
                <SectionLabel>{t("contracts.signature_section")}</SectionLabel>
                <div className="space-y-1.5">
                  <Label>{t("contracts.signature_place_label")}</Label>
                  <Input value={form.signaturePlace} onChange={f("signaturePlace")} placeholder="Paris" />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>{t("contracts.notes_label")}</Label>
                <Textarea value={form.notes} onChange={f("notes")} rows={2} />
              </div>

              {/* Readiness */}
              <ContractReadiness readiness={readiness} />
            </TabsContent>

            {/* ── PREVIEW TAB ── */}
            <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
              <div className="h-full overflow-y-auto rounded-lg border bg-white dark:bg-muted/10 p-4">
                {livePreview ? (
                  <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                    {livePreview}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                    <FileText className="w-8 h-8 opacity-30" />
                    <p className="text-sm">Select a template to see a live preview here.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !form.title}
            >
              {createMutation.isPending ? t("contracts.creating") : t("contracts.create_contract_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Missing info dialog ── */}
      <MissingInfoDialog
        open={showMissingDialog}
        validation={pendingValidation}
        onConfirm={handleConfirmCreate}
        onCancel={() => {
          setShowMissingDialog(false);
          setPendingValidation(null);
        }}
      />
    </div>
  );
}
