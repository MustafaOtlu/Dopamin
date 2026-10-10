import type { Database } from "@/lib/db";
import { AppError, assert } from "@/lib/errors";
export async function assertWritableJob(
  tx: Database,
  jobId: string,
  token: string,
  courseId: string,
  ownerId: string,
) {
  const [course] = await tx.query(
    "select id from courses where id=$1 and owner_id=$2 and not archived for update",
    [courseId, ownerId],
  );
  assert(course, "Bu dersteki işlem yetkisi artık geçerli değil.", 409);
  await assertJobLease(tx, jobId, token);
}
export async function assertJobLease(tx: Database, jobId: string, token: string) {
  const [owned] = await tx.query(
    `select id from background_jobs where id=$1 and lease_token=$2
    and status='processing' and leased_until>now() for update`,
    [jobId, token],
  );
  if (!owned) throw new AppError(409, "İşlem başka bir işleyiciye geçti.", "JOB_LEASE_LOST");
}
export async function renewJobLease(tx: Database, jobId: string, token: string) {
  return (
    (
      await tx.query(
        `update background_jobs set leased_until=now()+interval '10 minutes',
    heartbeat_at=now() where id=$1 and lease_token=$2 and status='processing'
    and leased_until>now() returning id`,
        [jobId, token],
      )
    ).length > 0
  );
}
