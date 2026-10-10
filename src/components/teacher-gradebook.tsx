"use client";
import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import type { GradebookRow } from "@/modules/analytics/teacher-workspace";
import { api, dateLabel, errorMessage } from "@/lib/client";
import { downloadCsv } from "@/lib/csv";
import { ErrorBanner, Spinner } from "./ui";

export const submissionLabels: Record<string, string> = {
  submitted: "Değerlendirme bekliyor",
  reviewed: "Değerlendirildi",
  returned: "Düzeltme istendi",
  missing: "Teslim edilmedi",
  not_started: "Henüz başlamadı",
  in_progress: "Çalışılıyor",
  withdrawn: "Geri çekildi",
};
export function TeacherGradebook({
  courseId,
  openAssignment,
}: {
  courseId: string;
  openAssignment: (id: string) => void;
}) {
  const [rows, setRows] = useState<GradebookRow[] | null>(null),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [assignment, setAssignment] = useState("all"),
    [status, setStatus] = useState("all");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<GradebookRow[]>(`courses/${courseId}/gradebook`)
      .then((data) => {
        if (active) {
          setRows(data);
          setError("");
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [courseId, revision]);
  if (!rows)
    return (
      <>
        <ErrorBanner message={error} />
        {!error ? (
          <Spinner />
        ) : (
          <button className="button secondary" onClick={() => setRevision((v) => v + 1)}>
            Yeniden dene
          </button>
        )}
      </>
    );
  const filtered = rows.filter(
    (row) =>
      (assignment === "all" || row.assignment_id === assignment) &&
      (status === "all" ||
        (status === "late"
          ? row.late && ["submitted", "reviewed", "returned"].includes(row.status)
          : row.status === status)) &&
      `${row.display_name} ${row.email}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  const assignments = [
    ...new Map(rows.map((row) => [row.assignment_id, row.assignment_title])).entries(),
  ];
  return (
    <section className="teacher-gradebook">
      <div className="section-heading">
        <div>
          <h2>Not defteri</h2>
          <p className="muted">Yayımlanan ödevler, güncel teslimler ve öğretmen notları.</p>
        </div>
        <button
          className="button secondary"
          disabled={!filtered.length}
          onClick={() =>
            downloadCsv(`not-defteri-${courseId.slice(0, 8)}.csv`, [
              [
                "Öğrenci",
                "E-posta",
                "Ödev",
                "Durum",
                "Son teslim",
                "Teslim tarihi",
                "Geç teslim",
                "Not (100)",
                "Geri bildirim",
              ],
              ...filtered.map((r) => [
                r.display_name,
                r.email,
                r.assignment_title,
                submissionLabels[r.status],
                r.due_at,
                ["submitted", "reviewed", "returned"].includes(r.status) ? r.submitted_at : null,
                r.late ? "Evet" : "",
                r.grade,
                r.feedback,
              ]),
            ])
          }
        >
          <Download size={16} />
          CSV indir
        </button>
      </div>
      <div className="teacher-filter-bar">
        <label className="teacher-search">
          <Search size={16} />
          <input
            aria-label="Not defterinde öğrenci ara"
            placeholder="Öğrenci adı veya e-posta"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Ödev
          <select
            aria-label="Ödev"
            value={assignment}
            onChange={(e) => setAssignment(e.target.value)}
          >
            <option value="all">Tüm ödevler</option>
            {assignments.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Teslim durumu
          <select
            aria-label="Teslim durumu"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Tüm durumlar</option>
            {Object.entries(submissionLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            <option value="late">Geç teslim</option>
          </select>
        </label>
      </div>
      <p className="teacher-result-count" role="status">
        {filtered.length} / {rows.length} kayıt · Notlar 100 üzerinden. Boş notlar sıfır sayılmaz.
      </p>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Ödev teslim ve not çizelgesi</caption>
          <thead>
            <tr>
              <th>Öğrenci</th>
              <th>Ödev</th>
              <th>Durum</th>
              <th>Not / 100</th>
              <th>Son teslim</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.assignment_id}-${r.user_id}`}>
                <td>
                  <strong>{r.display_name}</strong>
                  <small>{r.email}</small>
                </td>
                <td>{r.assignment_title}</td>
                <td>
                  <span className={`ledger-status ledger-${r.status}`}>
                    {submissionLabels[r.status]}
                  </span>
                  {r.late && ["submitted", "reviewed", "returned"].includes(r.status) && (
                    <small>Geç teslim</small>
                  )}
                </td>
                <td className="ledger-grade">{r.grade ?? "—"}</td>
                <td>{dateLabel(r.due_at)}</td>
                <td>
                  <button className="text-button" onClick={() => openAssignment(r.assignment_id)}>
                    Ödevi aç
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="desk-empty">
            {rows.length
              ? "Bu filtrelere uyan kayıt yok."
              : "Ödev yayımlandığında öğrenci teslimleri burada listelenir."}
          </p>
        )}
      </div>
    </section>
  );
}
