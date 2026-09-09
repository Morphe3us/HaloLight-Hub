import {
  db,
  usersTable,
  userOnboardingProgressTable,
  onboardingStepsTable,
  userLessonProgress,
  lessons,
  events,
  quotes,
  quoteItems,
  invoices,
  invoiceItems,
  supportTickets,
  supportTicketReplies,
  communityChannels,
  communityPosts,
  communityReplies,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  addSeedDays,
  deterministicRange,
  seedDaysAgo,
  seedDaysFromNow,
} from "./seed-utils";

const DEMO_CLIENTS = [
  {
    clerkId: "demo_champion_001",
    email: "sarah.johnson@luxebooth.com",
    fullName: "Sarah Johnson",
    companyName: "Luxe Photo Booth Co.",
    phone: "+1 (555) 210-8891",
    referencePrefix: "SAR",
    role: "client" as const,
    // 2 days ago — high login activity
    daysAgo: 2,
    onboardingSteps: 8, // all complete
    academyLessons: 6,
    eventsCount: 3,
    quotesCount: 4,
    invoiceCount: 3,
    paidInvoiceCount: 2,
    communityPosts: 3,
    communityReplies: 5,
    tickets: 2,
  },
  {
    clerkId: "demo_healthy_001",
    email: "marcus.r@captureevents.io",
    fullName: "Marcus Rodriguez",
    companyName: "Capture Events LLC",
    phone: "+1 (555) 332-7741",
    referencePrefix: "MAR",
    role: "client" as const,
    daysAgo: 5,
    onboardingSteps: 6,
    academyLessons: 3,
    eventsCount: 2,
    quotesCount: 2,
    invoiceCount: 2,
    paidInvoiceCount: 1,
    communityPosts: 1,
    communityReplies: 2,
    tickets: 1,
  },
  {
    clerkId: "demo_developing_001",
    email: "aisha.k@shinebooth.com",
    fullName: "Aisha Kamara",
    companyName: "Shine Photo Booth",
    phone: "+1 (555) 449-2210",
    referencePrefix: "AIS",
    role: "client" as const,
    daysAgo: 25,
    onboardingSteps: 4,
    academyLessons: 1,
    eventsCount: 1,
    quotesCount: 1,
    invoiceCount: 0,
    paidInvoiceCount: 0,
    communityPosts: 0,
    communityReplies: 1,
    tickets: 1,
  },
  {
    clerkId: "demo_at_risk_001",
    email: "tom.w@flashbooth.net",
    fullName: "Tom Wallace",
    companyName: "Flash Booth Rentals",
    phone: "+1 (555) 887-3304",
    referencePrefix: "TOM",
    role: "client" as const,
    daysAgo: 55,
    onboardingSteps: 1,
    academyLessons: 0,
    eventsCount: 0,
    quotesCount: 0,
    invoiceCount: 0,
    paidInvoiceCount: 0,
    communityPosts: 0,
    communityReplies: 0,
    tickets: 1,
  },
  {
    clerkId: "demo_developing_002",
    email: "priya.s@momentbooth.com",
    fullName: "Priya Sharma",
    companyName: "Moment Booth Studios",
    phone: "+1 (555) 561-9920",
    referencePrefix: "PRI",
    role: "client" as const,
    daysAgo: 20,
    onboardingSteps: 3,
    academyLessons: 2,
    eventsCount: 1,
    quotesCount: 2,
    invoiceCount: 1,
    paidInvoiceCount: 0,
    communityPosts: 1,
    communityReplies: 0,
    tickets: 0,
  },
];

