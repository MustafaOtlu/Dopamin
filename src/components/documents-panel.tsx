"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, RefreshCw, Sparkles, Check, Eye, Trash2, History } from "lucide-react";
import type { Objective } from "@/types/domain";
import type { Document } from "@/modules/documents/service";
import type { CurriculumOutput } from "@/modules/ai/contracts";
import { api, errorMessage } from "@/lib/client";
import { Empty, ErrorBanner, Field, Modal, Pill } from "./ui";
import { WebSourceSettings, type WebSourceState } from "./web-source-settings";
interface ContentState {
  jobs: {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    max_attempts: number;
    manual_retries: number;
    available_at: string;
    heartbeat_at: string | null;
    scheduled: boolean;
    poll_soon: boolean;
    result: { generated?: number; published?: number; needs_review?: number } | null;
    error_message: string | null;
  }[];
  drafts: { id: string; origin: string; data: CurriculumOutput; status: string }[];
  questions: {
    id: string;
    draft_id: string;
    topic: string;
    question: string;
    reason: string;
    options: string[];
    answer: string | null;
  }[];
  usage: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number | null;
  }[];
  queue: {
    ready: number;
    scheduled: number;
    processing: number;
    stalled: number;
    attention: number;
  };
}
interface Detail extends Document {
  chunks: { page: number; text: string; heading: string | null }[];
  versions: Document[];
}
export function DocumentsPanel({
  courseId,
  objectives,
  aiConfigured,
  onChange,
}: {
  courseId: string;
  objectives: Objective[];
  aiConfigured: boolean;
  onChange: () => Promise<void>;
}) {
  const [documents, setDocuments] = useState<Document[]>([]),
    [content, setContent] = useState<ContentState | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [draft, setDraft] = useState<ContentState["drafts"][number] | null>(null),
    [generate, setGenerate] = useState(false);
  const [replaceId, setReplaceId] = useState<string | undefined>(),
    [removing, setRemoving] = useState<Document | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [web, setWeb] = useState<WebSourceState | null>(null);
  const refresh = useCallback(async () => {
    const [docs, state, sources] = await Promise.all([
      api<Document[]>(`courses/${courseId}/documents`),
      api<ContentState>(`courses/${courseId}/content`),
      api<WebSourceState>(`courses/${courseId}/web-sources`),
    ]);
    setDocuments(docs);
    setContent(state);
    setWeb(sources);
    setSelected((old) =>
      old.filter((id) =>
        docs.some((doc) => doc.id === id && doc.allowed && doc.status === "ready"),
      ),
    );
  }, [courseId]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Document[]>(`courses/${courseId}/documents`),
      api<ContentState>(`courses/${courseId}/content`),
      api<WebSourceState>(`courses/${courseId}/web-sources`),
    ])
      .then(([docs, state, sources]) => {
        if (active) {
          setDocuments(docs);
          setContent(state);
          setWeb(sources);
          setSelected([]);
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [courseId]);
  const processing = content?.jobs.some((j) => j.poll_soon);
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      void refresh().catch((err) => setError(errorMessage(err)));
    }, 3000);
    return () => clearInterval(timer);
  }, [processing, refresh]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    await act(async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("course_id", courseId);
      form.set("purpose", "document");
      if (replaceId) form.set("replace_id", replaceId);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNotice(
        result.duplicate
          ? "Bu belge daha önce yüklendi."
          : replaceId
            ? "Yeni kaynak sürümü yüklendi. Eski soruların kaynakları korunur."
            : "Belge yüklendi. Metin sayfa referanslarıyla çıkarılıyor.",
      );
      setReplaceId(undefined);
    });
  }
  function select(id: string) {
    setSelected((old) => (old.includes(id) ? old.filter((s) => s !== id) : [...old, id]));
  }
  return (
    <section className="documents-panel">
      {web && <WebSourceSettings courseId={courseId} value={web} changed={refresh} />}
      <ErrorBanner message={error} />
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button className="text-button" onClick={() => setNotice("")}>
            Kapat
          </button>
        </div>
      )}
      <div className="section-heading">
        <div>
          <h3>Ders kaynakları</h3>
          <p className="muted">Belgeler, izinli web metinleri ve incelemeye hazır içerikler.</p>
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => {
            setReplaceId(undefined);
            uploadRef.current?.click();
          }}
        >
          <Upload size={17} />
          {busy ? "Yükleniyor…" : "PDF yükle"}
        </button>
        <input
          ref={uploadRef}
          type="file"
          hidden
          accept="application/pdf"
          aria-label="PDF kaynağı seç"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
      {documents.length ? (
        <>
          <div className="source-toolbar">
            <span>{selected.length} kaynak seçili</span>
            <div>
              <button
                className="button small secondary"
                disabled={!selected.length || !aiConfigured || busy}
                onClick={() =>
                  act(() => api(`courses/${courseId}/ai/analyze`, { document_ids: selected }))
                }
              >
                <Sparkles size={15} />
                Kapsamı analiz et
              </button>
              <button
                className="button small primary"
                disabled={!selected.length || !objectives.length || !aiConfigured || busy}
                onClick={() => setGenerate(true)}
              >
                Etkinlik üret
              </button>
            </div>
          </div>
          <div className="activity-list">
            {documents.map((d) => (
              <article key={d.id} className="activity-row">
                <input
                  className="row-checkbox"
                  aria-label={`${d.title} kaynağını seç`}
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  disabled={d.status !== "ready" || !d.allowed}
                  onChange={() => select(d.id)}
                />
                <span className="activity-row-icon color-violet">
                  <FileText size={21} />
                </span>
                <div className="activity-row-main">
                  <h3>{d.title}</h3>
                  <p>
                    {d.source_kind === "web" ? "Web · " : ""}
                    {d.page_count
                      ? `${d.page_count} ${d.source_kind === "web" ? "bölüm" : "sayfa"} · `
                      : ""}
                    Sürüm {d.source_version} ·{" "}
                    {d.student_access ? "Öğrencilere açık" : "Yalnız akademisyen"}
                    {!!d.ocr_pages?.length &&
                      ` · ${d.ocr_pages.length} sayfa OCR${d.ocr_confidence === null ? "" : ` · güven %${Math.round(Number(d.ocr_confidence))}`}`}
                  </p>
                  {d.error_message && (
                    <p className={d.status === "ready" ? "muted" : "danger-text"}>
                      {d.error_message}
                    </p>
                  )}
                </div>
                <Pill
                  tone={
                    d.status === "ready"
                      ? "green"
                      : d.status === "failed" || d.status === "needs_ocr"
                        ? "orange"
                        : "neutral"
                  }
                >
                  {!d.allowed
                    ? "İzin gerekli"
                    : d.status === "ready"
                      ? d.ocr_pages?.length
                        ? "OCR · İncele"
                        : "Hazır"
                      : d.status === "needs_ocr"
                        ? "OCR gerekli"
                        : d.status === "failed"
                          ? "İşlenemedi"
                          : "İşleniyor"}
                </Pill>
                <div className="row-actions">
                  {d.source_kind === "pdf" && (
                    <button
                      className="icon-button"
                      aria-label={`${d.title} yeni sürüm yükle`}
                      disabled={busy}
                      onClick={() => {
                        setReplaceId(d.id);
                        uploadRef.current?.click();
                      }}
                    >
                      <History size={17} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`${d.title} metnini incele`}
                    onClick={() =>
                      act(async () =>
                        setDetail(await api<Detail>(`courses/${courseId}/documents/${d.id}`)),
                      )
                    }
                  >
                    <Eye size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${d.title} yeniden işle`}
                    disabled={
                      busy || !d.allowed || d.status === "processing" || d.status === "queued"
                    }
                    onClick={() =>
                      act(() =>
                        api(
                          d.source_kind === "web"
                            ? `courses/${courseId}/web-sources/${d.source_permission_id}/fetch`
                            : `courses/${courseId}/documents/${d.id}/reprocess`,
                          {},
                        ),
                      )
                    }
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${d.title} kaldır`}
                    disabled={busy}
                    onClick={() => setRemoving(d)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <Empty
          title="Kaynaklarını ekle"
          description="En fazla 20 MB PDF yükleyebilirsin. Taranmış sayfalar OCR ile okunur; çıkartılan metni kontrol edebilirsin. Kaynaklar öğrencilere izin verene kadar özel kalır."
        />
      )}
      {!aiConfigured && (
        <div className="source-info">
          <Sparkles size={18} />
          <p>
            AI bağlantısı kurulunca kapsam analizi ve etkinlik üretimi açılır. Çıkarılan metni ve
            müfredat taslaklarını şimdiden kullanabilirsin.
          </p>
        </div>
      )}
      {content?.drafts.length ? (
        <>
          <div className="section-heading">
            <h3>Müfredat taslakları</h3>
            <span className="muted">Tarih ve kazanımları doğrula</span>
          </div>
          <div className="activity-list">
            {content.drafts.map((d) => (
              <article className="activity-row" key={d.id}>
                <span className="activity-row-icon color-blue">
                  <FileText size={20} />
                </span>
                <div className="activity-row-main">
                  <h3>{d.data.course_title}</h3>
                  <p>
                    {d.data.topics.length} konu ·{" "}
                    {d.origin === "ai" ? "AI taslağı" : "Belgeden çıkarılan başlıklar"}
                  </p>
                </div>
                <button className="button small secondary" onClick={() => setDraft(d)}>
                  İncele ve düzenle
                </button>
              </article>
            ))}
          </div>
        </>
      ) : null}
      {content?.jobs.length ? (
        <>
          <div className="section-heading">
            <h3>İşlem merkezi</h3>
            <button className="text-button" onClick={() => act(refresh)}>
              Yenile
            </button>
          </div>
          <div className="queue-summary" aria-label="Ders işlem kuyruğu">
            <div>
              <strong>{content.queue.ready}</strong>
              <span>Sırada</span>
            </div>
            <div>
              <strong>{content.queue.processing}</strong>
              <span>İşleniyor</span>
            </div>
            <div>
              <strong>{content.queue.scheduled}</strong>
              <span>Zamanı bekleniyor</span>
            </div>
            <div>
              <strong>{content.queue.attention}</strong>
              <span>İnceleme gerekiyor</span>
            </div>
          </div>
          {content.queue.stalled > 0 && (
            <p className="notice">
              {content.queue.stalled} işlemin işleyici süresi dolmuş. Çalışan işleyici bu işleri
              yeniden alır.
            </p>
          )}
          <div className="jobs-list">
            {content.jobs.slice(0, 8).map((j) => (
              <div key={j.id}>
                <span>
                  {j.kind === "pdf_extract"
                    ? "PDF çözümleme"
                    : j.kind === "web_fetch"
                      ? "Web kaynağı okuma"
                      : j.kind === "ai_analyze"
                        ? "Kapsam analizi"
                        : j.kind === "file_cleanup"
                          ? "Kaynak dosyası temizliği"
                          : "Etkinlik üretimi"}
                </span>
                <Pill
                  tone={
                    j.status === "completed"
                      ? "green"
                      : j.status === "failed" || j.status === "needs_input"
                        ? "orange"
                        : "neutral"
                  }
                >
                  {j.status === "completed"
                    ? "Tamamlandı"
                    : j.status === "processing"
                      ? "İşleniyor"
                      : j.status === "queued"
                        ? j.scheduled
                          ? "Zamanı bekleniyor"
                          : "Sırada"
                        : "İnceleme gerekli"}
                </Pill>
                {j.scheduled && (
                  <small>Planlanan: {new Date(j.available_at).toLocaleString("tr-TR")}</small>
                )}
                {j.result?.generated != null && (
                  <small>
                    {j.result.generated} soru · {j.result.published || 0} yayında ·{" "}
                    {j.result.needs_review || 0} incelemede
                  </small>
                )}
                {j.error_message && <small>{j.error_message}</small>}
                {["failed", "needs_input"].includes(j.status) && j.kind !== "file_cleanup" && (
                  <button
                    className="button small secondary"
                    disabled={busy || j.manual_retries >= 5}
                    onClick={() => act(() => api(`courses/${courseId}/jobs/${j.id}/retry`, {}))}
                  >
                    <RefreshCw size={14} /> Yeniden dene
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
      {content?.usage.length ? (
        <div className="source-info">
          <p>
            {content.usage
              .map(
                (u) =>
                  `${u.model}: ${u.input_tokens.toLocaleString("tr-TR")} girdi / ${u.output_tokens.toLocaleString("tr-TR")} çıktı tokenı${u.estimated_cost_usd === null ? "" : ` · tahmini $${u.estimated_cost_usd.toFixed(4)}`}`,
              )
              .join(" · ")}
          </p>
        </div>
      ) : null}
      {detail && (
        <Modal wide title={detail.title} onClose={() => setDetail(null)}>
          {detail.source_kind === "web" && detail.source_url && (
            <div className="source-provenance">
              <a href={detail.source_url} target="_blank" rel="noopener noreferrer">
                {detail.source_url}
              </a>
              <p className="field-help">
                {detail.fetched_at &&
                  `Okunma: ${new Date(detail.fetched_at).toLocaleString("tr-TR")} · `}
                {detail.page_count} metin bölümü. Alıntılardaki bölüm numaraları bu kayıtlı metne
                aittir.
              </p>
              {!detail.allowed && (
                <p className="notice">
                  Bu kaydın kaynak izni güncel değil. Yeniden içerik üretmek için kaynağı güncel
                  izinle oku.
                </p>
              )}
            </div>
          )}
          {detail.versions.length > 1 && (
            <div className="source-versions">
              <label htmlFor="source-version">Kaynak sürümü</label>
              <select
                id="source-version"
                value={detail.id}
                onChange={(e) =>
                  act(async () =>
                    setDetail(await api<Detail>(`courses/${courseId}/documents/${e.target.value}`)),
                  )
                }
              >
                {detail.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Sürüm {v.source_version}
                    {v.superseded_by ? " · Önceki" : " · Güncel"} — {v.title}
                  </option>
                ))}
              </select>
              <p className="field-help">
                Eski yayımlanmış sorular kendi kaynak sürümlerini kullanır.
              </p>
            </div>
          )}
          <div className="form-actions">
            <a
              className="button secondary"
              href={`/api/files/${detail.file_id}`}
              target="_blank"
              rel="noreferrer"
            >
              {detail.source_kind === "web" ? "Kaydedilmiş metni indir" : "PDF indir"}
            </a>
            <button
              className="button secondary"
              disabled={busy || (!detail.student_access && !detail.allowed)}
              hidden={!!detail.superseded_by}
              onClick={() =>
                act(async () => {
                  await api(`courses/${courseId}/documents/${detail.id}/access`, {
                    student_access: !detail.student_access,
                  });
                  setDetail({ ...detail, student_access: !detail.student_access });
                })
              }
            >
              {detail.student_access ? "Öğrenci erişimini kapat" : "Öğrencilere aç"}
            </button>
          </div>
          <div className="document-text">
            {detail.chunks.map((c, i) => (
              <section key={i}>
                <span className="eyebrow">
                  {detail.source_kind === "web" ? "BÖLÜM" : "SAYFA"} {c.page}
                </span>
                <p>{c.text}</p>
              </section>
            ))}
          </div>
        </Modal>
      )}
      {removing && (
        <Modal title="Kaynağı kaldır" onClose={() => setRemoving(null)}>
          <p>
            <strong>{removing.title}</strong> ve önceki kaynak sürümleri kaldırılacak. Öğrenci
            erişimi ve yeni içerik üretimi kapanır. Yayımlanmış sorular ve geçmiş cevaplar korunur.
          </p>
          <p className="field-help">
            Özel dosyalar 30 günlük saklama süresinden sonra arka plan işleyicisiyle fiziksel olarak
            silinir.
          </p>
          <div className="form-actions">
            <button className="button secondary" onClick={() => setRemoving(null)}>
              Vazgeç
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api(`courses/${courseId}/documents/${removing.id}/delete`, {});
                  setSelected((old) => old.filter((id) => id !== removing.id));
                  setRemoving(null);
                })
              }
            >
              Kaynağı kaldır
            </button>
          </div>
        </Modal>
      )}
      {draft && content && (
        <DraftEditor
          draft={draft}
          documents={documents}
          questions={content.questions.filter((q) => q.draft_id === draft.id)}
          courseId={courseId}
          onClose={() => setDraft(null)}
          onSaved={async () => {
            await refresh();
            await onChange();
          }}
        />
      )}
      {generate && (
        <Modal title="Kaynaklardan etkinlik üret" onClose={() => setGenerate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api(`courses/${courseId}/ai/generate`, {
                  document_ids: selected,
                  objective_id: f.get("objective_id"),
                  count: Number(f.get("count")),
                });
                setGenerate(false);
                setNotice(
                  "Üretim sıraya alındı. Sonuçlar Etkinlikler alanında incelemeni bekleyecek.",
                );
              });
            }}
          >
            <Field label="Hedef kazanım">
              <select name="objective_id">
                {objectives.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Etkinlik sayısı">
              <input type="number" name="count" defaultValue={3} min={1} max={10} />
            </Field>
            <p className="field-help">
              Üretilen içerikler kaynak ve veri denetiminden geçer. Akademik doğruluğu kontrol
              ettikten sonra yayımla.
            </p>
            <button className="button primary full-width" disabled={busy}>
              Üretimi başlat
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function DraftEditor({
  draft,
  documents,
  questions,
  courseId,
  onClose,
  onSaved,
}: {
  draft: ContentState["drafts"][number];
  documents: Document[];
  questions: ContentState["questions"];
  courseId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [topics, setTopics] = useState(draft.data.topics),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [answers, setAnswers] = useState<Record<string, string>>(
      Object.fromEntries(questions.map((q) => [q.id, q.answer || ""])),
    );
  function change(index: number, values: Partial<CurriculumOutput["topics"][number]>) {
    setTopics((old) => old.map((t, i) => (i === index ? { ...t, ...values } : t)));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      for (const q of questions) {
        if (!answers[q.id].trim()) throw new Error("Bekleyen kapsam sorularını yanıtla.");
        if (answers[q.id] !== q.answer)
          await api(`courses/${courseId}/ai/clarify`, { id: q.id, answer: answers[q.id] });
      }
      await api(`courses/${courseId}/ai/approve-curriculum`, {
        id: draft.id,
        data: { ...draft.data, topics },
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal wide title="Müfredatı doğrula" onClose={onClose}>
      <form onSubmit={save}>
        <ErrorBanner message={error} />
        {questions.map((q) => (
          <section className="clarification" key={q.id}>
            <Pill tone="orange">{q.topic}</Pill>
            <h3>{q.question}</h3>
            <p className="muted">{q.reason}</p>
            <Field label="Kapsam açıklaman">
              <textarea
                value={answers[q.id]}
                required
                rows={2}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              />
            </Field>
            {q.options.length > 0 && (
              <p className="field-help">Öneriler: {q.options.join(" · ")}</p>
            )}
          </section>
        ))}
        {topics.map((t, i) => (
          <section className="draft-topic" key={i}>
            <span className="eyebrow">KONU {i + 1}</span>
            <Field label="Konu başlığı">
              <input
                value={t.title}
                required
                onChange={(e) => change(i, { title: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Hafta">
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={t.week || ""}
                  required
                  onChange={(e) => change(i, { week: Number(e.target.value) })}
                />
              </Field>
              <Field label="İşleneceği tarih">
                <input
                  type="date"
                  value={t.scheduled_date || ""}
                  required
                  onChange={(e) =>
                    change(i, { scheduled_date: e.target.value, date_is_inferred: false })
                  }
                />
              </Field>
            </div>
            {t.date_is_inferred && (
              <p className="field-help">Bu tarih AI tarafından tahmin edildi; doğrula.</p>
            )}
            <Field label="Her satıra bir ölçülebilir kazanım">
              <textarea
                value={t.objective_titles.join("\n")}
                required
                rows={3}
                onChange={(e) => change(i, { objective_titles: e.target.value.split("\n") })}
              />
            </Field>
            <div className="source-quote">
              <span>
                {documents.find((d) => d.id === t.sources[0]?.document_id)?.source_kind === "web"
                  ? "Bölüm"
                  : "Sayfa"}{" "}
                {t.sources[0]?.page}
              </span>
              <blockquote>{t.sources[0]?.quote}</blockquote>
            </div>
          </section>
        ))}
        <button className="button primary full-width" disabled={busy}>
          <Check size={17} />
          {busy ? "Uygulanıyor…" : "Doğrula ve müfredata ekle"}
        </button>
      </form>
    </Modal>
  );
}
