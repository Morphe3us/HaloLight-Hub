import type { ActionHandler } from "../types";

// Email template generation — stores the rendered email in the log detail.
// No send occurs at this stage. Future integration: pass the output to
// SendGrid / Postmark / Resend by implementing a DeliveryChannel interface
// and wiring it in here.

export const actionEmailTemplate: ActionHandler = async (rule, match, _executionId) => {
  const { targetUserId, detail } = match;
  if (!targetUserId) return { success: false, detail: { error: "No targetUserId" } };

  const cfg = rule.actionConfig;

  const subject = interpolate(
    cfg.emailSubject ?? defaultSubject(rule.triggerType),
    detail
  );
  const body = interpolate(
    cfg.emailBodyTemplate ?? defaultBodyTemplate(rule.triggerType),
    detail
  );

  const emailTemplate = {
    to: targetUserId,
    subject,
    htmlBody: renderHtml(subject, body),
    textBody: body,
    generatedAt: new Date().toISOString(),
    status: "generated_not_sent",
  };

  return { success: true, detail: { emailTemplate } };
};

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(data[key] ?? ""));
}

function renderHtml(subject: string, body: string): string {
  const paragraphs = body
    .split("\n\n")
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <div style="background:#4f46e5;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">HaloLight OS</h1>
  </div>
  <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;">
    <h2 style="font-size:18px;margin:0 0 16px;">${subject}</h2>
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="font-size:12px;color:#6b7280;margin:0;">
      You're receiving this because you're a HaloLight OS client.
      This email was generated automatically by the HaloLight Automation Engine.
    </p>
  </div>
</body>
</html>`;
}

function defaultSubject(triggerType: string): string {
  const subjects: Record<string, string> = {
    onboarding_stalled: "Complete Your HaloLight Onboarding",
    inactive_user: "We haven't seen you in a while, {{userName}}",
    low_academy_progress: "Continue Your Academy Training",
    no_events_created: "Ready to Book Your First Event?",
    no_quotes_created: "Start Sending Quotes Today",
    low_consumable_stock: "Low Stock Alert: {{catalogName}} Running Low",
    warranty_expiring: "Action Required: Warranty Expiring in {{daysUntilExpiry}} Days",
    high_performer_detected: "🏆 You're a HaloLight Top Performer!",
    upsell_opportunity_detected: "Exclusive Growth Opportunity for {{userName}}",
    coaching_recommendation_generated: "A Coaching Session Has Been Recommended for You",
  };
  return subjects[triggerType] ?? "An Update from HaloLight";
}

function defaultBodyTemplate(triggerType: string): string {
  const bodies: Record<string, string> = {
    onboarding_stalled: `Hi {{userName}},\n\nYou've completed {{completionPct}}% of your HaloLight onboarding journey.\n\nFinishing the remaining steps will unlock the full power of the platform, including equipment tracking, automated quotes, and the AI Assistant.\n\nLog in now to continue: https://halolight.app/onboarding\n\nBest,\nThe HaloLight Team`,
    inactive_user: `Hi {{userName}},\n\nWe noticed you haven't been active on HaloLight OS for {{daysSinceActivity}} days.\n\nYour business doesn't sleep — and neither should your tools. Log back in to check on your equipment, quotes, and upcoming events.\n\nBest,\nThe HaloLight Team`,
    low_academy_progress: `Hi {{userName}},\n\nYou've completed {{completedLessons}} of {{totalLessons}} lessons in the HaloLight Academy.\n\nContinuing your training will help you serve clients better and grow your photobooth business. Your next lesson is ready.\n\nBest,\nThe HaloLight Team`,
    no_events_created: `Hi {{userName}},\n\nIt's been {{daysSinceSignup}} days since you joined HaloLight OS — but we haven't seen your first event yet!\n\nCreating events helps you track bookings, manage clients, and generate invoices automatically.\n\nBest,\nThe HaloLight Team`,
    no_quotes_created: `Hi {{userName}},\n\nSending quotes is one of the fastest ways to grow revenue with HaloLight OS.\n\nCreate a professional quote in under 2 minutes and share it directly with clients. Get started today.\n\nBest,\nThe HaloLight Team`,
    low_consumable_stock: `Hi {{userName}},\n\nYour stock of {{catalogName}} (SKU: {{sku}}) is running low with only {{daysRemaining}} days remaining.\n\nLog in to HaloLight OS to place a reorder before you run out.\n\nBest,\nThe HaloLight Team`,
    warranty_expiring: `Hi {{userName}},\n\nThe warranty on your {{productModel}} (S/N: {{serialNumber}}) expires in {{daysUntilExpiry}} days.\n\nNow is a good time to review extended coverage options or plan for maintenance.\n\nBest,\nThe HaloLight Team`,
    high_performer_detected: `Hi {{userName}},\n\nIncredible work! You've created {{quotesInPeriod}} quotes and {{eventsInPeriod}} events in the last {{periodDays}} days.\n\nYou're operating at a high level. Your coach will be in touch with growth recommendations tailored to your business.\n\nBest,\nThe HaloLight Team`,
    upsell_opportunity_detected: `Hi {{userName}},\n\nBased on your activity and equipment portfolio, we believe you're ready for the next level: {{suggestedProduct}}.\n\nReach out to your HaloLight coach to explore this opportunity.\n\nBest,\nThe HaloLight Team`,
    coaching_recommendation_generated: `Hi {{userName}},\n\nYour academy progress is at {{academyProgressPct}}%, and a coaching session has been recommended to help you accelerate.\n\nYour coach will follow up shortly to schedule a 1:1 session.\n\nBest,\nThe HaloLight Team`,
  };
  return bodies[triggerType] ?? `Hi {{userName}},\n\nYou have a new update from HaloLight OS.\n\nBest,\nThe HaloLight Team`;
}