export async function seedPhase5() {
  console.log(
    "\nSeeding Phase 5 — demo clients for Customer Success Engine...",
  );
  const demoClientIds: string[] = [];

  // Get existing onboarding steps
  const allSteps = await db.select().from(onboardingStepsTable);
  const totalSteps = allSteps.length;

  // Get existing lessons
  const allLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .limit(10);

  for (const [demoIndex, demo] of DEMO_CLIENTS.entries()) {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, demo.clerkId));
    let userId: string;

    const lastActive = seedDaysAgo(demo.daysAgo);

    if (existing.length > 0) {
      userId = existing[0]!.id;
      console.log(`  - Skipped existing client: ${demo.email}`);
    } else {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkId: demo.clerkId,
          email: demo.email,
          fullName: demo.fullName,
          companyName: demo.companyName,
          phone: demo.phone,
          role: demo.role,
          createdAt: lastActive,
          updatedAt: lastActive,
        })
        .returning({ id: usersTable.id });
      userId = created!.id;
      console.log(`  ✓ Created demo client: ${demo.email}`);
    }
    demoClientIds.push(userId);

    // Update updatedAt to simulate activity recency
    await db
      .update(usersTable)
      .set({ updatedAt: lastActive })
      .where(eq(usersTable.id, userId));

    // Onboarding progress
    const stepsToComplete = allSteps.slice(0, demo.onboardingSteps);
    for (const step of stepsToComplete) {
      const exists = await db
        .select()
        .from(userOnboardingProgressTable)
        .where(eq(userOnboardingProgressTable.userId, userId));
      const stepExists = exists.some((e) => e.stepId === step.id);
      if (!stepExists) {
        await db.insert(userOnboardingProgressTable).values({
          userId,
          stepId: step.id,
          completedAt: addSeedDays(lastActive, 1),
        });
      }
    }

    // Academy lesson progress
    for (let i = 0; i < Math.min(demo.academyLessons, allLessons.length); i++) {
      const lesson = allLessons[i]!;
      const exists = await db
        .select()
        .from(userLessonProgress)
        .where(eq(userLessonProgress.userId, userId));
      if (!exists.some((e) => e.lessonId === lesson.id)) {
        await db.insert(userLessonProgress).values({
          userId,
          lessonId: lesson.id,
          completedAt: addSeedDays(lastActive, 2),
        });
      }
    }

    // Events
    const existingEvents = await db
      .select()
      .from(events)
      .where(eq(events.userId, userId));
    const eventsToCreate = demo.eventsCount - existingEvents.length;
    for (let i = 0; i < eventsToCreate; i++) {
      const futureDate = addSeedDays(lastActive, i + 7);
      await db.insert(events).values({
        userId,
        title:
          [
            `Birthday Party @ Grand Ballroom`,
            `Corporate Gala — ${demo.companyName}`,
            `Wedding Reception — Ritz Hotel`,
          ][i] ?? `Event ${i + 1}`,
        eventDate: futureDate,
        location:
          [
            `The Grand Ballroom, NYC`,
            `Hilton Conference Center`,
            `Ritz-Carlton Hotel`,
          ][i] ?? "Venue TBD",
        status: (["upcoming", "active", "completed"] as const)[i] ?? "upcoming",
        notes: "Client demo event",
      });
    }

    // Quotes
    const existingQuotes = await db
      .select()
      .from(quotes)
      .where(eq(quotes.userId, userId));
    const quotesToCreate = demo.quotesCount - existingQuotes.length;
    for (let i = 0; i < quotesToCreate; i++) {
      const amount = [2500, 3800, 1900, 4200][i] ?? 2000;
      const [q] = await db
        .insert(quotes)
        .values({
          userId,
          quoteNumber: `Q-${demo.referencePrefix}-${String(i + 1).padStart(3, "0")}`,
          title:
            [
              `Open Air Booth Package`,
              `Enclosed Booth Premium`,
              `LED Ring Light Add-on`,
              `Full Day Package`,
            ][i] ?? `Quote ${i + 1}`,
          clientName: demo.fullName ?? demo.email,
          clientEmail: demo.email,
          subtotal: String(amount),
          taxRate: "8.5",
          taxAmount: String(Math.round(amount * 0.085)),
          total: String(Math.round(amount * 1.085)),
          status: (["sent", "accepted", "draft", "sent"] as const)[i] ?? "sent",
          validUntil: seedDaysFromNow(30),
          notes: "Demo quote",
        })
        .returning({ id: quotes.id });
      if (q) {
        await db.insert(quoteItems).values({
          quoteId: q.id,
          description: "Photobooth rental (4 hours)",
          quantity: "1",
          unitPrice: String(amount),
          total: String(amount),
        });
      }
    }

    // Invoices
    const existingInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId));
    const invoicesToCreate = demo.invoiceCount - existingInvoices.length;
    for (let i = 0; i < invoicesToCreate; i++) {
      const amount = [2800, 3200, 1600][i] ?? 2000;
      const isPaid = i < demo.paidInvoiceCount;
      const [inv] = await db
        .insert(invoices)
        .values({
          userId,
          invoiceNumber: `INV-${demo.referencePrefix}-${String(i + 1).padStart(3, "0")}`,
          title:
            [
              `Photobooth Rental — Q1 Event`,
              `Premium Package — Corporate Gala`,
              `Add-on Services`,
            ][i] ?? `Invoice ${i + 1}`,
          clientName: demo.fullName ?? demo.email,
          clientEmail: demo.email,
          subtotal: String(amount),
          taxRate: "8.5",
          taxAmount: String(Math.round(amount * 0.085)),
          total: String(Math.round(amount * 1.085)),
          status: isPaid ? "paid" : "sent",
          dueDate: seedDaysFromNow(isPaid ? -7 : 14),
          paidAmount: isPaid ? String(Math.round(amount * 1.085)) : null,
          paymentMethod: isPaid ? "credit_card" : null,
        })
        .returning({ id: invoices.id });
      if (inv) {
        await db.insert(invoiceItems).values({
          invoiceId: inv.id,
          description: "Photobooth rental service",
          quantity: "1",
          unitPrice: String(amount),
          total: String(amount),
        });
      }
    }

    // Community posts
    const existingPosts = await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.userId, userId));
    if (existingPosts.length < demo.communityPosts) {
      const channels = await db
        .select({ id: communityChannels.id })
        .from(communityChannels)
        .limit(1);
      const firstChannelRow = channels[0];
      if (firstChannelRow) {
        const channelId = firstChannelRow.id;
        for (let i = existingPosts.length; i < demo.communityPosts; i++) {
          await db.insert(communityPosts).values({
            channelId,
            userId,
            title:
              [
                `My first photobooth event went amazing!`,
                `Tips for managing large events`,
                `How I scaled to 5 bookings/month`,
              ][i] ?? `Post ${i + 1}`,
            content: `Hey everyone! Sharing my experience after running my latest photobooth event. The platform has been incredibly helpful for managing everything from quotes to the actual event day. Highly recommend checking out the academy courses!`,
            isPinned: 0,
            isLocked: 0,
            views: deterministicRange(demoIndex * 10 + i, 10, 59),
          });
        }
      }
    }

    // Support tickets
    const existingTickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId));
    if (existingTickets.length < demo.tickets) {
      for (let i = existingTickets.length; i < demo.tickets; i++) {
        const [ticket] = await db
          .insert(supportTickets)
          .values({
            userId,
            ticketNumber: `TK-${demo.referencePrefix}-${String(i + 1).padStart(3, "0")}`,
            title:
              [
                `Hardware question about print speed`,
                `How to create a custom template`,
              ][i] ?? `Support request ${i + 1}`,
            description:
              "I have a question about my equipment setup and need some guidance.",
            status: i === 0 ? "resolved" : "open",
            priority: "medium",
            category: "technical",
          })
          .returning({ id: supportTickets.id });
        if (ticket) {
          await db.insert(supportTicketReplies).values({
            ticketId: ticket.id,
            userId,
            content:
              "Thanks for reaching out! Our team will get back to you shortly.",
            isStaff: 1,
          });
        }
      }
    }
  }

  console.log("  ✅ Phase 5 demo clients seeded successfully");
  return demoClientIds;
}
