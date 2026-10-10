import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { leagueView, joinLeague, leaveLeague } from "@/modules/competition/leagues";
import { weekStart, addDays } from "@/lib/time";
import type { User } from "@/types/domain";
import { closeExpiredLeagues } from "@/workers/maintenance";
let db: RootDatabase, one: User, two: User;
const user = () =>
  createLocalUser(db, {
    email: `league-${randomUUID()}@test.edu`,
    display_name: "Lig öğrencisi",
    role: "student",
    password: "TestPass2026!",
  });
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  one = await user();
  two = await user();
});
afterAll(async () => {
  await db.close();
});
it("katılım onay ister; aynı hafta tekrar aynı üyelik olur, ad ve lig puanı dışında veri açılmaz", async () => {
  await expect(
    asUser(db, one.id, (tx) => joinLeague(tx, one, { consent: false })),
  ).rejects.toThrow();
  await expect(asUser(db, one.id, (tx) => tx.query("select join_league(null)"))).rejects.toThrow(
    "LEAGUE_CONSENT_REQUIRED",
  );
  expect((await asUser(db, one.id, (tx) => leagueView(tx, one))).entries).toHaveLength(0);
  await asUser(db, one.id, (tx) => joinLeague(tx, one, { consent: true }));
  await asUser(db, one.id, (tx) => joinLeague(tx, one, { consent: true }));
  await asUser(db, two.id, (tx) => joinLeague(tx, two, { consent: true }));
  await db.query(
    "insert into xp_transactions(user_id,event_key,reason,amount,class_xp,global_xp,week) values($1,'goal-fixture','daily_goal',0,0,40,$2),($1,'practice-fixture','new_objective',15,0,0,$2)",
    [one.id, weekStart()],
  );
  const view = await asUser(db, one.id, (tx) => leagueView(tx, one));
  expect(view.entries.find((e) => e.user_id === one.id)).toMatchObject({ points: 15, rank: 1 });
  expect(view.entries.find((e) => e.user_id === two.id)).toMatchObject({ points: 0, rank: 2 });
  expect(Object.keys(view.entries[0]).sort()).toEqual([
    "display_name",
    "points",
    "rank",
    "user_id",
  ]);
  expect(
    await asUser(db, two.id, (tx) =>
      tx.query("select * from league_members where user_id=$1", [one.id]),
    ),
  ).toHaveLength(0);
  await expect(
    asUser(db, one.id, (tx) =>
      tx.query(
        "insert into league_members(user_id,week,group_id) select $1,week,group_id from league_members where user_id=$1",
        [one.id],
      ),
    ),
  ).rejects.toThrow();
});
it("ayrılma adı sıralamadan çıkarır ve grup değiştirme için aynı hafta yeniden girişe izin vermez", async () => {
  await asUser(db, two.id, (tx) => leaveLeague(tx, two));
  expect((await asUser(db, one.id, (tx) => leagueView(tx, one))).entries).toHaveLength(1);
  expect((await asUser(db, two.id, (tx) => leagueView(tx, two))).entries).toHaveLength(0);
  await expect(asUser(db, two.id, (tx) => joinLeague(tx, two, { consent: true }))).rejects.toThrow(
    "Gelecek hafta",
  );
});
it("30 üyede yeni grup açılır; üyelik tekrarları kapasiteyi artırmaz", async () => {
  const members = [one, two];
  for (let i = 0; i < 29; i++) {
    const u = await user();
    members.push(u);
    await asUser(db, u.id, (tx) => joinLeague(tx, u, { consent: true }));
  }
  const [count] = await db.query<{ groups: number; largest: number }>(
    "select count(*)::int groups,max(n)::int largest from (select group_id,count(*) n from league_members where week=$1 group by group_id) q",
    [weekStart()],
  );
  expect(count).toEqual({ groups: 2, largest: 30 });
  expect(
    (await asUser(db, members.at(-1)!.id, (tx) => leagueView(tx, members.at(-1)!))).entries,
  ).toHaveLength(1);
});
it("yeni hafta eski puanları dondurur; üst/alt seviyeye geçiş sunucuda hesaplanır", async () => {
  const users: User[] = [];
  for (let i = 0; i < 5; i++) users.push(await user());
  const previous = addDays(weekStart(), -7);
  const [group] = await db.query<{ id: string }>(
    "insert into league_groups(week,tier) values($1,1) returning id",
    [previous],
  );
  for (const [i, u] of users.entries()) {
    await db.query("insert into league_members(user_id,week,group_id) values($1,$2,$3)", [
      u.id,
      previous,
      group.id,
    ]);
    await db.query(
      "insert into xp_transactions(user_id,event_key,reason,amount,class_xp,global_xp,week) values($1,'weekly-fixture','daily_goal',$2,0,0,$3)",
      [u.id, (i + 1) * 40, previous],
    );
  }
  await asUser(db, users[4].id, (tx) => joinLeague(tx, users[4], { consent: true }));
  const history = (await asUser(db, users[4].id, (tx) => leagueView(tx, users[4]))).history[0];
  expect(history).toMatchObject({ final_rank: 1, final_points: 200, next_tier: 2 });
  await asUser(db, users[0].id, (tx) => joinLeague(tx, users[0], { consent: true }));
  expect((await asUser(db, users[0].id, (tx) => leagueView(tx, users[0]))).membership?.tier).toBe(
    0,
  );
  expect(
    (await asUser(db, users[4].id, (tx) => leagueView(tx, users[4]))).entries.find(
      (e) => e.user_id === users[4].id,
    )?.points,
  ).toBe(0);
  await expect(
    asUser(db, users[4].id, (tx) => tx.query("select close_league($1)", [group.id])),
  ).rejects.toThrow();
});
it("bakım işleyicisi süresi dolan grubu yeni katılım olmadan kapatır ve aktif haftayı bırakır", async () => {
  const [old] = await db.query<{ id: string }>(
    "insert into league_groups(week,tier) values($1,0) returning id",
    [addDays(weekStart(), -14)],
  );
  const [active] = await db.query<{ id: string }>(
    "insert into league_groups(week,tier) values($1,0) returning id",
    [weekStart()],
  );
  expect(await closeExpiredLeagues(db)).toBe(1);
  expect(await closeExpiredLeagues(db)).toBe(0);
  const groups = await db.query<{ id: string; closed_at: string | null }>(
    "select id,closed_at from league_groups where id=any($1::uuid[])",
    [[old.id, active.id]],
  );
  expect(groups.find((g) => g.id === old.id)?.closed_at).not.toBeNull();
  expect(groups.find((g) => g.id === active.id)?.closed_at).toBeNull();
});
