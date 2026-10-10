"use client";
import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client";
import {
  validateActivity,
  publicActivity,
  kindLabels,
  type ActivityInput,
  type StoredActivity,
} from "@/modules/activities/schema";
import { gradeActivity, answerSummary } from "@/modules/activities/grader";
import type { Objective } from "@/types/domain";
import { Modal, Field, ErrorBanner } from "../ui";
import { ActivityPlayer } from "./player";
import { RegionEditor } from "./region-editor";

function editorText(a?: StoredActivity) {
  if (!a) return "";
  const activity = a as ActivityInput;
  if (activity.kind === "matching")
    return activity.content.left
      .map(
        (l) =>
          `${l.label} = ${activity.content.right.find((r) => r.id === activity.answer_key.pairs[l.id])?.label}`,
      )
      .join("\n");
  if (activity.kind === "ordering")
    return activity.answer_key.order
      .map((id) => activity.content.items.find((i) => i.id === id)?.label)
      .join("\n");
  if (activity.kind === "fill_blank")
    return Object.entries(activity.answer_key.accepted)
      .map(([id, answers]) => `${id} = ${answers.join(" | ")}`)
      .join("\n");
  if (activity.kind === "categorize")
    return activity.content.items
      .map(
        (i) =>
          `${i.label} = ${activity.content.categories.find((c) => c.id === activity.answer_key.categories[i.id])?.label}`,
      )
      .join("\n");
  if (activity.kind === "region")
    return JSON.stringify({ content: activity.content, answer_key: activity.answer_key }, null, 2);
  return "";
}
export function ActivityEditor({
  courseId,
  objectives,
  existing,
  onClose,
  onSaved,
}: {
  courseId: string;
  objectives: Objective[];
  existing?: StoredActivity;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<ActivityInput["kind"]>(existing?.kind || "true_false");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<ActivityInput | null>(null);
  const [result, setResult] = useState<{
    correct: boolean;
    explanation: string;
    correct_answer: string;
  } | null>(null);
  function build() {
    const values = Object.fromEntries(new FormData(ref.current!).entries());
    const common = {
      kind,
      title: values.title,
      instruction: values.instruction,
      explanation: values.explanation,
      difficulty: Number(values.difficulty),
      source_refs: existing?.source_refs || [],
    };
    let content: unknown, answer_key: unknown;
    const lines = String(values.items || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (kind === "true_false") {
      content = { statement: values.statement };
      answer_key = { value: values.correct === "true" };
    } else if (kind === "ordering") {
      const items = lines.map((label, i) => ({ id: `i${i}`, label }));
      content = { items };
      answer_key = { order: items.map((i) => i.id) };
    } else if (kind === "matching") {
      const pairs = lines.map((l) => {
        const split = l.indexOf("=");
        if (split < 1) throw new Error("Her eşleştirmeyi kavram = açıklama biçiminde yaz.");
        return [l.slice(0, split).trim(), l.slice(split + 1).trim()];
      });
      content = {
        left: pairs.map(([label], i) => ({ id: `l${i}`, label })),
        right: pairs.map(([, label], i) => ({ id: `r${i}`, label })),
      };
      answer_key = { pairs: Object.fromEntries(pairs.map((_, i) => [`l${i}`, `r${i}`])) };
    } else if (kind === "fill_blank") {
      const accepted = Object.fromEntries(
        lines.map((l) => {
          const split = l.indexOf("=");
          if (split < 1) throw new Error("Her boşluğu id = cevap biçiminde yaz.");
          return [
            l.slice(0, split).trim(),
            l
              .slice(split + 1)
              .split("|")
              .map((v) => v.trim())
              .filter(Boolean),
          ];
        }),
      );
      content = {
        text: values.statement,
        blanks: Object.keys(accepted).map((id) => ({ id, label: id })),
      };
      answer_key = { accepted };
    } else if (kind === "categorize") {
      const pairs = lines.map((l) => {
        const split = l.indexOf("=");
        if (split < 1) throw new Error("Her öğeyi kavram = kategori biçiminde yaz.");
        return [l.slice(0, split).trim(), l.slice(split + 1).trim()];
      });
      const categories = [...new Set(pairs.map((p) => p[1]))].map((label, i) => ({
        id: `c${i}`,
        label,
      }));
      content = { items: pairs.map(([label], i) => ({ id: `i${i}`, label })), categories };
      answer_key = {
        categories: Object.fromEntries(
          pairs.map(([, label], i) => [`i${i}`, categories.find((c) => c.label === label)?.id]),
        ),
      };
    } else {
      const parsed = JSON.parse(String(values.items));
      content = parsed.content;
      answer_key = parsed.answer_key;
    }
    return {
      objective_id: String(values.objective_id),
      activity: validateActivity({ ...common, content, answer_key }),
    };
  }
  function showPreview() {
    setError("");
    try {
      setPreview(build().activity);
      setResult(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = build();
      await api(
        `courses/${courseId}/activities${existing ? `/${existing.activity_id}/edit` : ""}`,
        data,
      );
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal wide title={existing ? "Etkinliği düzenle" : "Yeni etkinlik"} onClose={onClose}>
      <ErrorBanner message={error} />
      {preview ? (
        <>
          <ActivityPlayer
            key={JSON.stringify(preview)}
            activity={publicActivity({
              ...preview,
              id: "preview",
              activity_id: "preview",
              course_id: courseId,
              objective_id: "",
              version: 1,
              published_at: null,
            } as StoredActivity)}
            result={result}
            onSubmit={(answer) =>
              setResult({
                ...gradeActivity(preview, answer),
                explanation: preview.explanation,
                correct_answer: answerSummary(preview),
              })
            }
          />
          <button className="button secondary full-width" onClick={() => setPreview(null)}>
            Editöre dön
          </button>
        </>
      ) : (
        <form ref={ref} onSubmit={save}>
          <div className="form-grid">
            <Field label="Kazanım">
              <select name="objective_id" defaultValue={existing?.objective_id} required>
                {objectives.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.topic_title} · {o.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Etkinlik türü">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ActivityInput["kind"])}
              >
                {Object.entries(kindLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Başlık">
            <input name="title" required maxLength={200} defaultValue={existing?.title} />
          </Field>
          <Field label="Öğrenci yönergesi">
            <input
              name="instruction"
              required
              defaultValue={existing?.instruction || "Cevabını seç ve kontrol et."}
            />
          </Field>
          {(kind === "true_false" || kind === "fill_blank") && (
            <Field label={kind === "true_false" ? "Önerme" : "Metin (boşluklar: {{b1}})"}>
              <textarea
                name="statement"
                required
                rows={3}
                defaultValue={
                  existing
                    ? String(
                        (existing.content as { statement?: string; text?: string }).statement ||
                          (existing.content as { text?: string }).text ||
                          "",
                      )
                    : ""
                }
              />
            </Field>
          )}
          {kind === "true_false" ? (
            <Field label="Doğru cevap">
              <select
                name="correct"
                defaultValue={
                  existing ? String((existing.answer_key as { value: boolean }).value) : "true"
                }
              >
                <option value="true">Doğru</option>
                <option value="false">Yanlış</option>
              </select>
            </Field>
          ) : kind === "region" ? (
            <RegionEditor
              courseId={courseId}
              existing={
                existing?.kind === "region"
                  ? (existing as Extract<ActivityInput, { kind: "region" }>)
                  : undefined
              }
            />
          ) : (
            <Field
              label={
                kind === "matching"
                  ? "Her satıra bir eş: kavram = açıklama"
                  : kind === "ordering"
                    ? "Öğeleri doğru sırayla, her satıra bir tane yaz"
                    : kind === "fill_blank"
                      ? "Her satıra: b1 = doğru cevap | diğer kabul edilen cevap"
                      : kind === "categorize"
                        ? "Her satıra: öğe = kategori"
                        : "Görsel ve doğrulanmış bölgeler (JSON)"
              }
            >
              <textarea
                key={kind}
                name="items"
                required
                rows={6}
                defaultValue={editorText(existing)}
                placeholder={
                  kind === "matching"
                    ? "Değişken = Bir değeri saklayan ad\nDöngü = Tekrarlayan işlemler"
                    : kind === "ordering"
                      ? "Başla\nVeriyi oku\nİşle\nBitir"
                      : ""
                }
              />
            </Field>
          )}
          <Field label="Öğrenme açıklaması">
            <textarea
              name="explanation"
              required
              rows={3}
              defaultValue={existing?.explanation}
              placeholder="Cevabın neden doğru olduğunu kısaca açıkla."
            />
          </Field>
          <Field label="Zorluk">
            <select name="difficulty" defaultValue={existing?.difficulty || 1}>
              <option value="1">1 · Başlangıç</option>
              <option value="2">2 · Orta</option>
              <option value="3">3 · İleri</option>
            </select>
          </Field>
          <p className="field-help">
            Taslak olarak kaydedilir. İnceleyip ayrı olarak yayımlayabilirsin.
            {existing?.published_at
              ? " Düzenleme yeni bir sürüm oluşturur; eski cevaplar korunur."
              : ""}
          </p>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={showPreview}>
              Önizle
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Kaydediliyor…" : "Taslağı kaydet"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
