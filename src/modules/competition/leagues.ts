import { z } from "zod";
import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";
import { requireStudent } from "@/modules/auth/service";
import { AppError } from "@/lib/errors";
import { weekStart } from "@/lib/time";
export async function leagueView(tx: Database, user: User) {
  requireStudent(user);
  const week = weekStart();
  return {
    week,
    your_id: user.id,
    membership:
      (
        await tx.query<{ tier: number; withdrawn: boolean }>(
          "select g.tier,m.withdrawn from league_members m join league_groups g on g.id=m.group_id where m.user_id=$1 and m.week=$2",
          [user.id, week],
        )
      )[0] || null,
    entries: await tx.query<{
      user_id: string;
      display_name: string;
      points: number;
      rank: number;
    }>("select user_id,display_name,points::int,rank::int from league_ranking()"),
    history: await tx.query<{
      week: string;
      tier: number;
      final_points: number | null;
      final_rank: number | null;
      next_tier: number | null;
      withdrawn: boolean;
    }>(
      "select m.week::text,g.tier,m.final_points,m.final_rank,m.next_tier,m.withdrawn from league_members m join league_groups g on g.id=m.group_id where m.user_id=$1 and m.week<$2 order by m.week desc limit 20",
      [user.id, week],
    ),
  };
}
export async function joinLeague(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const { consent } = z.object({ consent: z.literal(true) }).parse(input);
  try {
    await tx.query("select join_league($1)", [consent]);
    return { joined: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes("LEAGUE_REJOIN_NEXT_WEEK"))
      throw new AppError(
        409,
        "Bu haftanın liginden ayrıldın. Gelecek hafta yeniden katılabilirsin.",
      );
    throw e;
  }
}
export async function leaveLeague(tx: Database, user: User) {
  requireStudent(user);
  await tx.query("select leave_league()");
  return { left: true };
}
