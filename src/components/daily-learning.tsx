"use client";
import { BookOpen, Check, Clock3, GraduationCap, Play, Sparkles } from "lucide-react";
import type { DailyView, PlanItem } from "@/modules/scheduling/service";

export function DailyLearning({
  daily,
  busy,
  start,
  explore,
}: {
  daily: DailyView;
  busy: boolean;
  start: (item: PlanItem) => void;
  explore: () => void;
}) {
  const done = daily.items.filter((i) => i.status === "completed").length;
  const complete = daily.plan.status === "completed",
    empty = daily.plan.status === "no_content";
  const next =
    daily.items.find((i) => i.status === "in_progress") ||
    daily.items.find((i) => i.status === "ready");
  return (
    <section aria-label="Günlük öğrenme planın">
      <div className="student-welcome-card">
        <div>
          <span className="pill pill-light">
            <Sparkles size={14} /> BUGÜNKÜ ÖĞRENME YOLUN
          </span>
          <h2>
            {complete ? (
              <>
                Bugünün adımlarını
                <br />
                tamamladın!
              </>
            ) : empty ? (
              <>
                Yeni içerikler
                <br />
                hazırlanıyor.
              </>
            ) : (
              <>
                Küçük adımlar,
                <br />
                kalıcı bilgiler.
              </>
            )}
          </h2>
          <p>
            {complete
              ? "İstersen derslerinden seçerek keşfetmeye devam et."
              : empty
                ? "Akademisyenin etkinlik yayımladığında öğrenme yolun burada açılacak."
                : `${daily.items.length} kazanım · ${daily.items.reduce((sum, i) => sum + i.activity_version_ids.length, 0)} etkinlik · yaklaşık ${daily.plan.estimated_minutes} dakika`}
          </p>
          {next ? (
            <button className="button white-button" disabled={busy} onClick={() => start(next)}>
              <Play size={17} />
              {next.status === "in_progress"
                ? "Günlük çalışmaya devam et"
                : "Günlük çalışmaya başla"}
            </button>
          ) : (
            <button className="button white-button" onClick={explore}>
              <BookOpen size={17} />
              Derslerini keşfet
            </button>
          )}
          {!empty && (
            <p className="daily-hero-progress">
              {done}/{daily.items.length} adım tamamlandı
              {complete ? " · Eline sağlık!" : " · Kendi hızında ilerle."}
            </p>
          )}
        </div>
        <div className="journey-graphic" aria-hidden="true">
          <span className="journey-node node-a">
            <BookOpen size={26} />
          </span>
          <span className="journey-node node-b">
            <Check size={26} />
          </span>
          <span className="journey-node node-c">
            <GraduationCap size={34} />
          </span>
          <div className="journey-line" />
        </div>
      </div>
      {!!daily.items.length && (
        <div className="daily-plan-list">
          {daily.items.map((item, index) => (
            <article
              key={item.id}
              className={`daily-plan-row ${item.status === "completed" ? "task-completed" : ""}`}
            >
              <span className={`daily-step color-${item.snapshot.color}`} aria-hidden="true">
                {item.status === "completed" ? (
                  <Check size={22} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <div className="daily-task-main">
                <span className="objective-topic">
                  {item.snapshot.course_title} · {item.snapshot.topic_title}
                </span>
                <h3>{item.snapshot.title}</h3>
                <p>{item.reason}</p>
              </div>
              <span className="daily-task-size">
                <Clock3 size={14} />
                {item.activity_version_ids.length} etkinlik
              </span>
              {item.status === "completed" ? (
                <span className="pill pill-green">Tamamlandı</span>
              ) : (
                <button
                  className="button small secondary"
                  disabled={busy}
                  onClick={() => start(item)}
                >
                  {item.status === "in_progress" ? "Devam et" : "Başla"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
