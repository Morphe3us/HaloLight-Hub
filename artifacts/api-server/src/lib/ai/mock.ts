// ─── Mock AI Provider ─────────────────────────────────────────────────────────
// Used when no API keys are configured. Generates rich, context-aware responses
// using the RAG sources provided. Replace with a real provider in production.

import type { AIProvider, AIMessage, AIStreamChunk, RAGSource, SuggestedAction, AIProviderOptions } from "./provider";

// Photobooth business domain knowledge for mock responses
const DOMAIN_RESPONSES: Array<{
  patterns: string[];
  response: (sources: RAGSource[]) => string;
}> = [
  {
    patterns: ["paper", "stock", "glossy", "matte", "strip", "4x6", "2x6"],
    response: (sources) => {
      const ref = sources.find((s) => s.type === "kb");
      const base = `Your photo paper inventory is critical to uninterrupted event operations. Standard 4×6 glossy paper packs yield approximately 400 prints, while 2×6 strips give you 800 per pack.\n\nWhen you're running low (typically below 3 packs), you should reorder immediately — factor in 5–7 business days for delivery. I recommend keeping a minimum of 6 packs as a safety buffer for busy event seasons.`;
      return ref
        ? `${base}\n\nYou can find detailed ordering guidance in the **${ref.title}** article in your Knowledge Base.`
        : base;
    },
  },
  {
    patterns: ["ribbon", "ymco", "dnp", "cartridge", "ink"],
    response: (sources) => {
      const ref = sources.find((s) => s.type === "kb");
      const base = `Ribbon cartridges are consumable per-print items. A single DNP DS40 YMCO ribbon yields about 400 prints per roll at standard 4×6 size.\n\nFor high-volume events (200+ guests), bring at least 2 ribbon rolls. Signs of a failing ribbon include colour banding, streaks, or incomplete prints — replace immediately if you notice these.`;
      return ref
        ? `${base}\n\nThe **${ref.title}** guide in your Knowledge Base has full replacement instructions.`
        : base;
    },
  },
  {
    patterns: ["maintenance", "service", "clean", "calibrate", "tune"],
    response: (sources) => {
      const ref = sources.find((s) => s.type === "kb");
      const base = `Regular maintenance keeps your booth performing at its best and protects your warranty. Here's the recommended schedule:\n\n• **Weekly**: Wipe exterior, clean print station, check paper path for debris\n• **Monthly**: Clean printer heads with cleaning card, inspect ribbon mechanism\n• **Every 6 months**: Full service with a certified technician — calibration, belt tension, firmware update\n\nFor HaloLight Pro 2 and Elite units, a 6-month service costs approximately $149–$229 and is covered under the annual maintenance plan.`;
      return ref
        ? `${base}\n\nSee **${ref.title}** for a full maintenance checklist.`
        : base;
    },
  },
  {
    patterns: ["warranty", "expire", "expired", "coverage", "claim"],
    response: (sources) => `Your HaloLight warranty covers manufacturing defects, component failures, and software issues for the warranty period from purchase date.\n\n**What's covered:**\n- Printer mechanism failures\n- Electronic component defects\n- Touch screen malfunctions\n- Software bugs\n\n**What's not covered:**\n- Physical damage from accidents\n- Consumable wear (ribbons, paper)\n- Damage from improper maintenance\n\nIf your warranty is expiring soon, consider our extended service plan which provides continued coverage and priority support. You can view your warranty status on the Equipment page.\n\nTo file a warranty claim, open a support ticket and select "Warranty Claim" as the category.`,
  },
  {
    patterns: ["booking", "book", "reserve", "schedule", "event"],
    response: (sources) => {
      const ref = sources.find((s) => s.type === "kb" || s.type === "product");
      const base = `To book your photobooth for an event, here's the recommended workflow:\n\n1. **Create a Lead** in the CRM with the client's event details\n2. **Send a Quote** with your chosen package and pricing\n3. Once accepted, **generate a Contract** for the client to sign\n4. Issue an **Invoice** after the contract is signed\n5. Log the **Event** with date, venue, and expected guest count\n\nThis full-cycle approach keeps all your bookings organised in one place and gives you a clear revenue pipeline.`;
      return ref
        ? `${base}\n\nCheck out **${ref.title}** for more tips on managing your booking pipeline.`
        : base;
    },
  },
  {
    patterns: ["print", "photo", "quality", "blur", "dark", "bright", "colour", "color"],
    response: () => `Print quality issues are usually caused by one of four things:\n\n**1. Ribbon/Paper mismatch** — Always use the ribbon type that matches your paper stock. Mixing brands can cause colour shift.\n\n**2. Printer head contamination** — Run a cleaning card (1–2 passes) to clear debris from the print head.\n\n**3. Calibration drift** — After extended use, colour profiles can drift. Access printer settings and run an auto-calibration.\n\n**4. Environmental factors** — High humidity affects dye-sublimation prints. Store paper in sealed packaging and avoid areas with >60% humidity.\n\nIf the problem persists after trying these steps, it may be a hardware issue — open a support ticket and we'll arrange a service visit.`,
  },
  {
    patterns: ["setup", "install", "space", "power", "outlet", "floor"],
    response: () => `Here are the standard setup requirements for HaloLight units:\n\n**Space**: Minimum 8×8 ft (2.4×2.4m) footprint including backdrop. For 360° units, allow 12×12 ft.\n\n**Power**: Single standard 110V/15A outlet within 10 feet. Do not run on extension cords for events over 4 hours.\n\n**Surface**: Level, stable flooring. Avoid soft carpets for 360° platforms — use a hard base mat.\n\n**Lighting**: The booth performs best in indoor environments with controlled lighting. Direct sunlight on the camera causes overexposure.\n\n**Setup time**: Allow 1.5–2 hours for full setup and testing before guests arrive.`,
  },
  {
    patterns: ["pricing", "price", "cost", "package", "quote", "rate", "charge"],
    response: () => `Photobooth pricing varies based on duration, package tier, and event type. Common pricing structures:\n\n**Hourly Packages:**\n- 3-hour standard: $800–$1,200\n- 4-hour premium: $1,200–$1,800\n- 6-hour full-day: $2,000–$3,500\n\n**Add-ons that command premium rates:**\n- Custom branded overlays: +$150–$300\n- 360° platform upgrade: +$400–$800\n- Attendant (recommended): included or +$200\n- Print station (additional): +$300\n\nYou can build custom quotes using the Quotes module in your portal — it auto-calculates taxes and generates a professional PDF for your clients.`,
  },
  {
    patterns: ["cancel", "refund", "deposit", "policy"],
    response: () => `A clear cancellation policy protects your business. The industry-standard approach:\n\n**Deposits**: Collect 25–50% at booking confirmation. This is non-refundable within 14 days of the event.\n\n**Cancellation windows:**\n- 30+ days before: Full deposit refund\n- 14–30 days before: 50% deposit retained\n- Less than 14 days: Full deposit retained\n- Day-of cancellation: Full payment due\n\nFor force majeure (venue closure, extreme weather), consider offering a free reschedule within 6 months.\n\nMake sure your cancellation terms are clearly stated in all contracts. You can customise your contract templates in the Contracts module.`,
  },
  {
    patterns: ["error", "not working", "broken", "fail", "jam", "stuck", "problem", "issue"],
    response: (sources) => {
      const base = `I'm sorry to hear you're experiencing an issue. Let me help you troubleshoot.\n\n**Common causes and quick fixes:**\n\n🖨️ **Paper jam**: Open the paper compartment, carefully remove the jammed sheet pulling in the print direction, then reload. Run 1–2 blank prints to clear.\n\n⚡ **Power/restart issues**: Hold the power button for 10 seconds for a hard reset. Check that the power cable is fully seated.\n\n🔌 **Connection issues**: Re-seat USB/network cables. On iPad booths, toggle WiFi off/on.\n\n📱 **Software crash**: Force-quit and reopen the booth app. Clear cache if problems persist.\n\nIf none of these resolve the issue, please open a support ticket — our technical team typically responds within 2 hours during business hours.`;
      return base;
    },
  },
  {
    patterns: ["academy", "learn", "course", "lesson", "training", "tutorial", "guide"],
    response: (sources) => {
      const academySrc = sources.find((s) => s.type === "academy");
      const base = `The HaloLight Academy has structured courses to help you get the most out of your equipment and grow your business.\n\n**Available learning paths:**\n- **Getting Started**: Booth setup, first event prep, software walkthrough\n- **Advanced Operations**: Troubleshooting, maintenance, advanced printing\n- **Business Growth**: Pricing strategy, marketing, client management\n- **Events & CRM**: Lead management, quotes, invoicing workflow\n\nCompleting courses also contributes to your Customer Success score and unlocks coaching recommendations.`;
      return academySrc
        ? `${base}\n\n**"${academySrc.title}"** looks particularly relevant to your question — check it out in the Academy.`
        : base;
    },
  },
];

