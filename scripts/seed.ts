import { extendDemoLearning } from "./demo-learning-content";
import { createDatabase, migrate, asUser } from "../src/lib/db";
import { createLocalUser } from "../src/modules/auth/service";
import { createCourse, createObjective, joinCourse } from "../src/modules/courses/service";
import { saveActivity, publishActivity } from "../src/modules/activities/service";
import { today, addDays } from "../src/lib/time";
import type { User } from "../src/types/domain";

if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_PREVIEW)
  throw new Error("Örnek veri canlı ortamda kullanılamaz.");
const db = await createDatabase();
try {
  await migrate(db);
  let [teacher] = await db.query<User>(
    "select * from profiles where email='akademisyen@pusula.local'",
  );
  if (!teacher)
    teacher = await createLocalUser(
      db,
      {
        email: "akademisyen@pusula.local",
        display_name: "Dr. Deniz Aydın",
        role: "teacher",
        password: "PusulaDemo2026!",
      },
      true,
    );
  let [student] = await db.query<User>("select * from profiles where email='ogrenci@pusula.local'");
  if (!student)
    student = await createLocalUser(db, {
      email: "ogrenci@pusula.local",
      display_name: "Ece Yılmaz",
      role: "student",
      password: "PusulaDemo2026!",
    });
  if (!(await db.query("select id from courses where owner_id=$1", [teacher.id])).length) {
    const courses = await asUser(db, teacher.id, async (tx) => {
      const course = await createCourse(tx, teacher, {
        title: "Programlamaya Giriş",
        code: "BIL101",
        description: "Algoritmalar, veri yapıları ve problem çözme dünyasına ilk adım.",
        term: "2026–2027 Güz",
        color: "violet",
      });
      const objective = await createObjective(tx, teacher, course.id, {
        topic_title: "Algoritmalar",
        title: "Temel algoritma kavramlarını ayırt edebilme",
        week: 1,
        scheduled_date: today(),
        importance: 3,
      });
      const activities = [
        {
          kind: "true_false",
          title: "Algoritmanın özellikleri",
          instruction: "Önermenin doğru olup olmadığını seç.",
          content: {
            statement:
              "Bir algoritma, bir problemi çözmek için tanımlanmış sonlu ve sıralı adımlar bütünüdür.",
          },
          answer_key: { value: true },
          explanation:
            "Algoritmalar belirli bir sonuca ulaşmak için açık, sıralı ve sonlu adımlardan oluşur.",
        },
        {
          kind: "matching",
          title: "Kavramları eşleştir",
          instruction: "Her kavramı uygun açıklamayla eşleştir.",
          content: {
            left: [
              { id: "l1", label: "Değişken" },
              { id: "l2", label: "Döngü" },
              { id: "l3", label: "Koşul" },
            ],
            right: [
              { id: "r1", label: "Bir değeri saklayan ad" },
              { id: "r2", label: "Tekrarlayan işlem" },
              { id: "r3", label: "Karara göre dallanma" },
            ],
          },
          answer_key: { pairs: { l1: "r1", l2: "r2", l3: "r3" } },
          explanation:
            "Değişken değer tutar, döngü işlemleri tekrarlar, koşul farklı yollar arasında seçim yapar.",
        },
        {
          kind: "ordering",
          title: "Bir algoritmanın akışı",
          instruction: "Adımları doğru sıraya yerleştir.",
          content: {
            items: [
              { id: "a", label: "Başla" },
              { id: "b", label: "Sayıyı oku" },
              { id: "c", label: "Sayının karesini hesapla" },
              { id: "d", label: "Sonucu göster" },
              { id: "e", label: "Bitir" },
            ],
          },
          answer_key: { order: ["a", "b", "c", "d", "e"] },
          explanation: "Önce girdi alınır, sonra hesaplama yapılır ve sonuç gösterilir.",
        },
      ];
      for (const activity of activities) {
        const saved = await saveActivity(tx, teacher, course.id, {
          objective_id: objective.id,
          activity: { ...activity, difficulty: 1 },
        });
        await publishActivity(tx, teacher, course.id, saved.activity_id);
      }
      await createObjective(tx, teacher, course.id, {
        topic_title: "Döngüler",
        title: "Döngülerin yürütme sırasını belirleyebilme",
        week: 2,
        scheduled_date: addDays(today(), 7),
      });
      const biology = await createCourse(tx, teacher, {
        title: "Hücre Biyolojisi",
        code: "BIO103",
        description: "Yaşamın yapı taşlarını keşfet.",
        term: "2026–2027 Güz",
        color: "teal",
      });
      const bio = await createObjective(tx, teacher, biology.id, {
        topic_title: "Hücre yapısı",
        title: "Temel organellerin görevlerini ayırt edebilme",
        week: 1,
        scheduled_date: today(),
      });
      const b = await saveActivity(tx, teacher, biology.id, {
        objective_id: bio.id,
        activity: {
          kind: "true_false",
          title: "Hücrenin enerji merkezi",
          instruction: "Önermeyi değerlendir.",
          content: {
            statement: "Mitokondri, ökaryot hücrelerde ATP üretiminde önemli bir rol oynar.",
          },
          answer_key: { value: true },
          explanation: "Mitokondri, hücresel solunum yoluyla ATP üretimine katılır.",
          difficulty: 1,
        },
      });
      await publishActivity(tx, teacher, biology.id, b.activity_id);
      return [course, biology];
    });
    await asUser(db, student.id, async (tx) => {
      for (const c of courses) await joinCourse(tx, student, { code: c.invite_code });
    });
  }
  await extendDemoLearning(db, teacher);
  console.log("Yerel örnek hesaplar hazır: akademisyen@pusula.local / ogrenci@pusula.local");
  console.log("Şifre: PusulaDemo2026! (yalnızca yerel geliştirme)");
} finally {
  await db.close();
}
