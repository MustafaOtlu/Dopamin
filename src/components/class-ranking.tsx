"use client";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api, errorMessage, dateLabel } from "@/lib/client";
import { today, weekStart, addDays } from "@/lib/time";
import { ErrorBanner, Spinner } from "./ui";
import { PublicProfileDialog } from "./public-profile";
interface Ranking {
  week: string;
  your_id: string;
  entries: { user_id: string; display_name: string; xp: number; rank: number }[];
}
export function ClassRanking({
  courseId,
  studentProfiles = false,
}: {
  courseId: string;
  studentProfiles?: boolean;
}) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [week, setWeek] = useState(() => weekStart(today())),
    [data, setData] = useState<Ranking | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Ranking>(`courses/${courseId}/ranking?week=${week}`)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [courseId, week]);
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Haftalık sınıf sıralaması</h2>
          <p className="muted">Bu dersteki günlük adımlardan kazanılan XP.</p>
        </div>
        <label className="ranking-week-label">
          Hafta
          <input
            type="date"
            value={week}
            max={today()}
            onChange={(e) => {
              if (e.target.value) setWeek(weekStart(e.target.value));
            }}
          />
        </label>
      </div>
      <ErrorBanner message={error} />
      <p className="muted">
        {dateLabel(week)} – {dateLabel(addDays(week, 6))} · Eşit puanlar aynı sırayı paylaşır.
      </p>
      {!data ? (
        <Spinner />
      ) : (
        <div className="ranking-list">
          {data.entries.map((entry) => (
            <article
              className={`ranking-row ${entry.user_id === data.your_id ? "your-rank" : ""}`}
              key={entry.user_id}
            >
              <span className={`rank-number rank-${entry.rank}`} aria-label={`${entry.rank}. sıra`}>
                {entry.rank <= 3 && <Trophy size={16} />} {entry.rank}
              </span>
              <div>
                {studentProfiles ? (
                  <button className="dp-link" onClick={() => setProfileId(entry.user_id)}>
                    {entry.display_name}
                  </button>
                ) : (
                  <strong>{entry.display_name}</strong>
                )}
                {entry.user_id === data.your_id && <small>Sen</small>}
              </div>
              <span className="rank-points">{entry.xp} XP</span>
            </article>
          ))}
        </div>
      )}
      {profileId && <PublicProfileDialog userId={profileId} close={() => setProfileId(null)} />}
    </section>
  );
}
