import { beforeAll, afterAll, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { saveProfilePhoto } from "@/modules/rewards/photos";
import { rewardSummary } from "@/modules/rewards/service";
import { publicStudentProfile } from "@/modules/rewards/profiles";
import { readStoredFile } from "@/modules/documents/storage";
import type { User } from "@/types/domain";
let db: RootDatabase, student: User, other: User, teacher: User;
const previous = process.env.STORAGE_PATH;
beforeAll(async () => {
  process.env.STORAGE_PATH = path.resolve(".data/test-photos-" + randomUUID());
  db = await createDatabase("memory://");
  await migrate(db);
  const make = (role: "student" | "teacher") =>
    createLocalUser(
      db,
      {
        email: randomUUID() + "@test.edu",
        display_name: "Fotoğraf testi",
        role,
        password: "TestPass2026!",
      },
      role === "teacher",
    );
  student = await make("student");
  other = await make("student");
  teacher = await make("teacher");
});
afterAll(async () => {
  await db.close();
  if (previous === undefined) delete process.env.STORAGE_PATH;
  else process.env.STORAGE_PATH = previous;
});
const picture = () =>
  new File([new Uint8Array(createCanvas(32, 24).toBuffer("image/png"))], "photo.png", {
    type: "image/png",
  });
it("uploads for free, stores a square PNG, and keeps metadata private from teachers", async () => {
  const result = await saveProfilePhoto(db, student, picture());
  expect(result.photo_url).toContain("/api/students/" + student.id + "/photo?v=");
  const wallet = await asUser(db, student.id, (tx) => rewardSummary(tx, student));
  expect(wallet).toMatchObject({ tokens: 0, photo_url: result.photo_url });
  const [row] = await asUser(db, student.id, (tx) =>
    tx.query<{ storage_key: string }>("select * from profile_photos where user_id=$1", [
      student.id,
    ]),
  );
  const bytes = Buffer.from(await readStoredFile(row.storage_key));
  expect(bytes.readUInt32BE(16)).toBe(512);
  expect(bytes.readUInt32BE(20)).toBe(512);
  expect(
    await asUser(db, teacher.id, (tx) => tx.query("select * from profile_photos")),
  ).toHaveLength(0);
  expect(await asUser(db, other.id, (tx) => tx.query("select * from profile_photos"))).toHaveLength(
    0,
  );
  await expect(
    asUser(db, other.id, (tx) => publicStudentProfile(tx, other, student.id)),
  ).rejects.toThrow();
  await db.query("update profiles set public_profile=true where id=$1", [student.id]);
  expect(
    await asUser(db, other.id, (tx) => publicStudentProfile(tx, other, student.id)),
  ).toMatchObject({ photo_url: result.photo_url });
});
it("rejects disguised files, oversized dimensions and teacher writes", async () => {
  await expect(
    saveProfilePhoto(db, student, new File(["<svg/>"], "photo.png", { type: "image/png" })),
  ).rejects.toMatchObject({ status: 415 });
  const bytes = Buffer.from(await picture().arrayBuffer());
  bytes.writeUInt32BE(10001, 16);
  await expect(saveProfilePhoto(db, student, new File([bytes], "photo.png"))).rejects.toMatchObject(
    { status: 413 },
  );
  await expect(saveProfilePhoto(db, teacher, picture())).rejects.toMatchObject({ status: 403 });
});
it("replaces the previous image without changing purchases or balance", async () => {
  const before = await asUser(db, student.id, (tx) => rewardSummary(tx, student));
  const result = await saveProfilePhoto(db, student, picture());
  expect(result.photo_url).not.toBe(before.photo_url);
  expect((await asUser(db, student.id, (tx) => rewardSummary(tx, student))).tokens).toBe(
    before.tokens,
  );
  expect(
    await db.query("select * from profile_photos where user_id=$1", [student.id]),
  ).toHaveLength(1);
});
