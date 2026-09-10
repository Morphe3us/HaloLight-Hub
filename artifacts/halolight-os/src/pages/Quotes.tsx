import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useListQuotes,
  useCreateQuote,
  useDeleteQuote,
  useGetEquipment,
  useUpdateQuoteStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  FileText,
  Trash2,
  ChevronRight,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import CustomerSearchCombobox from "@/components/CustomerSearchCombobox";
import { useProspectCreation } from "@/hooks/useProspectCreation";
import { prospectPrefill } from "@/lib/prospectCreation";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  accepted: "bg-success/8 text-success border-success/20",
  declined: "bg-destructive/10 text-destructive border-destructive/30",
  expired: "bg-warning/8 text-warning border-warning/20",
};

const STATUS_KEYS = ["draft", "sent", "accepted", "declined", "expired"];

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type LineItem = { description: string; quantity: string; unitPrice: string };

type QuoteForm = {
  validUntil: string;
  paymentMethod: string;
  title: string;
  clientName: string;
  clientEmail: string;
  taxRate: string;
  notes: string;
  terms: string;
  leadId: string;
  clientPhone: string;
  clientCompany: string;
  clientAddress: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  eventStartTime: string;
  eventEndTime: string;
  currency: string;
  packageName: string;
  rentalDuration: string;
  includedPrints: string;
  digitalGallery: boolean;
  customTemplate: boolean;
  deliveryIncluded: boolean;
  setupIncluded: boolean;
  operatorIncluded: boolean;
  equipmentIds: string[];
  equipmentDescription: string;
  optionsList: string;
  rentalPrice: string;
  optionsPrice: string;
  deliveryFees: string;
  discountAmount: string;
};

const EMPTY_FORM: QuoteForm = {
  validUntil: "",
  paymentMethod: "",
  title: "",
  clientName: "",
  clientEmail: "",
  taxRate: "10",
  notes: "",
  terms: "",
  leadId: "",
  clientPhone: "",
  clientCompany: "",
  clientAddress: "",
  eventType: "",
  eventDate: "",
  eventLocation: "",
  eventStartTime: "",
  eventEndTime: "",
  currency: "",
  packageName: "",
  rentalDuration: "",
  includedPrints: "",
  digitalGallery: false,
  customTemplate: false,
  deliveryIncluded: false,
  setupIncluded: false,
  operatorIncluded: false,
  equipmentIds: [],
  equipmentDescription: "",
  optionsList: "",
  rentalPrice: "",
  optionsPrice: "",
  deliveryFees: "",
  discountAmount: "",
};

