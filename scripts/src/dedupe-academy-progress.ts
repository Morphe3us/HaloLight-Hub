import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

async function main() {
  const before = await db.execute(sql`
    select count(*)::int as duplicate_groups
    from (
      select user_id, lesson_id
      from user_lesson_progress
      group by user_id, lesson_id
      having count(*) > 1
    ) duplicate_progress
  `);

  const duplicateGroups = Number(before.rows[0]?.duplicate_groups ?? 0);
  if (duplicateGroups === 0) {
    console.log("Academy progress dedupe: no duplicate groups found.");
    return;
  }

  const deleted = await db.execute(sql`
    with ranked_progress as (
      select
        id,
        row_number() over (
          partition by user_id, lesson_id
          order by
            (completed_at is not null) desc,
            completed_at desc nulls last,
            watch_percent desc,
            updated_at desc,
            created_at desc,
            id desc
        ) as row_rank
      from user_lesson_progress
    )
    delete from user_lesson_progress
    where id in (
      select id
      from ranked_progress
      where row_rank > 1
    )
    returning id
  `);

  console.log(
    `Academy progress dedupe: removed ${deleted.rows.length} duplicate rows from ${duplicateGroups} duplicate groups.`,
  );
}

main().catch((error) => {
  console.error("Academy progress dedupe failed:", error);
  process.exit(1);
});