function generateMockResponse(
  query: string,
  sources: RAGSource[]
): string {
  const lower = query.toLowerCase();

  // Find the best matching domain response
  let bestMatch: { patterns: string[]; response: (sources: RAGSource[]) => string } | undefined;
  let bestScore = 0;

  for (const entry of DOMAIN_RESPONSES) {
    const score = entry.patterns.filter((p) => lower.includes(p)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch && bestScore > 0) {
    return bestMatch.response(sources);
  }

  // Generic fallback using whatever sources were found
  if (sources.length > 0) {
    const srcList = sources
      .slice(0, 3)
      .map((s) => `- **${s.title}** (${s.type})`)
      .join("\n");
    return `Great question! Based on your query, here are some relevant resources from your HaloLight knowledge base that should help:\n\n${srcList}\n\nI'd recommend reviewing these first. If you need more specific help — for example, with a technical issue, a booking, or equipment maintenance — feel free to ask with more detail and I'll do my best to guide you.\n\nYou can also open a support ticket if you need direct help from the HaloLight team.`;
  }

  return `Thanks for your question! I'm here to help with everything related to your HaloLight photobooth business.\n\nI can assist with:\n- **Equipment & Maintenance** — troubleshooting, service schedules, warranty queries\n- **Consumables** — paper and ribbon stock management, reorder guidance\n- **Business Operations** — bookings, quotes, contracts, invoicing\n- **Academy** — learning resources and training content\n- **Support** — opening tickets for technical issues\n\nCould you give me a bit more detail about what you need help with today?`;
}

// ─── Mock Provider Implementation ────────────────────────────────────────────

export class MockAIProvider implements AIProvider {
  readonly name = "Mock (Demo)";
  readonly modelId = "mock-v1";

  async *chat(
    messages: AIMessage[],
    systemPrompt: string,
    sources: RAGSource[],
    _options?: AIProviderOptions
  ): AsyncGenerator<AIStreamChunk> {
    // Get the last user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const query = lastUser?.content ?? "";

    const fullResponse = generateMockResponse(query, sources);

    // Simulate streaming — yield word by word with small delays
    const words = fullResponse.split(" ");
    let buffer = "";
    for (let i = 0; i < words.length; i++) {
      buffer += (i === 0 ? "" : " ") + words[i];
      // Yield in chunks of ~5 words for smooth streaming
      if ((i + 1) % 5 === 0 || i === words.length - 1) {
        yield { type: "content", content: buffer };
        buffer = "";
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 30));
      }
    }

    // Yield sources
    if (sources.length > 0) {
      yield { type: "sources", sources };
    }

    yield { type: "done" };
  }
}
