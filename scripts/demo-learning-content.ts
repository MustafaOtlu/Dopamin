import { asUser, type RootDatabase } from "../src/lib/db";
import { saveActivity, publishActivity } from "../src/modules/activities/service";
import type { User } from "../src/types/domain";
import type { ActivityInput } from "../src/modules/activities/schema";
const common = { instruction: "Soruyu yanıtla.", difficulty: 1, source_refs: [] } as const;
const algorithm: ActivityInput[] = [
  {
    ...common,
    source_refs: [],
    kind: "fill_blank",
    title: "Bir işlemi tekrarlamak",
    content: {
      text: "Aynı işlemi birden fazla kez çalıştırmak için {{loop}} kullanılır.",
      blanks: [{ id: "loop", label: "Programlama yapısı" }],
    },
    answer_key: { accepted: { loop: ["döngü", "dongu"] } },
    explanation: "Döngü, aynı adımları bir koşul veya tekrar sayısına göre yeniden çalıştırır.",
  },
  {
    ...common,
    source_refs: [],
    kind: "true_false",
    title: "Algoritma ve programlama dili",
    content: { statement: "Bir algoritma mutlaka bir programlama diliyle yazılmalıdır." },
    answer_key: { value: false },
    explanation:
      "Algoritmalar günlük dille, sözde kodla veya akış şemasıyla anlatılabilir; belirli bir dile bağlı değildir.",
  },
];
const biology: ActivityInput[] = [
  {
    ...common,
    source_refs: [],
    kind: "matching",
    title: "Organelleri tanı",
    content: {
      left: [
        { id: "nucleus", label: "Çekirdek" },
        { id: "ribosome", label: "Ribozom" },
        { id: "membrane", label: "Hücre zarı" },
      ],
      right: [
        { id: "r1", label: "Genetik bilgiyi taşır" },
        { id: "r2", label: "Protein üretir" },
        { id: "r3", label: "Madde geçişini düzenler" },
      ],
    },
    answer_key: { pairs: { nucleus: "r1", ribosome: "r2", membrane: "r3" } },
    explanation:
      "Çekirdek DNA'yı barındırır, ribozom protein sentezler; hücre zarı seçici geçirgenliğiyle madde alışverişini düzenler.",
  },
  {
    ...common,
    source_refs: [],
    kind: "ordering",
    title: "Küçükten büyüğe canlı yapıları",
    instruction: "Yapıları küçükten büyüğe sürükleyerek sırala.",
    content: {
      items: [
        { id: "cell", label: "Hücre" },
        { id: "tissue", label: "Doku" },
        { id: "organ", label: "Organ" },
        { id: "system", label: "Sistem" },
        { id: "organism", label: "Organizma" },
      ],
    },
    answer_key: { order: ["cell", "tissue", "organ", "system", "organism"] },
    explanation:
      "Benzer hücreler dokuları, dokular organları, birlikte çalışan organlar sistemleri; sistemler organizmayı oluşturur.",
  },
  {
    ...common,
    source_refs: [],
    kind: "fill_blank",
    title: "Fotosentez nerede gerçekleşir?",
    content: {
      text: "Bitki hücresinde fotosentezin gerçekleştiği organel {{organel}}tır.",
      blanks: [{ id: "organel", label: "Organel" }],
    },
    answer_key: { accepted: { organel: ["kloroplast"] } },
    explanation:
      "Kloroplast, ışık enerjisinin kimyasal enerjiye dönüştürüldüğü fotosentez organelidir.",
  },
  {
    ...common,
    source_refs: [],
    kind: "categorize",
    title: "Bitki ve hayvan hücreleri",
    instruction: "Her yapıyı uygun gruba yerleştir.",
    content: {
      items: [
        { id: "wall", label: "Hücre duvarı" },
        { id: "chloroplast", label: "Kloroplast" },
        { id: "ribosome", label: "Ribozom" },
        { id: "membrane", label: "Hücre zarı" },
      ],
      categories: [
        { id: "plant", label: "Yalnız bitkide" },
        { id: "both", label: "İkisinde de" },
      ],
    },
    answer_key: {
      categories: { wall: "plant", chloroplast: "plant", ribosome: "both", membrane: "both" },
    },
    explanation:
      "Bitki–hayvan karşılaştırmasında hücre duvarı ve kloroplast bitkilerde bulunur; ribozom ve hücre zarı iki hücre türünde de vardır.",
  },
];
const prep = {
  BIL101: {
    cards: [
      {
        term: "Algoritma",
        fact: "Bir işi tamamlamak için izlenen açık ve sıralı adımlardır. Bilgisayar kodu olmak zorunda değildir.",
        example:
          "Çay demlemek: suyu kaynat, çayı ekle, demlenmesini bekle. Adımların sırası sonucu değiştirir.",
        question: "Bir adım eksik veya belirsiz olursa ne olur?",
      },
      {
        term: "Girdi → işlem → çıktı",
        fact: "Algoritma önce bilgi alır, bu bilgiyi işler ve bir sonuç üretir.",
        example: "Girdi: 4. İşlem: sayının karesini al. Çıktı: 16.",
        question: "Bir not ortalaması hesabında girdiler neler olur?",
      },
      {
        term: "Değişken ve koşul",
        fact: "Değişken bir değeri saklar. Koşul ise o değere göre hangi yolun izleneceğini belirler.",
        example: "not = 65; not en az 50 ise 'geçti', değilse 'kaldı' yaz.",
        question: "Koşulu değiştirince aynı girdi başka bir sonuç verebilir mi?",
      },
      {
        term: "Döngü",
        fact: "Bir işlemi belirli sayıda veya koşul sağlandığı sürece tekrarlar. Durma koşulu önemlidir.",
        example:
          "Bir listedeki her öğrencinin adını yazdırmak, aynı adımı her öğrenci için tekrarlamaktır.",
        question: "Durma koşulu hiç oluşmazsa ne olur?",
      },
    ],
  },
  BIO103: {
    cards: [
      {
        term: "Hücre: canlılığın temel birimi",
        fact: "Hücre zarı hücreyi çevreler. Sitoplazma, hücre içindeki birçok olayın gerçekleştiği ortamdır.",
        example: "Hücreyi küçük bir atölye gibi düşün: sınırı zar, çalışma alanı sitoplazmadır.",
        question: "Hücre içi ve dışı neden birbirinden ayrılmalı?",
      },
      {
        term: "Çekirdek ve ribozom",
        fact: "Ökaryot hücrelerde çekirdek DNA'yı barındırır. Ribozom, genetik bilgiden gelen talimatlarla protein üretir.",
        example:
          "DNA tariflerin saklandığı kitap, ribozom tarife göre üretim yapan tezgâh gibidir.",
        question: "Bilginin saklanması ile üretim yapılması neden farklı görevlerdir?",
      },
      {
        term: "Mitokondri",
        fact: "Mitokondri, hücresel solunumda ATP üretiminde görev alır. ATP, hücrenin birçok iş için kullanabildiği enerji taşıyıcısıdır.",
        example:
          "Kasların çalışması enerji gerektirir. Bu yüzden yoğun çalışan hücrelerin enerji ihtiyacı fazladır.",
        question: "Çok çalışan bir hücrede mitokondri sayısı nasıl olabilir?",
      },
      {
        term: "Bitki hücresinin farkı",
        fact: "Bitki hücresinin duvarı destek sağlar. Kloroplast fotosentez yapar. Hücre zarı ve ribozom hem bitki hem hayvan hücrelerinde bulunur.",
        example:
          "Duvarı dış destek, zarı giriş çıkış kontrolü olarak düşün; görevleri aynı değildir.",
        question: "Hücre duvarı varsa hücre zarına yine ihtiyaç var mı?",
      },
    ],
  },
};
export async function extendDemoLearning(db: RootDatabase, teacher: User) {
  const rows = await db.query<{
    id: string;
    code: "BIL101" | "BIO103";
    topic_id: string;
    objective_id: string;
  }>(
    "select c.id,c.code,t.id topic_id,o.id objective_id from courses c join topics t on t.course_id=c.id join objectives o on o.topic_id=t.id where c.owner_id=$1 and c.code in ('BIL101','BIO103') and t.week=1",
    [teacher.id],
  );
  for (const row of rows) {
    await asUser(db, teacher.id, async (tx) => {
      await tx.query("update topics set preparation=$2 where id=$1", [
        row.topic_id,
        JSON.stringify(prep[row.code]),
      ]);
      const existing = await tx.query<{ title: string }>(
        "select v.title from activities a join activity_versions v on v.activity_id=a.id and v.version=a.published_version where a.objective_id=$1 and a.status!='archived'",
        [row.objective_id],
      );
      for (const activity of row.code === "BIL101" ? algorithm : biology) {
        if (existing.length >= 5) break;
        if (existing.some((a) => a.title === activity.title)) continue;
        const saved = await saveActivity(tx, teacher, row.id, {
          objective_id: row.objective_id,
          activity,
        });
        await publishActivity(tx, teacher, row.id, saved.activity_id);
        existing.push({ title: activity.title });
      }
    });
  }
}
