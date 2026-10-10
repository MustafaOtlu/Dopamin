import { z } from "zod";
import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";
import { requireStudent } from "@/modules/auth/service";
import { AppError } from "@/lib/errors";
export async function publicStudentProfile(tx: Database, user: User, target: string) {
  requireStudent(user);
  try {
    return (
      await tx.query<{ profile: unknown }>("select student_public_profile($1) profile", [
        z.uuid().parse(target),
      ])
    )[0].profile;
  } catch (error) {
    if (error instanceof Error && error.message.includes("PROFILE_PRIVATE"))
      throw new AppError(404, "Bu öğrenci profili şu anda paylaşılmıyor.");
    throw error;
  }
}
