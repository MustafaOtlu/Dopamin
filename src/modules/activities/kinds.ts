import type { ActivityInput } from "./schema";

export const kindLabels: Record<ActivityInput["kind"], string> = {
  true_false: "Doğru / yanlış",
  matching: "Kavram eşleştirme",
  ordering: "Sıralama",
  fill_blank: "Boşluk tamamlama",
  categorize: "Kategorilere ayırma",
  region: "Görsel bölge seçme",
};
