import {
  db,
  usersTable,
  supportTickets,
  supportTicketReplies,
  kbCategories,
  kbArticles,
  aiSuggestedQuestions,
  communityChannels,
  communityPosts,
  communityReplies,
  communityReactions,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export async function seedPhase4() {
  console.log("\n🎧 Seeding Phase 4 data (Support, KB, AI, Community)...");

  const [anyUser] = await db.select().from(usersTable).limit(1);
  if (!anyUser) {
    console.log("  ℹ No users found — Phase 4 seed requires at least one logged-in user.");
    return;
  }
  const userId = anyUser.id;

  // ─── Support Tickets ────────────────────────────────────────────────────
  const existingTickets = await db.select().from(supportTickets).limit(1);
  if (existingTickets.length === 0) {
    const tickets = await db.insert(supportTickets).values([
      {
        userId,
        ticketNumber: "TKT-2025-10001",
        title: "Print quality issues with my HaloLight unit",
        description: "Hi, I've been noticing that my prints are coming out slightly blurry on the right side. This started happening about 3 days ago. I haven't changed any settings. The unit is about 6 months old. Please help!",
        status: "in_progress",
        priority: "high",
        category: "technical",
      },
      {
        userId,
        ticketNumber: "TKT-2025-10002",
        title: "Question about adding a second booth",
        description: "I'd like to expand my business and add a second photobooth. Can you walk me through the process? I'm particularly interested in whether I can manage both units from the same HaloLight OS account.",
        status: "open",
        priority: "medium",
        category: "general",
      },
      {
        userId,
        ticketNumber: "TKT-2025-10003",
        title: "Invoice INV-2024-018 - incorrect tax amount",
        description: "I believe there's an error on my recent invoice. The tax rate was applied at 10% but my jurisdiction rate is 8.5%. I need this corrected before I submit it to my client.",
        status: "resolved",
        priority: "medium",
        category: "billing",
        resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        userId,
        ticketNumber: "TKT-2025-10004",
        title: "Feature request: bulk quote generation",
        description: "It would be really useful to be able to generate multiple quotes from a single template for different clients. Currently I have to create each quote manually which takes a lot of time for large events.",
        status: "open",
        priority: "low",
        category: "feature_request",
      },
      {
        userId,
        ticketNumber: "TKT-2025-10005",
        title: "App crashes when uploading custom overlay",
        description: "Every time I try to upload a PNG overlay larger than 5MB, the app crashes. I've tried multiple times with different files. The file format is correct (PNG, transparent background) but anything over 5MB fails.",
        status: "waiting_on_client",
        priority: "urgent",
        category: "bug_report",
      },
    ]).returning();

    await db.insert(supportTicketReplies).values([
      {
        ticketId: tickets[0]!.id,
        userId,
        content: "Thank you for reporting this. Our technical team has reviewed your case. Could you please try cleaning the print head using the maintenance menu (Settings > Maintenance > Clean Print Head) and let us know if the issue persists?",
        isStaff: 1,
      },
      {
        ticketId: tickets[0]!.id,
        userId,
        content: "I tried the maintenance procedure and it helped a bit, but there's still some blurriness on the right edge. Should I send it in for service?",
        isStaff: 0,
      },
      {
        ticketId: tickets[2]!.id,
        userId,
        content: "We've reviewed your invoice and confirmed the tax rate discrepancy. We've updated the invoice with the correct 8.5% rate. Please find the corrected invoice attached to your account. Apologies for the inconvenience!",
        isStaff: 1,
      },
      {
        ticketId: tickets[2]!.id,
        userId,
        content: "Thank you for the quick fix! The corrected invoice looks perfect.",
        isStaff: 0,
      },
      {
        ticketId: tickets[4]!.id,
        userId,
        content: "We've been able to reproduce this issue in our test environment. It appears to be related to our file size validation. As a workaround, could you try compressing your PNG to under 5MB using a tool like TinyPNG and let us know if that works?",
        isStaff: 1,
      },
    ]);
    console.log(`  ✓ Created ${tickets.length} support tickets with replies`);
  } else {
    console.log("  - Skipped existing support tickets");
  }

  // ─── Knowledge Base ──────────────────────────────────────────────────────
  const existingCategories = await db.select().from(kbCategories).limit(1);
  if (existingCategories.length === 0) {
    const categories = await db.insert(kbCategories).values([
      { name: "Getting Started", slug: "getting-started", description: "Everything you need to know to set up and launch your HaloLight business", icon: "Zap", order: 1 },
      { name: "Equipment & Setup", slug: "equipment-setup", description: "Technical guides for your photobooth hardware and configuration", icon: "Wrench", order: 2 },
      { name: "Billing & Payments", slug: "billing-payments", description: "Invoicing, payments, and financial management", icon: "CreditCard", order: 3 },
      { name: "Features & Tips", slug: "features-tips", description: "Get the most out of HaloLight OS with pro tips and tricks", icon: "Lightbulb", order: 4 },
      { name: "Troubleshooting", slug: "troubleshooting", description: "Common issues and how to fix them", icon: "HelpCircle", order: 5 },
      { name: "Business Growth", slug: "business-growth", description: "Guides for growing your photobooth business", icon: "TrendingUp", order: 6 },
    ]).returning();

    const gettingStarted = categories.find((c) => c.slug === "getting-started")!;
    const equipment = categories.find((c) => c.slug === "equipment-setup")!;
    const billing = categories.find((c) => c.slug === "billing-payments")!;
    const features = categories.find((c) => c.slug === "features-tips")!;
    const troubleshooting = categories.find((c) => c.slug === "troubleshooting")!;
    const growth = categories.find((c) => c.slug === "business-growth")!;

    await db.insert(kbArticles).values([
      {
        categoryId: gettingStarted.id,
        authorId: userId,
        title: "Welcome to HaloLight OS — Your Complete Business Hub",
        slug: "welcome-to-halolight-os",
        excerpt: "A complete overview of everything HaloLight OS can do for your photobooth business.",
        status: "published" as const,
        publishedAt: new Date(),
        views: 284,
        order: 1,
        tags: ["overview", "getting-started"],
        content: `# Welcome to HaloLight OS

HaloLight OS is your all-in-one operating system for running a professional photobooth business. This guide walks you through everything available to you.

## What's Inside HaloLight OS

### Sales & CRM
Manage your entire sales pipeline from first contact to signed contract:
- **Leads** — Track potential clients through your pipeline with a visual kanban board
- **Quotes** — Generate professional quotes with line items and tax calculations
- **Contracts** — Create and send contracts with digital signing workflow
- **Invoices** — Invoice clients and track payments

### Support Center
Get help when you need it:
- Submit and track support tickets
- View ticket history and staff replies
- Browse the knowledge base for self-service answers

### Community
Connect with other HaloLight operators:
- Join community channels for discussions
- Share tips and best practices
- Get inspiration from other operators

### Academy
Learn and grow your business:
- Video courses on equipment operation
- Business growth guides
- Certification programs

## Getting Started Checklist

1. Complete your onboarding wizard
2. Set up your first lead in the CRM
3. Customize your quote template
4. Explore the Academy courses
5. Join the Community channels

Welcome aboard!`,
      },
      {
        categoryId: equipment.id,
        authorId: userId,
        title: "Setting Up Your HaloLight Photobooth — Complete Guide",
        slug: "setting-up-halolight-photobooth",
        excerpt: "Step-by-step guide for setting up your HaloLight unit at an event.",
        status: "published" as const,
        publishedAt: new Date(),
        views: 196,
        order: 1,
        tags: ["setup", "equipment", "events"],
        content: `# Setting Up Your HaloLight Photobooth

## Space Requirements

- Minimum 8×8 ft floor space
- Ceiling height: 7 ft minimum
- Access to a standard 110V outlet (15A circuit)

## Setup Steps

### 1. Unpack and Inspect
Check all components before the event:
- HaloLight unit (main booth)
- Ring light assembly
- Print station
- Prop box
- Cables and power strips

### 2. Position the Booth
- Place on a flat, stable surface
- Ensure backdrop is at least 4 ft behind the booth
- Check that power cable reaches the outlet safely (no tripping hazards)

### 3. Power Up
1. Connect the main power cable
2. Turn on the main unit (power button on the side)
3. Wait for the startup sequence (approximately 90 seconds)
4. The touch screen will display the HaloLight logo when ready

### 4. Configure for the Event
1. Open Settings > Event Profile
2. Load or create the event profile with:
   - Event name
   - Custom overlay design
   - Print quantity settings
   - Gallery sharing options

### 5. Test Run
- Take 3-5 test photos
- Verify print quality
- Test digital delivery (QR code scan)
- Check that social sharing works

## Troubleshooting Common Setup Issues

- **Screen not responding**: Hold power button 10 seconds to restart
- **Printer offline**: Check USB cable connection, cycle printer power
- **Poor print quality**: Run maintenance from Settings > Maintenance > Clean Print Head

## Tear-Down

Pack components in reverse order. Allow the printer to cool for 10 minutes before packing.`,
      },
      {
        categoryId: billing.id,
        authorId: userId,
        title: "How to Create and Send an Invoice",
        slug: "how-to-create-send-invoice",
        excerpt: "Learn how to create professional invoices and track payments in HaloLight OS.",
        status: "published" as const,
        publishedAt: new Date(),
        views: 143,
        order: 1,
        tags: ["invoices", "billing", "payments"],
        content: `# Creating and Sending Invoices

## Creating Your First Invoice

### From the Invoice Module
1. Navigate to **Invoices** in the sidebar
2. Click **New Invoice**
3. Fill in client details (name, email)
4. Add line items with descriptions, quantities, and unit prices
5. Set the tax rate for your jurisdiction
6. Add payment terms and due date
7. Click **Save** to create as draft

### From an Existing Quote
1. Open the accepted quote
2. Click **Convert to Invoice** 
3. Line items are automatically imported
4. Review and adjust as needed

## Sending the Invoice

1. Open the invoice (status: Draft)
2. Click **Mark as Sent** to update the status
3. Download the PDF using the print button
4. Email the PDF to your client

## Payment Tracking

When a client pays:
1. Open the invoice
2. Click **Mark as Paid**
3. Enter the payment amount, method, and reference
4. The invoice status updates to **Paid**

## Invoice Statuses

- **Draft** — Working copy, not sent to client
- **Sent** — Delivered to client, awaiting payment
- **Paid** — Payment received and confirmed
- **Overdue** — Past due date without payment
- **Cancelled** — Voided invoice

## Tips

- Always add payment terms (Net 7, Net 14, Net 30)
- Include your bank details or payment link in the notes field
- Set up due dates to track overdue invoices easily`,
      },
      {
        categoryId: features.id,
        authorId: userId,
        title: "Using the AI Assistant Effectively",
        slug: "using-ai-assistant",
        excerpt: "Get the most out of the HaloLight AI Assistant for quick answers and guidance.",
        status: "published" as const,
        publishedAt: new Date(),
        views: 89,
        order: 1,
        tags: ["ai", "assistant", "tips"],
        content: `# Getting the Most from the AI Assistant

## What the AI Assistant Can Help With

The HaloLight AI Assistant is trained on our product knowledge base and can answer questions about:

- **Pricing & Packages** — Get information on our pricing tiers and what's included
- **Booking Process** — Learn how the lead-to-invoice workflow works
- **Equipment** — Technical specifications and setup guidance
- **Troubleshooting** — Common issues and first-step solutions
- **Policies** — Cancellation, payment, and service policies

## Tips for Better Answers

### Be Specific
Instead of: *"Tell me about pricing"*
Try: *"What's included in the standard 3-hour package?"*

### Use Natural Language
The AI understands conversational questions:
- "How do I set up the booth for an outdoor event?"
- "What happens if a client cancels 2 weeks before the event?"
- "Can I use my own custom overlays?"

## Conversation History

All your conversations are saved automatically. You can:
- Return to previous conversations from the left panel
- Start a new conversation with the **New Chat** button
- Delete conversations you no longer need

## Limitations

The AI Assistant currently uses a knowledge base approach and does not:
- Access real-time information
- Connect to external systems
- Process images or files

For complex issues not covered by the AI, please submit a Support Ticket.`,
      },
      {
        categoryId: troubleshooting.id,
        authorId: userId,
        title: "Print Quality Issues — Diagnosis and Fixes",
        slug: "print-quality-diagnosis-fixes",
        excerpt: "Comprehensive guide to diagnosing and resolving print quality problems.",
        status: "published" as const,
        publishedAt: new Date(),
        views: 211,
        order: 1,
        tags: ["prints", "troubleshooting", "quality"],
        content: `# Print Quality Troubleshooting Guide

## Common Print Issues and Solutions

### Blurry or Smudged Prints

**Cause:** Dirty print head or low ink

**Solution:**
1. Open Settings > Maintenance > Clean Print Head
2. Run a standard clean cycle (takes ~2 minutes)
3. Print a test page to verify
4. If still blurry, run Deep Clean (takes ~5 minutes)
5. If problem persists, check ink cartridge levels

### Color Banding (Horizontal Lines)

**Cause:** Clogged ink nozzles

**Solution:**
1. Run Print Head Alignment from Settings > Maintenance
2. Print alignment test page
3. If bands remain, replace the affected ink cartridge
4. Run nozzle check: Settings > Maintenance > Nozzle Check

### Faded Prints

**Cause:** Low ink or incorrect media type setting

**Solution:**
1. Check ink levels in Settings > Status
2. Replace cartridges below 20%
3. Verify media type: Settings > Print > Paper Type should be "Photo Glossy"
4. Check temperature — prints can look faded if the paper is stored in direct sunlight

### Paper Jams

**Cause:** Incorrectly loaded paper or debris

**Solution:**
1. Do NOT force-remove jammed paper
2. Open the paper tray cover (right side panel)
3. Gently pull the paper toward you in one smooth motion
4. Clear any torn paper fragments
5. Reload the paper tray with fresh stock
6. Verify paper is loaded correctly (shiny side up, stack evenly)

### Prints Cutting Off

**Cause:** Incorrect overlay/template size

**Solution:**
1. Verify your overlay is sized to 1800×1200px (4×6" at 300dpi)
2. Check your event profile — portrait vs landscape setting
3. Test with the default HaloLight template to isolate the issue

## When to Contact Support

If none of the above solutions work, please submit a support ticket with:
- Description of the issue
- When it started
- What solutions you've already tried
- Photos of sample prints showing the issue`,
      },
      {
        categoryId: growth.id,
        authorId: userId,
        title: "Building a 6-Figure Photobooth Business",
        slug: "building-six-figure-photobooth-business",
        excerpt: "Proven strategies for growing your photobooth operation to six figures.",
        status: "published" as const,
        publishedAt: new Date(),
        views: 312,
        order: 1,
        tags: ["business", "growth", "revenue", "strategy"],
        content: `# Building a 6-Figure Photobooth Business

## The Revenue Formula

Reaching $100K+ annually with a photobooth business comes down to:

**Events per year × Average event value = Annual revenue**

Example: 50 events × $2,000 avg = $100,000

## Phase 1: Establish Your Foundation (Month 1-3)

### Define Your Market
- Weddings (high value, seasonal)
- Corporate events (consistent, high budget)
- School events (volume, lower price)
- Social gatherings (flexible, year-round)

### Set Your Pricing
Research local competitors and price competitively:
- Entry package: $800–1,000 (3 hours)
- Standard: $1,200–1,500 (4-5 hours)
- Premium: $2,000+ (full day, extras included)

## Phase 2: Build Your Pipeline (Month 3-6)

### Lead Generation Channels
1. **Wedding vendors** — Build relationships with photographers, venues, planners
2. **Google My Business** — Essential for local search visibility
3. **Social media** — Instagram and TikTok for visual marketing
4. **Referral program** — Offer 5-10% to clients who refer you

### Use Your CRM
HaloLight OS CRM helps you:
- Track every lead from first contact
- Follow up systematically
- Never lose a deal due to poor communication

## Phase 3: Scale (Month 6-12)

### Add a Second Booth
Once you're booking 6-8 events/month consistently, a second booth doubles your revenue potential.

### Build a Team
- Part-time event attendants ($15-20/hour)
- Start with trusted friends or family
- Create standard operating procedures

### Add Premium Services
- 360° video booth add-on (+$400-600/event)
- AI filter customization (+$200/event)
- Custom branding packages (+$300/event)

## Financial Management

Track these metrics monthly in HaloLight OS:
- Revenue (invoices marked as paid)
- Pipeline value (leads × estimated value)
- Conversion rate (leads → won)
- Average deal size

### Target Benchmarks
- Conversion rate: 40-60%
- Average deal size: $1,500-2,000
- Events per month: 8-10 at scale`,
      },
    ]);
    console.log("  ✓ Created 6 KB categories and 6 articles");
  } else {
    console.log("  - Skipped existing KB categories");
  }

  // ─── AI Suggested Questions ──────────────────────────────────────────────
  const existingSuggestions = await db.select().from(aiSuggestedQuestions).limit(1);
  if (existingSuggestions.length === 0) {
    await db.insert(aiSuggestedQuestions).values([
      { question: "What's included in the standard photobooth package?", category: "pricing", order: 1 },
      { question: "How do I book HaloLight for an event?", category: "booking", order: 2 },
      { question: "What are the space requirements for the photobooth?", category: "setup", order: 3 },
      { question: "How does digital photo delivery work?", category: "features", order: 4 },
      { question: "What is your cancellation policy?", category: "policy", order: 5 },
      { question: "Can I use a custom branded overlay?", category: "features", order: 6 },
      { question: "How long does setup take?", category: "setup", order: 7 },
      { question: "Do you offer multi-booth discounts?", category: "pricing", order: 8 },
    ]);
    console.log("  ✓ Created 8 AI suggested questions");
  } else {
    console.log("  - Skipped existing AI suggestions");
  }

  // ─── Community Channels & Posts ──────────────────────────────────────────
  const existingChannels = await db.select().from(communityChannels).limit(1);
  if (existingChannels.length === 0) {
    const channels = await db.insert(communityChannels).values([
      { createdBy: userId, name: "Announcements", slug: "announcements", description: "Official HaloLight updates, product news, and important announcements", type: "announcement" as const, icon: "Megaphone", order: 1 },
      { createdBy: userId, name: "General", slug: "general", description: "General discussion for all HaloLight operators", type: "public" as const, icon: "Hash", order: 2 },
      { createdBy: userId, name: "Tips & Tricks", slug: "tips-tricks", description: "Share your best tips, hacks, and pro techniques", type: "public" as const, icon: "Lightbulb", order: 3 },
      { createdBy: userId, name: "Business Growth", slug: "business-growth", description: "Marketing, sales, and scaling your photobooth business", type: "public" as const, icon: "TrendingUp", order: 4 },
      { createdBy: userId, name: "Equipment Help", slug: "equipment-help", description: "Technical support, setup questions, and hardware discussions", type: "public" as const, icon: "Wrench", order: 5 },
    ]).returning();

    const announcements = channels.find((c) => c.slug === "announcements")!;
    const general = channels.find((c) => c.slug === "general")!;
    const tips = channels.find((c) => c.slug === "tips-tricks")!;
    const growth = channels.find((c) => c.slug === "business-growth")!;
    const equipment = channels.find((c) => c.slug === "equipment-help")!;

    const posts = await db.insert(communityPosts).values([
      {
        channelId: announcements.id,
        userId,
        title: "HaloLight OS Phase 4 — Now Live! 🎉",
        content: `We're thrilled to announce that Phase 4 of HaloLight OS is now available to all partners!

What's new in this release:
- **Support Center** — Submit and track support tickets with real-time status updates
- **Knowledge Base** — Self-service articles organized by category with full search
- **AI Assistant** — Intelligent chat assistant trained on HaloLight content
- **Community** — Connect with fellow operators in topic-based channels

We're committed to building the most comprehensive platform for photobooth professionals. Stay tuned for Phase 5!

— The HaloLight Team`,
        isPinned: 1,
      },
      {
        channelId: general.id,
        userId,
        title: "Welcome to the HaloLight Community! 👋",
        content: `Hey everyone! Welcome to the HaloLight Community forum.

This is the place to connect with fellow photobooth operators, share experiences, ask questions, and grow together.

A few community guidelines:
- Be respectful and supportive
- Share knowledge freely — we all grow together
- No self-promotion or spam
- Keep discussions relevant to photobooth business and HaloLight OS

Looking forward to seeing this community thrive. Introduce yourself below!`,
        isPinned: 1,
      },
      {
        channelId: tips.id,
        userId,
        title: "My #1 tip for corporate events: branded props",
        content: `After doing 30+ corporate events this year, I've found that providing company-branded props dramatically increases photo volume and client satisfaction.

Simple branded props I've made:
- Custom speech bubbles with company slogans
- Logo cutouts on a stick
- Department-name frames

Clients absolutely love seeing their branding in the photos. It also makes for great internal communications content for the company.

Cost to make: $20-30 per event in materials. Perceived value: massive.

Anyone else doing custom props? Would love to hear your approaches!`,
      },
      {
        channelId: growth.id,
        userId,
        title: "How I landed my first $5,000 corporate contract",
        content: `Six months ago I was doing $800 weddings. Last month I signed a $5,000 annual contract with a tech company for their quarterly events. Here's what made the difference:

**1. Repositioned my offering**
Instead of "photobooth rental" I started calling it "branded experience activation" — sounds silly but it actually works for corporate buyers.

**2. Created a proposal deck**
One page with ROI messaging: how photos = social content = brand visibility. Finance and marketing speak the same language.

**3. Targeted event coordinators on LinkedIn**
Sent 50 personalized messages. Got 8 replies. Had 3 demos. Closed 1. That's a 2% conversion rate on cold outreach — normal for B2B.

**4. Offered a pilot event**
Instead of asking for the full annual contract upfront, I offered one event at a slight discount. They loved it, and the full contract followed.

The CRM in HaloLight OS has been invaluable for tracking this pipeline. Seeing everything in one place keeps me organized.

Happy to answer questions!`,
      },
      {
        channelId: equipment.id,
        userId,
        title: "Quick tip: prevent paper jams at outdoor events",
        content: `Learned this the hard way at an outdoor summer wedding...

Paper jams are way more likely in humid or hot conditions. My fix:

1. **Keep paper sealed until 30 min before using** — moisture in the paper is the #1 cause of jams
2. **Use a small cooling fan near the paper tray** — a $15 USB fan works great
3. **Keep 2 extra paper packs in the car** — always
4. **Run a 5-print test** as soon as you power up at each event

Also: if you do get a jam, always pull the paper OUT the same direction it was going (toward the front). Never pull it backward.

I also now carry a mini humidifier dehumidifier pack inside my printer case. No jams in 8 months since I started this routine.`,
      },
    ]).returning();

    await db.insert(communityReplies).values([
      { postId: posts[1]!.id, userId, content: "So excited about this community! I've been operating for 2 years in Phoenix, AZ. Mostly corporate and weddings. Looking forward to connecting with everyone!" },
      { postId: posts[2]!.id, userId, content: "Love this idea! I do logo props for tech companies and they always post them on internal Slack. One company event led to 3 referrals from employees at other companies." },
      { postId: posts[3]!.id, userId, content: "This is gold! The repositioning tip especially. I've been calling it photobooth rental which sounds so basic. Going to update all my materials." },
      { postId: posts[4]!.id, userId, content: "The humidity tip is clutch! Lost an hour at a garden party last summer to a paper jam. Wish I'd known this." },
    ]);

    await db.insert(communityReactions).values([
      { postId: posts[0]!.id, userId, emoji: "🎉" },
      { postId: posts[1]!.id, userId, emoji: "👍" },
      { postId: posts[2]!.id, userId, emoji: "💡" },
      { postId: posts[3]!.id, userId, emoji: "🔥" },
      { postId: posts[4]!.id, userId, emoji: "👏" },
    ]);

    console.log(`  ✓ Created ${channels.length} channels, ${posts.length} posts, with replies and reactions`);
  } else {
    console.log("  - Skipped existing community data");
  }

  console.log("  ✅ Phase 4 seed complete.");
}
