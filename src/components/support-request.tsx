"use client";
import { useEffect, useState } from "react";
import { CircleCheck, MessageCircle } from "lucide-react";
import type { GapReport, GapEvent } from "@/modules/learning/gaps";
import type { Objective } from "@/types/domain";
import { api, errorMessage, dateLabel } from "@/lib/client";
import { Modal, Field, ErrorBanner, Pill, Spinner } from "./ui";
export const gapActionLabels = {
  reported: "Destek istendi",
  updated: "Not güncellendi",
  reopened: "Yeniden destek istendi",
  resolved: "Bildirim kapatıldı",
};
interface Detail {
  report: GapReport | null;
  history: GapEvent[];
}
export function SupportRequest({
  courseId,
  objective,
  close,
  saved,
}: {
  courseId: string;
  objective: Objective;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const route = `courses/${courseId}/gaps/${objective.id}`;
  useEffect(() => {
    let active = true;
    api<Detail>(route)
      .then((value) => {
        if (active) {
          setDetail(value);
          setNote(value.report?.note || "");
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [route]);
  async function change(resolve = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(resolve ? "gaps/resolve" : "gaps", {
        course_id: courseId,
        objective_id: objective.id,
        note: resolve ? "" : note,
        expected_revision: detail?.report?.revision || null,
      });
      setDetail(await api<Detail>(route));
      await saved();
      setNotice(resolve ? "Destek bildirimin kapatıldı." : "Bildirimin akademisyenine ulaştı.");
    } catch (err) {
      setError(errorMessage(err));
      // Refresh the revision and the displayed report; preserve the unsaved student's note.
      setDetail(await api<Detail>(route).catch(() => detail));
    } finally {
      setBusy(false);
    }
  }
  const report = detail?.report;
  return (
    <Modal title="Öğrenme desteği" onClose={close}>
      <div className="support-objective">
        <MessageCircle size={22} />
        <div>
          <span className="eyebrow">{objective.topic_title}</span>
          <h3>{objective.title}</h3>
        </div>
      </div>
      <ErrorBanner message={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && report && report.note !== note && (
        <div className="notice">
          <strong>Güncel kayıt</strong>
          <p>{report.note || "Not eklenmemiş."}</p>
        </div>
      )}
      {!detail ? (
        <Spinner />
      ) : (
        <>
          {report && (
            <div className="section-heading">
              <Pill tone={report.resolved ? "green" : "orange"}>
                {report.resolved ? "Bildirim kapalı" : "Destek bekleniyor"}
              </Pill>
              <span className="muted">{dateLabel(report.created_at)}</span>
            </div>
          )}
          {report?.resolved && report.resolution_note && (
            <div className="support-reply">
              <CircleCheck size={20} />
              <div>
                <strong>
                  {detail.history.find((event) => event.revision === report.revision)
                    ?.actor_role === "teacher"
                    ? "Akademisyeninin notu"
                    : "Kapatma notun"}
                </strong>
                <p>{report.resolution_note}</p>
              </div>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void change();
            }}
          >
            <Field label="Nerede zorlanıyorsun?">
              <textarea
                aria-label="Nerede zorlanıyorsun?"
                rows={4}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Örneğin, döngünün hangi koşulda durduğunu karıştırıyorum."
              />
            </Field>
            <p className="field-help">
              Notunu yalnız sen ve bu dersin akademisyeni görebilir. Günlük çalışmaların bu ihtiyaca
              göre önceliklendirilir.
            </p>
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {report
                  ? report.resolved
                    ? "Yeniden destek iste"
                    : "Notu güncelle"
                  : "Destek iste"}
              </button>
            </div>
          </form>
          {report && !report.resolved && (
            <button
              className="text-button support-close"
              disabled={busy}
              onClick={() => change(true)}
            >
              Artık desteğe ihtiyacım yok
            </button>
          )}
          {detail.history.length > 0 && (
            <details className="support-history">
              <summary>Bildirim geçmişi</summary>
              <ol>
                {detail.history.map((event) => (
                  <li key={event.id}>
                    <strong>{gapActionLabels[event.action]}</strong>
                    <span>
                      {event.actor_role === "teacher" ? "Akademisyen" : "Sen"} ·{" "}
                      {dateLabel(event.created_at)}
                    </span>
                    {event.note && <p>{event.note}</p>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </Modal>
  );
}
