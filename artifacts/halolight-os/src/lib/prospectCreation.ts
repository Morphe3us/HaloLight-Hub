import type { Lead } from "@workspace/api-client-react";

export function prospectCreationUrl(module: "quotes" | "invoices" | "contracts", leadId: string) {
  return `/${module}?${new URLSearchParams({ create: "1", leadId })}`;
}

export function creationLeadId(search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get("leadId");
  return params.get("create") === "1" && id ? id : null;
}

export function prospectPrefill(lead: Lead) {
  return {
    leadId: lead.id,
    clientName: lead.contactName,
    clientEmail: lead.email ?? "",
    clientPhone: lead.phone ?? "",
    clientCompany: lead.companyName,
    clientAddress: lead.address ?? "",
    eventType: lead.eventType ?? "",
    eventDate: lead.expectedEventDate?.slice(0, 10) ?? "",
  };
}
