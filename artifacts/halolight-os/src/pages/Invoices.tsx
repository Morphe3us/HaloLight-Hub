import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListInvoices, useCreateInvoice, useDeleteInvoice, useUpdateInvoiceStatus, useGetEquipment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, ReceiptText, Trash2, ChevronRight, X, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import CustomerSearchCombobox from "@/components/CustomerSearchCombobox";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  paid: "bg-success/8 text-success border-success/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

const STATUS_KEYS = ["draft", "sent", "paid", "overdue", "cancelled"];

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isOverdue(dueDate: string | null | undefined, status: string) {
  if (status === "paid" || status === "cancelled" || !dueDate) return false;
  return new Date(dueDate) < new Date();
}

type LineItem = { description: string; quantity: string; unitPrice: string };

type InvoiceForm = {
  title: string; clientName: string; clientEmail: string; taxRate: string; notes: string; terms: string; dueDate: string;
  leadId: string; quoteId: string; contractId: string; clientPhone: string; clientCompany: string; clientAddress: string;
  eventType: string; eventDate: string; eventLocation: string; eventStartTime: string; eventEndTime: string;
  currency: string; packageName: string; rentalDuration: string; includedPrints: string;
  digitalGallery: boolean; customTemplate: boolean; deliveryIncluded: boolean;
  setupIncluded: boolean; operatorIncluded: boolean;
  equipmentIds: string[]; equipmentDescription: string; optionsList: string;
  rentalPrice: string; optionsPrice: string; deliveryFees: string; discountAmount: string;
};

const EMPTY_FORM: InvoiceForm = {
  title: "", clientName: "", clientEmail: "", taxRate: "10", notes: "", terms: "", dueDate: "",
  leadId: "", quoteId: "", contractId: "", clientPhone: "", clientCompany: "", clientAddress: "",
  eventType: "", eventDate: "", eventLocation: "", eventStartTime: "", eventEndTime: "",
  currency: "", packageName: "", rentalDuration: "", includedPrints: "",
  digitalGallery: false, customTemplate: false, deliveryIncluded: false,
  setupIncluded: false, operatorIncluded: false,
  equipmentIds: [], equipmentDescription: "", optionsList: "",
  rentalPrice: "", optionsPrice: "", deliveryFees: "", discountAmount: "",
};

