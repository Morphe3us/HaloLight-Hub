import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useListContractTemplates,
  useUpdateContractTemplate,
  useCreateContractTemplate,
  useResetContractTemplates,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Notice, PageHeader } from "@/components/page";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "nl", label: "Nederlands" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "pl", label: "Polski" },
];

const TEMPLATE_VARIABLES = [
  ["advance_amount", "Advance payment (not the security deposit)"],
  ["balance_amount", "Contract total minus advance payment"],
  ["payment_method", "Payment method"],
  ["responsibility_terms", "Author-supplied responsibilities"],
  ["breakdown_terms", "Author-supplied breakdown terms"],
  ["postponement_terms", "Author-supplied postponement terms"],
  ["force_majeure_terms", "Author-supplied force majeure terms"],
  ["privacy_terms", "Author-supplied personal data terms"],
  ["special_conditions", "Author-supplied special conditions"],
  ["contract_number", "Auto-generated contract number"],
  ["rental_company_name", "Your company name"],
  ["rental_company_representative", "Your full name"],
  ["rental_company_address", "Your company address"],
  ["rental_company_email", "Your email"],
  ["rental_company_phone", "Your phone number"],
  ["rental_company_website", "Your website URL"],
  ["rental_company_vat", "Your VAT / registration number"],
  ["client_first_name", "Client first name"],
  ["client_last_name", "Client last name"],
  ["client_company_name", "Client company name"],
  ["client_address", "Client address"],
  ["client_phone", "Client phone"],
  ["client_email", "Client email"],
  ["event_type", "Type of event (wedding, birthday, etc.)"],
  ["event_date", "Date of the event"],
  ["event_start_time", "Event start time"],
  ["event_end_time", "Event end time"],
  ["event_location", "Venue / location"],
  ["setup_time", "Setup / delivery time"],
  ["pickup_time", "Equipment pickup time"],
  ["equipment_list", "Full list of rented equipment"],
  ["package_name", "Name of the rental package"],
  ["rental_duration", "Duration of rental"],
  ["included_prints", "Number of included prints"],
  ["digital_gallery", "Digital gallery included (Yes/No)"],
  ["custom_template", "Custom template included (Yes/No)"],
  ["delivery_included", "Delivery included (Yes/No)"],
  ["setup_included", "Setup included (Yes/No)"],
  ["operator_included", "Operator included (Yes/No)"],
  ["options_list", "Additional options/add-ons"],
  ["rental_price", "Base rental price"],
  ["options_price", "Additional options price"],
  ["delivery_fees", "Delivery fees"],
  ["discount_amount", "Discount amount"],
  ["subtotal", "Subtotal before tax"],
  ["tax_rate", "Tax/VAT rate (%)"],
  ["tax_amount", "Tax/VAT amount"],
  ["total_amount", "Total amount due"],
  ["currency", "Currency symbol (auto-filled from settings)"],
  ["payment_terms", "Payment terms"],
  ["deposit_amount", "Deposit / security amount"],
  ["deposit_method", "Deposit payment method"],
  ["deposit_conditions", "Conditions for keeping deposit"],
  ["deposit_return", "Conditions for returning deposit"],
  ["cancellation_terms", "Cancellation / postponement terms"],
  ["signature_place", "Place of signing"],
  ["signature_date", "Date of signing (auto-filled)"],
];

