import {
  db,
  leads,
  leadActivities,
  quotes,
  quoteItems,
  contracts,
  contractTemplates,
  invoices,
  invoiceItems,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { addSeedDays, SEED_BASE_DATE } from "./seed-utils";
import { DEFAULT_CONTRACT_TEMPLATES } from "../../artifacts/api-server/src/lib/defaultContractTemplates";

export async function seedCrm(seedUserId?: string) {
  console.log("\n💼 Seeding CRM demo data...");

  // ─── Find any existing user to attach data to ──────────────────────────
  let userId = seedUserId;
  if (!userId) {
    const [anyUser] = await db.select().from(usersTable).limit(1);
    if (!anyUser) {
      console.log("  ℹ No users found — CRM seed requires at least one user.");
      return;
    }
    userId = anyUser.id;
  }

  // ─── Contract Templates ──────────────────────────────────────────────
  const existingTemplates = await db.select().from(contractTemplates).limit(1);
  if (existingTemplates.length === 0) {
    await db.insert(contractTemplates).values(
      DEFAULT_CONTRACT_TEMPLATES.map((tpl) => ({
        title: tpl.title,
        category: "photobooth",
        language: tpl.language,
        content: tpl.content,
        isDefault: true,
      })),
    );
    console.log(
      `  ✓ Created ${DEFAULT_CONTRACT_TEMPLATES.length} default contract templates`,
    );
  } else {
    console.log("  - Skipped existing contract templates");
  }

  // ─── Check if CRM data already seeded ─────────────────────────────
  const existingLeads = await db
    .select()
    .from(leads)
    .where(eq(leads.userId, userId))
    .limit(1);
  if (existingLeads.length > 0) {
    console.log("  - Skipped existing CRM data (already seeded for this user)");
    return;
  }

  // ─── Leads ────────────────────────────────────────────────────────
  const leadData = [
    {
      userId,
      companyName: "Riverside Event Hall",
      contactName: "Sarah Mitchell",
      email: "sarah.mitchell@riverside.com",
      phone: "+1 (555) 201-4400",
      source: "referral" as const,
      status: "won" as const,
      value: "2400.00",
      notes:
        "Annual corporate holiday party. Very happy with service — likely to rebook.",
      eventType: "Corporate Party",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, -30),
    },
    {
      userId,
      companyName: "Bella Vista Weddings",
      contactName: "Emma & James Torres",
      email: "emma.torres@gmail.com",
      phone: "+1 (555) 384-9921",
      source: "website" as const,
      status: "proposal" as const,
      value: "1800.00",
      notes: "Wedding in June. They want the premium package with guest book.",
      eventType: "Wedding",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, 45),
    },
    {
      userId,
      companyName: "TechNova Inc.",
      contactName: "David Chen",
      email: "dchen@technova.io",
      phone: "+1 (555) 770-3310",
      source: "cold_outreach" as const,
      status: "qualified" as const,
      value: "5500.00",
      notes:
        "Looking for multi-booth setup for their annual product launch event. High value.",
      eventType: "Product Launch",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, 60),
    },
    {
      userId,
      companyName: "City Gala Foundation",
      contactName: "Patricia Huang",
      email: "p.huang@citygala.org",
      phone: "+1 (555) 612-0087",
      source: "trade_show" as const,
      status: "negotiation" as const,
      value: "3200.00",
      notes:
        "Non-profit gala event. Discussed discount options. Close to signing.",
      eventType: "Gala",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, 25),
    },
    {
      userId,
      companyName: "Sunset Prom Committee",
      contactName: "Marcus Johnson",
      email: "marcus.j@sunsetschool.edu",
      phone: "+1 (555) 449-6623",
      source: "inbound_call" as const,
      status: "contacted" as const,
      value: "1200.00",
      notes: "School prom — budget conscious. Sent basic package info.",
      eventType: "Prom",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, 90),
    },
    {
      userId,
      companyName: "Golden Years Care",
      contactName: "Linda Vasquez",
      email: "linda@goldenyears.com",
      phone: "+1 (555) 233-8847",
      source: "social_media" as const,
      status: "new" as const,
      value: "900.00",
      notes: "Resident birthday celebration at care facility.",
      eventType: "Birthday Party",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, 30),
    },
    {
      userId,
      companyName: "Metro Sports Club",
      contactName: "Kevin O'Brien",
      email: "kobrien@metrosports.com",
      phone: "+1 (555) 519-2240",
      source: "referral" as const,
      status: "lost" as const,
      value: "1600.00",
      notes: "Went with a competitor — price was the deciding factor.",
      eventType: "Awards Night",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, -15),
    },
    {
      userId,
      companyName: "Harmony Church",
      contactName: "Rev. Thomas Adeyemi",
      email: "tadeyemi@harmonychurch.org",
      phone: "+1 (555) 327-4492",
      source: "referral" as const,
      status: "qualified" as const,
      value: "1400.00",
      notes:
        "Annual church picnic event. Very interested. Awaiting budget approval.",
      eventType: "Community Event",
      expectedEventDate: addSeedDays(SEED_BASE_DATE, 50),
    },
  ];

  const insertedLeads = await db.insert(leads).values(leadData).returning();
  console.log(`  ✓ Created ${insertedLeads.length} leads`);

  // ─── Lead Activities ──────────────────────────────────────────────
  const wonLead = insertedLeads.find((l) => l.status === "won")!;
  const proposalLead = insertedLeads.find((l) => l.status === "proposal")!;
  const qualifiedLead = insertedLeads.find(
    (l) => l.status === "qualified" && l.companyName === "TechNova Inc.",
  )!;
  const negotiationLead = insertedLeads.find(
    (l) => l.status === "negotiation",
  )!;

  await db.insert(leadActivities).values([
    {
      leadId: wonLead.id,
      userId,
      type: "call",
      title: "Initial discovery call",
      description:
        "Spoke with Sarah about their holiday party needs. 150 guests expected. Interested in premium package.",
    },
    {
      leadId: wonLead.id,
      userId,
      type: "quote_sent",
      title: "Quote #Q-2024-018 sent",
      description: "Sent corporate holiday package quote: $2,400 for 5 hours.",
    },
    {
      leadId: wonLead.id,
      userId,
      type: "contract_sent",
      title: "Contract sent for signature",
      description: "Standard rental agreement sent via email.",
    },
    {
      leadId: wonLead.id,
      userId,
      type: "status_change",
      title: "Lead marked as Won",
      description: "Contract signed, deposit received.",
    },
    {
      leadId: wonLead.id,
      userId,
      type: "invoice_sent",
      title: "Invoice #INV-2024-018 sent",
      description:
        "Final invoice sent post-event. Payment received within 7 days.",
    },

    {
      leadId: proposalLead.id,
      userId,
      type: "email",
      title: "Inquiry received via website",
      description:
        "Emma filled out the contact form asking about wedding packages.",
    },
    {
      leadId: proposalLead.id,
      userId,
      type: "meeting",
      title: "Discovery meeting — Zoom",
      description:
        "Met with Emma & James. They want the premium package with guest book and custom overlay.",
    },
    {
      leadId: proposalLead.id,
      userId,
      type: "quote_sent",
      title: "Wedding package quote sent",
      description: "Sent premium wedding quote: $1,800 for 4 hours + extras.",
    },

    {
      leadId: qualifiedLead.id,
      userId,
      type: "email",
      title: "Cold outreach sent",
      description:
        "Sent LinkedIn message and follow-up email to David Chen at TechNova.",
    },
    {
      leadId: qualifiedLead.id,
      userId,
      type: "call",
      title: "Qualification call",
      description:
        "30-minute call with David. They need 2-3 booths for their Q4 product launch. 300+ attendees.",
    },
    {
      leadId: qualifiedLead.id,
      userId,
      type: "note",
      title: "Internal note",
      description:
        "High-value opportunity. David mentioned they have budget approved. Need to follow up with multi-booth proposal.",
    },

    {
      leadId: negotiationLead.id,
      userId,
      type: "meeting",
      title: "Met at Charity Gala Expo",
      description:
        "Patricia stopped by our booth at the trade show. Very interested in our AI filter capabilities.",
    },
    {
      leadId: negotiationLead.id,
      userId,
      type: "quote_sent",
      title: "Gala package quote sent",
      description:
        "Sent tailored non-profit package: $3,200 with 10% charity discount applied.",
    },
    {
      leadId: negotiationLead.id,
      userId,
      type: "call",
      title: "Negotiation call",
      description:
        "Patricia wants to bring price to $2,800. Discussed what we can remove from scope. Close to agreement.",
    },
  ]);
  console.log(`  ✓ Created lead activities`);

  // ─── Quotes ───────────────────────────────────────────────────────
  const [q1] = await db
    .insert(quotes)
    .values({
      userId,
      leadId: wonLead.id,
      quoteNumber: "Q-2024-018",
      title: "Corporate Holiday Party Package",
      clientName: "Riverside Event Hall",
      clientEmail: "sarah.mitchell@riverside.com",
      status: "accepted",
      subtotal: "2181.82",
      taxRate: "10.00",
      taxAmount: "218.18",
      total: "2400.00",
      notes: "Includes all travel within 50 miles. Setup 2 hours before event.",
      terms:
        "50% deposit required to secure booking. Balance due 7 days before event.",
      validUntil: addSeedDays(SEED_BASE_DATE, -25),
      sentAt: addSeedDays(SEED_BASE_DATE, -45),
      acceptedAt: addSeedDays(SEED_BASE_DATE, -40),
    })
    .returning();

  await db.insert(quoteItems).values([
    {
      quoteId: q1.id,
      description: "HaloLight Photobooth Rental (5 hours)",
      quantity: "1",
      unitPrice: "800.00",
      total: "800.00",
      order: 1,
    },
    {
      quoteId: q1.id,
      description: "Professional Attendant",
      quantity: "1",
      unitPrice: "350.00",
      total: "350.00",
      order: 2,
    },
    {
      quoteId: q1.id,
      description: "Premium Print Package (unlimited 4x6 prints)",
      quantity: "1",
      unitPrice: "400.00",
      total: "400.00",
      order: 3,
    },
    {
      quoteId: q1.id,
      description: "Custom Corporate Branded Overlay Design",
      quantity: "1",
      unitPrice: "150.00",
      total: "150.00",
      order: 4,
    },
    {
      quoteId: q1.id,
      description: "Digital Gallery Delivery (90-day access)",
      quantity: "1",
      unitPrice: "181.82",
      total: "181.82",
      order: 5,
    },
    {
      quoteId: q1.id,
      description: "Travel & Setup Fee",
      quantity: "1",
      unitPrice: "300.00",
      total: "300.00",
      order: 6,
    },
  ]);

  const [q2] = await db
    .insert(quotes)
    .values({
      userId,
      leadId: proposalLead.id,
      quoteNumber: "Q-2025-001",
      title: "Premium Wedding Package",
      clientName: "Emma & James Torres",
      clientEmail: "emma.torres@gmail.com",
      status: "sent",
      subtotal: "1636.36",
      taxRate: "10.00",
      taxAmount: "163.64",
      total: "1800.00",
      notes:
        "Includes custom wedding overlay, 2 copies per session, guest book, and full digital gallery.",
      terms: "50% deposit required. Balance due 14 days before wedding date.",
      validUntil: addSeedDays(SEED_BASE_DATE, 30),
      sentAt: addSeedDays(SEED_BASE_DATE, -3),
    })
    .returning();

  await db.insert(quoteItems).values([
    {
      quoteId: q2.id,
      description: "HaloLight Photobooth Rental (4 hours)",
      quantity: "1",
      unitPrice: "700.00",
      total: "700.00",
      order: 1,
    },
    {
      quoteId: q2.id,
      description: "Wedding Attendant",
      quantity: "1",
      unitPrice: "300.00",
      total: "300.00",
      order: 2,
    },
    {
      quoteId: q2.id,
      description: "Unlimited Prints (2 copies per session)",
      quantity: "1",
      unitPrice: "300.00",
      total: "300.00",
      order: 3,
    },
    {
      quoteId: q2.id,
      description: "Custom Wedding Overlay & Design",
      quantity: "1",
      unitPrice: "150.00",
      total: "150.00",
      order: 4,
    },
    {
      quoteId: q2.id,
      description: "Guest Book with Photo Strips & Messages",
      quantity: "1",
      unitPrice: "120.00",
      total: "120.00",
      order: 5,
    },
    {
      quoteId: q2.id,
      description: "Online Gallery (12 months)",
      quantity: "1",
      unitPrice: "66.36",
      total: "66.36",
      order: 6,
    },
  ]);

  const [q3] = await db
    .insert(quotes)
    .values({
      userId,
      leadId: negotiationLead.id,
      quoteNumber: "Q-2025-002",
      title: "City Gala Foundation — Event Package",
      clientName: "City Gala Foundation",
      clientEmail: "p.huang@citygala.org",
      status: "sent",
      subtotal: "2909.09",
      taxRate: "10.00",
      taxAmount: "290.91",
      total: "3200.00",
      notes:
        "10% non-profit discount applied. Includes premium AI filter package.",
      terms: "40% deposit required. Balance due 10 days before event.",
      validUntil: addSeedDays(SEED_BASE_DATE, 14),
      sentAt: addSeedDays(SEED_BASE_DATE, -7),
    })
    .returning();

  await db.insert(quoteItems).values([
    {
      quoteId: q3.id,
      description: "HaloLight Photobooth Rental (6 hours)",
      quantity: "1",
      unitPrice: "1000.00",
      total: "1000.00",
      order: 1,
    },
    {
      quoteId: q3.id,
      description: "Professional Attendant",
      quantity: "1",
      unitPrice: "350.00",
      total: "350.00",
      order: 2,
    },
    {
      quoteId: q3.id,
      description: "AI Filter & Effects Package",
      quantity: "1",
      unitPrice: "450.00",
      total: "450.00",
      order: 3,
    },
    {
      quoteId: q3.id,
      description: "Unlimited Prints",
      quantity: "1",
      unitPrice: "500.00",
      total: "500.00",
      order: 4,
    },
    {
      quoteId: q3.id,
      description: "Custom Branded Overlay",
      quantity: "1",
      unitPrice: "200.00",
      total: "200.00",
      order: 5,
    },
    {
      quoteId: q3.id,
      description: "Non-Profit Discount (10%)",
      quantity: "1",
      unitPrice: "-250.00",
      total: "-250.00",
      order: 6,
    },
    {
      quoteId: q3.id,
      description: "Travel & Logistics",
      quantity: "1",
      unitPrice: "659.09",
      total: "659.09",
      order: 7,
    },
  ]);

  const [q4] = await db
    .insert(quotes)
    .values({
      userId,
      quoteNumber: "Q-2025-003",
      title: "Standard Single Booth Package",
      clientName: "Sample Client",
      clientEmail: "sample@client.com",
      status: "draft",
      subtotal: "909.09",
      taxRate: "10.00",
      taxAmount: "90.91",
      total: "1000.00",
      notes: "Standard package draft.",
      validUntil: addSeedDays(SEED_BASE_DATE, 30),
    })
    .returning();

  await db.insert(quoteItems).values([
    {
      quoteId: q4.id,
      description: "HaloLight Photobooth Rental (3 hours)",
      quantity: "1",
      unitPrice: "550.00",
      total: "550.00",
      order: 1,
    },
    {
      quoteId: q4.id,
      description: "Attendant",
      quantity: "1",
      unitPrice: "250.00",
      total: "250.00",
      order: 2,
    },
    {
      quoteId: q4.id,
      description: "Print Package",
      quantity: "1",
      unitPrice: "109.09",
      total: "109.09",
      order: 3,
    },
  ]);

  console.log("  ✓ Created 4 quotes with line items");

  // ─── Contracts ────────────────────────────────────────────────────
  const [con1] = await db
    .insert(contracts)
    .values({
      userId,
      leadId: wonLead.id,
      quoteId: q1.id,
      contractNumber: "CON-2024-018",
      title: "Riverside Event Hall — Holiday Party Contract",
      clientName: "Riverside Event Hall",
      clientEmail: "sarah.mitchell@riverside.com",
      status: "signed",
      content: `PHOTOBOOTH RENTAL AGREEMENT

This Agreement is entered into between HaloLight ("Company") and Riverside Event Hall ("Client").

1. EVENT DETAILS
   Event Date: December 14, 2024
   Event Location: Riverside Event Hall, 420 River Rd
   Setup Time: 5:00 PM
   Event Duration: 5 hours

2. SERVICES PROVIDED
   - One (1) HaloLight photobooth unit with professional lighting
   - Unlimited photo sessions during the event
   - Instant prints (4x6") for all guests
   - Digital gallery delivery (90-day access)
   - Professional attendant for the duration of the event
   - Custom corporate branded overlay

3. PAYMENT TERMS
   Total Amount: $2,400.00
   Deposit (50%): $1,200.00 — PAID
   Balance: $1,200.00 — PAID

4. CANCELLATION POLICY
   Standard cancellation terms apply as per Company policy.

5. STATUS: COMPLETED — EVENT SUCCESSFULLY DELIVERED`,
      value: "2400.00",
      startDate: addSeedDays(SEED_BASE_DATE, -30),
      endDate: addSeedDays(SEED_BASE_DATE, -30),
      signedAt: addSeedDays(SEED_BASE_DATE, -40),
      sentAt: addSeedDays(SEED_BASE_DATE, -42),
    })
    .returning();

  const [con2] = await db
    .insert(contracts)
    .values({
      userId,
      leadId: proposalLead.id,
      quoteId: q2.id,
      contractNumber: "CON-2025-001",
      title: "Torres Wedding — Premium Package Contract",
      clientName: "Emma & James Torres",
      clientEmail: "emma.torres@gmail.com",
      status: "sent",
      content: `WEDDING PHOTOBOOTH SERVICES AGREEMENT

Couple: Emma & James Torres
Wedding Date: July 12, 2025
Venue: Bella Vista Gardens

PACKAGE INCLUDES:
✓ 4-hour photobooth rental
✓ Unlimited prints (2 copies per session)
✓ Guest book with photo strips & messages
✓ Online gallery for 12 months
✓ Custom wedding overlay design
✓ Prop box included
✓ Professional attendant

PRICING:
Package Total: $1,800.00
Deposit: $900.00 (non-refundable)
Balance Due: $900.00 (due 14 days before wedding)

Status: AWAITING SIGNATURE`,
      value: "1800.00",
      eventType: "Wedding",
      eventDate: addSeedDays(SEED_BASE_DATE, 45),
      eventLocation: "Bella Vista Gardens",
      eventStartTime: "18:00",
      eventEndTime: "23:00",
      setupTime: "16:30",
      pickupTime: "23:30",
      packageName: "Premium Wedding Photobooth Package",
      rentalDuration: "4 hours",
      includedPrints: "Unlimited prints, two copies per session",
      rentalPrice: "1600.00",
      optionsPrice: "200.00",
      deliveryFees: "0.00",
      discountAmount: "0.00",
      taxRate: "0.00",
      depositAmount: "900.00",
      depositMethod: "Bank transfer",
      depositConditions:
        "Deposit is retained if the event is cancelled less than 14 days before the booking.",
      depositReturn:
        "Any remaining refundable deposit is returned after equipment inspection.",
      paymentTerms:
        "50% deposit on signature, balance due 14 days before the event.",
      cancellationTerms:
        "Full refund if cancelled 30+ days before the event; deposit retained after that window.",
      signaturePlace: "Paris",
      equipmentDescription: "Premium photobooth, prop box, guest book station",
      digitalGallery: true,
      customTemplate: true,
      deliveryIncluded: true,
      setupIncluded: true,
      operatorIncluded: true,
      optionsList: "Guest book, wedding overlay design, online gallery",
      startDate: addSeedDays(SEED_BASE_DATE, 45),
      endDate: addSeedDays(SEED_BASE_DATE, 45),
      sentAt: addSeedDays(SEED_BASE_DATE, -2),
    })
    .returning();

  const [con3] = await db
    .insert(contracts)
    .values({
      userId,
      contractNumber: "CON-2025-002",
      title: "TechNova Multi-Booth Proposal Contract",
      clientName: "TechNova Inc.",
      clientEmail: "dchen@technova.io",
      status: "draft",
      content: `CORPORATE EVENT SERVICES AGREEMENT — DRAFT

Client: TechNova Inc.
Contact: David Chen
Event: Q4 Product Launch
Proposed Date: TBD

This contract draft is pending finalization of booth count and package details.

[DRAFT — NOT FOR DISTRIBUTION]`,
      value: "5500.00",
    })
    .returning();

  console.log("  ✓ Created 3 contracts");

  // ─── Invoices ─────────────────────────────────────────────────────
  const [inv1] = await db
    .insert(invoices)
    .values({
      userId,
      leadId: wonLead.id,
      quoteId: q1.id,
      contractId: con1.id,
      invoiceNumber: "INV-2024-018",
      title: "Holiday Party — Final Invoice",
      clientName: "Riverside Event Hall",
      clientEmail: "sarah.mitchell@riverside.com",
      status: "paid",
      subtotal: "2181.82",
      taxRate: "10.00",
      taxAmount: "218.18",
      total: "2400.00",
      notes:
        "Thank you for your business! We look forward to working with you again.",
      terms: "Net 7 — Payment due within 7 days of event.",
      dueDate: addSeedDays(SEED_BASE_DATE, -23),
      sentAt: addSeedDays(SEED_BASE_DATE, -29),
      paidAt: addSeedDays(SEED_BASE_DATE, -24),
      paidAmount: "2400.00",
      paymentMethod: "Bank Transfer",
      paymentReference: "TXN-847291",
    })
    .returning();

  await db.insert(invoiceItems).values([
    {
      invoiceId: inv1.id,
      description: "HaloLight Photobooth Rental (5 hours)",
      quantity: "1",
      unitPrice: "800.00",
      total: "800.00",
      order: 1,
    },
    {
      invoiceId: inv1.id,
      description: "Professional Attendant",
      quantity: "1",
      unitPrice: "350.00",
      total: "350.00",
      order: 2,
    },
    {
      invoiceId: inv1.id,
      description: "Premium Print Package",
      quantity: "1",
      unitPrice: "400.00",
      total: "400.00",
      order: 3,
    },
    {
      invoiceId: inv1.id,
      description: "Custom Corporate Overlay",
      quantity: "1",
      unitPrice: "150.00",
      total: "150.00",
      order: 4,
    },
    {
      invoiceId: inv1.id,
      description: "Digital Gallery (90-day)",
      quantity: "1",
      unitPrice: "181.82",
      total: "181.82",
      order: 5,
    },
    {
      invoiceId: inv1.id,
      description: "Travel & Setup Fee",
      quantity: "1",
      unitPrice: "300.00",
      total: "300.00",
      order: 6,
    },
  ]);

  const [inv2] = await db
    .insert(invoices)
    .values({
      userId,
      invoiceNumber: "INV-2025-001",
      title: "Deposit Invoice — Torres Wedding",
      clientName: "Emma & James Torres",
      clientEmail: "emma.torres@gmail.com",
      status: "sent",
      subtotal: "818.18",
      taxRate: "10.00",
      taxAmount: "81.82",
      total: "900.00",
      notes: "Deposit invoice for 50% of wedding package total.",
      terms: "Payment due within 7 days to secure your date.",
      dueDate: addSeedDays(SEED_BASE_DATE, 4),
      sentAt: addSeedDays(SEED_BASE_DATE, -3),
    })
    .returning();

  await db.insert(invoiceItems).values([
    {
      invoiceId: inv2.id,
      description: "Wedding Package Deposit (50%)",
      quantity: "1",
      unitPrice: "818.18",
      total: "818.18",
      order: 1,
    },
  ]);

  const [inv3] = await db
    .insert(invoices)
    .values({
      userId,
      invoiceNumber: "INV-2024-015",
      title: "Birthday Party — Overdue Invoice",
      clientName: "Johnson Family",
      clientEmail: "mark.johnson@email.com",
      status: "overdue",
      subtotal: "727.27",
      taxRate: "10.00",
      taxAmount: "72.73",
      total: "800.00",
      notes: "Please arrange payment at your earliest convenience.",
      terms: "Net 14",
      dueDate: addSeedDays(SEED_BASE_DATE, -10),
      sentAt: addSeedDays(SEED_BASE_DATE, -25),
    })
    .returning();

  await db.insert(invoiceItems).values([
    {
      invoiceId: inv3.id,
      description: "HaloLight Photobooth Rental (3 hours)",
      quantity: "1",
      unitPrice: "550.00",
      total: "550.00",
      order: 1,
    },
    {
      invoiceId: inv3.id,
      description: "Attendant",
      quantity: "1",
      unitPrice: "177.27",
      total: "177.27",
      order: 2,
    },
  ]);

  const [inv4] = await db
    .insert(invoices)
    .values({
      userId,
      invoiceNumber: "INV-2025-002",
      title: "Spring Gala — Draft Invoice",
      clientName: "City Gala Foundation",
      clientEmail: "p.huang@citygala.org",
      status: "draft",
      subtotal: "2909.09",
      taxRate: "10.00",
      taxAmount: "290.91",
      total: "3200.00",
      dueDate: addSeedDays(SEED_BASE_DATE, 35),
    })
    .returning();

  await db.insert(invoiceItems).values([
    {
      invoiceId: inv4.id,
      description: "Gala Package (6 hours)",
      quantity: "1",
      unitPrice: "2000.00",
      total: "2000.00",
      order: 1,
    },
    {
      invoiceId: inv4.id,
      description: "AI Filters Package",
      quantity: "1",
      unitPrice: "450.00",
      total: "450.00",
      order: 2,
    },
    {
      invoiceId: inv4.id,
      description: "Non-Profit Discount (10%)",
      quantity: "1",
      unitPrice: "-250.00",
      total: "-250.00",
      order: 3,
    },
    {
      invoiceId: inv4.id,
      description: "Travel & Logistics",
      quantity: "1",
      unitPrice: "709.09",
      total: "709.09",
      order: 4,
    },
  ]);

  console.log("  ✓ Created 4 invoices with line items");
  console.log("\n✅ CRM seed complete.");
}
