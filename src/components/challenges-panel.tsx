"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Trophy, Play, Send, Zap, Shuffle } from "lucide-react";
import { Penguin } from "./penguin";
import { PublicProfileDialog } from "./public-profile";
import { api, errorMessage, dateLabel } from "@/lib/client";
import type { Course, LearningSession } from "@/types/domain";
import { Empty, ErrorBanner, Field, Pill, Spinner } from "./ui";
interface ChallengeView {
  id: string;
  mode: "classic" | "rapid";
  duration_seconds: number;
  course_title: string;
  creator_id: string;
  recipient_id: string;
  status: string;
  items: string[];
  created_at: string;
  expires_at: string;
  winner_id: string | null;
  your_session: string | null;
  participants: {
    user_id: string;
    display_name: string;
    score: string | null;
    correct_count: number | null;
    completed: boolean;
  }[];
}
const labels: Record<string, string> = {
  pending: "Davet bekliyor",
  accepted: "Çözülüyor",
  completed: "Tamamlandı",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
  expired: "Süre doldu",
};
export function ChallengesPanel({
  courses,
  userId,
  outfit = "penguin",
}: {
  courses: Course[];
  userId: string;
  outfit?: string;
}) {
  const [mode, setMode] = useState<"classic" | "rapid">("classic"),
    [searching, setSearching] = useState(false),
    [profileId, setProfileId] = useState<string | null>(null);
  const router = useRouter();
  const [data, setData] = useState<ChallengeView[] | null>(null),
    [courseId, setCourseId] = useState(courses[0]?.id || ""),
    [roster, setRoster] = useState<{ user_id: string; display_name: string }[]>([]),
    [recipient, setRecipient] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => setData(await api<ChallengeView[]>("challenges")), []);
  useEffect(() => {
    let active = true,
      inFlight = false;
    const timer = setInterval(async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const [challenges, status] = await Promise.all([
          api<ChallengeView[]>("challenges"),
          api<{ queue: unknown }>("matches/status"),
        ]);
        if (active) {
          setData(challenges);
          setSearching(!!status.queue);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        inFlight = false;
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    api<ChallengeView[]>("challenges")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (courseId)
      api<typeof roster>(`courses/${courseId}/challenge-roster`)
        .then((value) => {
          if (active) {
            setRoster(value);
            setRecipient(value[0]?.user_id || "");
          }
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [courseId]);
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Bir arkadaş, bir tur</span>
          <h1>
            Meydan okumalar<span className="greeting-dot">.</span>
          </h1>
          <p>Arkadaşını davet et ya da dersinden rastgele bir rakip bul.</p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void act(load, "Davetler ve sonuçlar yenilendi.")}
        >
          Yenile
        </button>
      </div>
      <ErrorBanner message={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="dp-duel-companion">
        <Penguin mood="duel" outfit={outfit} interactive />
        <span key={mode} className="dp-mode-announcement" role="status">
          {mode === "classic"
            ? "Klasik · Sıranı oyna, rakibine meydan oku."
            : "Seri · Yan yana, aynı anda!"}
        </span>
      </div>
      <div className="dp-match-modes">
        <button
          className={mode === "classic" ? "active" : ""}
          aria-pressed={mode === "classic"}
          disabled={busy || searching}
          onClick={() => setMode("classic")}
        >
          <Clock3 />
          <strong>Klasik</strong>
          <span>Sen şimdi oyna. Arkadaşın müsait olunca cevaplasın.</span>
          <small>Kişi başı 3 dakika · Davet 7 gün geçerli</small>
        </button>
        <button
          className={mode === "rapid" ? "active" : ""}
          aria-pressed={mode === "rapid"}
          disabled={busy || searching}
          onClick={() => setMode("rapid")}
        >
          <Zap />
          <strong>Seri</strong>
          <span>Yan yanayken bir oda açın. İkiniz de girince sayaç başlasın.</span>
          <small>2 dakikalık tur · Birlikte başlar</small>
        </button>
      </div>
      <div
        key={mode}
        className="dp-match-steps"
        aria-label={`${mode === "classic" ? "Klasik" : "Seri"} nasıl oynanır`}
      >
        {(mode === "classic"
          ? [
              "Arkadaşını seç, kendi turuna hemen başla.",
              "Arkadaşın 7 gün içinde kendi 3 dakikasını oynasın.",
              "İkiniz de bitirince puanları karşılaştırın.",
            ]
          : [
              "Arkadaşını seçip bekleme odasını aç.",
              "Arkadaşın daveti kabul ederek odaya girsin.",
              "3, 2, 1… Aynı anda başlayan 2 dakikada yarışın.",
            ]
        ).map((text) => (
          <div key={text}>{text}</div>
        ))}
      </div>
      <details className="dp-match-rules">
        <summary>Puanlama ve ödüller</summary>
        <p>
          Aynı 5 soruya kadar yarışılır. Önce doğru cevaplar, eşitlikte bitirme süresi belirleyici.
          Boş sorular 0 puan. Günde ilk 5 maçta kazanana 30 XP + 5 elmas, diğer oyuncuya 15 XP;
          beraberlikte ikinize de 15 XP. En az bir cevap gerekir.
        </p>
      </details>
      <form
        className="challenge-create"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            const challenge = await api<{ id: string }>("challenges", {
              course_id: courseId,
              recipient_id: recipient,
              request_key: requestKey,
              mode,
            });
            setRequestKey(crypto.randomUUID());
            const session = await api<LearningSession>(`challenges/${challenge.id}/start`, {});
            router.push(`/learn/${session.id}`);
          }, "Davet gönderildi.");
        }}
      >
        <Field label="Ders">
          <select
            aria-label="Ders"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setRecipient("");
              setRoster([]);
            }}
            disabled={busy || !courses.length}
          >
            {!courses.length && <option value="">Önce bir sınıfa katıl</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sınıf arkadaşın">
          <select
            aria-label="Sınıf arkadaşın"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={busy || !roster.length}
          >
            {!roster.length && <option value="">Henüz başka öğrenci yok</option>}
            {roster.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </Field>
        <button className="button primary" disabled={busy || !recipient || !courseId}>
          <Send size={17} />
          {mode === "classic" ? "Davet et ve turunu oyna" : "Odayı aç"}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !courseId}
          onClick={() =>
            void act(
              async () => {
                if (searching) {
                  await api("matches/cancel", {});
                  setSearching(false);
                  return;
                }
                const result = await api<{ challenge_id: string | null }>("matches/find", {
                  course_id: courseId,
                  mode,
                  request_key: requestKey,
                });
                setRequestKey(crypto.randomUUID());
                setSearching(!result.challenge_id);
              },
              searching
                ? "Eşleşme araması durdu."
                : "Eşleşme araması açıldı. Bekleyen rakip bulununca maç aşağıda görünür.",
            )
          }
        >
          <Shuffle size={18} />
          {searching ? "Aramayı iptal et" : "Rastgele rakip bul"}
        </button>
      </form>
      {searching && (
        <p className="notice" role="status">
          Aynı dersten {mode === "rapid" ? "Seri" : "Klasik"} maç arayan bir öğrenci bekleniyor.
          Arama 2 dakika içinde sona erer.
        </p>
      )}
      <div className="section-heading">
        <h2>Davetler ve sonuçlar</h2>
        <span className="muted">Son 100 meydan okuma</span>
      </div>
      {!data ? (
        <Spinner />
      ) : !data.length ? (
        <Empty
          title="İlk meydan okumanı oluştur"
          description="Sınıf arkadaşın daveti kendi ekranında kabul edebilir."
        />
      ) : (
        <div className="challenge-grid">
          {data.map((c) => {
            const own = c.participants.find((p) => p.user_id === userId),
              opponent = c.participants.find((p) => p.user_id !== userId),
              complete = c.status === "completed";
            return (
              <article
                className={`challenge-card ${complete ? "challenge-finished" : ""}`}
                key={c.id}
              >
                <div className="section-heading">
                  <span className="eyebrow">{c.course_title}</span>
                  <Pill tone={complete ? "green" : c.status === "pending" ? "orange" : "neutral"}>
                    {labels[c.status]}
                  </Pill>
                </div>
                <h3>
                  <button
                    className="dp-link"
                    onClick={() => opponent && setProfileId(opponent.user_id)}
                  >
                    {opponent?.display_name || "Sınıf arkadaşın"}
                  </button>{" "}
                  ile meydan okuma
                </h3>
                <p className="challenge-meta">
                  <Clock3 size={15} />
                  {c.mode === "rapid" ? "Seri" : "Klasik"} · {c.duration_seconds / 60} dk ·{" "}
                  {c.items.length} soru · Son gün {dateLabel(c.expires_at)}
                </p>
                <div className="challenge-participants">
                  {c.participants.map((p) => (
                    <div key={p.user_id}>
                      <span>{p.user_id === userId ? "Sen" : p.display_name}</span>
                      <strong>
                        {complete
                          ? `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Number(p.score) * 100)} / 100`
                          : p.completed
                            ? "Tamamlandı"
                            : "Bekliyor"}
                      </strong>
                      {complete && (
                        <small>
                          {p.correct_count} / {c.items.length} tam doğru
                        </small>
                      )}
                    </div>
                  ))}
                </div>
                {complete && (
                  <p className="challenge-outcome">
                    <Trophy size={19} />
                    {!c.winner_id
                      ? "Berabere! Aynı puanı paylaştınız."
                      : c.winner_id === userId
                        ? "Bu turu sen kazandın!"
                        : `${opponent?.display_name} bu turu kazandı.`}
                  </p>
                )}
                <div className="row-actions">
                  {c.status === "pending" &&
                    (c.recipient_id === userId ? (
                      <>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await api(`challenges/${c.id}/respond`, { action: "accept" });
                              const session = await api<LearningSession>(
                                `challenges/${c.id}/start`,
                                {},
                              );
                              router.push(`/learn/${session.id}`);
                            }, "")
                          }
                        >
                          {c.mode === "rapid" ? "Odaya katıl" : "Kabul et ve turunu oyna"}
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => api(`challenges/${c.id}/respond`, { action: "reject" }),
                              "Davet reddedildi.",
                            )
                          }
                        >
                          Reddet
                        </button>
                      </>
                    ) : (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => api(`challenges/${c.id}/respond`, { action: "cancel" }),
                            "Davet iptal edildi.",
                          )
                        }
                      >
                        Daveti iptal et
                      </button>
                    ))}
                  {(c.status === "accepted" ||
                    (c.status === "pending" && c.creator_id === userId)) &&
                    !own?.completed && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const session = await api<LearningSession>(
                              `challenges/${c.id}/start`,
                              {},
                            );
                            router.push(`/learn/${session.id}`);
                          }, "")
                        }
                      >
                        <Play size={17} />
                        {c.your_session
                          ? "Turuna devam et"
                          : c.mode === "rapid"
                            ? "Hazırım, odaya gir"
                            : "Turunu başlat"}
                      </button>
                    )}
                  {["pending", "accepted"].includes(c.status) && own?.completed && (
                    <p className="muted">Turun kaydedildi. Arkadaşının tamamlaması bekleniyor.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {profileId && <PublicProfileDialog userId={profileId} close={() => setProfileId(null)} />}
    </>
  );
}
