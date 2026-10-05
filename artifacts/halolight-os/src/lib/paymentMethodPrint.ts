import { escapeHtml } from "./escapeHtml";

export function paymentMethodPrint(label: string, value: string | null | undefined): string {
  return value ? `<div class="section"><div class="label">${escapeHtml(label)}</div><div style="white-space:pre-wrap">${escapeHtml(value)}</div></div>` : "";
}