export default function Invoices() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showService, setShowService] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [form, setForm] = useState<InvoiceForm>(EMPTY_FORM);
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "" }]);

  const { data, isLoading } = useListInvoices(
    { status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["invoices", filterStatus] } }
  );

  const { data: equipmentListData } = useGetEquipment();
  const equipmentItems = (equipmentListData as any[]) ?? [];

  const createMutation = useCreateInvoice({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["invoices"] });
        qc.invalidateQueries({ queryKey: ["events"] });
        setShowCreate(false);
        setShowService(false);
        setCustomerSearch("");
        setForm(EMPTY_FORM);
        setItems([{ description: "", quantity: "1", unitPrice: "" }]);
        toast({ title: t("invoices.invoice_created") });
      },
    },
  });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast({ title: t("invoices.invoice_deleted") }); },
    },
  });

  const markPaidMutation = useUpdateInvoiceStatus({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["invoices"] });
        qc.invalidateQueries({ queryKey: ["events"] });
        toast({ title: t("invoices.invoice_marked_paid") });
      },
    },
  });

  const invoices = data?.items ?? [];
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total), 0);
  const pendingTotal = invoices.filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total), 0);
  const overdueTotal = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.total), 0);

  const f = (field: keyof InvoiceForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const addItem = () => setItems([...items, { description: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string) =>
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const calcSubtotal = () => items.reduce((s, item) => s + (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0")), 0);
  const calcTotal = () => { const sub = calcSubtotal(); return sub + sub * (parseFloat(form.taxRate || "0") / 100); };

  const handleEquipmentToggle = (id: string, checked: boolean) => {
    setForm((prev) => {
      const ids = checked ? [...prev.equipmentIds, id] : prev.equipmentIds.filter((eid) => eid !== id);
      const names = equipmentItems
        .filter((e: any) => ids.includes(e.id))
        .map((e: any) => [e.productModel, e.serialNumber ? `SN: ${e.serialNumber}` : null].filter(Boolean).join(" — "))
        .join(", ");
      return { ...prev, equipmentIds: ids, equipmentDescription: names || prev.equipmentDescription };
    });
  };

  const handleCreate = () => {
    if (!form.clientName) return;
    createMutation.mutate({
      data: {
        title: form.title.trim(),
        clientName: form.clientName,
        clientEmail: form.clientEmail || undefined,
        clientPhone: form.clientPhone || undefined,
        clientCompany: form.clientCompany || undefined,
        clientAddress: form.clientAddress || undefined,
        eventType: form.eventType || undefined,
        eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : undefined,
        eventLocation: form.eventLocation || undefined,
        eventStartTime: form.eventStartTime || undefined,
        eventEndTime: form.eventEndTime || undefined,
        currency: form.currency || undefined,
        leadId: form.leadId || undefined,
        quoteId: form.quoteId || undefined,
        contractId: form.contractId || undefined,
        packageName: form.packageName || undefined,
        rentalDuration: form.rentalDuration || undefined,
        includedPrints: form.includedPrints || undefined,
        digitalGallery: form.digitalGallery,
        customTemplate: form.customTemplate,
        deliveryIncluded: form.deliveryIncluded,
        setupIncluded: form.setupIncluded,
        operatorIncluded: form.operatorIncluded,
        equipmentIds: form.equipmentIds.length > 0 ? form.equipmentIds : undefined,
        equipmentDescription: form.equipmentDescription || undefined,
        optionsList: form.optionsList || undefined,
        rentalPrice: form.rentalPrice || undefined,
        optionsPrice: form.optionsPrice || undefined,
        deliveryFees: form.deliveryFees || undefined,
        discountAmount: form.discountAmount || undefined,
        taxRate: form.taxRate,
        notes: form.notes || undefined,
        terms: form.terms || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        items: items.filter((i) => i.description && i.unitPrice).map((i) => ({
          description: i.description, quantity: i.quantity, unitPrice: i.unitPrice,
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

  const SERVICE_BOOLEANS: Array<{ key: keyof InvoiceForm; label: string }> = [
    { key: "digitalGallery", label: t("invoices.digital_gallery_label") },
    { key: "customTemplate", label: t("invoices.custom_template_label") },
    { key: "deliveryIncluded", label: t("invoices.delivery_included_label") },
    { key: "setupIncluded", label: t("invoices.setup_included_label") },
    { key: "operatorIncluded", label: t("invoices.operator_included_label") },
  ];

  const hasLinkedDoc = !!(form.quoteId || form.contractId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("invoices.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("invoices.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> {t("invoices.new_invoice")}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">{t("invoices.total_invoices")}</p>
          <p className="text-xl font-bold mt-1">{invoices.length}</p>
        </div>
        <div className="rounded-xl border bg-success/8 border-success/20 p-4">
          <p className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t("invoices.status_paid")}</p>
          <p className="text-xl font-bold mt-1 text-success">{formatCurrency(paidTotal)}</p>
        </div>
        <div className="rounded-xl border bg-info/10 border-info/30 p-4">
          <p className="text-xs text-info font-medium">{t("invoices.pending")}</p>
          <p className="text-xl font-bold mt-1 text-info">{formatCurrency(pendingTotal)}</p>
        </div>
        <div className="rounded-xl border bg-destructive/10 border-destructive/30 p-4">
          <p className="text-xs text-destructive font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {t("invoices.status_overdue")}</p>
          <p className="text-xl font-bold mt-1 text-destructive">{formatCurrency(overdueTotal)}</p>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("invoices.all_statuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("invoices.all_statuses")}</SelectItem>
            {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`invoices.status_${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("invoices.count", { count: invoices.length })}</span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">{t("invoices.loading")}</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ReceiptText className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">{t("invoices.no_invoices")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("invoices.col_invoice_num")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("invoices.col_client")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t("common.status")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t("invoices.due_date_label")}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("invoices.col_amount")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => {
                  const overdue = isOverdue(inv.dueDate, inv.status);
                  const effectiveStatus = overdue && inv.status === "sent" ? "overdue" : inv.status;
                  const color = STATUS_COLORS[effectiveStatus] ?? STATUS_COLORS[inv.status];
                  return (
                    <tr key={inv.id} className={cn("hover:bg-muted/20 transition-colors group", overdue && "bg-destructive/5")}>
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`}>
                          <span className="font-mono text-sm font-medium hover:text-primary cursor-pointer">{inv.invoiceNumber}</span>
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{inv.title}</p>
                        {(inv as any).packageName && (
                          <p className="text-xs text-accent-foreground/70">{(inv as any).packageName}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{inv.clientName}</p>
                        {(inv as any).clientPhone && (
                          <p className="text-xs text-muted-foreground">{(inv as any).clientPhone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {color && <Badge variant="outline" className={cn("text-xs", color)}>{t(`invoices.status_${effectiveStatus}`)}</Badge>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs">
                        <span className={cn(overdue ? "text-destructive font-medium" : "text-muted-foreground")}>{formatDate(inv.dueDate)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("font-bold", inv.status === "paid" ? "text-success" : overdue ? "text-destructive" : "")}>{formatCurrency(inv.total)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <button
                              onClick={() => markPaidMutation.mutate({ id: inv.id, data: { status: "paid", paidAmount: inv.total } })}
                              className="text-xs text-success hover:text-success/80 border border-success/30 rounded px-2 py-0.5 bg-success/8 hover:bg-success/15 transition-colors whitespace-nowrap"
                            >
                              {t("invoices.mark_paid")}
                            </button>
                          )}
                          <Link href={`/invoices/${inv.id}`}><Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="w-4 h-4" /></Button></Link>
                          <button onClick={() => deleteMutation.mutate({ id: inv.id })} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
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

      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetDialog(); else setShowCreate(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("invoices.new_invoice")}</DialogTitle></DialogHeader>
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
                    eventDate: s.eventDate ? s.eventDate.slice(0, 10) : f.eventDate,
                    eventLocation: s.eventLocation ?? f.eventLocation,
                    currency: s.currency ?? f.currency,
                    leadId: s.leadId ?? f.leadId,
                    quoteId: s.quoteId ?? f.quoteId,
                    contractId: s.contractId ?? f.contractId,
                  }));
                }}
                onClear={() => setCustomerSearch("")}
                existingEmail={form.clientEmail}
              />
              <p className="text-xs text-muted-foreground">{t("sales_search.or_create_new")}</p>
            </div>

            {/* Auto-fill banner */}
            {hasLinkedDoc && (
              <div className="flex items-start gap-2 bg-info/10 border border-info/30 rounded-lg px-3 py-2 text-sm text-info">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {form.contractId
                    ? t("invoices.service_auto_filled_contract")
                    : t("invoices.service_auto_filled_quote")}
                </span>
              </div>
            )}

            {/* Client info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>{t("invoices.title_label")}</Label>
                <Input value={form.title} onChange={f("title")} placeholder={t("invoices.title_placeholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("invoices.client_name_label")} *</Label>
                <Input value={form.clientName} onChange={f("clientName")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("invoices.client_email_label")}</Label>
                <Input type="email" value={form.clientEmail} onChange={f("clientEmail")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("contracts.client_phone_label", { defaultValue: "Phone" })}</Label>
                <Input value={form.clientPhone} onChange={f("clientPhone")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("invoices.due_date_label")}</Label>
                <Input type="date" value={form.dueDate} onChange={f("dueDate")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("contracts.event_type_label", { defaultValue: "Event Type" })}</Label>
                <Input value={form.eventType} onChange={f("eventType")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("contracts.event_date_label", { defaultValue: "Event Date" })}</Label>
                <Input type="date" value={form.eventDate} onChange={f("eventDate")} />
              </div>
            </div>

            {/* Service Details toggle */}
            <button
              type="button"
              onClick={() => setShowService((s) => !s)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full border border-dashed rounded-lg px-3 py-2"
            >
              {showService ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {t("invoices.service_section")}
              {hasLinkedDoc && (
                <span className="ml-auto text-xs text-info font-medium">Auto-filled</span>
              )}
              {(form.packageName || form.includedPrints || form.equipmentIds.length > 0) && !hasLinkedDoc && (
                <span className="ml-auto text-xs text-primary font-medium">
                  {[form.packageName, form.includedPrints && `${form.includedPrints} prints`].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>

            {showService && (
              <div className="border rounded-xl p-4 space-y-4 bg-muted/20">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("invoices.start_time_label")}</Label>
                    <Input type="time" value={form.eventStartTime} onChange={f("eventStartTime")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("invoices.end_time_label")}</Label>
                    <Input type="time" value={form.eventEndTime} onChange={f("eventEndTime")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("invoices.included_prints_label")}</Label>
                    <Input value={form.includedPrints} onChange={f("includedPrints")} placeholder="100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("invoices.package_name_label")}</Label>
                    <Input value={form.packageName} onChange={f("packageName")} placeholder="Premium" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("invoices.rental_duration_label")}</Label>
                    <Input value={form.rentalDuration} onChange={f("rentalDuration")} placeholder="4h" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("contracts.event_location_label", { defaultValue: "Location" })}</Label>
                    <Input value={form.eventLocation} onChange={f("eventLocation")} />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SERVICE_BOOLEANS.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={form[key] as boolean}
                        onCheckedChange={(checked) => setForm((p) => ({ ...p, [key]: !!checked }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label>{t("invoices.options_list_label")}</Label>
                  <Textarea value={form.optionsList} onChange={f("optionsList")} rows={2} placeholder="Extra album, GIF booth…" />
                </div>

                <div className="space-y-1.5">
                  <Label>{t("invoices.equipment_section")}</Label>
                  {equipmentItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("invoices.equipment_empty")}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                      {equipmentItems.map((eq: any) => (
                        <label key={eq.id} className="flex items-center gap-2 text-sm cursor-pointer rounded p-1.5 hover:bg-muted/40">
                          <Checkbox
                            checked={form.equipmentIds.includes(eq.id)}
                            onCheckedChange={(checked) => handleEquipmentToggle(eq.id, Boolean(checked))}
                          />
                          <span className="truncate">{eq.productModel || "Unit"}{eq.serialNumber ? ` · ${eq.serialNumber}` : ""}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">{t("invoices.pricing_breakdown_label")}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("invoices.rental_price_label")}</Label>
                      <Input type="number" value={form.rentalPrice} onChange={f("rentalPrice")} placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("invoices.options_price_label")}</Label>
                      <Input type="number" value={form.optionsPrice} onChange={f("optionsPrice")} placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("invoices.delivery_fees_label")}</Label>
                      <Input type="number" value={form.deliveryFees} onChange={f("deliveryFees")} placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("invoices.discount_amount_label")}</Label>
                      <Input type="number" value={form.discountAmount} onChange={f("discountAmount")} placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t("invoices.line_items_section")}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                  <Plus className="w-3 h-3" /> {t("invoices.add_item")}
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                    <div className="sm:col-span-6"><Input placeholder={t("invoices.description_col")} value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></div>
                    <div className="sm:col-span-2"><Input placeholder={t("invoices.qty_col")} type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></div>
                    <div className="sm:col-span-3"><Input placeholder={t("invoices.unit_price_col")} type="number" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} /></div>
                    <div className="sm:col-span-1 flex items-center sm:pt-1"><button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("invoices.tax_rate_label")}</Label>
                <Input type="number" value={form.taxRate} onChange={f("taxRate")} />
              </div>
              <div className="flex items-end pb-1">
                <div className="text-right w-full">
                  <p className="text-xs text-muted-foreground">{t("invoices.subtotal_label")}: {formatCurrency(calcSubtotal())}</p>
                  <p className="text-base font-bold">{t("invoices.total_col")}: {formatCurrency(calcTotal())}</p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5"><Label>{t("invoices.notes_section")}</Label><Textarea value={form.notes} onChange={f("notes")} rows={2} /></div>
            <div className="space-y-1.5"><Label>{t("invoices.payment_terms_section")}</Label><Textarea value={form.terms} onChange={f("terms")} rows={2} placeholder="Net 30, etc." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.clientName}>
              {createMutation.isPending ? t("invoices.creating") : t("invoices.create_invoice_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
