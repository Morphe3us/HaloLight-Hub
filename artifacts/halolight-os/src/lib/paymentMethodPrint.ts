export function paymentMethodPrint(label: string, value: string | null | undefined): string {
  const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return value ? `<div class="section"><div class="label">${escape(label)}</div><div style="white-space:pre-wrap">${escape(value)}</div></div>` : "";
}
