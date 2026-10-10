"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ListChecks, Plus, Play, Clock3, ExternalLink } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import type { Assignment, Submission } from "@/modules/assignments/service";
import type { LearningSession } from "@/types/domain";
import { ErrorBanner, Empty, Field, Modal, Pill, Spinner } from "./ui";
interface Version {
  id: string;
  submission_id: string;
  revision: number;
  text: string;
  link: string;
  file_id: string | null;
  original_name: string | null;
  first_score: number | null;
  late: boolean;
  submitted_at: string;
}
interface Feedback {
  submission_id: string;
  revision: number;
  grade: number | null;
  feedback: string;
  returned: boolean;
}
interface Detail {
  assignment: Assignment;
  submissions: Submission[];
  versions: Version[];
  feedback: Feedback[];
  resources: { id: string; original_name: string }[];
}
interface Options {
  activities: { id: string; title: string; kind: string }[];
  students: { id: string; display_name: string }[];
  files: { id: string; original_name: string }[];
}
const statusLabels: Record<string, string> = {
  draft: "Taslak",
  published: "Yayında",
  closed: "Kapalı",
  in_progress: "Çalışılıyor",
  submitted: "Teslim edildi",
  reviewed: "Değerlendirildi",
  returned: "Düzeltme istendi",
  withdrawn: "Geri çekildi",
};
function deadline(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function localDate(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function AssignmentsPanel({
  courseId,
  teacher,
  initialTarget,
  clearTarget,
  initialAssignment,
}: {
  courseId: string;
  teacher: boolean;
  initialTarget?: string;
  clearTarget?: () => void;
  initialAssignment?: string;
}) {
  const router = useRouter();
  const [submissionFilter, setSubmissionFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [assignments, setAssignments] = useState<Assignment[] | null>(null),
    [options, setOptions] = useState<Options | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [editor, setEditor] = useState<Assignment | "new" | null>(initialTarget ? "new" : null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!initialAssignment) return;
    let active = true;
    api<Detail>(`courses/${courseId}/assignments/${initialAssignment}`)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [initialAssignment, courseId]);
  const refresh = useCallback(async () => {
    setAssignments(await api<Assignment[]>(`courses/${courseId}/assignments`));
  }, [courseId]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Assignment[]>(`courses/${courseId}/assignments`),
      teacher ? api<Options>(`courses/${courseId}/assignment-options`) : Promise.resolve(null),
    ])
      .then(([items, opts]) => {
        if (active) {
          setAssignments(items);
          setOptions(opts);
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [courseId, teacher]);
  async function act(fn: () => Promise<unknown>, detailId?: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (detailId) setDetail(await api<Detail>(`courses/${courseId}/assignments/${detailId}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="assignments-panel">
      <ErrorBanner message={error} />
      <div className="section-heading">
        <div>
          <h2>Ödevler</h2>
          <p className="muted">Teslimler ve geri bildirimler burada.</p>
        </div>
        {teacher && (
          <button
            className="button primary"
            disabled={!options || busy}
            onClick={() => setEditor("new")}
          >
            <Plus size={17} />
            Ödev oluştur
          </button>
        )}
      </div>
      {teacher && assignments && (
        <div className="teacher-filter-bar">
          <label>
            Ödev durumu
            <select
              aria-label="Ödev durumu"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
            >
              <option value="all">Tüm ödevler</option>
              <option value="draft">Taslak</option>
              <option value="published">Yayındaki ödevler</option>
              <option value="closed">Kapalı</option>
            </select>
          </label>
        </div>
      )}
      {!assignments ? (
        <Spinner />
      ) : !assignments.length ? (
        <Empty
          title={teacher ? "İlk ödevini hazırla" : "Henüz ödevin yok"}
          description={
            teacher
              ? "İnteraktif etkinlikleri seç veya metin, bağlantı ve dosya teslimi iste."
              : "Akademisyenin ödev yayımladığında burada görünecek."
          }
        />
      ) : (
        <div className="assignment-grid">
          {assignments
            .filter((a) => assignmentFilter === "all" || a.status === assignmentFilter)
            .map((a) => (
              <article className="assignment-card" key={a.id}>
                <div className="assignment-card-top">
                  <span className="activity-row-icon color-violet">
                    {a.kind === "interactive" ? <ListChecks size={22} /> : <FileText size={22} />}
                  </span>
                  <Pill tone={a.status === "published" ? "green" : "neutral"}>
                    {statusLabels[a.status]}
                  </Pill>
                </div>
                <h3>{a.title}</h3>
                <p>
                  {a.kind === "interactive"
                    ? `${a.activity_version_ids.length} interaktif etkinlik`
                    : "Dosya, metin veya bağlantı teslimi"}
                </p>
                <span className="assignment-deadline">
                  <Clock3 size={15} />
                  {deadline(a.due_at)}
                </span>
                {teacher ? (
                  <p className="assignment-count">
                    {a.submission_count || 0}/{a.target_count || 0} öğrenci teslim etti
                  </p>
                ) : (
                  a.submission_status && (
                    <Pill tone={a.submission_status === "returned" ? "orange" : "green"}>
                      {statusLabels[a.submission_status]}
                    </Pill>
                  )
                )}
                <div className="assignment-card-actions">
                  <button
                    className="button small secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () =>
                        setDetail(await api<Detail>(`courses/${courseId}/assignments/${a.id}`)),
                      )
                    }
                  >
                    Ödevi aç
                  </button>
                  {teacher && a.status === "draft" && (
                    <button
                      className="button small primary"
                      disabled={busy}
                      onClick={() =>
                        void act(() => api(`courses/${courseId}/assignments/${a.id}/publish`, {}))
                      }
                    >
                      Yayımla
                    </button>
                  )}
                </div>
              </article>
            ))}
          {!assignments.some(
            (a) => assignmentFilter === "all" || a.status === assignmentFilter,
          ) && <p className="desk-empty">Bu durumda bir ödev yok.</p>}
        </div>
      )}
      {editor && options && (
        <AssignmentForm
          courseId={courseId}
          existing={editor === "new" ? undefined : editor}
          options={options}
          initialTargets={initialTarget ? [initialTarget] : []}
          close={() => {
            setEditor(null);
            clearTarget?.();
          }}
          saved={refresh}
        />
      )}
      {detail && (
        <Modal title={detail.assignment.title} onClose={() => setDetail(null)} wide>
          <ErrorBanner message={error} />
          <div className="assignment-detail-meta">
            <Pill>
              {detail.assignment.kind === "interactive" ? "İnteraktif ödev" : "Geleneksel ödev"}
            </Pill>
            <span>Son teslim: {deadline(detail.assignment.due_at)}</span>
          </div>
          <p className="assignment-description">
            {detail.assignment.description || "Akademisyenin bu ödev için açıklama eklememiş."}
          </p>
          {!!detail.resources.length && (
            <div className="assignment-resources">
              {detail.resources.map((r) => (
                <a key={r.id} className="text-button" href={`/api/files/${r.id}`}>
                  <ExternalLink size={14} /> {r.original_name}
                </a>
              ))}
            </div>
          )}
          {teacher ? (
            <>
              <div className="assignment-management">
                {detail.assignment.status === "draft" ? (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setEditor(detail.assignment);
                        setDetail(null);
                      }}
                    >
                      Taslağı düzenle
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            api(
                              `courses/${courseId}/assignments/${detail.assignment.id}/publish`,
                              {},
                            ),
                          detail.assignment.id,
                        )
                      }
                    >
                      Ödevi yayımla
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            api(`courses/${courseId}/assignments/${detail.assignment.id}/manage`, {
                              status:
                                detail.assignment.status === "closed" ? "published" : "closed",
                            }),
                          detail.assignment.id,
                        )
                      }
                    >
                      {detail.assignment.status === "closed" ? "Teslimleri aç" : "Teslimleri kapat"}
                    </button>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={detail.assignment.allow_late}
                        disabled={busy}
                        onChange={(e) =>
                          void act(
                            () =>
                              api(
                                `courses/${courseId}/assignments/${detail.assignment.id}/manage`,
                                { allow_late: e.target.checked },
                              ),
                            detail.assignment.id,
                          )
                        }
                      />
                      Geç teslimlere izin ver
                    </label>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const date = String(new FormData(e.currentTarget).get("due_at"));
                        void act(
                          () =>
                            api(`courses/${courseId}/assignments/${detail.assignment.id}/manage`, {
                              due_at: new Date(date).toISOString(),
                            }),
                          detail.assignment.id,
                        );
                      }}
                    >
                      <Field label="Son teslim tarihini değiştir">
                        <input
                          key={detail.assignment.due_at}
                          name="due_at"
                          type="datetime-local"
                          required
                          defaultValue={localDate(detail.assignment.due_at)}
                        />
                      </Field>
                      <button className="button small secondary" disabled={busy}>
                        Tarihi güncelle
                      </button>
                    </form>
                  </>
                )}
              </div>
              <h3>Teslimler</h3>
              <div className="teacher-filter-bar">
                <label>
                  Teslimleri göster
                  <select
                    aria-label="Teslimleri göster"
                    value={submissionFilter}
                    onChange={(e) => setSubmissionFilter(e.target.value)}
                  >
                    <option value="all">Tüm teslimler</option>
                    <option value="submitted">Değerlendirme bekleyenler</option>
                    <option value="reviewed">Değerlendirilenler</option>
                    <option value="returned">Düzeltme istenenler</option>
                  </select>
                </label>
                <span className="muted">
                  {detail.submissions.filter((s) => s.status === "submitted").length} değerlendirme
                  bekliyor
                </span>
              </div>
              {!detail.submissions.length ? (
                <p className="muted">Henüz teslim yapılmadı.</p>
              ) : (
                detail.submissions
                  .filter((s) => submissionFilter === "all" || s.status === submissionFilter)
                  .map((s) => (
                    <section className="submission-card" key={s.id}>
                      <div className="section-heading">
                        <h3>{s.display_name}</h3>
                        <Pill tone={s.status === "returned" ? "orange" : "neutral"}>
                          {statusLabels[s.status]}
                        </Pill>
                      </div>
                      <SubmissionHistory detail={detail} submission={s} />
                      {s.status === "submitted" && (
                        <form
                          className="review-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const form = new FormData(e.currentTarget);
                            void act(
                              () =>
                                api(`courses/${courseId}/submissions/${s.id}/review`, {
                                  feedback: String(form.get("feedback")),
                                  grade: form.get("grade") ? Number(form.get("grade")) : null,
                                  returned: form.get("returned") === "on",
                                }),
                              detail.assignment.id,
                            );
                          }}
                        >
                          <Field label={`${s.display_name} için geri bildirim`}>
                            <textarea name="feedback" required maxLength={10000} rows={3} />
                          </Field>
                          <Field label="Not (0–100, isteğe bağlı)">
                            <input name="grade" type="number" min="0" max="100" />
                          </Field>
                          <label className="checkbox-row">
                            <input name="returned" type="checkbox" />
                            Düzeltme için öğrenciye geri gönder
                          </label>
                          <button className="button primary" disabled={busy}>
                            Değerlendirmeyi kaydet
                          </button>
                        </form>
                      )}
                    </section>
                  ))
              )}
              {!!detail.submissions.length &&
                !detail.submissions.some(
                  (s) => submissionFilter === "all" || s.status === submissionFilter,
                ) && (
                  <p className="desk-empty" role="status">
                    Bu durumda bir teslim yok.
                  </p>
                )}
            </>
          ) : (
            <>
              {detail.submissions.map((s) => (
                <section key={s.id} className="submission-card">
                  <div className="section-heading">
                    <h3>Senin teslimin</h3>
                    <Pill tone={s.status === "returned" ? "orange" : "green"}>
                      {statusLabels[s.status]}
                    </Pill>
                  </div>
                  <SubmissionHistory detail={detail} submission={s} />
                  {["submitted", "in_progress"].includes(s.status) &&
                    detail.assignment.status === "published" && (
                      <button
                        className="text-button danger-text"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              api(
                                `courses/${courseId}/assignments/${detail.assignment.id}/withdraw`,
                                {},
                              ),
                            detail.assignment.id,
                          )
                        }
                      >
                        Teslimi geri çek
                      </button>
                    )}
                </section>
              ))}
              {detail.assignment.status === "published" &&
                (!detail.submissions.length ||
                  ["returned", "withdrawn", "in_progress"].includes(
                    detail.submissions[0].status,
                  )) &&
                (detail.assignment.kind === "interactive" ? (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const s = await api<LearningSession>(
                          `courses/${courseId}/assignments/${detail.assignment.id}/start`,
                          {},
                        );
                        router.push(`/learn/${s.id}`);
                      })
                    }
                  >
                    <Play size={17} />
                    {detail.submissions[0]?.status === "in_progress"
                      ? "Ödeve devam et"
                      : "İnteraktif ödevi çöz"}
                  </button>
                ) : (
                  <TraditionalSubmission
                    courseId={courseId}
                    assignment={detail.assignment}
                    saved={async () => {
                      await refresh();
                      setDetail(
                        await api<Detail>(
                          `courses/${courseId}/assignments/${detail.assignment.id}`,
                        ),
                      );
                    }}
                  />
                ))}
              {detail.assignment.status === "closed" && (
                <p className="notice">Bu ödev yeni teslimlere kapalı.</p>
              )}
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
function SubmissionHistory({ detail, submission }: { detail: Detail; submission: Submission }) {
  return (
    <div className="submission-history">
      {detail.versions
        .filter((v) => v.submission_id === submission.id)
        .map((v) => {
          const f = detail.feedback.find(
            (f) => f.submission_id === submission.id && f.revision === v.revision,
          );
          return (
            <details key={v.id} open={v.revision === submission.current_revision}>
              <summary>
                {v.revision}. teslim · {deadline(v.submitted_at)} {v.late && "· Geç teslim"}
              </summary>
              {v.first_score !== null && <p>İlk deneme başarısı: %{Number(v.first_score)}</p>}
              {v.text && <p className="submission-text">{v.text}</p>}
              {v.link && (
                <p>
                  <a
                    className="text-button"
                    href={v.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Teslim bağlantısını aç <ExternalLink size={14} />
                  </a>
                </p>
              )}
              {v.file_id && (
                <p>
                  <a className="text-button" href={`/api/files/${v.file_id}`}>
                    {v.original_name || "Teslim dosyasını indir"} <ExternalLink size={14} />
                  </a>
                </p>
              )}
              {f && (
                <div className="assignment-feedback">
                  <strong>
                    {f.returned ? "Düzeltme istendi" : "Akademisyen geri bildirimi"}
                    {f.grade !== null && ` · ${Number(f.grade)}/100`}
                  </strong>
                  <p>{f.feedback}</p>
                </div>
              )}
            </details>
          );
        })}
    </div>
  );
}
function TraditionalSubmission({
  courseId,
  assignment,
  saved,
}: {
  courseId: string;
  assignment: Assignment;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState<{ id: string; name: string } | null>(null),
    [requestKey] = useState(() => crypto.randomUUID());
  return (
    <form
      className="submission-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await api(`courses/${courseId}/assignments/${assignment.id}/submit`, {
            request_key: requestKey,
            text: String(form.get("text") || ""),
            link: String(form.get("link") || ""),
            file_id: file?.id,
          });
          await saved();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Teslimini hazırla</h3>
      <ErrorBanner message={error} />
      <Field label="Teslim metni">
        <textarea name="text" rows={5} maxLength={20000} />
      </Field>
      <Field label="Teslim bağlantısı">
        <input name="link" type="url" placeholder="https://…" />
      </Field>
      <Field label="Dosya ekle (PDF, PNG, JPEG · en fazla 20 MB)">
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          disabled={busy}
          onChange={async (e) => {
            const chosen = e.target.files?.[0];
            if (!chosen) return;
            setBusy(true);
            setError("");
            try {
              const form = new FormData();
              form.set("file", chosen);
              form.set("course_id", courseId);
              form.set("assignment_id", assignment.id);
              form.set("purpose", "submission");
              const response = await fetch("/api/uploads", { method: "POST", body: form });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setFile(result);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      {file && <p className="muted">Eklendi: {file.name}</p>}
      <button className="button primary" disabled={busy}>
        {busy ? "Kaydediliyor…" : "Ödevi teslim et"}
      </button>
    </form>
  );
}
function AssignmentForm({
  courseId,
  existing,
  options,
  close,
  saved,
  initialTargets,
}: {
  courseId: string;
  existing?: Assignment;
  options: Options;
  close: () => void;
  saved: () => Promise<void>;
  initialTargets: string[];
}) {
  const [kind, setKind] = useState(existing?.kind || "traditional"),
    [initialDue] = useState(
      () => existing?.due_at || new Date(Date.now() + 7 * 86400000).toISOString(),
    ),
    [activities, setActivities] = useState<string[]>(existing?.activity_version_ids || []),
    [targets, setTargets] = useState<string[]>(existing?.target_ids || initialTargets),
    [files, setFiles] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!existing) return;
    let active = true;
    api<Detail>(`courses/${courseId}/assignments/${existing.id}`)
      .then((d) => {
        if (active) setFiles(d.resources.map((r) => r.id));
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [courseId, existing]);
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
  return (
    <Modal title={existing ? "Ödevi düzenle" : "Yeni ödev"} onClose={close} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await api(`courses/${courseId}/assignments${existing ? `/${existing.id}/edit` : ""}`, {
              title: String(form.get("title")),
              description: String(form.get("description")),
              kind,
              due_at: new Date(String(form.get("due_at"))).toISOString(),
              allow_late: form.get("allow_late") === "on",
              activity_version_ids: kind === "interactive" ? activities : [],
              target_ids: targets,
              file_ids: files,
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
        <ErrorBanner message={error} />
        <Field label="Ödev başlığı">
          <input
            name="title"
            required
            minLength={2}
            maxLength={180}
            defaultValue={existing?.title}
          />
        </Field>
        <Field label="Açıklama">
          <textarea
            name="description"
            rows={3}
            maxLength={10000}
            defaultValue={existing?.description}
          />
        </Field>
        <div className="form-grid">
          <Field label="Ödev tipi">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="traditional">Dosya / metin / bağlantı</option>
              <option value="interactive">İnteraktif etkinlikler</option>
            </select>
          </Field>
          <Field label="Son teslim (cihazının yerel saati)">
            <input
              name="due_at"
              type="datetime-local"
              required
              defaultValue={localDate(initialDue)}
            />
          </Field>
        </div>
        <label className="checkbox-row">
          <input name="allow_late" type="checkbox" defaultChecked={existing?.allow_late} />
          Geç teslimlere izin ver
        </label>
        {kind === "interactive" && (
          <fieldset className="assignment-selection">
            <legend>Yayımlanmış etkinlikler</legend>
            {options.activities.length ? (
              options.activities.map((a) => (
                <label key={a.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={activities.includes(a.id)}
                    onChange={() => setActivities(toggle(activities, a.id))}
                  />
                  {a.title}
                </label>
              ))
            ) : (
              <p className="muted">Önce bu derste etkinlik yayımla.</p>
            )}
          </fieldset>
        )}
        <fieldset className="assignment-selection">
          <legend>Hedef öğrenciler</legend>
          <p className="muted">Seçim yapmazsan yayımlama anındaki tüm sınıfa atanır.</p>
          {options.students.map((s) => (
            <label key={s.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={targets.includes(s.id)}
                onChange={() => setTargets(toggle(targets, s.id))}
              />
              {s.display_name}
            </label>
          ))}
        </fieldset>
        {!!options.files.length && (
          <fieldset className="assignment-selection">
            <legend>Ek kaynaklar</legend>
            {options.files.map((f) => (
              <label key={f.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={files.includes(f.id)}
                  onChange={() => setFiles(toggle(files, f.id))}
                />
                {f.original_name}
              </label>
            ))}
          </fieldset>
        )}
        <button className="button primary full-width" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Ödev taslağını kaydet"}
        </button>
      </form>
    </Modal>
  );
}
