"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, RefreshCw, Check, Timer, Users } from "lucide-react";
import { Penguin } from "./penguin";
import { Brand, Spinner, ErrorBanner, Modal } from "./ui";
import { ActivityPlayer } from "./activities/player";
import { api, errorMessage, ApiError } from "@/lib/client";
import type { PublicActivity } from "@/modules/activities/schema";
import type { LearningSession } from "@/types/domain";
import type { Wallet } from "./rewards-panel";
interface View {
  session: LearningSession;
  activity: PublicActivity | null;
  rewards?: Wallet;
  timing?: {
    mode: string;
    status: string;
    duration_seconds: number;
    started_at: string | null;
    deadline: string | null;
    server_time: string;
  } | null;
}
interface Feedback {
  correct: boolean | null;
  pending_feedback?: boolean;
  explanation: string;
  correct_answer: string;
  session: LearningSession;
}
export function LearningScreen({ id }: { id: string }) {
  const router = useRouter();
  const [exitOpen, setExitOpen] = useState(false);
  const [view, setView] = useState<View | null>(null),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [clock, setClock] = useState(() => Date.now()),
    [clockOffset, setClockOffset] = useState(0);
  const load = useCallback(async () => {
    try {
      const response = await api<View>(`sessions/${id}`);
      setView(response);
      if (response.timing)
        setClockOffset(new Date(response.timing.server_time).getTime() - Date.now());
      setRequestKey(crypto.randomUUID());
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.push("/login");
      else setError(errorMessage(err));
      return false;
    }
  }, [id, router]);
  useEffect(() => {
    let active = true;
    api<View>(`sessions/${id}`)
      .then((response) => {
        if (active) {
          setView(response);
          if (response.timing)
            setClockOffset(new Date(response.timing.server_time).getTime() - Date.now());
          setRequestKey(crypto.randomUUID());
        }
      })
      .catch((err) => {
        if (active) {
          if (err instanceof ApiError && err.status === 401) router.push("/login");
          else setError(errorMessage(err));
        }
      });
    return () => {
      active = false;
    };
  }, [id, router]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!view?.timing || view.session.status === "completed") return;
    let active = true,
      inFlight = false;
    const timer = setInterval(async () => {
      const deadline = view.timing?.deadline,
        started = view.timing?.started_at;
      const waiting = !view.activity || !started,
        expired = !!deadline && Date.now() + clockOffset >= new Date(deadline).getTime();
      if ((!waiting && !expired) || inFlight || busy) return;
      inFlight = true;
      try {
        const response = await api<View>(`sessions/${id}`);
        if (active) {
          setView(response);
          if (response.timing)
            setClockOffset(new Date(response.timing.server_time).getTime() - Date.now());
          if (response.session.status === "completed") setFeedback(null);
          if (waiting && response.activity) setRequestKey(crypto.randomUUID());
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        inFlight = false;
      }
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [view?.timing, view?.activity, view?.session.status, id, busy, clockOffset]);
  async function answer(value: unknown) {
    if (!view?.activity) return;
    setBusy(true);
    setError("");
    try {
      setFeedback(
        await api<Feedback>(`sessions/${id}/answers`, {
          request_key: requestKey,
          activity_version_id: view.activity.id,
          answer: value,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    setBusy(true);
    setError("");
    try {
      if (await load()) setFeedback(null);
    } finally {
      setBusy(false);
    }
  }
  const session = feedback?.session || view?.session;
  const completed = view?.session.status === "completed" && !feedback;
  const closedMatch =
    view?.timing && ["cancelled", "rejected", "expired"].includes(view.timing.status);
  const returnUrl = `/app?page=${session?.mode === "challenge" ? "match" : "learn"}&course=${encodeURIComponent(session?.course_id || "")}`;
  const remaining = view?.timing?.deadline
    ? Math.max(
        0,
        Math.ceil((new Date(view.timing.deadline).getTime() - clock - clockOffset) / 1000),
      )
    : null;
  const countdown = view?.timing?.started_at
    ? Math.max(
        0,
        Math.ceil((new Date(view.timing.started_at).getTime() - clock - clockOffset) / 1000),
      )
    : null;
  const hasActiveLesson = !!view && !completed;
  useEffect(() => {
    if (!hasActiveLesson) return;
    const url = window.location.href;
    const state = { ...window.history.state, dopaminLessonGuard: id };
    if (window.history.state?.dopaminLessonGuard !== id) window.history.pushState(state, "", url);
    const confirmBack = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      window.history.pushState(state, "", url);
      setExitOpen(true);
    };
    window.addEventListener("popstate", confirmBack, true);
    return () => window.removeEventListener("popstate", confirmBack, true);
  }, [hasActiveLesson, id]);
  const percent = session
    ? Math.round(
        ((session.cursor + session.review_cursor) /
          (session.items.length + session.review_items.length)) *
          100,
      )
    : 0;
  return (
    <main
      className="learning-layout dopamin-app dp-learning-session"
      data-theme={view?.rewards?.cosmetics.theme || "polar"}
    >
      <header className="learning-header">
        <Brand small />
        {view?.timing && !completed && remaining !== null && (
          <span
            className={`dp-match-timer ${remaining < 20 ? "urgent" : ""}`}
            aria-label={`Kalan süre ${remaining} saniye`}
          >
            <Timer size={19} />
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        )}
        <div className="learning-progress">
          <div className="progress-track">
            <span style={{ width: `${percent}%` }} />
          </div>
          <span>{percent}%</span>
        </div>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="Çalışmaya ara ver ve ana sayfaya dön"
          onClick={() => (completed ? router.push(returnUrl) : setExitOpen(true))}
        >
          <X />
        </button>
      </header>
      <div className="learning-content">
        <ErrorBanner message={error} />
        {!view && !error ? (
          <Spinner />
        ) : completed ? (
          <section className="session-complete">
            <div className="dp-completion-penguin">
              <Penguin mood={closedMatch ? "sad" : "celebrate"} interactive />
            </div>
            <h1>
              {closedMatch
                ? "Bu maç kapandı"
                : view.session.mode === "challenge"
                  ? "Meydan okuma turunu tamamladın!"
                  : "Çalışma tamamlandı!"}
            </h1>
            <p>
              {view.session.mode === "challenge"
                ? `${view.session.cursor}/${view.session.items.length} soruyu yanıtladın.`
                : `${view.session.items.length} etkinlik çözdün.`}{" "}
              {view.session.mode === "challenge"
                ? closedMatch
                  ? "Davet reddedildi, iptal edildi veya süresi doldu. Yeni bir maç açabilirsin."
                  : view.timing?.mode === "classic" && view.timing.status === "pending"
                    ? "Turun kaydedildi. Arkadaşın daveti kabul edip oynadığında sonuç burada olacak."
                    : "İki öğrenci de tamamlayınca sonuçlar açıklanacak."
                : "İlerlemene kaldığın dersten devam edebilirsin."}
            </p>
            <div className="completion-stats">
              {view.session.mode !== "mistakes" && view.session.mode !== "challenge" && (
                <div>
                  <strong>
                    {view.session.first_correct}/{view.session.items.length}
                  </strong>
                  <span>İlk turda doğru</span>
                </div>
              )}
              <div>
                <strong>{view.session.review_items.length}</strong>
                <span>Tekrar edilen</span>
              </div>
              <div>
                <strong>
                  <Check size={25} />
                </strong>
                <span>Sonuçlar kaydedildi</span>
              </div>
            </div>
            {view.session.review_items.length > 0 && (
              <p className="notice">
                Yanlışların Hatalarım alanında seni bekliyor. Orada çözerek pekiştirebilirsin.
              </p>
            )}
            <Link className="button primary" href={returnUrl}>
              {view.session.mode === "challenge" ? "Meydan okumalara dön" : "Öğrenme alanına dön"}
            </Link>
          </section>
        ) : view?.timing && !view.activity ? (
          <section className="dp-match-waiting">
            <Penguin waving interactive />
            <h1>{countdown ? `${countdown}…` : "Rakibin bekleniyor"}</h1>
            <p>
              {countdown
                ? "İkiniz de hazırsınız. Aynı anda başlıyorsunuz!"
                : "İkiniz de odaya girdiğinizde süre başlayacak."}
            </p>
            <Users size={28} />
          </section>
        ) : view?.activity ? (
          <>
            {view.session.status === "reviewing" && (
              <div className="review-banner">
                <RefreshCw size={18} /> Şimdi yanlışları birlikte pekiştirelim.
              </div>
            )}
            <p className="question-counter">
              {view.session.status === "reviewing"
                ? `TEKRAR ${view.session.review_cursor + 1} / ${view.session.review_items.length}`
                : `ETKİNLİK ${view.session.cursor + 1} / ${view.session.items.length}`}
            </p>
            <ActivityPlayer
              headingLevel={1}
              key={view.activity.id + view.session.status}
              activity={view.activity}
              onSubmit={answer}
              busy={busy || (remaining !== null && remaining === 0)}
              result={feedback}
              companion={
                feedback && (
                  <div
                    className="dp-answer-reaction"
                    data-reaction={
                      feedback.correct === true
                        ? "correct"
                        : feedback.correct === false
                          ? "incorrect"
                          : "pending"
                    }
                  >
                    <Penguin
                      key={String(feedback.correct) + view.activity.id}
                      mood={
                        feedback.correct === true
                          ? "clap"
                          : feedback.correct === false
                            ? "sad"
                            : "think"
                      }
                      outfit={view.rewards?.cosmetics.outfit || "penguin"}
                      interactive
                    />
                  </div>
                )
              }
            />
            {feedback && (
              <button className="button primary full-width" disabled={busy} onClick={next}>
                {feedback.session.status === "completed" ? "Sonucumu gör" : "Devam et"}
              </button>
            )}
          </>
        ) : null}
      </div>
      {exitOpen && (
        <Modal title="Gerçekten dersi terk etmek mi istiyorsun?" onClose={() => setExitOpen(false)}>
          <div className="dp-exit-lesson">
            <Penguin mood="cry" outfit={view?.rewards?.cosmetics.outfit || "penguin"} />
            <p>
              {view?.timing
                ? "Maçın süresi sen çıktıktan sonra da işlemeye devam eder."
                : "Cevapların kaydedildi. Daha sonra kaldığın yerden devam edebilirsin."}
            </p>
            <button className="button primary full-width" onClick={() => setExitOpen(false)}>
              Derse devam et
            </button>
            <button
              className="button secondary full-width"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  if (view && !completed) await api(`sessions/${id}/pause`, {});
                  router.push(returnUrl);
                } catch (error) {
                  setError(errorMessage(error));
                  setExitOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Dersi terk et
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