export default function Quotes() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showService, setShowService] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [form, setForm] = useState<QuoteForm>(EMPTY_FORM);
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "" },
  ]);

  const { data, isLoading } = useListQuotes(
    { status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["quotes", filterStatus] } },
  );

  const { data: equipmentListData } = useGetEquipment();
  const equipmentItems = (equipmentListData as any[]) ?? [];

  useProspectCreation((lead) => {
    setForm({ ...EMPTY_FORM, ...prospectPrefill(lead) });
    setCustomerSearch(lead.contactName);
    setItems([{ description: "", quantity: "1", unitPrice: "" }]);
    setShowService(false);
    setShowCreate(true);
  });

  const createMutation = useCreateQuote({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["quotes"] });
        qc.invalidateQueries({ queryKey: ["lead-pipeline"] });
        setShowCreate(false);
        setShowService(false);
        setCustomerSearch("");
        setForm(EMPTY_FORM);
        setItems([{ description: "", quantity: "1", unitPrice: "" }]);
        toast({ title: t("quotes.quote_created") });
      },
    },
  });

  const deleteMutation = useDeleteQuote({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["quotes"] });
        toast({ title: t("quotes.quote_deleted") });
      },
    },
  });

  const statusMutation = useUpdateQuoteStatus({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["quotes"] });
      },
      onError: () => {
        toast({ title: t("common.error"), variant: "destructive" });
      },
    },
  });

  const quotes = data?.items ?? [];
  const totalRevenue = quotes
    .filter((q) => q.status === "accepted")
    .reduce((s, q) => s + Number(q.total), 0);

  const f =
    (field: keyof QuoteForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  const addItem = () =>
    setItems([...items, { description: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (i: number) =>
    setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string) =>
    setItems(
      items.map((item, idx) =>
        idx === i ? { ...item, [field]: value } : item,
      ),
    );

  const money = (value: string) => {
    const parsed = Number(value || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const calcSubtotal = () =>
    Math.max(
      0,
      items.reduce(
        (s, item) => s + money(item.quantity) * money(item.unitPrice),
        0,
      ) +
        money(form.rentalPrice) +
        money(form.optionsPrice) +
        money(form.deliveryFees) -
        money(form.discountAmount),
    );
  const calcTotal = () => {
    const sub = calcSubtotal();
    return sub + sub * (parseFloat(form.taxRate || "0") / 100);
  };

  const handleEquipmentToggle = (id: string, checked: boolean) => {
    setForm((prev) => {
      const ids = checked
        ? [...prev.equipmentIds, id]
        : prev.equipmentIds.filter((eid) => eid !== id);
      const names = equipmentItems
        .filter((e: any) => ids.includes(e.id))
        .map((e: any) =>
          [e.productModel, e.serialNumber ? `SN: ${e.serialNumber}` : null]
            .filter(Boolean)
            .join(" — "),
        )
        .join(", ");
      return {
        ...prev,
        equipmentIds: ids,
        equipmentDescription: names || prev.equipmentDescription,
      };
    });
  };

  const handleCreate = () => {
    if (!form.clientName) return;
    createMutation.mutate({
      data: {
        title: form.title.trim(),
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
        paymentMethod: form.paymentMethod || undefined,
        clientName: form.clientName,
        clientEmail: form.clientEmail || undefined,
        clientPhone: form.clientPhone || undefined,
        clientCompany: form.clientCompany || undefined,
        clientAddress: form.clientAddress || undefined,
        eventType: form.eventType || undefined,
        eventDate: form.eventDate
          ? new Date(form.eventDate).toISOString()
          : undefined,
        eventLocation: form.eventLocation || undefined,
        eventStartTime: form.eventStartTime || undefined,
        eventEndTime: form.eventEndTime || undefined,
        currency: form.currency || undefined,
        leadId: form.leadId || undefined,
        packageName: form.packageName || undefined,
        rentalDuration: form.rentalDuration || undefined,
        includedPrints: form.includedPrints || undefined,
        digitalGallery: form.digitalGallery,
        customTemplate: form.customTemplate,
        deliveryIncluded: form.deliveryIncluded,
        setupIncluded: form.setupIncluded,
        operatorIncluded: form.operatorIncluded,
        equipmentIds:
          form.equipmentIds.length > 0 ? form.equipmentIds : undefined,
        equipmentDescription: form.equipmentDescription || undefined,
        optionsList: form.optionsList || undefined,
        rentalPrice: form.rentalPrice || undefined,
        optionsPrice: form.optionsPrice || undefined,
        deliveryFees: form.deliveryFees || undefined,
        discountAmount: form.discountAmount || undefined,
        taxRate: form.taxRate,
        notes: form.notes || undefined,
        terms: form.terms || undefined,
        items: items
          .filter((i) => i.description && i.unitPrice)
          .map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
      },
    });
  };

  const resetDialog = () => {
    setShowCreate(false);
    setShowService(false);
    setCustomerSearch("");
    setForm(EMPTY_FORM);
    setItems([{ description: "", quantity: "1", unitPrice: "" }]);
  };

  const SERVICE_BOOLEANS: Array<{ key: keyof QuoteForm; label: string }> = [
    { key: "digitalGallery", label: t("quotes.digital_gallery_label") },
    { key: "customTemplate", label: t("quotes.custom_template_label") },
    { key: "deliveryIncluded", label: t("quotes.delivery_included_label") },
    { key: "setupIncluded", label: t("quotes.setup_included_label") },
    { key: "operatorIncluded", label: t("quotes.operator_included_label") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("quotes.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("quotes.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> {t("quotes.new_quote")}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("quotes.total_quotes"), value: String(quotes.length) },
          {
            label: t("quotes.accepted"),
            value: String(quotes.filter((q) => q.status === "accepted").length),
          },
          {
            label: t("quotes.pending"),
            value: String(quotes.filter((q) => q.status === "sent").length),
          },
          {
            label: t("quotes.won_revenue"),
            value: formatCurrency(totalRevenue),
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">
              {s.label}
            </p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("quotes.all_statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quotes.all_statuses")}</SelectItem>
            {STATUS_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`quotes.status_${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t("quotes.count", { count: quotes.length })}
        </span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            {t("quotes.loading")}
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">
              {t("quotes.no_quotes")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    {t("quotes.col_quote_num")}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    {t("quotes.col_client")}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                    {t("common.status")}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    {t("quotes.valid_until_label")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    {t("quotes.total_col")}
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotes.map((q) => {
                  const color = STATUS_COLORS[q.status];
                  return (
                    <tr
                      key={q.id}
                      className="hover:bg-muted/20 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/quotes/${q.id}`}>
                          <span className="font-mono text-sm font-medium hover:text-primary cursor-pointer">
                            {q.quoteNumber}
                          </span>
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {q.title}
                        </p>
                        {(q as any).packageName && (
                          <p className="text-xs text-accent-foreground/70 truncate max-w-[160px]">
                            {(q as any).packageName}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{q.clientName}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Select
                          value={q.status}
                          onValueChange={(val) =>
                            statusMutation.mutate({
                              id: q.id,
                              data: {
                                status: val as
                                  | "draft"
                                  | "sent"
                                  | "accepted"
                                  | "declined"
                                  | "expired",
                              },
                            })
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-7 text-xs w-[110px] border font-medium",
                              color,
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_KEYS.map((k) => (
                              <SelectItem key={k} value={k} className="text-xs">
                                {t(`quotes.status_${k}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {formatDate(q.validUntil)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {formatCurrency(q.total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/quotes/${q.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </Link>
                          <button
                            onClick={() => deleteMutation.mutate({ id: q.id })}
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

      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) resetDialog();
          else setShowCreate(true);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("quotes.new_quote")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Customer search */}
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
                    eventDate: s.eventDate
                      ? s.eventDate.slice(0, 10)
                      : f.eventDate,
                    eventLocation: s.eventLocation ?? f.eventLocation,
                    currency: s.currency ?? f.currency,
                    leadId: s.leadId ?? f.leadId,
                  }));
                }}
                onClear={() => setCustomerSearch("")}
                existingEmail={form.clientEmail}
              />
              <p className="text-xs text-muted-foreground">
                {t("sales_search.or_create_new")}
              </p>
            </div>

            {/* Client info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="quote-company">{t("contracts.client_company_label", { defaultValue: "Company" })}</Label>
                <Input id="quote-company" value={form.clientCompany} onChange={f("clientCompany")} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="quote-address">{t("contracts.client_address_label", { defaultValue: "Client address" })}</Label>
                <Input id="quote-address" value={form.clientAddress} onChange={f("clientAddress")} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{t("quotes.title_label")}</Label>
                <Input
                  value={form.title}
                  onChange={f("title")}
                  placeholder={t("quotes.title_placeholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("quotes.client_name_label")} *</Label>
                <Input value={form.clientName} onChange={f("clientName")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("quotes.client_email_label")}</Label>
                <Input
                  type="email"
                  value={form.clientEmail}
                  onChange={f("clientEmail")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t("contracts.client_phone_label", { defaultValue: "Phone" })}
                </Label>
                <Input value={form.clientPhone} onChange={f("clientPhone")} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t("contracts.event_type_label", {
                    defaultValue: "Event Type",
                  })}
                </Label>
                <Input value={form.eventType} onChange={f("eventType")} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t("contracts.event_date_label", {
                    defaultValue: "Event Date",
                  })}
                </Label>
                <Input
                  type="date"
                  value={form.eventDate}
                  onChange={f("eventDate")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t("contracts.event_location_label", {
                    defaultValue: "Location",
                  })}
                </Label>
                <Input
                  value={form.eventLocation}
                  onChange={f("eventLocation")}
                />
              </div>
            </div>

            {/* Service Details toggle */}
            <button
              type="button"
              onClick={() => setShowService((s) => !s)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full border border-dashed rounded-lg px-3 py-2"
            >
              {showService ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {t("quotes.service_section")}
              {(form.packageName ||
                form.includedPrints ||
                form.equipmentIds.length > 0) && (
                <span className="ml-auto text-xs text-primary font-medium">
                  {[
                    form.packageName,
                    form.includedPrints && `${form.includedPrints} prints`,
                    form.equipmentIds.length > 0 &&
                      `${form.equipmentIds.length} equip.`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </button>

            {showService && (
              <div className="border rounded-xl p-4 space-y-4 bg-muted/20">
                {/* Time + Package */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("quotes.start_time_label")}</Label>
                    <Input
                      type="time"
                      value={form.eventStartTime}
                      onChange={f("eventStartTime")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("quotes.end_time_label")}</Label>
                    <Input
                      type="time"
                      value={form.eventEndTime}
                      onChange={f("eventEndTime")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("quotes.included_prints_label")}</Label>
                    <Input
                      value={form.includedPrints}
                      onChange={f("includedPrints")}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("quotes.package_name_label")}</Label>
                    <Input
                      value={form.packageName}
                      onChange={f("packageName")}
                      placeholder="Premium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("quotes.rental_duration_label")}</Label>
                    <Input
                      value={form.rentalDuration}
                      onChange={f("rentalDuration")}
                      placeholder="4h"
                    />
                  </div>
                </div>

                {/* Service booleans */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SERVICE_BOOLEANS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={form[key] as boolean}
                        onCheckedChange={(checked) =>
                          setForm((p) => ({ ...p, [key]: !!checked }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Options */}
                <div className="space-y-1.5">
                  <Label>{t("quotes.options_list_label")}</Label>
                  <Textarea
                    value={form.optionsList}
                    onChange={f("optionsList")}
                    rows={2}
                    placeholder="Extra album, GIF booth…"
                  />
                </div>

                {/* Equipment */}
                <div className="space-y-1.5">
                  <Label>{t("quotes.equipment_section")}</Label>
                  {equipmentItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("quotes.equipment_empty")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                      {equipmentItems.map((eq: any) => (
                        <label
                          key={eq.id}
                          className="flex items-center gap-2 text-sm cursor-pointer rounded p-1.5 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={form.equipmentIds.includes(eq.id)}
                            onCheckedChange={(checked) =>
                              handleEquipmentToggle(eq.id, Boolean(checked))
                            }
                          />
                          <span className="truncate">
                            {eq.productModel || "Unit"}
                            {eq.serialNumber ? ` · ${eq.serialNumber}` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pricing breakdown */}
                <div>
                  <Label className="mb-2 block">
                    {t("quotes.pricing_breakdown_label")}
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t("quotes.rental_price_label")}
                      </Label>
                      <Input
                        type="number"
                        value={form.rentalPrice}
                        onChange={f("rentalPrice")}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t("quotes.options_price_label")}
                      </Label>
                      <Input
                        type="number"
                        value={form.optionsPrice}
                        onChange={f("optionsPrice")}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t("quotes.delivery_fees_label")}
                      </Label>
                      <Input
                        type="number"
                        value={form.deliveryFees}
                        onChange={f("deliveryFees")}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t("quotes.discount_amount_label")}
                      </Label>
                      <Input
                        type="number"
                        value={form.discountAmount}
                        onChange={f("discountAmount")}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t("quotes.line_items_section")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" /> {t("quotes.add_item")}
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start"
                  >
                    <div className="sm:col-span-6">
                      <Input
                        placeholder={t("quotes.description_col")}
                        value={item.description}
                        onChange={(e) =>
                          updateItem(i, "description", e.target.value)
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        placeholder={t("quotes.qty_col")}
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(i, "quantity", e.target.value)
                        }
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        placeholder={t("quotes.unit_price_col")}
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(i, "unitPrice", e.target.value)
                        }
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center sm:pt-1">
                      <button
                        onClick={() => removeItem(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("quotes.tax_rate_label")}</Label>
                <Input
                  type="number"
                  value={form.taxRate}
                  onChange={f("taxRate")}
                />
              </div>
              <div className="flex items-end pb-1">
                <div className="text-right w-full">
                  <p className="text-xs text-muted-foreground">
                    {t("quotes.subtotal")}: {formatCurrency(calcSubtotal())}
                  </p>
                  <p className="text-base font-bold">
                    {t("quotes.total_col")}: {formatCurrency(calcTotal())}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("quotes.notes_section")}</Label>
              <Textarea value={form.notes} onChange={f("notes")} rows={2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quote-valid-until">{t("quotes.valid_until_label", { defaultValue: "Valid until" })}</Label>
                <Input id="quote-valid-until" type="date" value={form.validUntil} onChange={f("validUntil")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-payment-method">{t("quotes.payment_method", { defaultValue: "Payment method" })}</Label>
                <Input id="quote-payment-method" maxLength={200} value={form.paymentMethod} onChange={f("paymentMethod")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("quotes.terms_section")}</Label>
              <Textarea
                value={form.terms}
                onChange={f("terms")}
                rows={2}
                placeholder={t("quotes.terms_placeholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !form.clientName}
            >
              {createMutation.isPending
                ? t("quotes.creating")
                : t("quotes.create_quote_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
