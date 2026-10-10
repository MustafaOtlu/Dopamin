"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  RefreshCw,
  FileText,
  MessageSquare,
  ClipboardCheck,
} from "lucide-react";
import { api, dateLabel, errorMessage } from "@/lib/client";
import type {
  TeacherWorkspace as Workspace,
  WorkspaceItem,
} from "@/modules/analytics/teacher-workspace";
import { ErrorBanner, Spinner } from "./ui";

export type TeacherDestination = {
  course: string;
  tab: "activities" | "assignments" | "students" | "gradebook";
  assignment?: string;
  student?: string;
  review?: boolean;
};
const kinds = {
  grading: "Değerlendirme",
  content: "İçerik incelemesi",
  support: "Öğrenci desteği",
};
export function TeacherWorkspace({ open }: { open: (destination: TeacherDestination) => void }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    api<Workspace>("teacher/workspace")
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  if (!data)
    return (
      <>
        <ErrorBanner message={error} />
        {!error && <Spinner />}
        {error && (
          <button className="button secondary" onClick={() => setRevision((v) => v + 1)}>
            Yeniden dene
          </button>
        )}
      </>
    );
  const counts = data.courses.reduce(
    (s, c) => ({
      grading: s.grading + c.grading,
      content: s.content + c.review,
      support: s.support + c.support,
    }),
    { grading: 0, content: 0, support: 0 },
  );
  const total = counts.grading + counts.content + counts.support;
  const rows = data.queue.filter((item) => filter === "all" || item.kind === filter);
  function openItem(item: WorkspaceItem) {
    open({
      course: item.course_id,
      tab:
        item.kind === "grading"
          ? "assignments"
          : item.kind === "content"
            ? "activities"
            : "students",
      assignment: item.kind === "grading" ? item.id : undefined,
      student: item.kind === "support" ? item.id : undefined,
      review: item.kind === "content",
    });
  }
  return (
    <div className="teacher-workspace">
      <ErrorBanner message={error} />
      <div className="desk-summary" aria-label="Bekleyen işler özeti">
        {(["grading", "content", "support"] as const).map((kind, i) => {
          const Icon = [ClipboardCheck, FileText, MessageSquare][i];
          return (
            <button key={kind} onClick={() => setFilter(kind)} aria-pressed={filter === kind}>
              <Icon size={19} />
              <span>
                {kinds[kind]}
                <strong>
                  {counts[kind]}
                  <small>bekleyen</small>
                </strong>
              </span>
              <ArrowUpRight size={17} />
            </button>
          );
        })}
      </div>
      <div className="desk-columns">
        <section className="desk-sheet" aria-labelledby="desk-inbox-title">
          <div className="desk-section-title">
            <div>
              <span className="desk-kicker">01 / GELEN KUTUSU</span>
              <h2 id="desk-inbox-title">
                Ele alınacaklar <span>{total}</span>
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="Bekleyen işleri yenile"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setRevision((v) => v + 1);
              }}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <div className="desk-filters" role="group" aria-label="Bekleyen işleri filtrele">
            {[["all", "Tümü"], ...Object.entries(kinds)].map(([id, label]) => (
              <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          {rows.length ? (
            <div className="desk-inbox">
              {rows.map((item, index) => (
                <button
                  className="desk-inbox-row"
                  key={`${item.kind}-${item.id}-${index}`}
                  onClick={() => openItem(item)}
                >
                  <span className={`desk-status-line ${item.kind}`} />
                  <span>
                    <small>
                      {item.course_title} · {kinds[item.kind]}
                    </small>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <span className="desk-row-date">
                    {dateLabel(item.created_at)}
                    <ArrowUpRight size={17} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="desk-empty">
              <Check size={26} />
              <h3>Bekleyen iş yok.</h3>
              <p>
                {filter === "all"
                  ? "Yeni teslimler, incelemeler ve destek talepleri burada görünecek."
                  : "Bu kategoride bekleyen bir kayıt bulunmuyor."}
              </p>
            </div>
          )}
          <p className="desk-footnote">
            Her kategoride en eski 40 kayıt gösterilir. Sayılar tüm aktif dersleri kapsar.
          </p>
        </section>
        <aside className="desk-agenda" aria-labelledby="desk-agenda-title">
          <span className="desk-kicker">02 / AJANDA</span>
          <h2 id="desk-agenda-title">Yaklaşan teslimler</h2>
          <p className="muted">Önümüzdeki 14 gün</p>
          {data.deadlines.length ? (
            data.deadlines.map((a) => (
              <button
                className="desk-deadline"
                key={a.id}
                onClick={() => open({ course: a.course_id, tab: "assignments", assignment: a.id })}
              >
                <time dateTime={a.due_at}>
                  {dateLabel(a.due_at)}
                  <small>
                    {new Date(a.due_at).toLocaleTimeString("tr-TR", {
                      timeZone: "Europe/Istanbul",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </time>
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.course_title}</small>
                  <span>
                    {a.submitted}/{a.targets} teslim
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="desk-agenda-empty">
              Bu tarih aralığında teslim tarihi olan bir ödev yok.
            </p>
          )}
          <div className="desk-agenda-note">
            <span className="desk-kicker">TESLİM TAKİBİ</span>
            <p>Sınıfın not defteri.</p>
            <span>
              Teslim etmeyen öğrenciler ve güncel notlar, dersin Not defteri sekmesinde. Tarihler
              Türkiye saatine göredir.
            </span>
          </div>
        </aside>
      </div>
      <section className="desk-course-register" aria-labelledby="desk-courses-title">
        <div className="desk-section-title">
          <div>
            <span className="desk-kicker">03 / DERS DOSYALARI</span>
            <h2 id="desk-courses-title">Bu dönem</h2>
          </div>
          <span className="muted">{data.courses.length} aktif ders</span>
        </div>
        {data.courses.length ? (
          data.courses.map((course, i) => (
            <button
              className="desk-course-row"
              key={course.id}
              onClick={() => open({ course: course.id, tab: "activities" })}
            >
              <span className="desk-index">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <small>
                  {course.code || "DERS"} · {course.term}
                </small>
                <strong>{course.title}</strong>
              </span>
              <span>{course.students} öğrenci</span>
              <span>{course.published} etkinlik</span>
              <ArrowUpRight size={18} />
            </button>
          ))
        ) : (
          <p className="desk-empty">Yeni ders düğmesiyle ilk ders dosyanızı açın.</p>
        )}
      </section>
    </div>
  );
}
