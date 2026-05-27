import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Search, X, Loader2, AlertCircle, User, FileText, FileSignature, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CustomerSuggestion {
  id: string;
  type: "lead" | "quote" | "contract" | "invoice";
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  eventType: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  currency: string | null;
  leadId: string | null;
  clientId: string | null;
  quoteId: string | null;
  contractId: string | null;
  invoiceId: string | null;
  pipelineStage: string | null;
  lastActivityAt: string | null;
}

interface CustomerSearchComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: CustomerSuggestion) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  existingEmail?: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  lead: <User className="w-3 h-3" />,
  quote: <FileText className="w-3 h-3" />,
  contract: <FileSignature className="w-3 h-3" />,
  invoice: <ReceiptText className="w-3 h-3" />,
};

const TYPE_COLOR: Record<string, string> = {
  lead: "bg-info/10 text-info border-info/30",
  quote: "bg-warning/10 text-warning border-warning/30",
  contract: "bg-success/10 text-success border-success/30",
  invoice: "bg-primary/10 text-primary border-primary/30",
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CustomerSearchCombobox({
  value,
  onChange,
  onSelect,
  onClear,
  placeholder,
  className,
  existingEmail,
}: CustomerSearchComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selected, setSelected] = useState<CustomerSuggestion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const debouncedQuery = useDebounce(value, 300);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.items ?? []);
        setOpen(true);
        setActiveIndex(-1);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) fetchSuggestions(debouncedQuery);
  }, [debouncedQuery, fetchSuggestions, selected]);

  const handleSelect = (suggestion: CustomerSuggestion) => {
    setSelected(suggestion);
    onChange(suggestion.name);
    setSuggestions([]);
    setOpen(false);
    onSelect(suggestion);
  };

  const handleClear = () => {
    setSelected(null);
    onChange("");
    setSuggestions([]);
    setOpen(false);
    onClear?.();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const emailDuplicate =
    existingEmail &&
    suggestions.some(
      (s) => s.email && s.email.toLowerCase() === existingEmail.toLowerCase(),
    );

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setSelected(null);
            onChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder ?? t("sales_search.placeholder")}
          className="pl-9 pr-8"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {!loading && (selected || value) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {emailDuplicate && existingEmail && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-warning">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{t("sales_search.existing_customer_found")}</span>
        </div>
      )}

      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 rounded-xl border bg-popover shadow-lg overflow-hidden"
        >
          {suggestions.length === 0 && !loading ? (
            <li className="px-4 py-3 text-sm text-muted-foreground text-center">
              {t("sales_search.no_results")}
            </li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={`${s.type}-${s.id}`}
                className={cn(
                  "px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/60 border-b last:border-b-0",
                  i === activeIndex && "bg-muted/60",
                )}
                onMouseDown={() => handleSelect(s)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground truncate">{s.name}</span>
                      {s.company && s.company !== s.name && (
                        <span className="text-xs text-muted-foreground truncate">· {s.company}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {s.email && <span className="text-xs text-muted-foreground">{s.email}</span>}
                      {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                    </div>
                    {s.pipelineStage && (
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{s.pipelineStage.replace(/_/g, " ")}</p>
                    )}
                  </div>
                  <span className={cn("inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border shrink-0 mt-0.5 font-medium", TYPE_COLOR[s.type])}>
                    {TYPE_ICON[s.type]}
                    {t(`sales_search.type_${s.type}`)}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
