import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse, createObjective, joinCourse } from "@/modules/courses/service";
import { saveActivity, publishActivity } from "@/modules/activities/service";
import { ensureDailyPlan, startPlanItem } from "@/modules/scheduling/service";
import { submitAnswer, startPractice } from "@/modules/learning/service";
import {
  rewardSummary,
  rewardView,
  purchase,
  equip,
  classRanking,
  protectDay,
  claimChest,
} from "@/modules/rewards/service";
import { today, addDays, weekStart } from "@/lib/time";
import type { User, Course } from "@/types/domain";
let db: RootDatabase, teacher: User, student: User, other: User, courses: Course[];
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "reward-teacher@test.edu",
      display_name: "Öğretmen",
      password: "TestPass2026!",
      role: "teacher",
    },
    true,
  );
  student = await createLocalUser(db, {
    email: "reward-student@test.edu",
    display_name: "Öğrenci",
    password: "TestPass2026!",
    role: "student",
  });
  other = await createLocalUser(db, {
    email: "reward-other@test.edu",
    display_name: "Başka Öğrenci",
    password: "TestPass2026!",
    role: "student",
  });
  courses = [];
  for (const title of ["Algoritmalar", "Biyoloji"]) {
    const c = await asUser(db, teacher.id, (tx) =>
      createCourse(tx, teacher, { title, term: "Güz" }),
    );
    courses.push(c);
    await asUser(db, teacher.id, async (tx) => {
      const o = await createObjective(tx, teacher, c.id, {
        title: `${title} temel kazanım`,
        topic_title: "Temeller",
        week: 1,
      });
      const a = await saveActivity(tx, teacher, c.id, {
        objective_id: o.id,
        activity: {
          kind: "true_false",
          title: "Önerme",
          instruction: "Seç",
          content: { statement: "Doğru" },
          answer_key: { value: true },
          explanation: "Doğru önerme",
        },
      });
      await publishActivity(tx, teacher, c.id, a.activity_id);
    });
    await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: c.invite_code }));
  }
  await asUser(db, other.id, (tx) => joinCourse(tx, other, { code: courses[0].invite_code }));
});
afterAll(async () => {
  await db.close();
});
it("ödül ve bakiye doğrudan değiştirilemez; bitmemiş oturuma ödül verilemez", async () => {
  const session = await asUser(db, student.id, (tx) =>
    startPractice(tx, student, { course_id: courses[0].id }),
  );
  await expect(
    asUser(db, student.id, (tx) => tx.query("select award_completed_session($1)", [session.id])),
  ).rejects.toThrow("COMPLETED_SESSION_ONLY");
  await expect(
    asUser(db, student.id, (tx) =>
      tx.query("insert into reward_accounts(user_id,tokens) values($1,999)", [student.id]),
    ),
  ).rejects.toThrow();
  await expect(
    asUser(db, student.id, (tx) =>
      tx.query("select issue_reward($1,'fake','fake',null,999,999,999,999)", [student.id]),
    ),
  ).rejects.toThrow();
});
it("iki günlük adım iki kez ödüllenmez; gerçek çalışma ve hedef ayrı tutulur", async () => {
  const plan = await asUser(db, student.id, (tx) => ensureDailyPlan(tx, student));
  for (const [index, item] of plan.items.entries()) {
    const s = await asUser(db, student.id, (tx) => startPlanItem(tx, student, item.id));
    const request = { request_key: randomUUID(), activity_version_id: s.items[0], answer: true };
    await asUser(db, student.id, (tx) => submitAnswer(tx, student, s.id, request));
    await asUser(db, student.id, (tx) => submitAnswer(tx, student, s.id, request));
    await asUser(db, student.id, (tx) => tx.query("select award_completed_session($1)", [s.id]));
    const wallet = await asUser(db, student.id, (tx) => rewardSummary(tx, student));
    expect(wallet.xp).toBe(40 * (index + 1));
    expect(wallet.tokens).toBe(index === 0 ? 0 : 10);
    const [day] = await asUser(db, student.id, (tx) =>
      tx.query<{ actual_learning: boolean; goal_completed: boolean }>(
        "select * from learning_days where user_id=$1",
        [student.id],
      ),
    );
    expect(day.actual_learning).toBe(true);
    expect(day.goal_completed).toBe(index === 1);
  }
  expect(
    await asUser(db, other.id, (tx) =>
      tx.query("select * from reward_accounts where user_id=$1", [student.id]),
    ),
  ).toHaveLength(0);
  const view = await asUser(db, student.id, (tx) => rewardView(tx, student));
  expect(view.products.length).toBeGreaterThanOrEqual(25);
  expect(view.days).toHaveLength(1);
  expect(view.days[0].goal_completed).toBe(true);
});
it("satın alma bakiyeyi ve envanteri atomik değiştirir; tekrar aynı işlem olur", async () => {
  const request = { product_id: "frame-lilac", request_key: randomUUID() };
  const first = await asUser(db, student.id, (tx) => purchase(tx, student, request));
  expect((await asUser(db, student.id, (tx) => purchase(tx, student, request))).id).toBe(first.id);
  const wallet = await asUser(db, student.id, (tx) => rewardSummary(tx, student));
  expect(wallet.tokens).toBe(0);
  expect(wallet.xp).toBe(80);
  expect(
    (
      await db.query<{ quantity: number }>(
        "select quantity from inventory where user_id=$1 and product_id='frame-lilac'",
        [student.id],
      )
    )[0].quantity,
  ).toBe(1);
  await expect(
    asUser(db, student.id, (tx) =>
      purchase(tx, student, { product_id: "avatar-owl", request_key: randomUUID() }),
    ),
  ).rejects.toThrow("yeterli elmas");
  await asUser(db, student.id, (tx) => equip(tx, student, { product_id: "frame-lilac" }));
  expect((await asUser(db, student.id, (tx) => rewardSummary(tx, student))).cosmetics.frame).toBe(
    "lilac",
  );
});
it("gönüllü tekrar lig puanı üretmez, aynı kazanım yalnız bir kez XP verir", async () => {
  for (let i = 0; i < 2; i++) {
    const s = await asUser(db, student.id, (tx) =>
      startPractice(tx, student, { course_id: courses[0].id }),
    );
    await asUser(db, student.id, (tx) =>
      submitAnswer(tx, student, s.id, {
        request_key: randomUUID(),
        activity_version_id: s.items[0],
        answer: true,
      }),
    );
  }
  expect((await asUser(db, student.id, (tx) => rewardSummary(tx, student))).xp).toBe(95);
  for (const c of courses) {
    const ranking = await asUser(db, student.id, (tx) =>
      classRanking(tx, student, c.id, new URLSearchParams()),
    );
    expect(ranking.entries.find((e) => e.user_id === student.id)?.xp).toBe(40);
  }
  await expect(
    asUser(db, other.id, (tx) => classRanking(tx, other, courses[1].id, new URLSearchParams())),
  ).rejects.toThrow("COURSE_MEMBERS_ONLY");
});

