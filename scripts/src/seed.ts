import {
  db,
  onboardingStepsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { seedAcademy } from "./seed-academy";
import { seedCrm } from "./seed-crm";
import { seedPhase4 } from "./seed-phase4";
import { seedPhase5 } from "./seed-phase5";
import { seedRevenueData } from "./seed-revenue";
import { seedPhase6 } from "./seed-phase6";

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function isExplicitDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

function shouldSeedDemoAcademy(): boolean {
  const configured = parseBooleanEnv(process.env.SEED_DEMO_ACADEMY);
  if (configured !== null) return configured;
  return false;
}

function shouldSeedDemoData(): boolean {
  const configured = parseBooleanEnv(process.env.SEED_DEMO_DATA);
  if (configured !== null) return configured;
  return isExplicitDevelopment();
}

function resolveSeedAdminConfig(): { clerkId: string; email: string } {
  const explicitClerkId = process.env.SEED_ADMIN_CLERK_ID?.trim();
  const explicitEmail = process.env.SEED_ADMIN_EMAIL?.trim();

  if (!isExplicitDevelopment() && !explicitClerkId && !explicitEmail) {
    throw new Error(
      "Seed requires SEED_ADMIN_CLERK_ID or SEED_ADMIN_EMAIL unless NODE_ENV=development.",
    );
  }

  return {
    clerkId: explicitClerkId || "manual_seed_admin_001",
    email: explicitEmail || "admin@halolight.local",
  };
}

async function ensureSeedUser() {
  const { clerkId, email } = resolveSeedAdminConfig();
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (existing) {
    console.log(`  - Skipped existing seed user: ${existing.email}`);
    return existing.id;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      clerkId,
      email,
      fullName: "HaloLight Demo Admin",
      companyName: "HaloLight",
      companyAddress: "24 Rue de la Lumiere, 75002 Paris, France",
      phone: "+33 1 23 45 67 89",
      website: "https://halolight.example",
      taxId: "FR12345678901",
      providerSignature: "/HaloLight Demo Admin/",
      providerSignerTitle: "Managing Director",
      role: "admin",
    })
    .returning({ id: usersTable.id });
  console.log(`  ✓ Created seed user: ${email}`);
  return created.id;
}

async function seed() {
  console.log("Seeding Phase 1 demo data...");

  // ─── Onboarding Steps ───────────────────────────────────────────────────
  const steps = [
    {
      key: "complete_profile",
      title: "Complete your profile",
      description:
        "Add your full name, company name, and phone number so we can personalize your experience.",
      order: 1,
      isRequired: true,
      category: "account",
      pointsReward: 20,
    },
    {
      key: "set_language",
      title: "Choose your language",
      description:
        "Select your preferred language. HaloLight OS supports English, French, Spanish, German, Italian, Polish, Portuguese, and Dutch.",
      order: 2,
      isRequired: true,
      category: "account",
      pointsReward: 10,
    },
    {
      key: "explore_academy",
      title: "Explore the Academy",
      description:
        "Browse our video courses and start your first lesson to become a HaloLight expert.",
      order: 3,
      isRequired: false,
      category: "learning",
      pointsReward: 30,
    },
    {
      key: "create_first_event",
      title: "Create your first event",
      description:
        "Add an upcoming event to start tracking your bookings and managing your equipment.",
      order: 4,
      isRequired: true,
      category: "operations",
      pointsReward: 25,
    },
    {
      key: "register_equipment",
      title: "Register your equipment",
      description:
        "Add your HaloLight equipment with serial numbers and purchase dates for warranty tracking.",
      order: 5,
      isRequired: false,
      category: "equipment",
      pointsReward: 20,
    },
    {
      key: "invite_team",
      title: "Invite your team",
      description:
        "Add team members or collaborators to your HaloLight OS workspace.",
      order: 6,
      isRequired: false,
      category: "account",
      pointsReward: 15,
    },
    {
      key: "setup_notifications",
      title: "Configure notifications",
      description:
        "Set up your notification preferences so you never miss an important update.",
      order: 7,
      isRequired: false,
      category: "account",
      pointsReward: 10,
    },
    {
      key: "explore_resources",
      title: "Download marketing resources",
      description:
        "Access our library of branded marketing materials, social media templates, and print assets.",
      order: 8,
      isRequired: false,
      category: "marketing",
      pointsReward: 15,
    },
  ];

  for (const step of steps) {
    const existing = await db
      .select()
      .from(onboardingStepsTable)
      .where(eq(onboardingStepsTable.key, step.key));

    if (existing.length === 0) {
      await db.insert(onboardingStepsTable).values(step);
      console.log(`  ✓ Created onboarding step: ${step.key}`);
    } else {
      console.log(`  - Skipped existing step: ${step.key}`);
    }
  }

  // ─── Demo Admin User ─────────────────────────────────────────────────────
  const seedDemoAcademy = shouldSeedDemoAcademy();
  const seedDemoData = shouldSeedDemoData();

  if (seedDemoAcademy) {
    await seedAcademy();
  } else {
    console.log("\n📚 Skipped Academy demo data. Set SEED_DEMO_ACADEMY=true to opt in.");
  }
  const seedUserId = await ensureSeedUser();
  if (seedDemoData) {
    await seedPhase4(seedUserId);
    const demoClientIds = await seedPhase5();
    await seedCrm(seedUserId);
    await seedRevenueData(demoClientIds);
    await seedPhase6(demoClientIds);
  } else {
    console.log("\n🧹 Skipped CRM/revenue/support demo data. Set SEED_DEMO_DATA=true to opt in.");
  }

  console.log("\n✅ Seed complete.");
  console.log(
    "   Note: Production JIT provisioning is disabled by default unless ALLOW_PUBLIC_SIGNUPS=true.",
  );
  console.log(
    "   Admins can manage roles and active status from the Users admin page.",
  );

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
