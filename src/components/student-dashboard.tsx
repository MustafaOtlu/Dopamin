"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  Flame,
  Gem,
  ListChecks,
  LogOut,
  RefreshCw,
  Settings2,
  ShoppingBag,
  Sparkles,
  Star,
  Swords,
  Trophy,
  UserRound,
  ArrowRight,
} from "lucide-react";
import type { Bootstrap } from "@/types/bootstrap";
import type { LearningSession, Objective } from "@/types/domain";
import { api, errorMessage } from "@/lib/client";
import { levelProgress } from "@/lib/levels";
import { Penguin } from "./penguin";
import { ProfilePhoto, PhotoUpload } from "./profile-photo";
import { LessonPreparation } from "./lesson-preparation";
import { CoursePicker } from "./course-picker";
import { Empty, ErrorBanner, Field, Modal, Spinner } from "./ui";
import { DailyLearning } from "./daily-learning";
import { AssignmentsPanel } from "./assignments-panel";
import { ChallengesPanel } from "./challenges-panel";
import { LeaguePanel } from "./league-panel";
import { ClassRanking } from "./class-ranking";
import { RewardsPanel } from "./rewards-panel";
import { AccountSecurity } from "./account-security";
import { LearningHistory } from "./learning-history";
import { SupportRequest } from "./support-request";

