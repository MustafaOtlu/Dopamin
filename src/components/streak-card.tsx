"use client";
import { useState } from "react";
import { Check, Flame, Gift, Minus, Shield, RotateCcw, Clock3 } from "lucide-react";
import { api, dateLabel } from "@/lib/client";
import { addDays } from "@/lib/time";
import type { LearningDay } from "@/modules/rewards/streak";
export interface StreakView {
  today: string;
  week: string;
  days: LearningDay[];
  streak: { current: number; best: number };
  weeks: { week: string; completed: number; claimed: boolean; available: boolean }[];
  makeup_used: string | null;
  makeup_available: boolean;
  missed_days: string[];
}
const weekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export function StreakCard({
  data,
  shields,
  busy,
  act,
  showWeekly = true,
}: {
  data: StreakView;
  shields: number;
  busy: boolean;
  act: (fn: () => Promise<unknown>, message: string) => Promise<void>;
  showWeekly?: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const chosen = data.missed_days.includes(selectedDate) ? selectedDate : data.missed_days[0] || "";
  const currentWeek = data.weeks.find((w) => w.week === data.week)!;
  const chests = data.weeks.filter((w) => w.available);
  return (
    <section className="streak-panel" aria-labelledby="streak-title">
      <div className="streak-heading">
        <div className="streak-count">
          <span>
            <Flame size={30} />
          </span>
          <div>
            <h2 id="streak-title">Günlük serin</h2>
            <strong>{data.streak.current} gün</strong>
            <p>En uzun serin: {data.streak.best} gün</p>
          </div>
        </div>
        <div className="streak-participation">
          <strong>{data.days.filter((d) => d.actual_learning).length}</strong>
          <span>Bu hafta gerçekten çalıştığın gün</span>
        </div>
      </div>
      <div className="streak-calendar">
        {weekdays.map((label, i) => {
          const date = addDays(data.week, i),
            day = data.days.find((d) => d.date === date),
            future = date > data.today;
          const state = day?.goal_completed
            ? "completed"
            : day?.makeup_completed
              ? "makeup"
              : day?.streak_protected
                ? "protected"
                : day?.neutral
                  ? "neutral"
                  : future
                    ? "future"
                    : !day
                      ? "not_started"
                      : date === data.today
                        ? "today"
                        : "missed";
          const text = {
            completed: "Tamam",
            makeup: "Telafi",
            protected: "Korundu",
            neutral: "İçerik yok",
            future: "Yakında",
            today: "Bugün",
            missed: "Kaçırıldı",
            not_started: "Başlamadı",
          }[state];
          const Icon =
            state === "completed"
              ? Check
              : state === "makeup"
                ? RotateCcw
                : state === "protected"
                  ? Shield
                  : state === "neutral" || state === "not_started"
                    ? Minus
                    : Clock3;
          return (
            <div
              key={date}
              className={`streak-day streak-${state}`}
              aria-label={`${dateLabel(date)}: ${text}${day?.actual_learning ? ", gerçek çalışma var" : ""}`}
              aria-current={date === data.today ? "date" : undefined}
            >
              <small>{label}</small>
              <span className="streak-day-icon">
                <Icon size={21} />
              </span>
              <strong>{text}</strong>
              {day?.actual_learning && (
                <span className="actual-learning-dot" title="Gerçek çalışma var" />
              )}
            </div>
          );
        })}
      </div>
      <p className="streak-explainer">
        Hedef, telafi ve koruma serini sürdürür. İçerik olmayan gün serini bozmaz. Gerçek çalışma
        ayrıca kaydedilir.
      </p>
      <div className="streak-recovery">
        <div>
          <h3>Bir günü telafi et</h3>
          <p>
            {data.makeup_used
              ? `${dateLabel(data.makeup_used)} için bu haftanın ücretsiz telafisini kullandın.`
              : data.makeup_available
                ? "Bu hafta bir kaçırılan gün için ücretsiz telafin hazır."
                : "Bugünün hedefini tamamlayınca bu haftanın bir günü için ücretsiz telafi kullanabilirsin."}
          </p>
        </div>
        {chosen ? (
          <div className="streak-recovery-actions">
            <label className="field">
              <span>Kaçırılan gün</span>
              <select
                value={chosen}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={busy}
              >
                {data.missed_days.map((d) => (
                  <option key={d} value={d}>
                    {dateLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={busy || !data.makeup_available || chosen < data.week}
              onClick={() =>
                void act(
                  () => api("rewards/protect", { date: chosen, method: "makeup" }),
                  "Ücretsiz telafin uygulandı. Gerçek çalışma geçmişin korunuyor.",
                )
              }
            >
              <RotateCcw size={16} />
              Ücretsiz telafi
            </button>
            <button
              className="button secondary"
              disabled={busy || shields < 1}
              onClick={() =>
                void act(
                  () => api("rewards/protect", { date: chosen, method: "shield" }),
                  "Seri koruyucu kullanıldı. Bu gün sandık hedefi sayılmaz.",
                )
              }
            >
              <Shield size={16} />
              Koruyucu kullan ({shields})
            </button>
          </div>
        ) : (
          <p className="muted">Son yedi günde koruma gerektiren bir günün yok.</p>
        )}
      </div>
      {showWeekly && (
        <div className="weekly-chest">
          <span className={`chest-icon ${currentWeek.claimed ? "chest-opened" : ""}`}>
            <Gift size={34} />
          </span>
          <div className="weekly-chest-copy">
            <h3>Haftalık keşif sandığı</h3>
            <p>
              Yedi günlük hedefini tamamla, 50 elmas kazan. Ücretsiz telafi sayılır; seri koruyucu
              sayılmaz.
            </p>
            <div
              className="chest-progress"
              role="progressbar"
              aria-label="Haftalık hedefler"
              aria-valuenow={currentWeek.completed}
              aria-valuemin={0}
              aria-valuemax={7}
            >
              <span style={{ width: `${(currentWeek.completed / 7) * 100}%` }} />
            </div>
            <small>
              {currentWeek.completed} / 7 günlük hedef ·{" "}
              {currentWeek.claimed ? "Sandık açıldı" : "Bu hafta"}
            </small>
          </div>
          <button
            className="button primary"
            disabled={busy || !currentWeek.available}
            onClick={() =>
              void act(
                () => api("rewards/chest", { week: data.week }),
                "Sandığını açtın! 50 elmas bakiyene eklendi.",
              )
            }
          >
            {currentWeek.claimed ? "Sandık açıldı" : "Sandığı aç"}
          </button>
        </div>
      )}
      {showWeekly &&
        chests
          .filter((w) => w.week !== data.week)
          .map((w) => (
            <div className="past-chest" key={w.week}>
              <span>{dateLabel(w.week)} haftasının sandığı hazır.</span>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => api("rewards/chest", { week: w.week }),
                    "Geçmiş haftanın sandığı açıldı. 50 elmas eklendi.",
                  )
                }
              >
                50 elması al
              </button>
            </div>
          ))}
    </section>
  );
}
