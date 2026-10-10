import type { RootDatabase } from "@/lib/db";

export async function closeExpiredLeagues(db: RootDatabase) {
  return db.transaction(async (tx) => {
    const groups = await tx.query<{ id: string }>(
      "select id from league_groups where closed_at is null and week+6<(now() at time zone 'Europe/Istanbul')::date order by week,id for update skip locked limit 100",
    );
    for (const group of groups) await tx.query("select close_league($1)", [group.id]);
    return groups.length;
  });
}