const panels = [
  { id: "learn", label: "Öğren", icon: BookOpen },
  { id: "tasks", label: "Görevler", icon: ListChecks },
  { id: "match", label: "Maç", icon: Swords },
  { id: "shop", label: "Mağaza", icon: ShoppingBag },
  { id: "profile", label: "Profil", icon: UserRound },
];
const aliases: Record<string, string> = {
  home: "learn",
  courses: "learn",
  rewards: "shop",
  challenges: "match",
  league: "match",
  history: "profile",
  mistakes: "tasks",
};
interface Topic {
  id: string;
  title: string;
  week: number;
  objectives: Objective[];
}
export function StudentDashboard({
  data,
  updated,
}: {
  data: Bootstrap;
  updated: () => Promise<void>;
}) {
  const router = useRouter();
  const [page, setPage] = useState("learn"),
    [courseId, setCourseId] = useState(data.courses[0]?.id || "");
  const [objectives, setObjectives] = useState<Objective[] | null>(null),
    [selected, setSelected] = useState<Topic | null>(null);
  const [preparing, setPreparing] = useState(false),
    [support, setSupport] = useState<Objective | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [join, setJoin] = useState(false);
  const [taskTab, setTaskTab] = useState("daily"),
    [matchTab, setMatchTab] = useState("play"),
    [profileTab, setProfileTab] = useState("overview");
  useEffect(() => {
    const sync = () => {
      const value = new URLSearchParams(window.location.search).get("page") || "learn";
      const requested = new URLSearchParams(window.location.search).get("course");
      let remembered: string | null = null;
      try {
        remembered = localStorage.getItem(`dopamin:course:${data.user.id}`);
      } catch {
        /* URL remains usable without storage. */
      }
      const nextCourse =
        [requested, remembered].find((id) => data.courses.some((c) => c.id === id)) ||
        data.courses[0]?.id ||
        "";
      setCourseId(nextCourse);
      try {
        if (nextCourse) localStorage.setItem(`dopamin:course:${data.user.id}`, nextCourse);
      } catch {
        /* Optional persistence. */
      }
      setPage(aliases[value] || (panels.some((p) => p.id === value) ? value : "learn"));
      if (value === "league") setMatchTab("league");
      if (value === "history") setProfileTab("history");
      if (value === "mistakes") setTaskTab("mistakes");
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [data.user.id, data.courses]);
  useEffect(() => {
    let active = true;
    if (courseId)
      api<Objective[]>(`courses/${courseId}/objectives`)
        .then((v) => {
          if (active) setObjectives(v);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [courseId]);
  function navigate(id: string) {
    setPage(id);
    setError("");
    setNotice("");
    setSelected(null);
    window.history.pushState(null, "", `/app?page=${id}&course=${encodeURIComponent(courseId)}`);
    window.scrollTo({ top: 0 });
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const wallet = data.rewards,
    level = levelProgress(wallet?.xp || 0);
  const course = data.courses.find((c) => c.id === courseId);
  const unfinished = data.sessions.find(
    (s) =>
      s.course_id === courseId &&
      ["practice", "advance"].includes(s.mode) &&
      s.status !== "completed",
  );
  const topics = [
    ...(objectives || [])
      .reduce((map, o) => {
        const topic = map.get(o.topic_id) || {
          id: o.topic_id,
          title: o.topic_title,
          week: o.week,
          objectives: [],
        };
        topic.objectives.push(o);
        map.set(o.topic_id, topic);
        return map;
      }, new Map<string, Topic>())
      .values(),
  ].sort((a, b) => a.week - b.week);
  const weeks = [...new Set(topics.map((t) => t.week))];
  function selectCourse(id: string) {
    if (id === courseId) return;
    setObjectives(null);
    setSelected(null);
    setCourseId(id);
    try {
      localStorage.setItem(`dopamin:course:${data.user.id}`, id);
    } catch {
      /* URL also persists selection. */
    }
    window.history.replaceState(null, "", `/app?page=${page}&course=${encodeURIComponent(id)}`);
  }
  const chooseCourse = (
    <CoursePicker
      courses={data.courses}
      value={courseId}
      onChange={selectCourse}
      onJoin={() => setJoin(true)}
    />
  );
  return (
    <div className="dopamin-app" data-theme={wallet?.cosmetics.theme || "polar"}>
      <a className="skip-link" href="#student-main">
        İçeriğe geç
      </a>
      <aside className="dp-sidebar" aria-label="Gezinme ve hesabın">
        <a href="/app" className="dp-brand">
          <Penguin />
          <span>
            dopamin<span>•</span>
          </span>
        </a>
        <nav className="dp-navigation" aria-label="Ana menü">
          {panels.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`dp-nav-item dp-nav-${id} ${page === id ? "is-active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <span className="dp-nav-icon">
                <Icon size={25} strokeWidth={2.4} />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="dp-sidebar-bottom">
          <blockquote className="dp-science-quote">
            <p>Hayatta en hakiki mürşit ilimdir.</p>
            <cite>Mustafa Kemal ATATÜRK</cite>
          </blockquote>
          <button className="dp-user-chip" onClick={() => navigate("profile")}>
            <span className={`dp-avatar dp-frame-${wallet?.cosmetics.frame || "none"}`}>
              <ProfilePhoto url={wallet?.photo_url} name={data.user.display_name} />
            </span>
            <span>
              <strong>{data.user.display_name}</strong>
            </span>
          </button>
        </div>
      </aside>
      <div className="dp-body">
        <header className="dp-topbar">
          <div className="dp-topbar-left">
            {page === "learn" ? (
              chooseCourse
            ) : (
              <span className="dp-section-name">{panels.find((p) => p.id === page)?.label}</span>
            )}
          </div>
          <div className="dp-meters">
            <button
              title="Günlük serin"
              onClick={() => {
                navigate("profile");
                setProfileTab("overview");
              }}
            >
              <Flame className="dp-fire" fill="currentColor" size={24} />
              <span>{wallet?.streak || 0}</span>
            </button>
            <button title="Toplam XP ve seviyen" onClick={() => navigate("profile")}>
              <Star className="dp-xp" fill="currentColor" size={22} />
              <span>
                Seviye {level.level}
                <span className="dp-meter-divider"> · </span>
                {wallet?.xp || 0}
                <small> XP</small>
              </span>
            </button>
            <button title="Elmas bakiyen" onClick={() => navigate("shop")}>
              <Gem className="dp-token" fill="currentColor" size={23} />
              <span>{wallet?.tokens || 0}</span>
            </button>
          </div>
        </header>
        <main id="student-main" tabIndex={-1} className={`dp-main dp-page-${page}`}>
          <ErrorBanner message={error} />
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {page === "learn" && (
            <div className="dp-learn-layout">
              <section className="dp-path-area" aria-label="Haftalık konu yolu">
                <div className="dp-learn-heading">
                  <div>
                    <span className="eyebrow">{course?.code || "Derslerin"}</span>
                    <h1>Öğrenme yolun</h1>
                  </div>
                </div>
                {unfinished && (
                  <a className="dp-card dp-resume" href={`/learn/${unfinished.id}`}>
                    <RefreshCw size={21} />
                    <span>
                      <strong>Kaldığın yerden devam et</strong>
                      <small>
                        {unfinished.cursor} / {unfinished.items.length} etkinlik tamamlandı
                      </small>
                    </span>
                    <ArrowRight size={19} />
                  </a>
                )}
                {!course ? (
                  <Empty
                    title="İlk dersinle yola çık"
                    description="Öğretmeninin paylaştığı sınıf koduyla katıl."
                  >
                    <button className="button primary" onClick={() => setJoin(true)}>
                      Sınıfa katıl
                    </button>
                  </Empty>
                ) : !objectives ? (
                  <Spinner />
                ) : !topics.length ? (
                  <Empty
                    title="Yolun hazırlanıyor"
                    description="Öğretmenin konuları yayımladığında burada göreceksin."
                  />
                ) : (
                  weeks.map((week, wi) => (
                    <section className="dp-unit" key={week}>
                      <div className="dp-unit-header">
                        <div>
                          <span>
                            {course.code || "DERS"} · {week}. HAFTA
                          </span>
                          <h2>
                            {topics
                              .filter((t) => t.week === week)
                              .map((t) => t.title)
                              .join(" & ")}
                          </h2>
                        </div>
                        <BookOpen size={28} />
                      </div>
                      <div className="dp-path-nodes">
                        {topics
                          .filter((t) => t.week === week)
                          .map((t, i) => {
                            const mastered = t.objectives.every(
                              (o) => o.mastery_state === "mastered",
                            );
                            return (
                              <div className={`dp-path-step dp-step-${(i + wi) % 4}`} key={t.id}>
                                <button
                                  className={`dp-topic-node ${mastered ? "is-mastered" : ""}`}
                                  aria-label={`${t.title} konusunu aç`}
                                  onClick={() => {
                                    setSelected(t);
                                    setPreparing(false);
                                  }}
                                >
                                  <span>
                                    {mastered ? (
                                      <Check size={38} strokeWidth={3} />
                                    ) : (
                                      <Star size={36} fill="currentColor" strokeWidth={2.4} />
                                    )}
                                  </span>
                                </button>
                                <span className="dp-topic-name">{t.title}</span>
                                {i === 0 && wi === 0 && (
                                  <div className="dp-path-mascot">
                                    <div>
                                      Hangi konuya
                                      <br />
                                      <strong>bakıyoruz?</strong>
                                    </div>
                                    <Penguin waving interactive />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        <div className="dp-path-end" aria-hidden="true">
                          <span />
                          <Gem size={30} />
                          <span />
                        </div>
                      </div>
                    </section>
                  ))
                )}
                {!!topics.length && (
                  <p className="dp-path-caption">
                    Bir konu seç. Tekrar et ya da gelecek derse göz at.
                  </p>
                )}
              </section>
              <aside className="dp-learn-aside" aria-label="Seviye ve lig">
                <section className="dp-side-card">
                  <span className="dp-card-kicker">BİR SONRAKİ SEVİYE</span>
                  <div className="dp-level-emblem">
                    <Star size={32} fill="currentColor" />
                    <strong>{level.level}</strong>
                  </div>
                  <h2>Seviye {level.level + 1} için son adımlar</h2>
                  <p>
                    {level.required - level.progress} XP sonra seviye {level.level + 1}!
                  </p>
                  <progress
                    aria-label="Seviye ilerlemen"
                    max={level.required}
                    value={level.progress}
                  />
                  <small>
                    {level.progress} / {level.required} XP
                  </small>
                </section>
                <section className="dp-side-card dp-match-teaser">
                  <Trophy size={34} />
                  <h2>Haftalık lig</h2>
                  <p>Bu hafta kazandığın XP ile ligde yüksel.</p>
                  <button
                    className="dp-link"
                    onClick={() => {
                      navigate("match");
                      setMatchTab("league");
                    }}
                  >
                    Sıralamayı gör <ArrowRight size={16} />
                  </button>
                </section>
                <p className="dp-side-note">Bir konuya tekrar dönmek serbest.</p>
              </aside>
            </div>
          )}
          {page === "tasks" && (
            <>
              <div className="dp-page-heading">
                <span className="eyebrow">BUGÜN KENDİNE BİR ŞEY KAT</span>
                <h1>Görevler</h1>
                <p>Küçük adımlar, büyük ilerleme.</p>
              </div>
              <div className="dp-tabs">
                {[
                  ["daily", "Günlük"],
                  ["assignments", "Ödevler"],
                  ["weekly", "Haftalık"],
                  ["mistakes", "Hatalarım"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={taskTab === id ? "active" : ""}
                    aria-pressed={taskTab === id}
                    onClick={() => setTaskTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {taskTab === "daily" && data.daily && (
                <DailyLearning
                  daily={data.daily}
                  busy={busy}
                  explore={() => navigate("learn")}
                  start={(item) =>
                    void act(async () => {
                      const s = await api<LearningSession>(`daily/${item.id}/start`, {});
                      router.push(`/learn/${s.id}`);
                    })
                  }
                />
              )}
              {taskTab === "assignments" && (
                <>
                  {chooseCourse}
                  {course && (
                    <AssignmentsPanel key={courseId} courseId={courseId} teacher={false} />
                  )}
                </>
              )}
              {taskTab === "weekly" && <RewardsPanel updated={updated} section="streak" />}
              {taskTab === "mistakes" && (
                <section className="dp-card">
                  <div className="section-heading">
                    <h2>Pekiştirme zamanı</h2>
                    <button
                      className="button primary"
                      disabled={busy || !data.mistakes.length}
                      onClick={() =>
                        void act(async () => {
                          const s = await api<LearningSession>("mistakes/start", {});
                          router.push(`/learn/${s.id}`);
                        })
                      }
                    >
                      <RefreshCw size={17} />
                      Tümünü pekiştir
                    </button>
                  </div>
                  {data.mistakes.length ? (
                    data.mistakes.map((m) => (
                      <div className="dp-list-row" key={m.id}>
                        <BookOpen />
                        <div>
                          <strong>{m.title}</strong>
                          <p>
                            {m.course_title} · {m.topic_title}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>Bekleyen hatan yok. Yeni konular keşfetmeye hazırsın.</p>
                  )}
                </section>
              )}
            </>
          )}
          {page === "match" && (
            <>
              <div className="dp-tabs">
                {[
                  ["play", "Meydan okuma"],
                  ["league", "Haftalık lig"],
                  ["class", "Sınıf sıralaması"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={matchTab === id}
                    className={matchTab === id ? "active" : ""}
                    onClick={() => setMatchTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {matchTab === "play" ? (
                <ChallengesPanel
                  courses={data.courses}
                  userId={data.user.id}
                  outfit={wallet?.cosmetics.outfit || "penguin"}
                />
              ) : matchTab === "class" ? (
                <>
                  <div className="dp-page-heading">
                    <h1>Sınıf sıralaması</h1>
                  </div>
                  {chooseCourse}
                  {course && <ClassRanking key={courseId} courseId={courseId} studentProfiles />}
                </>
              ) : (
                <LeaguePanel updated={updated} />
              )}
            </>
          )}
          {page === "shop" && <RewardsPanel updated={updated} section="shop" profile={data.user} />}
          {page === "profile" && (
            <>
              <section
                className={`dp-profile-hero dp-banner-${wallet?.cosmetics.banner || "polar"}`}
              >
                <span
                  className={`dp-avatar dp-profile-avatar dp-frame-${wallet?.cosmetics.frame || "none"}`}
                >
                  <ProfilePhoto url={wallet?.photo_url} name={data.user.display_name} />
                </span>
                <PhotoUpload updated={updated} />
                <div className="dp-profile-companion">
                  <Penguin outfit={wallet?.cosmetics.outfit || "penguin"} interactive />
                </div>
                <h1 className={`dp-font-${wallet?.cosmetics.font || "default"}`}>
                  {data.user.display_name}
                </h1>
                <p>{data.user.university || "Merakın peşinde bir kaşif"}</p>
                <span className="dp-level-pill">Seviye {level.level}</span>
              </section>
              <div className="dp-profile-stats">
                <div>
                  <Star />
                  <strong>{wallet?.xp || 0}</strong>
                  <span>Toplam XP</span>
                </div>
                <div>
                  <Flame />
                  <strong>{wallet?.streak || 0}</strong>
                  <span>Günlük seri</span>
                </div>
                <div>
                  <BookOpen />
                  <strong>{data.courses.length}</strong>
                  <span>Ders</span>
                </div>
              </div>
              <div className="dp-tabs">
                {[
                  ["overview", "Başarımlar ve seri"],
                  ["inventory", "Sahip olduklarım"],
                  ["history", "Geçmişim"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={profileTab === id}
                    className={profileTab === id ? "active" : ""}
                    onClick={() => setProfileTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {profileTab === "history" ? (
                <LearningHistory />
              ) : (
                <RewardsPanel
                  updated={updated}
                  profile={data.user}
                  section={profileTab === "inventory" ? "inventory" : "profile"}
                />
              )}
              <button
                className="dp-card dp-profile-league"
                onClick={() => {
                  navigate("match");
                  setMatchTab("league");
                }}
              >
                <Trophy size={31} />
                <div>
                  <strong>Haftalık lig</strong>
                  <p>Bu haftaki sıralamanı ve geçmiş liglerini gör.</p>
                </div>
                <ArrowRight />
              </button>
              <section className="dp-settings">
                <h2>
                  <Settings2 size={23} /> Uygulama ve hesap ayarları
                </h2>
                <form
                  className="dp-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = Object.fromEntries(new FormData(e.currentTarget));
                    void act(async () => {
                      await api("profile", { ...v, public_profile: v.public_profile === "on" });
                      await updated();
                      setNotice("Profilin güncellendi.");
                    });
                  }}
                >
                  <Field label="Ad ve soyad">
                    <input
                      name="display_name"
                      required
                      minLength={2}
                      maxLength={100}
                      defaultValue={data.user.display_name}
                    />
                  </Field>
                  <Field label="Üniversite">
                    <input name="university" maxLength={150} defaultValue={data.user.university} />
                  </Field>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="public_profile"
                      defaultChecked={data.user.public_profile}
                    />
                    Profilimi diğer öğrenciler görebilsin
                  </label>
                  <button className="button primary" disabled={busy}>
                    Değişiklikleri kaydet
                  </button>
                </form>
                <AccountSecurity />
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api("auth/logout", {});
                      router.replace("/login");
                    })
                  }
                >
                  <LogOut size={18} />
                  Çıkış yap
                </button>
              </section>
            </>
          )}
        </main>
      </div>
      {selected && (
        <Modal
          title={preparing ? "Derse hazırlık" : selected.title}
          onClose={() => setSelected(null)}
        >
          <div className="dp-topic-dialog">
            <ErrorBanner message={error} />
            {!preparing ? (
              <>
                <span className="eyebrow">
                  {selected.week}. HAFTA · {selected.objectives.length} KAZANIM
                </span>
                <p>Bu konuya nasıl yaklaşmak istersin?</p>
                <button className="dp-choice" onClick={() => setPreparing(true)}>
                  <Sparkles />
                  <span>
                    <strong>Derse hazırlık</strong>
                    <small>Anahtar kavramlara kısa bir göz at.</small>
                  </span>
                  <ArrowRight />
                </button>
                <button
                  className="dp-choice"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const s = await api<LearningSession>("sessions", {
                        course_id: courseId,
                        topic_id: selected.id,
                        mode: "practice",
                      });
                      router.push(`/learn/${s.id}`);
                    })
                  }
                >
                  <RefreshCw />
                  <span>
                    <strong>Tekrar</strong>
                    <small>Detaylı sorularla bilgini pekiştir.</small>
                  </span>
                  <ArrowRight />
                </button>
              </>
            ) : (
              <>
                <LessonPreparation
                  courseId={courseId}
                  topicId={selected.id}
                  title={selected.title}
                  done={() => setSelected(null)}
                />
              </>
            )}
          </div>
          {!preparing && (
            <details className="dp-support-details">
              <summary>Bu konuda desteğe ihtiyacım var</summary>
              {selected.objectives.map((o) => (
                <button
                  className="dp-link"
                  key={o.id}
                  onClick={() => {
                    setSelected(null);
                    setSupport(o);
                  }}
                >
                  {o.title}
                </button>
              ))}
            </details>
          )}
        </Modal>
      )}
      {support && (
        <SupportRequest
          courseId={courseId}
          objective={support}
          close={() => setSupport(null)}
          saved={updated}
        />
      )}
      {join && (
        <Modal title="Sınıfa katıl" onClose={() => setJoin(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              void act(async () => {
                const joined = await api<{ course_id: string }>("courses/join", values);
                selectCourse(joined.course_id);
                await updated();
                setJoin(false);
              });
            }}
          >
            <ErrorBanner message={error} />
            <Field label="Sınıf kodu">
              <input name="code" required autoComplete="off" />
            </Field>
            <button className="button primary full-width" disabled={busy}>
              Katıl <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
