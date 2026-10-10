import path from "node:path";
import { createDatabase, asUser } from "../src/lib/db";
import { createCourse } from "../src/modules/courses/service";
import { uploadSource } from "../src/modules/documents/service";
import { academicPdf } from "../src/tests/fixtures";
import type { User } from "../src/types/domain";
const location = path.resolve(process.env.PGLITE_PATH || "");
if (
  !location.startsWith(path.resolve(".data/e2e-")) ||
  process.env.APP_ORIGIN !== "http://127.0.0.1:3001"
)
  throw new Error("Queue fixture requires the isolated E2E database.");
const db = await createDatabase();
try {
  const [teacher] = await db.query<User>(
    "select * from profiles where email='akademisyen@pusula.local'",
  );
  const course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, {
      title: "İşlem Merkezi Testi",
      code: "JOB101",
      term: "Güz",
    }),
  );
  const source = await uploadSource(
    db,
    teacher,
    course.id,
    new File(
      [
        academicPdf([
          "Algorithms - Queue Retry",
          "An algorithm is a finite sequence of steps to solve a problem.",
        ]),
      ],
      "Yeniden işlenecek kaynak.pdf",
      { type: "application/pdf" },
    ),
  );
  // Interrupted state is a fixture; the browser retry runs the actual extractor/worker.
  await db.query(
    "update background_jobs set status='failed',attempts=3,error_message='Test işleyicisi kesildi.' where course_id=$1",
    [course.id],
  );
  await db.query(
    "update documents set status='failed',error_message='Test işleyicisi kesildi.' where id=$1",
    [source.id],
  );
} finally {
  await db.close();
}
