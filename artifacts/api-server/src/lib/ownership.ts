import { and, eq, inArray } from "drizzle-orm";
import {
  contracts,
  db,
  equipment,
  invoices,
  leads,
  quotes,
} from "@workspace/db";

type OwnershipError = { ok: false; status: 400 | 404; error: string };
type OwnershipResult = { ok: true } | OwnershipError;
type ParsedOptionalId =
  | { ok: true; value: string | null | undefined }
  | OwnershipError;

export type OwnedLinksInput = {
  leadId?: unknown;
  quoteId?: unknown;
  contractId?: unknown;
  invoiceId?: unknown;
  equipmentIds?: unknown;
};

export async function validateOwnedLinks(
  userId: string,
  links: OwnedLinksInput,
): Promise<OwnershipResult> {
  const leadId = parseOptionalId("leadId", links.leadId);
  if (!leadId.ok) return leadId;
  const quoteId = parseOptionalId("quoteId", links.quoteId);
  if (!quoteId.ok) return quoteId;
  const contractId = parseOptionalId("contractId", links.contractId);
  if (!contractId.ok) return contractId;
  const invoiceId = parseOptionalId("invoiceId", links.invoiceId);
  if (!invoiceId.ok) return invoiceId;

  if (leadId.value !== undefined && leadId.value !== null) {
    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId.value), eq(leads.userId, userId)))
      .limit(1);
    if (!lead) return notFound("lead");
  }

  if (quoteId.value !== undefined && quoteId.value !== null) {
    const [quote] = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.id, quoteId.value), eq(quotes.userId, userId)))
      .limit(1);
    if (!quote) return notFound("quote");
  }

  if (contractId.value !== undefined && contractId.value !== null) {
    const [contract] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(eq(contracts.id, contractId.value), eq(contracts.userId, userId)),
      )
      .limit(1);
    if (!contract) return notFound("contract");
  }

  if (invoiceId.value !== undefined && invoiceId.value !== null) {
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId.value), eq(invoices.userId, userId)))
      .limit(1);
    if (!invoice) return notFound("invoice");
  }

  if (links.equipmentIds !== undefined && links.equipmentIds !== null) {
    if (
      !Array.isArray(links.equipmentIds) ||
      links.equipmentIds.some(
        (id) => typeof id !== "string" || id.trim() === "",
      )
    ) {
      return {
        ok: false,
        status: 400,
        error: "equipmentIds must be an array of IDs",
      };
    }

    const uniqueEquipmentIds = Array.from(new Set(links.equipmentIds));
    if (uniqueEquipmentIds.length > 0) {
      const ownedEquipment = await db
        .select({ id: equipment.id })
        .from(equipment)
        .where(
          and(
            eq(equipment.userId, userId),
            inArray(equipment.id, uniqueEquipmentIds),
          ),
        );
      if (ownedEquipment.length !== uniqueEquipmentIds.length) {
        return notFound("equipment");
      }
    }
  }

  return { ok: true };
}

function parseOptionalId(field: string, value: unknown): ParsedOptionalId {
  if (value === undefined || value === null) return { ok: true, value };
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      status: 400,
      error: `${field} must be a valid ID`,
    };
  }
  return { ok: true, value };
}

function notFound(entity: string): OwnershipResult {
  return {
    ok: false,
    status: 404,
    error: `Linked ${entity} not found`,
  };
}
