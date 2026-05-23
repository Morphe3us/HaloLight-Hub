import { db, onboardingStepsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { seedAcademy } from "./seed-academy";
import { seedCrm } from "./seed-crm";
import { seedPhase4 } from "./seed-phase4";
import { seedPhase5 } from "./seed-phase5";
import { seedRevenueData } from "./seed-revenue";

async function seed() {
  console.log("Seeding Phase 1 demo data...");

  // ─── Onboarding Steps ───────────────────────────────────────────────────
  const steps = [
    {
      key: "complete_profile",
      title: "Complete your profile",
      description: "Add your full name, company name, and phone number so we can personalize your experience.",
      order: 1,
      isRequired: true,
      category: "account",
      pointsReward: 20,
    },
    {
      key: "set_language",
      title: "Choose your language",
      description: "Select your preferred language. HaloLight OS supports English, French, Spanish, German, Italian, Polish, Portuguese, and Dutch.",
      order: 2,
      isRequired: true,
      category: "account",
      pointsReward: 10,
    },
    {
      key: "explore_academy",
      title: "Explore the Academy",
      description: "Browse our video courses and start your first lesson to become a HaloLight expert.",
      order: 3,
      isRequired: false,
      category: "learning",
      pointsReward: 30,
    },
    {
      key: "create_first_event",
      title: "Create your first event",
      description: "Add an upcoming event to start tracking your bookings and managing your equipment.",
      order: 4,
      isRequired: true,
      category: "operations",
      pointsReward: 25,
    },
    {
      key: "register_equipment",
      title: "Register your equipment",
      description: "Add your HaloLight equipment with serial numbers and purchase dates for warranty tracking.",
      order: 5,
      isRequired: false,
      category: "equipment",
      pointsReward: 20,
    },
    {
      key: "invite_team",
      title: "Invite your team",
      description: "Add team members or collaborators to your HaloLight OS workspace.",
      order: 6,
      isRequired: false,
      category: "account",
      pointsReward: 15,
    },
    {
      key: "setup_notifications",
      title: "Configure notifications",
      description: "Set up your notification preferences so you never miss an important update.",
      order: 7,
      isRequired: false,
      category: "account",
      pointsReward: 10,
    },
    {
      key: "explore_resources",
      title: "Download marketing resources",
      description: "Access our library of branded marketing materials, social media templates, and print assets.",
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
  // Note: The clerk_id for the demo admin needs to be updated with a real Clerk user ID
  // after first login. This is a placeholder that gets replaced by JIT provisioning.
  await seedAcademy();
  await seedCrm();
  await seedPhase4();
  await seedPhase5();
  await seedRevenueData();

  console.log("\n✅ Seed complete.");
  console.log("   Note: User records are created automatically on first login via JIT provisioning.");
  console.log("   To make a user an admin, update their role in the database after first login.");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
