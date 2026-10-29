import type { Lead } from "@workspace/api-client-react";

export function prospectCreationUrl(module: "quotes" | "invoices" | "contracts", leadId: string) {
  return `/${module}?${new URLSearchParams({ create: "1", leadId })}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lead ids are UUIDs; anything else in a shared link is ignored, never sent to the API. */
export function creationLeadId(search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get("leadId");
  return params.get("create") === "1" && id && UUID.test(id) ? id : null;
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
