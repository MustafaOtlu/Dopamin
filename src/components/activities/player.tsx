"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { PublicActivity } from "@/modules/activities/schema";
import type { ActivityInput } from "@/modules/activities/schema";
import { TileMatching } from "./tile-matching";
import { SortableSteps } from "./sortable-steps";

export function ActivityPlayer({
  activity,
  onSubmit,
  busy = false,
  result,
  headingLevel = 2,
  companion,
}: {
  activity: PublicActivity;
  onSubmit: (answer: unknown) => void;
  busy?: boolean;
  headingLevel?: 1 | 2;
  companion?: React.ReactNode;
  result?: {
    correct: boolean | null;
    explanation: string;
    correct_answer: string;
    pending_feedback?: boolean;
  } | null;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const FeedbackHeading = headingLevel === 1 ? "h2" : "h3";
  const [answer, setAnswer] = useState<unknown>(
    activity.kind === "ordering"
      ? [
          ...(
            activity.content as Extract<ActivityInput, { kind: "ordering" }>["content"]
          ).items.map((i) => i.id),
        ].reverse()
      : activity.kind === "true_false"
        ? null
        : {},
  );
  const disabled = busy || !!result;
  const [selectedRegion, setSelectedRegion] = useState(0);
  const values = answer as Record<string, string>;
  const setValue = (id: string, value: string) => setAnswer({ ...values, [id]: value });
  let complete = false;
  let controls: React.ReactNode;
  if (activity.kind === "true_false") {
    const content = activity.content as Extract<ActivityInput, { kind: "true_false" }>["content"];
    complete = typeof answer === "boolean";
    controls = (
      <>
        <div className="question-statement">{content.statement}</div>
        <div className="binary-options">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              disabled={disabled}
              aria-pressed={answer === v}
              className={`answer-option ${answer === v ? "selected" : ""}`}
              onClick={() => setAnswer(v)}
            >
              {v ? <Check /> : <X />}
              {v ? "Doğru" : "Yanlış"}
            </button>
          ))}
        </div>
      </>
    );
  } else if (activity.kind === "matching") {
    const content = activity.content as Extract<ActivityInput, { kind: "matching" }>["content"];
    complete = content.left.every((i) => values[i.id]);
    controls = (
      <TileMatching
        left={content.left}
        right={content.right}
        value={values}
        onChange={setAnswer}
        disabled={disabled}
      />
    );
  } else if (activity.kind === "ordering") {
    const content = activity.content as Extract<ActivityInput, { kind: "ordering" }>["content"];
    const order = answer as string[];
    complete = order.length === content.items.length;
    controls = (
      <SortableSteps items={content.items} value={order} onChange={setAnswer} disabled={disabled} />
    );
  } else if (activity.kind === "fill_blank") {
    const content = activity.content as Extract<ActivityInput, { kind: "fill_blank" }>["content"];
    complete = content.blanks.every((b) => values[b.id]?.trim());
    controls = (
      <>
        <p className="question-statement">
          {content.text.split(/(\{\{[^}]+\}\})/).map((part, i) =>
            part.startsWith("{{") ? (
              <strong className="blank-marker" key={i}>
                {content.blanks.find((b) => b.id === part.slice(2, -2))?.label}
              </strong>
            ) : (
              part
            ),
          )}
        </p>
        <div className="blank-fields">
          {content.blanks.map((b) => (
            <label className="field" key={b.id}>
              <span>{b.label}</span>
              <input
                disabled={disabled}
                value={values[b.id] || ""}
                onChange={(e) => setValue(b.id, e.target.value)}
                autoComplete="off"
              />
            </label>
          ))}
        </div>
      </>
    );
  } else if (activity.kind === "categorize") {
    const content = activity.content as Extract<ActivityInput, { kind: "categorize" }>["content"];
    complete = content.items.every((i) => values[i.id]);
    controls = (
      <div className="matching-grid">
        {content.items.map((i) => (
          <label className="match-row" key={i.id}>
            <span>{i.label}</span>
            <select
              disabled={disabled}
              value={values[i.id] || ""}
              aria-label={`${i.label} kategorisi`}
              onChange={(e) => setValue(i.id, e.target.value)}
            >
              <option value="">Kategori seç</option>
              {content.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  } else {
    const content = activity.content as Extract<ActivityInput, { kind: "region" }>["content"];
    const points = answer as Record<string, { x: number; y: number }>;
    complete = content.regions.every(
      (r) => Number.isFinite(points[r.id]?.x) && Number.isFinite(points[r.id]?.y),
    );
    controls = (
      <>
        <div className="region-choice-labels">
          {content.regions.map((r, i) => (
            <button
              key={r.id}
              className={`button small ${selectedRegion === i ? "primary" : "secondary"}`}
              aria-pressed={selectedRegion === i}
              disabled={disabled}
              onClick={() => setSelectedRegion(i)}
            >
              {i + 1}. {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          className="region-image region-click-surface"
          aria-label={`${content.regions[selectedRegion].label} için görselde bir nokta seç`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect(),
              id = content.regions[selectedRegion].id;
            setAnswer({
              ...points,
              [id]: {
                x:
                  e.detail === 0
                    ? 0.5
                    : Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
                y:
                  e.detail === 0
                    ? 0.5
                    : Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
              },
            });
            if (selectedRegion < content.regions.length - 1) setSelectedRegion(selectedRegion + 1);
          }}
        >
          <img src={content.image_url} alt={content.alt} />
          {Object.entries(points).map(([id, p]) => (
            <span
              className="region-pin"
              key={id}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              {content.regions.findIndex((r) => r.id === id) + 1}
            </span>
          ))}
        </button>
        <p className="muted">
          Bir hedef seçip görsele dokun. Klavyeyle çalışırken aşağıdaki konum alanlarını
          kullanabilirsin.
        </p>
        {content.regions.map((r) => (
          <fieldset className="region-coordinate" key={r.id}>
            <legend>{r.label}</legend>
            {(["x", "y"] as const).map((axis) => (
              <label key={axis}>
                {axis === "x" ? "Yatay (%)" : "Dikey (%)"}
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={disabled}
                  value={points[r.id]?.[axis] === undefined ? "" : points[r.id][axis] * 100}
                  onChange={(e) =>
                    setAnswer({
                      ...points,
                      [r.id]: { ...points[r.id], [axis]: Number(e.target.value) / 100 },
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
        ))}
      </>
    );
  }
  return (
    <div className={`activity-player activity-${activity.kind} ${result ? "has-result" : ""}`}>
      <Heading className="activity-title">
        {activity.kind === "matching" ? "Kavramları eşleştir" : activity.title}
      </Heading>
      {!["matching", "ordering", "true_false"].includes(activity.kind) && (
        <p className="activity-instruction">{activity.instruction}</p>
      )}
      <div className="activity-controls">{controls}</div>
      {result ? (
        <div
          className={`answer-feedback ${companion ? "has-companion" : ""} ${result.pending_feedback ? "pending-feedback" : result.correct ? "correct" : "incorrect"}`}
          role="status"
        >
          {companion}
          <div>
            <FeedbackHeading>
              {result.pending_feedback
                ? "Cevabın kaydedildi."
                : result.correct
                  ? "Güzel, doğru cevap!"
                  : "Birlikte bakalım."}
            </FeedbackHeading>
            {!result.pending_feedback && !result.correct && (
              <p>
                <strong>Doğru cevap:</strong> {result.correct_answer}
              </p>
            )}
            <p>{result.explanation}</p>
          </div>
        </div>
      ) : (
        <button
          className="button primary submit-answer"
          disabled={!complete || busy}
          onClick={() => onSubmit(answer)}
        >
          {busy ? "Kontrol ediliyor…" : "Cevabımı kontrol et"}
        </button>
      )}
    </div>
  );
}