export default function AdminContractTemplates() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeLang, setActiveLang] = useState("en");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [showVars, setShowVars] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const { data: templatesData, isLoading } = useListContractTemplates({}, { query: { queryKey: ["contract-templates-admin"] } });
  const templates = templatesData?.items ?? [];
  const activeTemplate = [...templates].filter((t) => t.language === activeLang)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id.localeCompare(b.id))[0];

  const updateMutation = useUpdateContractTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["contract-templates-admin"] });
        qc.invalidateQueries({ queryKey: ["contract-templates"] });
        toast({ title: t("admin_contract_templates.saved") });
        setIsDirty(false);
      },
    },
  });

  const createMutation = useCreateContractTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["contract-templates-admin"] });
        qc.invalidateQueries({ queryKey: ["contract-templates"] });
        toast({ title: t("admin_contract_templates.saved") });
        setIsDirty(false);
      },
    },
  });

  const resetMutation = useResetContractTemplates({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["contract-templates-admin"] });
        qc.invalidateQueries({ queryKey: ["contract-templates"] });
        toast({ title: t("admin_contract_templates.reset_success") });
        setIsDirty(false);
      },
    },
  });

  useEffect(() => {
    if (activeTemplate) {
      setEditedTitle(activeTemplate.title);
      setEditedContent(activeTemplate.content);
      setIsDirty(false);
    } else {
      setEditedTitle("");
      setEditedContent("");
      setIsDirty(false);
    }
  }, [activeLang, activeTemplate?.id]);

  const handleSave = () => {
    if (!editedTitle || !editedContent) return;
    if (activeTemplate && activeTemplate.id !== "default") {
      updateMutation.mutate({ id: activeTemplate.id, data: { language: activeLang, title: editedTitle, content: editedContent } });
    } else {
      createMutation.mutate({ data: { language: activeLang, title: editedTitle, content: editedContent, isDefault: true } });
    }
  };

  const handleReset = () => {
    if (!confirm(t("admin_contract_templates.reset_confirm"))) return;
    resetMutation.mutate({ data: { lang: activeLang } });
  };

  const isSaving = updateMutation.isPending || createMutation.isPending;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("admin_contract_templates.title")}
        description={t("admin_contract_templates.subtitle")}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={resetMutation.isPending} className="gap-2">
              <RotateCcw className="w-4 h-4 stroke-[1.75]" />
              {t("admin_contract_templates.reset_btn")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty} className="gap-2">
              <Save className="w-4 h-4 stroke-[1.75]" />
              {isSaving ? t("admin_contract_templates.saving") : t("admin_contract_templates.save_btn")}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((lang) => {
          const hasTemplate = templates.some((t) => t.language === lang.code);
          return (
            <button
              key={lang.code}
              onClick={() => setActiveLang(lang.code)}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                activeLang === lang.code
                  ? "bg-muted text-foreground border-foreground/20 font-medium"
                  : "bg-card text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              <span className="uppercase text-xs text-muted-foreground mr-1.5">{lang.code}</span>
              {lang.label}
              {!hasTemplate && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-warning" />}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{t("admin_contract_templates.loading")}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">
          <div className="space-y-4">
            {!activeTemplate && (
              <Notice
                tone="warning"
                icon={AlertCircle}
                title={<>{t("admin_contract_templates.no_template")} — {t("admin_contract_templates.create_hint")}</>}
              />
            )}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-normal text-muted-foreground">{t("admin_contract_templates.template_title_label")}</Label>
              <Input
                value={editedTitle}
                onChange={(e) => { setEditedTitle(e.target.value); setIsDirty(true); }}
                placeholder={t("admin_contract_templates.template_title_placeholder")}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-normal text-muted-foreground">{t("admin_contract_templates.template_content_label")}</Label>
                {isDirty && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-warning" />{t("admin_contract_templates.unsaved")}</span>}
              </div>
              <Textarea
                value={editedContent}
                onChange={(e) => { setEditedContent(e.target.value); setIsDirty(true); }}
                rows={30}
                className="font-mono text-xs leading-relaxed resize-y"
                placeholder={t("admin_contract_templates.content_placeholder")}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} disabled={resetMutation.isPending} className="gap-2">
                <RotateCcw className="w-3.5 h-3.5 stroke-[1.75]" />
                {t("admin_contract_templates.reset_btn")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty} className="gap-2">
                <Save className="w-3.5 h-3.5 stroke-[1.75]" />
                {isSaving ? t("admin_contract_templates.saving") : t("admin_contract_templates.save_btn")}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setShowVars(!showVars)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              <span>{t("admin_contract_templates.variables_title")}</span>
              {showVars ? <ChevronUp className="w-4 h-4 stroke-[1.75] text-muted-foreground" /> : <ChevronDown className="w-4 h-4 stroke-[1.75] text-muted-foreground" />}
            </button>
            {showVars && (
              <div className="border-t border-border divide-y divide-border max-h-96 overflow-y-auto">
                {TEMPLATE_VARIABLES.map(([key, desc]) => (
                  <div key={key} className="px-4 py-2">
                    <code className="text-xs font-mono text-foreground bg-muted px-1.5 py-0.5 rounded">
                      {`{{${key}}}`}
                    </code>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            )}
            {!showVars && (
              <div className="px-4 pb-3 text-xs text-muted-foreground tabular-nums">
                {TEMPLATE_VARIABLES.length} {t("admin_contract_templates.variables_count")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
