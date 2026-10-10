import { z } from "zod";
import type { Database } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { User } from "@/types/domain";
import { requireStudent } from "@/modules/auth/service";
import { today, weekStart, addDays } from "@/lib/time";
import { streakSummary, type LearningDay } from "./streak";
const errors: Record<string, string> = {
  LEVEL_REQUIRED: "Bu ürünün seviye şartına henüz ulaşmadın.",
  INSUFFICIENT_TOKENS: "Bu ürün için yeterli elmasın yok.",
  ALREADY_OWNED: "Bu ürün envanterinde zaten var.",
  REQUEST_CONFLICT: "Bu işlem anahtarı başka bir satın alımda kullanılmış.",
  PRODUCT_NOT_FOUND: "Ürün bulunamadı.",
  OWNED_COSMETIC_ONLY: "Önce bu profil ürününü edinmelisin.",
  PAST_WEEK_ONLY: "Son yedi gündeki geçmiş bir günü seç.",
  MISSED_LEARNING_DAY_ONLY: "Bu gün için telafi veya seri koruyucu gerekmiyor.",
  CURRENT_WEEK_ONLY: "Ücretsiz telafi bu haftadaki bir gün için kullanılabilir.",
  COMPLETE_TODAY_FIRST: "Ücretsiz telafi için önce bugünün günlük hedefini tamamla.",
  MAKEUP_ALREADY_USED: "Bu haftanın ücretsiz telafi hakkını kullandın.",
  SHIELD_REQUIRED: "Envanterinde seri koruyucu bulunmuyor.",
  WEEK_NOT_FINISHED: "Sandık haftanın son günlük hedefinden sonra açılabilir.",
  SEVEN_GOALS_REQUIRED: "Sandık için yedi günlük hedefin tamamlanması gerekiyor.",
};
export async function rewardSummary(tx: Database, user: User) {
  const [wallet] = await tx.query<{ xp: number; tokens: number }>(
    "select xp,tokens from reward_accounts where user_id=$1",
    [user.id],
  );
  const [cosmetics] = await tx.query<{
    avatar: string | null;
    outfit: string | null;
    frame: string | null;
    theme: string | null;
    banner: string | null;
    font: string | null;
  }>(
    "select a.value avatar,o.value outfit,f.value frame,t.value theme,b.value banner,n.value font from profile_cosmetics c left join shop_products a on a.id=c.avatar_id left join shop_products o on o.id=c.outfit_id left join shop_products f on f.id=c.frame_id left join shop_products t on t.id=c.theme_id left join shop_products b on b.id=c.banner_id left join shop_products n on n.id=c.font_id where c.user_id=$1",
    [user.id],
  );
  const days = await tx.query<LearningDay>(
    "select date::text,actual_learning,goal_completed,makeup_completed,streak_protected,neutral from learning_calendar()",
  );
  const [photo] = await tx.query<{ version: string }>(
    "select version from profile_photos where user_id=$1",
    [user.id],
  );
  return {
    photo_url: photo ? `/api/students/${user.id}/photo?v=${photo.version}` : null,
    ...(wallet || { xp: 0, tokens: 0 }),
    streak: streakSummary(days, today()).current,
    cosmetics: cosmetics || {
      avatar: null,
      outfit: null,
      frame: null,
      theme: null,
      banner: null,
      font: null,
    },
  };
}
export async function rewardView(tx: Database, user: User) {
  requireStudent(user);
  const date = today(),
    week = weekStart(date);
  const days = await tx.query<LearningDay>(
    "select date::text,actual_learning,goal_completed,makeup_completed,streak_protected,neutral from learning_calendar()",
  );
  const claimed = await tx.query<{ week: string }>(
    "select week::text from weekly_rewards where user_id=$1",
    [user.id],
  );
  const makeups = await tx.query<{ week: string; date: string }>(
    "select week::text,date::text from weekly_makeups where user_id=$1 and week=$2",
    [user.id, week],
  );
  const weeks = [...new Set([week, ...days.map((d) => weekStart(d.date))])]
    .sort()
    .reverse()
    .map((w) => {
      const completed = days.filter(
        (d) => weekStart(d.date) === w && (d.goal_completed || d.makeup_completed),
      ).length;
      const opened = claimed.some((c) => c.week === w);
      return {
        week: w,
        completed,
        claimed: opened,
        available: completed === 7 && addDays(w, 6) <= date && !opened,
      };
    })
    .filter((w, index) => index < 8 || w.available);
  return {
    wallet: await rewardSummary(tx, user),
    products: await tx.query("select * from shop_products order by price,id"),
    inventory: await tx.query("select * from inventory where user_id=$1", [user.id]),
    achievements: await tx.query(
      "select achievement_id,earned_at from achievements where user_id=$1 order by earned_at",
      [user.id],
    ),
    transactions: await tx.query(
      "select id,reason,amount,created_at,'xp' kind from xp_transactions where user_id=$1 and amount>0 union all select id,reason,amount,created_at,'token' kind from token_transactions where user_id=$1 order by created_at desc limit 30",
      [user.id],
    ),
    days: days.filter((d) => d.date >= week),
    streak: streakSummary(days, date),
    week,
    today: date,
    weeks,
    makeup_used: makeups[0]?.date || null,
    makeup_available:
      !makeups.length &&
      !!days.find((d) => d.date === date && d.actual_learning && d.goal_completed),
    missed_days: days
      .filter(
        (d) =>
          d.date < date &&
          d.date >= addDays(date, -7) &&
          !d.neutral &&
          !d.goal_completed &&
          !d.makeup_completed &&
          !d.streak_protected,
      )
      .map((d) => d.date),
  };
}
export async function protectDay(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const { date, method } = z
    .object({ date: z.iso.date(), method: z.enum(["makeup", "shield"]) })
    .parse(input);
  return rewardAction(() => tx.query("select protect_learning_day($1,$2)", [date, method]), {
    protected: true,
  });
}
export async function claimChest(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const { week } = z.object({ week: z.iso.date() }).parse(input);
  return rewardAction(() => tx.query("select claim_weekly_chest($1)", [week]), { claimed: true });
}
async function rewardAction<T>(action: () => Promise<unknown>, result: T) {
  try {
    await action();
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const match = Object.keys(errors).find((code) => message.includes(code));
    if (match) throw new AppError(409, errors[match]);
    throw err;
  }
}
export async function purchase(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const data = z
    .object({ product_id: z.string().min(1).max(100), request_key: z.uuid() })
    .parse(input);
  try {
    return (
      await tx.query("select * from purchase_product($1,$2)", [data.product_id, data.request_key])
    )[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const match = Object.keys(errors).find((code) => message.includes(code));
    if (match) throw new AppError(409, errors[match]);
    throw err;
  }
}
export async function equip(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const { product_id } = z.object({ product_id: z.string().min(1).max(100) }).parse(input);
  try {
    await tx.query("select equip_product($1)", [product_id]);
    return { equipped: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const match = Object.keys(errors).find((code) => message.includes(code));
    if (match) throw new AppError(409, errors[match]);
    throw err;
  }
}
export async function classRanking(
  tx: Database,
  user: User,
  courseId: string,
  params: URLSearchParams,
) {
  requireStudent(user);
  const date = z.iso.date().parse(params.get("week") || today());
  return {
    week: weekStart(date),
    entries: await tx.query(
      "select user_id,display_name,xp::int,rank::int from class_ranking($1,$2)",
      [courseId, weekStart(date)],
    ),
    your_id: user.id,
  };
}
