import { z } from "zod";
import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";
import { requireStudent } from "@/modules/auth/service";
export async function learningHistory(tx: Database, user: User, params: URLSearchParams) {
  requireStudent(user);
  const course = z
      .uuid()
      .optional()
      .parse(params.get("course") || undefined),
    objective = z
      .uuid()
      .optional()
      .parse(params.get("objective") || undefined),
    before = z.iso
      .datetime({ offset: true })
      .optional()
      .parse(params.get("before") || undefined),
    beforeId = z
      .uuid()
      .optional()
      .parse(params.get("before_id") || undefined);
  const rows = await tx.query<{ id: string; created_at: Date }>(
    `select a.id,a.created_at,a.correct,a.score,a.context,a.answer,a.curriculum_id,v.title,v.version,v.kind,v.explanation,c.title course_title,o.title objective_title,s.mode
    from attempts a join learning_sessions s on s.id=a.session_id join activity_versions v on v.id=a.activity_version_id join courses c on c.id=a.course_id join objectives o on o.id=a.objective_id
    where a.user_id=$1 and ($2::uuid is null or a.course_id=$2) and ($3::uuid is null or a.objective_id=$3)
    and (s.mode!='challenge' or exists(select 1 from challenges ch where ch.id=s.challenge_id and ch.status='completed'))
    and ($4::timestamptz is null or (a.created_at,a.id)<($4::timestamptz,$5::uuid)) order by a.created_at desc,a.id desc limit 51`,
    [
      user.id,
      course || null,
      objective || null,
      before || null,
      beforeId || "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ],
  );
  const items = rows.slice(0, 50),
    last = items.at(-1);
  return {
    items,
    next:
      rows.length > 50 && last
        ? { before: new Date(last.created_at).toISOString(), before_id: last.id }
        : null,
  };
}
