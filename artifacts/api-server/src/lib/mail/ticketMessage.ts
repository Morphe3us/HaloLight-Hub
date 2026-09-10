import type { TicketAttachment } from "../supportAttachments";

export type TicketMailSnapshot = {
  ticketId: string; ticketNumber: string; title: string; description: string;
  category: string; priority: string; equipmentModel: string | null; serialNumber: string | null;
  name: string; company: string | null; email: string; phone: string | null;
  attachments: Array<Omit<TicketAttachment, "key">>;
};
export type TicketMailRequest = { from: string; to: string[]; subject: string; text: string };
export type TicketMailPayload = { snapshot: TicketMailSnapshot; request?: TicketMailRequest };

export function buildTicketMail(snapshot: TicketMailSnapshot, from: string, hubOrigin: string): TicketMailRequest {
  const origin = new URL(hubOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("invalid_hub_origin");
  }
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) throw new Error("invalid_sender");
  const link = `${origin.origin}/support/tickets/${encodeURIComponent(snapshot.ticketId)}`;
  const text = [
    "Nouveau ticket HaloLight", `ID : ${snapshot.ticketId}`, `Numero : ${snapshot.ticketNumber}`,
    `Nom : ${snapshot.name}`, `Societe : ${snapshot.company || "Non renseignee"}`,
    `Email : ${snapshot.email}`, `Telephone : ${snapshot.phone || "Non renseigne"}`,
    `Categorie : ${snapshot.category}`, `Priorite : ${snapshot.priority}`, `Objet : ${snapshot.title}`,
    `Equipement : ${snapshot.equipmentModel || "Non renseigne"}`, `Numero de serie : ${snapshot.serialNumber || "Non renseigne"}`,
    "", "Description :", snapshot.description, "", `Ticket : ${link}`, "",
    "Pieces jointes (connexion au Hub requise) :",
    ...snapshot.attachments.map(file => `${file.fileName} (${file.size} octets) : ${origin.origin}/api/support/tickets/${encodeURIComponent(snapshot.ticketId)}/attachments/${encodeURIComponent(file.id)}`),
    ...(snapshot.attachments.length ? [] : ["Aucune"]),
  ].join("\n");
  return { from, to: ["info@halolight.fr"], subject: `[HaloLight][${snapshot.priority}] ${snapshot.ticketNumber} - ${snapshot.title}`.replace(/[\r\n]/g, " ").slice(0, 250), text };
}
