"use client";
import { useState } from "react";
import type { Objective } from "@/types/domain";
import { api, errorMessage } from "@/lib/client";
import { ErrorBanner, Field, Modal } from "./ui";

export function CurriculumCalendar({
  courseId,
  objectives,
  close,
  saved,
}: {
  courseId: string;
  objectives: Objective[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [topics, setTopics] = useState(() => [
    ...new Map(
      objectives.map((o) => [
        o.topic_id,
        {
          id: o.topic_id,
          title: o.topic_title,
          week: o.week,
          scheduled_date: o.scheduled_date,
          accessible: o.accessible,
        },
      ]),
    ).values(),
  ]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Müfredat takvimi" onClose={close} wide>
      <p className="muted">
        Yeni takvim bir sürüm olarak kaydedilir. Başlanmamış günlük planlar güncellenir; başlanan
        çalışmalar korunur.
      </p>
      <ErrorBanner message={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(`courses/${courseId}/curriculum/revise`, {
              topics: topics.map(({ id, week, scheduled_date, accessible }) => ({
                id,
                week,
                scheduled_date,
                accessible,
              })),
            });
            await saved();
            close();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="calendar-topic-list">
          {topics.map((topic, index) => (
            <fieldset className="calendar-topic" key={topic.id}>
              <legend>{topic.title}</legend>
              <div className="form-grid">
                <Field label="Hafta">
                  <input
                    type="number"
                    min="1"
                    max="52"
                    required
                    value={topic.week}
                    onChange={(e) =>
                      setTopics(
                        topics.map((t, i) =>
                          i === index ? { ...t, week: Number(e.target.value) } : t,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Ders tarihi">
                  <input
                    type="date"
                    required
                    value={topic.scheduled_date}
                    onChange={(e) =>
                      setTopics(
                        topics.map((t, i) =>
                          i === index ? { ...t, scheduled_date: e.target.value } : t,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={topic.accessible}
                  onChange={(e) =>
                    setTopics(
                      topics.map((t, i) =>
                        i === index ? { ...t, accessible: e.target.checked } : t,
                      ),
                    )
                  }
                />
                Öğrenciler bu konuyu çalışabilir
              </label>
            </fieldset>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Vazgeç
          </button>
          <button className="button primary" disabled={busy || !topics.length}>
            {busy ? "Kaydediliyor…" : "Yeni takvimi kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
