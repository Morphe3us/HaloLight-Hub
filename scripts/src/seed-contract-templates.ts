import { db, contractTemplates } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { DEFAULT_CONTRACT_TEMPLATES } from "../../artifacts/api-server/src/lib/defaultContractTemplates";

async function seedContractTemplates() {
  console.log("Seeding default contract templates for all 8 languages...");

  let created = 0;
  let skipped = 0;

  for (const tpl of DEFAULT_CONTRACT_TEMPLATES) {
    const [existing] = await db
      .select()
      .from(contractTemplates)
      .where(
        and(
          eq(contractTemplates.language, tpl.language),
          eq(contractTemplates.isDefault, true),
        ),
      );

    if (existing) {
      console.log(`  ↳ [${tpl.language}] already exists — skipping`);
      skipped++;
    } else {
      await db.insert(contractTemplates).values({
        language: tpl.language,
        title: tpl.title,
        content: tpl.content,
        isDefault: true,
        category: "photobooth",
      });
      console.log(`  ↳ [${tpl.language}] created: ${tpl.title}`);
      created++;
    }
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
}

seedContractTemplates()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