async function historicStudent() {
  const user = await createLocalUser(db, {
    email: `history-${randomUUID()}@test.edu`,
    display_name: "Seri öğrencisi",
    password: "TestPass2026!",
    role: "student",
  });
  await db.query(
    "update profiles set created_at=$2::date::timestamp at time zone 'Europe/Istanbul' where id=$1",
    [user.id, addDays(weekStart(), -14)],
  );
  return user;
}
async function recordDay(
  user: User,
  date: string,
  flags: { goal?: boolean; actual?: boolean; shield?: boolean; neutral?: boolean } = {},
) {
  await db.query(
    "insert into learning_days(user_id,date,goal_completed,actual_learning,streak_protected,neutral) values($1,$2,$3,$4,$5,$6) on conflict(user_id,date) do update set goal_completed=excluded.goal_completed,actual_learning=excluded.actual_learning,streak_protected=excluded.streak_protected,neutral=excluded.neutral",
    [user.id, date, !!flags.goal, !!flags.actual, !!flags.shield, !!flags.neutral],
  );
}
it("ücretsiz telafi bugünün gerçek hedefini gerektirir ve haftada bir kez uygulanır", async () => {
  const user = await historicStudent(),
    date = today(),
    week = weekStart();
  // Monday has no earlier day in its own week; run the same rule on a prior week fixture.
  if (date === week) {
    await recordDay(user, addDays(date, -1));
    await expect(
      asUser(db, user.id, (tx) =>
        protectDay(tx, user, { date: addDays(date, -1), method: "makeup" }),
      ),
    ).rejects.toThrow("bu haftadaki");
    return;
  }
  const missed = addDays(date, -1);
  await recordDay(user, missed);
  await expect(
    asUser(db, user.id, (tx) => protectDay(tx, user, { date: missed, method: "makeup" })),
  ).rejects.toThrow("bugünün");
  await recordDay(user, date, { goal: true, actual: true });
  await asUser(db, user.id, (tx) => protectDay(tx, user, { date: missed, method: "makeup" }));
  await asUser(db, user.id, (tx) => protectDay(tx, user, { date: missed, method: "makeup" }));
  const [saved] = await db.query<{ actual_learning: boolean; makeup_completed: boolean }>(
    "select * from learning_days where user_id=$1 and date=$2",
    [user.id, missed],
  );
  expect(saved.makeup_completed).toBe(true);
  expect(saved.actual_learning).toBe(false);
  expect((await asUser(db, user.id, (tx) => rewardSummary(tx, user))).tokens).toBe(0);
  if (addDays(date, -2) >= week) {
    await recordDay(user, addDays(date, -2));
    await expect(
      asUser(db, user.id, (tx) =>
        protectDay(tx, user, { date: addDays(date, -2), method: "makeup" }),
      ),
    ).rejects.toThrow("telafi hakkını");
  }
});
it("seri koruyucu bir kez tüketilir; gerçek öğrenme veya hedef kaydı üretmez", async () => {
  const user = await historicStudent(),
    missed = addDays(today(), -1);
  await recordDay(user, missed);
  await expect(
    asUser(db, user.id, (tx) => protectDay(tx, user, { date: missed, method: "shield" })),
  ).rejects.toThrow("koruyucu bulunmuyor");
  await db.query(
    "insert into inventory(user_id,product_id,quantity) values($1,'streak-shield',1)",
    [user.id],
  );
  await Promise.all(
    [1, 2].map(() =>
      asUser(db, user.id, (tx) => protectDay(tx, user, { date: missed, method: "shield" })),
    ),
  );
  const [saved] = await db.query<{
    actual_learning: boolean;
    goal_completed: boolean;
    streak_protected: boolean;
  }>("select * from learning_days where user_id=$1 and date=$2", [user.id, missed]);
  expect(saved).toMatchObject({
    actual_learning: false,
    goal_completed: false,
    streak_protected: true,
  });
  expect(
    (
      await db.query<{ quantity: number }>("select quantity from inventory where user_id=$1", [
        user.id,
      ])
    )[0].quantity,
  ).toBe(0);
  await recordDay(user, addDays(today(), -2), { neutral: true });
  await expect(
    asUser(db, user.id, (tx) =>
      protectDay(tx, user, { date: addDays(today(), -2), method: "shield" }),
    ),
  ).rejects.toThrow("gerekmiyor");
  expect(
    await asUser(db, other.id, (tx) =>
      tx.query("select * from learning_days where user_id=$1", [user.id]),
    ),
  ).toHaveLength(0);
});
it("sandık yedi hedef ister; koruma yeterli değildir, telafi sayılır ve tekrar ödüllendirmez", async () => {
  const user = await historicStudent(),
    week = addDays(weekStart(), -7);
  for (let i = 0; i < 7; i++)
    await recordDay(user, addDays(week, i), { goal: i < 6, actual: i < 6, shield: i === 6 });
  await expect(asUser(db, user.id, (tx) => claimChest(tx, user, { week }))).rejects.toThrow(
    "yedi günlük",
  );
  await db.query(
    "update learning_days set streak_protected=false,makeup_completed=true where user_id=$1 and date=$2",
    [user.id, addDays(week, 6)],
  );
  await Promise.all([1, 2].map(() => asUser(db, user.id, (tx) => claimChest(tx, user, { week }))));
  expect((await asUser(db, user.id, (tx) => rewardSummary(tx, user))).tokens).toBe(50);
  const view = await asUser(db, user.id, (tx) => rewardView(tx, user));
  expect(view.weeks.find((w) => w.week === week)).toMatchObject({
    completed: 7,
    claimed: true,
    available: false,
  });
  expect(view.achievements.some((a) => a.achievement_id === "weekly_complete")).toBe(true);
  await expect(
    asUser(db, user.id, (tx) => claimChest(tx, user, { week: addDays(weekStart(), 7) })),
  ).rejects.toThrow("son günlük");
  await expect(asUser(db, teacher.id, (tx) => claimChest(tx, teacher, { week }))).rejects.toThrow();
});
it("geçmişte içerik yoksa yeni yayın geriye dönük seri bozmaz; takvim kişiseldir", async () => {
  const user = await historicStudent();
  await asUser(db, user.id, (tx) => joinCourse(tx, user, { code: courses[0].invite_code }));
  const view = await asUser(db, user.id, (tx) => rewardView(tx, user));
  expect(view.missed_days).toHaveLength(0);
  expect(view.days.find((d) => d.date === today())?.neutral).toBe(false);
  await expect(
    asUser(db, user.id, (tx) =>
      tx.query("select learning_content_available($1,$2)", [other.id, today()]),
    ),
  ).rejects.toThrow();
});
