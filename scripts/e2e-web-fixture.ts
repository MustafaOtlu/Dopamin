import path from "node:path";
import { createDatabase, asUser } from "../src/lib/db";
import { createLocalUser } from "../src/modules/auth/service";
import { createCourse, joinCourse } from "../src/modules/courses/service";
import { addWebSource, setSourcePolicy } from "../src/modules/documents/web-sources";
import { extractWebText } from "../src/modules/documents/web-reader";
import { runNextJob } from "../src/workers/runner";
const location = path.resolve(process.env.PGLITE_PATH || "");
if (
  !location.startsWith(path.resolve(".data/e2e-")) ||
  process.env.APP_ORIGIN !== "http://127.0.0.1:3001"
)
  throw new Error("Web fixture requires the isolated E2E database.");
const db = await createDatabase();
try {
  const teacher = await createLocalUser(
    db,
    {
      email: "web-e2e@pusula.local",
      display_name: "Web Öğretmeni",
      password: "PusulaDemo2026!",
      role: "teacher",
    },
    true,
  );
  const course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Web Kaynakları Testi", code: "WEB101", term: "Güz" }),
  );
  const student = await createLocalUser(db, {
    email: "web-student-e2e@pusula.local",
    display_name: "Web Öğrencisi",
    password: "PusulaDemo2026!",
    role: "student",
  });
  await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: course.invite_code }));
  await asUser(db, teacher.id, async (tx) => {
    await setSourcePolicy(tx, teacher, course.id, { mode: "approved_web", expected_revision: 0 });
    await addWebSource(tx, teacher, course.id, {
      title: "Algoritmalar — web kaynağı",
      url: "https://example.com/algorithms",
    });
  });
  // Deterministic network fixture only at seed time, outside the application server.
  // The real worker, permission checks, storage, and later UI/API flows still run.
  await runNextJob(db, undefined, async () =>
    extractWebText(
      Buffer.from(
        `<title>Algoritmalar</title><main><p>Algoritma sonlu ve açık adımlardan oluşur. Her adımın girdisi, çıktısı ve sırası belirlenir. Aynı problem için farklı çözüm yolları karşılaştırılabilir.</p></main>`,
      ),
    ),
  );
} finally {
  await db.close();
}
