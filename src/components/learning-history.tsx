"use client";
import { useEffect, useState } from "react";
import { api, errorMessage, dateLabel } from "@/lib/client";
import { Empty, ErrorBanner, Pill, Spinner } from "./ui";
interface HistoryItem {
  id: string;
  created_at: string;
  correct: boolean;
  score: number;
  context: string;
  title: string;
  version: number;
  course_title: string;
  objective_title: string;
  mode: string;
  explanation: string;
}
interface View {
  items: HistoryItem[];
  next: { before: string; before_id: string } | null;
}
export const modeLabels: Record<string, string> = {
  daily: "Günlük görev",
  practice: "Gönüllü çalışma",
  advance: "İleri öğrenme",
  mistakes: "Hatalarım",
  assignment: "Ödev",
  challenge: "Meydan okuma",
};
export function LearningHistory() {
  const [view, setView] = useState<View | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<View>("history")
      .then((v) => {
        if (active) setView(v);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ATTIĞIN ADIMLAR</span>
          <h1>
            Öğrenme geçmişim<span className="greeting-dot">.</span>
          </h1>
          <p>İlk denemelerin ve tekrarların, kendi öğrenme yolculuğun.</p>
        </div>
      </div>
      <ErrorBanner message={error} />
      {!view ? (
        <Spinner />
      ) : !view.items.length ? (
        <Empty
          title="İlk adımını at"
          description="Çalışmalarını tamamladığında sonuçların burada birikecek."
        />
      ) : (
        <div className="history-list">
          {view.items.map((item) => (
            <article key={item.id} className="history-card">
              <div className="section-heading">
                <div>
                  <span className="objective-topic">
                    {item.course_title} · {dateLabel(item.created_at)}
                  </span>
                  <h2>{item.title}</h2>
                </div>
                <Pill tone={item.correct ? "green" : "orange"}>
                  {item.correct ? "Doğru" : "Yanlış"}
                </Pill>
              </div>
              <p>{item.objective_title}</p>
              <div className="history-meta">
                <span>{modeLabels[item.mode]}</span>
                <span>
                  {item.context === "first"
                    ? "İlk deneme"
                    : item.context === "session_review"
                      ? "Oturum tekrarı"
                      : "Hatalarım tekrarı"}
                </span>
                <span>Sürüm {item.version}</span>
              </div>
              <details>
                <summary>Öğrenme açıklamasını gör</summary>
                <p>{item.explanation}</p>
              </details>
            </article>
          ))}
          {view.next && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const v = await api<View>(`history?${new URLSearchParams(view.next!)}`);
                  setView({ items: [...view.items, ...v.items], next: v.next });
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Daha eski çalışmalar
            </button>
          )}
        </div>
      )}
    </>
  );
}
