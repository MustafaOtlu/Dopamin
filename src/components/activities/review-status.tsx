import type { GenerationChecks } from "@/types/domain";
export function ActivityReviewStatus({
  checks,
  status,
}: {
  checks?: GenerationChecks;
  status: string;
}) {
  if (checks?.publication_method === "automatic")
    return <p className="field-help">AI kontrolüyle otomatik yayımlandı.</p>;
  const review = checks?.automatic_review;
  if (!review || status !== "needs_review") return null;
  const issues = [
    ...new Set([
      ...review.findings,
      ...(!review.source_supported ? ["Kaynak desteğini kontrol et."] : []),
      ...(!review.answer_valid ? ["Cevap anahtarını ve açıklamayı kontrol et."] : []),
      ...(!review.unambiguous ? ["Sorudaki belirsizliği gider."] : []),
      ...(!review.objective_covered ? ["Sorunun kazanımı ölçtüğünü kontrol et."] : []),
    ]),
  ];
  return (
    <div className="activity-review-note">
      <strong>AI kontrolü · Senin incelemen gerekiyor</strong>
      {issues.length ? (
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p>Yayın tercihi veya soru sürümü değişti; otomatik yayın yapılmadı.</p>
      )}
    </div>
  );
}
