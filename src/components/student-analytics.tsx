"use client";
import { useEffect, useState } from "react";
import { api, errorMessage, dateLabel } from "@/lib/client";
import { Modal, ErrorBanner, Pill, Spinner, Field } from "./ui";
import { modeLabels } from "./learning-history";
interface Detail {
  student: { id: string; display_name: string; email: string };
  objectives: {
    id: string;
    title: string;
    topic_title: string;
    state: string | null;
    first_attempts: number | null;
    first_correct: number | null;
    gap_note: string | null;
    gap_reported_at: string | null;
    gap_revision: number | null;
    gap_resolved: boolean | null;
    resolution_note: string | null;
    resolved_at: string | null;
  }[];
  attempts: {
    id: string;
    title: string;
    version: number;
    context: string;
    correct: boolean;
    mode: string;
    created_at: string;
  }[];
  plans: {
    id: string;
    snapshot: { title: string };
    reason: string;
    status: string;
    plan_date: string;
  }[];
  assignments: { id: string; title: string; status: string | null }[];
}
const states: Record<string, string> = {
  learning: "Öğreniliyor",
  reinforcing: "Pekiştiriliyor",
  mastered: "Öğrenildiği tahmin ediliyor",
  needs_review: "Tekrar gerekli",
};
export function StudentAnalytics({
  courseId,
  studentId,
  close,
  assign,
  changed,
}: {
  courseId: string;
  studentId: string;
  close: () => void;
  assign: () => void;
  changed: () => Promise<void>;
}) {
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<Detail>(`courses/${courseId}/students/${studentId}/analytics`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [courseId, studentId]);
  return (
    <Modal title={data?.student.display_name || "Öğrenci analizi"} onClose={close} wide>
      <ErrorBanner message={error} />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="section-heading">
            <span className="muted">{data.student.email}</span>
            <button className="button primary" onClick={assign}>
              Özel çalışma ata
            </button>
          </div>
          <h3>Kazanımlar ve bildirilen eksikler</h3>
          <div className="student-objective-list">
            {data.objectives.map((o) => (
              <article key={o.id}>
                <span className="objective-topic">{o.topic_title}</span>
                <h3>{o.title}</h3>
                <div className="row-actions">
                  <Pill tone={o.state === "mastered" ? "green" : "neutral"}>
                    {o.state ? states[o.state] : "Henüz başlamadı"}
                  </Pill>
                  <span className="muted">
                    İlk denemeler: {o.first_correct || 0}/{o.first_attempts || 0}
                  </span>
                </div>
                {o.gap_reported_at && !o.gap_resolved && (
                  <section className="gap-teacher-card">
                    <div className="section-heading">
                      <strong>Destek istendi</strong>
                      <span className="muted">{dateLabel(o.gap_reported_at)}</span>
                    </div>
                    <p>{o.gap_note || "Öğrenci bu kazanımda eksiği olduğunu bildirdi."}</p>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const values = new FormData(e.currentTarget);
                        setBusy(true);
                        setError("");
                        try {
                          await api(
                            `courses/${courseId}/students/${studentId}/gaps/${o.id}/resolve`,
                            {
                              note: String(values.get("note") || ""),
                              expected_revision: o.gap_revision,
                            },
                          );
                          await changed();
                        } catch (err) {
                          setError(errorMessage(err));
                        } finally {
                          try {
                            setData(
                              await api<Detail>(
                                `courses/${courseId}/students/${studentId}/analytics`,
                              ),
                            );
                          } catch (err) {
                            setError(errorMessage(err));
                          }
                          setBusy(false);
                        }
                      }}
                    >
                      <Field label="Öğrenciye notun (isteğe bağlı)">
                        <textarea
                          aria-label="Öğrenciye notun (isteğe bağlı)"
                          name="note"
                          rows={2}
                          maxLength={1000}
                          placeholder="Birlikte çalıştığınız noktayı veya sonraki adımı yaz."
                        />
                      </Field>
                      <div className="form-actions">
                        <button className="button secondary small" disabled={busy}>
                          Desteği tamamla
                        </button>
                      </div>
                    </form>
                  </section>
                )}
                {o.gap_resolved && (
                  <div className="support-reply">
                    <div>
                      <strong>Destek bildirimi kapatıldı</strong>
                      {o.resolution_note && <p>{o.resolution_note}</p>}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          <h3>Günlük görev geçmişi</h3>
          {data.plans.length ? (
            <div className="activity-list">
              {data.plans.map((p) => (
                <div key={p.id} className="activity-row">
                  <div className="activity-row-main">
                    <strong>{p.snapshot.title}</strong>
                    <p>
                      {dateLabel(p.plan_date)} · {p.reason}
                    </p>
                  </div>
                  <Pill tone={p.status === "completed" ? "green" : "neutral"}>
                    {p.status === "completed"
                      ? "Tamamlandı"
                      : p.status === "in_progress"
                        ? "Çalışılıyor"
                        : "Bekliyor"}
                  </Pill>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Bu derste günlük görev kaydı yok.</p>
          )}
          <h3>İlk denemeler ve tekrarlar</h3>
          {data.attempts.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Etkinlik</th>
                    <th>Çalışma</th>
                    <th>Bağlam</th>
                    <th>Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attempts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.title}
                        <small>
                          Sürüm {a.version} · {dateLabel(a.created_at)}
                        </small>
                      </td>
                      <td>{modeLabels[a.mode]}</td>
                      <td>
                        {a.context === "first"
                          ? "İlk deneme"
                          : a.context === "session_review"
                            ? "Oturum tekrarı"
                            : "Hatalarım"}
                      </td>
                      <td>
                        <Pill tone={a.correct ? "green" : "orange"}>
                          {a.correct ? "Doğru" : "Yanlış"}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Henüz cevap kaydı yok.</p>
          )}
          <h3>Ödevler</h3>
          {data.assignments.map((a) => (
            <p key={a.id}>
              {a.title} ·{" "}
              {a.status === "reviewed"
                ? "Değerlendirildi"
                : a.status === "submitted"
                  ? "Teslim edildi"
                  : a.status === "returned"
                    ? "Düzeltme istendi"
                    : a.status === "in_progress"
                      ? "Çalışılıyor"
                      : "Teslim bekleniyor"}
            </p>
          ))}
        </>
      )}
    </Modal>
  );
}
