"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Bootstrap } from "@/types/bootstrap";
import { useRouter } from "next/navigation";
import {
  House,
  BookOpen,
  CircleAlert,
  UserRound,
  LogOut,
  Plus,
  Users,
  LayoutDashboard,
  Play,
  Sparkles,
  Clock3,
  Menu,
  Copy,
  Pencil,
  ListChecks,
  Settings2,
  Award,
  Coins,
  Swords,
  Trophy,
  X,
  Moon,
  Sun,
  Search,
  Download,
} from "lucide-react";
import { api, ApiError, errorMessage, dateLabel } from "@/lib/client";
import type { Course, Objective, LearningSession, GenerationChecks } from "@/types/domain";
import { today, addDays } from "@/lib/time";
import type { StoredActivity } from "@/modules/activities/schema";
import { kindLabels } from "@/modules/activities/kinds";
import { Brand, Spinner, Empty, Modal, Field, ErrorBanner, Pill, trapFocus } from "./ui";
const ActivityEditor = dynamic(
  () => import("./activities/editor").then((module) => module.ActivityEditor),
  { loading: () => <Spinner /> },
);
import { ActivityReviewStatus } from "./activities/review-status";
import { DocumentsPanel } from "./documents-panel";
import { AssignmentsPanel } from "./assignments-panel";
import { LearningHistory } from "./learning-history";
import { StudentAnalytics } from "./student-analytics";
import { RewardsPanel } from "./rewards-panel";
import { ClassRanking } from "./class-ranking";
import { ChallengesPanel } from "./challenges-panel";
import { LeaguePanel } from "./league-panel";
import { DailyLearning } from "./daily-learning";
import { CurriculumCalendar } from "./curriculum-calendar";
import { CourseSettings, CourseArchive } from "./course-settings";
import { AccountSecurity } from "./account-security";
import { SupportRequest } from "./support-request";
import { TeacherWorkspace, type TeacherDestination } from "./teacher-workspace";
import { TeacherGradebook } from "./teacher-gradebook";
import { downloadCsv } from "@/lib/csv";

interface StudentStats {
  id: string;
  display_name: string;
  email: string;
  first_attempts: number;
  first_correct: number;
  review_attempts: number;
  review_correct: number;
  last_active: string | null;
}
interface Attempt {
  id: string;
  display_name: string;
  title: string;
  version: number;
  correct: boolean;
  context: string;
  created_at: string;
  objective_title: string;
}
interface ObjectiveStats {
  id: string;
  title: string;
  topic_title: string;
  attempts: number;
  incorrect: number;
  reported_gaps: number;
}
interface Analytics {
  students: StudentStats[];
  attempts: Attempt[];
  objectives: ObjectiveStats[];
  date: string;
  participation: { date: string; students: number; daily_students: number }[];
  plans: { date: string; total_items: number; completed_items: number; students: number }[];
  pending_content: number;
}
type Tab =
  | "activities"
  | "curriculum"
  | "students"
  | "analytics"
  | "documents"
  | "assignments"
  | "ranking"
  | "gradebook";

export function TeacherDashboard({ initialData }: { initialData: Bootstrap }) {
  const [initialParams] = useState(
    () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search),
  );
  const router = useRouter();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [teacherTheme, setTeacherTheme] = useState(() => {
    try {
      return localStorage.getItem(`dopamin-teacher-theme:${initialData.user.id}`) === "dark"
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });
  const [activitySearch, setActivitySearch] = useState("");
  const [activityStatus, setActivityStatus] = useState("all");
  const [activityTopic, setActivityTopic] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [openAssignmentId, setOpenAssignmentId] = useState<string>();
  const [data, setData] = useState<Bootstrap>(initialData),
    [error, setError] = useState(""),
    [page, setPage] = useState(() =>
      ["home", "courses", "profile"].includes(initialParams.get("page") || "")
        ? initialParams.get("page")!
        : "home",
    ),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (!mobile) return;
    const opener = document.activeElement as HTMLElement | null;
    sidebarRef.current?.querySelector<HTMLElement>(".mobile-menu-close")?.focus();
    const media = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => {
      if (media.matches) setMobile(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => {
      media.removeEventListener("change", closeOnDesktop);
      if (opener?.isConnected) opener.focus();
    };
  }, [mobile]);
  const [courseId, setCourseId] = useState(
      () =>
        initialData.courses.find((c) => c.id === initialParams.get("course"))?.id ||
        initialData.courses[0]?.id ||
        "",
    ),
    [tab, setTab] = useState<Tab>(() =>
      [
        "activities",
        "curriculum",
        "students",
        "analytics",
        "documents",
        "assignments",
        "gradebook",
      ].includes(initialParams.get("tab") || "")
        ? (initialParams.get("tab") as Tab)
        : "activities",
    ),
    [activities, setActivities] = useState<
      (StoredActivity & {
        status: string;
        objective_title: string;
        topic_title: string;
        generation_checks?: GenerationChecks;
      })[]
    >([]),
    [objectives, setObjectives] = useState<Objective[]>([]),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [courseBusy, setCourseBusy] = useState(initialData.courses.length > 0);
  const [modal, setModal] = useState<
      | "course"
      | "join"
      | "objective"
      | "editor"
      | "calendar"
      | "course-settings"
      | "course-archive"
      | null
    >(null),
    [editing, setEditing] = useState<StoredActivity | undefined>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null),
    [supportObjective, setSupportObjective] = useState<Objective | null>(null),
    [assignmentTarget, setAssignmentTarget] = useState<string | undefined>();
  const load = useCallback(async () => {
    try {
      const value = await api<Bootstrap>("bootstrap");
      setData(value);
      setCourseId((old) =>
        value.courses.some((c) => c.id === old) ? old : value.courses[0]?.id || "",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
      else setError(errorMessage(err));
    }
  }, [router]);
  useEffect(() => {
    if (data?.user.role !== "teacher") return;
    const params = new URLSearchParams({ page });
    if (page === "courses" && courseId) {
      params.set("course", courseId);
      params.set("tab", tab);
    }
    window.history.replaceState(null, "", `/app?${params}`);
  }, [data?.user.role, page, courseId, tab]);
  const loadCourse = useCallback(async () => {
    if (!courseId || !data) return;
    try {
      const [a, o] = await Promise.all([
        api<typeof activities>(`courses/${courseId}/activities`),
        api<Objective[]>(`courses/${courseId}/objectives`),
      ]);
      setActivities(a);
      setObjectives(o);
      if (data.user.role === "teacher")
        setAnalytics(await api<Analytics>(`courses/${courseId}/analytics`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCourseBusy(false);
    }
  }, [courseId, data?.user.role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!courseId || data?.user.role !== "teacher") return;
    let active = true;
    Promise.all([
      api<typeof activities>(`courses/${courseId}/activities`),
      api<Objective[]>(`courses/${courseId}/objectives`),
      data.user.role === "teacher"
        ? api<Analytics>(`courses/${courseId}/analytics`)
        : Promise.resolve(null),
    ])
      .then(([a, o, stats]) => {
        if (active) {
          setActivities(a);
          setObjectives(o);
          setAnalytics(stats);
          setCourseBusy(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(errorMessage(err));
          setCourseBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [courseId, data?.user.role]);
  function navigate(p: string) {
    setPage(p);
    setMobile(false);
    setError("");
  }
  function selectCourse(id: string) {
    if (id !== courseId) setCourseBusy(true);
    setCourseId(id);
    setActivitySearch("");
    setActivityStatus("all");
    setActivityTopic("all");
    setStudentSearch("");
    setStudentFilter("all");
    setOpenAssignmentId(undefined);
    setAssignmentTarget(undefined);
  }
  function openTeacherDestination(destination: TeacherDestination) {
    selectCourse(destination.course);
    setTab(destination.tab);
    navigate("courses");
    setOpenAssignmentId(destination.assignment);
    setSelectedStudent(destination.student || null);
    if (destination.review) setActivityStatus("needs_review");
  }
  async function act(fn: () => Promise<unknown>, after?: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      if (after) await after();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function start(course: string, objective?: string, advance = false) {
    await act(async () => {
      const session = await api<LearningSession>("sessions", {
        course_id: course,
        objective_id: objective,
        mode: advance ? "advance" : "practice",
      });
      router.push(`/learn/${session.id}`);
    });
  }
  async function formSubmit(e: React.FormEvent<HTMLFormElement>, kind: string) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    await act(async () => {
      if (kind === "course") {
        const course = await api<Course>("courses", values);
        setCourseId(course.id);
        navigate("courses");
      } else if (kind === "join") await api("courses/join", values);
      else if (kind === "objective")
        await api(`courses/${courseId}/objectives`, {
          ...values,
          week: Number(values.week),
          importance: Number(values.importance),
        });
      setModal(null);
      await load();
      if (kind === "objective") await loadCourse();
    });
  }
  const teacher = data.user.role === "teacher",
    verified = data.user.teacher_verified,
    course = data.courses.find((c) => c.id === courseId);
  const nav = teacher
    ? [
        { id: "home", label: "Genel bakış", icon: LayoutDashboard },
        { id: "courses", label: "Derslerim", icon: BookOpen },
        { id: "profile", label: "Hesap ayarları", icon: Settings2 },
      ]
    : [
        { id: "home", label: "Bugün", icon: House },
        { id: "courses", label: "Derslerim", icon: BookOpen },
        { id: "mistakes", label: "Hatalarım", icon: CircleAlert },
        { id: "history", label: "Öğrenme geçmişim", icon: Clock3 },
        { id: "rewards", label: "Ödüller", icon: Award },
        { id: "challenges", label: "Meydan okumalar", icon: Swords },
        { id: "league", label: "Haftalık lig", icon: Trophy },
        { id: "profile", label: "Profilim", icon: UserRound },
      ];
  const name = data.user.display_name
    .replace(/^(?:Prof\.?\s+|Doç\.?\s+|Dr\.?\s+)+/iu, "")
    .trim()
    .split(/\s+/)[0]
    .replace(/\.+$/, "");
  const visibleActivities = activities.filter(
    (a) =>
      (activityStatus === "all" || a.status === activityStatus) &&
      (activityTopic === "all" || a.topic_title === activityTopic) &&
      `${a.title} ${a.objective_title} ${a.topic_title}`
        .toLocaleLowerCase("tr")
        .includes(activitySearch.toLocaleLowerCase("tr")),
  );
  const visibleStudents = (analytics?.students || []).filter(
    (s) =>
      `${s.display_name} ${s.email}`
        .toLocaleLowerCase("tr")
        .includes(studentSearch.toLocaleLowerCase("tr")) &&
      (studentFilter === "all" ||
        (studentFilter === "never"
          ? !s.last_active
          : !s.last_active ||
            today(new Date(s.last_active)) < addDays(analytics?.date || today(), -6))),
  );
  function courseCards() {
    return (
      <div className="course-card-grid">
        {data!.courses.map((c) => (
          <button
            key={c.id}
            className={`course-card color-${c.color}`}
            onClick={() => {
              setCourseId(c.id);
              navigate("courses");
            }}
          >
            <span className="course-card-icon">
              <BookOpen size={25} />
            </span>
            <span className="course-code">{c.code || "DERS"}</span>
            <h3>{c.title}</h3>
            <p>{c.term}</p>
            <div className="course-card-footer">
              <span>
                {teacher ? `${c.student_count || 0} öğrenci` : `${c.activity_count || 0} etkinlik`}
              </span>
              <span className="course-open">Dersi aç</span>
            </div>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div
      data-theme={teacher ? teacherTheme : data.rewards?.cosmetics.theme || "default"}
      className={`dashboard ${teacher ? "teacher-dashboard" : "student-dashboard"}`}
    >
      <a className="skip-link" href="#main">
        İçeriğe geç
      </a>
      <div
        ref={sidebarRef}
        id="main-menu"
        className={`sidebar ${mobile ? "sidebar-open" : ""}`}
        role={mobile ? "dialog" : "complementary"}
        aria-modal={mobile || undefined}
        aria-label={mobile ? "Ana menü" : undefined}
        onKeyDown={(event) => {
          if (!mobile) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setMobile(false);
          }
          trapFocus(event);
        }}
      >
        <button
          className="icon-button mobile-menu-close"
          aria-label="Menüyü kapat"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <Link href="/app" className="brand-link">
          {teacher ? (
            <span className="teacher-wordmark">
              <BookOpen size={25} strokeWidth={1.4} />
              dopamin<span>.</span>
            </span>
          ) : (
            <Brand />
          )}
        </Link>
        <span className="workspace-label">{teacher ? "AKADEMİSYEN ALANI" : "ÖĞRENME ALANIN"}</span>
        <nav aria-label="Ana menü">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
              {id === "mistakes" && data.mistakes.length > 0 && (
                <b className="nav-count">{data.mistakes.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={22} />
            <p>{teacher ? "Bir kazanım, yeni bir başlangıç." : "Küçük adımlar, büyük keşifler."}</p>
          </div>
          {teacher && (
            <p className="teacher-edition">
              ÖĞRETMEN DEFTERİ
              <br />
              <span>Dersler · Kayıtlar · Geri bildirim</span>
            </p>
          )}
          <button className="sidebar-user" onClick={() => navigate("profile")}>
            <span className={`avatar ${data.rewards?.cosmetics.frame ? "avatar-frame-lilac" : ""}`}>
              {data.rewards?.cosmetics.avatar ||
                data.user.display_name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
            </span>
            <span>
              <strong>{data.user.display_name}</strong>
              <small>{teacher ? "Akademisyen" : "Öğrenci"}</small>
            </span>
          </button>
          <button
            className="logout"
            onClick={() =>
              act(async () => {
                await api("auth/logout", {});
                router.replace("/login");
              })
            }
          >
            <LogOut size={16} />
            Çıkış yap
          </button>
        </div>
      </div>
      <div className="dashboard-main" inert={mobile}>
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Menüyü aç"
            aria-expanded={mobile}
            aria-controls="main-menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            {teacher ? "Akademisyen" : "Öğrenci"}
            <span>/</span>
            {nav.find((n) => n.id === page)?.label || "Öğrenme alanı"}
          </div>
          <div className="topbar-right">
            {teacher && (
              <button
                className="teacher-theme-toggle"
                aria-label={teacherTheme === "dark" ? "Açık temaya geç" : "Karanlık temaya geç"}
                onClick={() => {
                  const next = teacherTheme === "dark" ? "light" : "dark";
                  setTeacherTheme(next);
                  try {
                    localStorage.setItem(`dopamin-teacher-theme:${data.user.id}`, next);
                  } catch {
                    /* Theme still works without persistence. */
                  }
                }}
              >
                {teacherTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                <span>{teacherTheme === "dark" ? "Açık tema" : "Karanlık tema"}</span>
              </button>
            )}
            {!teacher && data.rewards && (
              <button
                className="topbar-wallet"
                onClick={() => navigate("rewards")}
                aria-label="Ödüllerini ve elmas bakiyeni aç"
              >
                <span>
                  <Award size={16} />
                  {data.rewards.xp} XP
                </span>
                <span>
                  <Coins size={16} />
                  {data.rewards.tokens}
                </span>
              </button>
            )}
            <span className="today-label">
              {new Date().toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                timeZone: "Europe/Istanbul",
              })}
            </span>
            <span
              className={`avatar avatar-small ${data.rewards?.cosmetics.frame ? "avatar-frame-lilac" : ""}`}
            >
              {data.rewards?.cosmetics.avatar || name[0]}
            </span>
          </div>
        </header>
        <main id="main" className="page-content" tabIndex={-1}>
          <ErrorBanner message={error} />
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button className="text-button" onClick={() => setNotice("")}>
                Kapat
              </button>
            </div>
          )}
          {teacher && !verified && (
            <div className="notice">
              Akademisyen hesabının doğrulanması bekleniyor. Ders yönetimi doğrulamadan sonra
              açılacak.
            </div>
          )}
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {teacher ? "DOPAMİN / ÖĞRETMEN DEFTERİ" : "YENİ BİR GÜN, YENİ BİR ADIM"}
                  </span>
                  <h1>
                    {teacher ? "Çalışma masası" : `Merhaba, ${name}`}
                    <span className="greeting-dot">.</span>
                  </h1>
                  <p>
                    {teacher
                      ? "Ders dosyaları, bekleyen değerlendirmeler ve sınıftan notlar."
                      : "Bugün de kendin için bir şey öğren."}
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={teacher && !verified}
                  onClick={() => setModal(teacher ? "course" : "join")}
                >
                  <Plus size={18} />
                  {teacher ? "Yeni ders" : "Sınıfa katıl"}
                </button>
              </div>
              {teacher ? (
                verified ? (
                  <TeacherWorkspace open={openTeacherDestination} />
                ) : null
              ) : (
                <>
                  {data.daily && (
                    <DailyLearning
                      daily={data.daily}
                      busy={busy}
                      explore={() => navigate("courses")}
                      start={(item) =>
                        void act(async () => {
                          const s = await api<LearningSession>(`daily/${item.id}/start`, {});
                          router.push(`/learn/${s.id}`);
                        })
                      }
                    />
                  )}
                  {data.sessions.length > 0 && (
                    <section className="resume-panel">
                      <div>
                        <Clock3 size={20} />
                        <div>
                          <strong>Kaldığın yerden devam et</strong>
                          <p>
                            {data.sessions[0].cursor}/{data.sessions[0].items.length} etkinlik
                            tamamlandı
                          </p>
                        </div>
                      </div>
                      <Link className="button secondary" href={`/learn/${data.sessions[0].id}`}>
                        Devam et
                      </Link>
                    </section>
                  )}
                  {data.mistakes.length > 0 && (
                    <button className="mistakes-callout" onClick={() => navigate("mistakes")}>
                      <span>
                        <CircleAlert size={22} />
                        <strong>{data.mistakes.length} soruyu birlikte pekiştirelim</strong>
                      </span>
                      <span>Hatalarıma git</span>
                    </button>
                  )}
                  <div className="section-heading">
                    <h2>Derslerin</h2>
                    <span className="muted">{data.courses.length} aktif ders</span>
                  </div>
                  {data.courses.length ? (
                    courseCards()
                  ) : (
                    <Empty
                      title="Yolculuğun bir sınıfla başlar"
                      description="Akademisyeninden aldığın sınıf kodunu gir."
                    >
                      <button className="button primary" onClick={() => setModal("join")}>
                        Sınıfa katıl
                      </button>
                    </Empty>
                  )}
                </>
              )}
            </>
          )}
          {page === "courses" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {teacher ? "DERS YÖNETİMİ" : "KEŞFET, ÖĞREN, PEKİŞTİR"}
                  </span>
                  <h1>Derslerim</h1>
                  <p>
                    {teacher
                      ? "İçerikleri hazırla, sınıfını takip et."
                      : "Her ders, yeni bir keşif."}
                  </p>
                </div>
                <div className="form-actions">
                  {teacher && (
                    <button className="button secondary" onClick={() => setModal("course-archive")}>
                      Arşiv
                    </button>
                  )}
                  <button
                    className="button primary"
                    disabled={teacher && !verified}
                    onClick={() => setModal(teacher ? "course" : "join")}
                  >
                    <Plus size={18} />
                    {teacher ? "Yeni ders" : "Sınıfa katıl"}
                  </button>
                </div>
              </div>
              {data.courses.length > 0 ? (
                <>
                  <div className="course-selector">
                    {data.courses.map((c) => (
                      <button
                        key={c.id}
                        className={courseId === c.id ? "selected" : ""}
                        onClick={() => selectCourse(c.id)}
                      >
                        <span className={`course-dot color-${c.color}`} />
                        {c.title}
                      </button>
                    ))}
                  </div>
                  {course && (
                    <>
                      <div className="course-detail-heading">
                        <div>
                          <span className="eyebrow">
                            {course.code} · {course.term}
                          </span>
                          <h2>{course.title}</h2>
                          <p>{course.description}</p>
                        </div>
                        {teacher && (
                          <div className="invite-box">
                            <button
                              className="button small secondary"
                              onClick={() => setModal("course-settings")}
                            >
                              <Settings2 size={16} /> Ders ayarları
                            </button>
                            <span>Sınıf kodu</span>
                            <button
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(course.invite_code || "")
                                  .then(() => setNotice("Sınıf kodu kopyalandı."));
                              }}
                            >
                              <strong>{course.invite_code || "İptal edildi"}</strong>
                              <Copy size={16} />
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => act(() => api(`courses/${courseId}/invite`, {}), load)}
                            >
                              Yenile
                            </button>
                          </div>
                        )}
                      </div>
                      <div
                        className="tabs"
                        role="tablist"
                        tabIndex={-1}
                        aria-label="Ders bölümleri"
                        onKeyDown={(event) => {
                          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                            return;
                          const tabs = Array.from(
                            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
                          );
                          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
                          const next =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? tabs.length - 1
                                : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                                  tabs.length;
                          event.preventDefault();
                          tabs[next]?.focus();
                          tabs[next]?.click();
                        }}
                      >
                        {(teacher
                          ? [
                              { id: "activities", label: "Etkinlikler" },
                              { id: "curriculum", label: "Müfredat" },
                              { id: "documents", label: "Kaynaklar ve AI" },
                              { id: "assignments", label: "Ödevler" },
                              { id: "students", label: "Öğrenciler" },
                              { id: "analytics", label: "Analiz" },
                              { id: "gradebook", label: "Not defteri" },
                            ]
                          : [
                              { id: "activities", label: "Etkinlikler" },
                              { id: "curriculum", label: "Öğrenme yolu" },
                              { id: "assignments", label: "Ödevler" },
                              { id: "ranking", label: "Sıralama" },
                            ]
                        ).map((t) => (
                          <button
                            role="tab"
                            id={`course-tab-${t.id}`}
                            aria-controls="course-panel"
                            tabIndex={tab === t.id ? 0 : -1}
                            aria-selected={tab === t.id}
                            key={t.id}
                            className={tab === t.id ? "active" : ""}
                            onClick={() => {
                              setOpenAssignmentId(undefined);
                              setTab(t.id as Tab);
                              if (teacher && ["students", "analytics"].includes(t.id))
                                void loadCourse();
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div
                        id="course-panel"
                        role="tabpanel"
                        aria-labelledby={`course-tab-${tab}`}
                        tabIndex={0}
                      >
                        {courseBusy ? (
                          <Spinner />
                        ) : (
                          <>
                            {tab === "activities" && (
                              <>
                                <div className="section-heading">
                                  <h3>{activities.length} etkinlik</h3>
                                  {teacher ? (
                                    <button
                                      className="button primary"
                                      disabled={!objectives.length || busy}
                                      onClick={() => {
                                        setEditing(undefined);
                                        setModal("editor");
                                      }}
                                    >
                                      <Plus size={16} />
                                      Etkinlik hazırla
                                    </button>
                                  ) : (
                                    <button
                                      className="button primary"
                                      disabled={!activities.length || busy}
                                      onClick={() => start(courseId)}
                                    >
                                      <Play size={17} />
                                      Çalışmaya başla
                                    </button>
                                  )}
                                </div>
                                {teacher && (
                                  <div className="teacher-filter-bar">
                                    <label className="teacher-search">
                                      <Search size={16} />
                                      <input
                                        aria-label="Etkinlik ara"
                                        placeholder="Başlık veya kazanım ara"
                                        value={activitySearch}
                                        onChange={(e) => setActivitySearch(e.target.value)}
                                      />
                                    </label>
                                    <label>
                                      Konu
                                      <select
                                        aria-label="Konu"
                                        value={activityTopic}
                                        onChange={(e) => setActivityTopic(e.target.value)}
                                      >
                                        <option value="all">Tüm konular</option>
                                        {[...new Set(activities.map((a) => a.topic_title))].map(
                                          (topic) => (
                                            <option key={topic}>{topic}</option>
                                          ),
                                        )}
                                      </select>
                                    </label>
                                    <label>
                                      Yayın durumu
                                      <select
                                        aria-label="Yayın durumu"
                                        value={activityStatus}
                                        onChange={(e) => setActivityStatus(e.target.value)}
                                      >
                                        <option value="all">Tüm durumlar</option>
                                        <option value="published">Yayındaki etkinlikler</option>
                                        <option value="needs_review">İnceleme bekliyor</option>
                                        <option value="draft">Taslak</option>
                                        <option value="archived">Arşiv</option>
                                      </select>
                                    </label>
                                    {(activitySearch ||
                                      activityStatus !== "all" ||
                                      activityTopic !== "all") && (
                                      <button
                                        className="text-button"
                                        onClick={() => {
                                          setActivitySearch("");
                                          setActivityStatus("all");
                                          setActivityTopic("all");
                                        }}
                                      >
                                        Temizle
                                      </button>
                                    )}
                                  </div>
                                )}
                                {activities.length ? (
                                  <div className="activity-list">
                                    {!visibleActivities.length && (
                                      <p className="desk-empty" role="status">
                                        Bu filtrelere uyan etkinlik yok.
                                      </p>
                                    )}
                                    {visibleActivities.map((a) => (
                                      <article className="activity-row" key={a.id}>
                                        <span className={`activity-row-icon color-${course.color}`}>
                                          <ListChecks size={21} />
                                        </span>
                                        <div className="activity-row-main">
                                          <h3>{a.title}</h3>
                                          <p>
                                            {a.topic_title} · {kindLabels[a.kind]}
                                          </p>
                                          {teacher && (
                                            <ActivityReviewStatus
                                              checks={a.generation_checks}
                                              status={a.status}
                                            />
                                          )}
                                        </div>
                                        <Pill tone={a.status === "published" ? "green" : "neutral"}>
                                          {a.status === "published"
                                            ? "Yayında"
                                            : a.status === "needs_review"
                                              ? "İnceleme bekliyor"
                                              : a.status === "archived"
                                                ? "Arşiv"
                                                : "Taslak"}
                                        </Pill>
                                        {teacher && (
                                          <div className="row-actions">
                                            <button
                                              className="icon-button"
                                              aria-label={`${a.title} düzenle`}
                                              onClick={() => {
                                                setEditing(a);
                                                setModal("editor");
                                              }}
                                            >
                                              <Pencil size={17} />
                                            </button>
                                            {a.status !== "published" &&
                                              a.status !== "archived" && (
                                                <button
                                                  className="button small secondary"
                                                  disabled={busy}
                                                  onClick={() =>
                                                    act(
                                                      () =>
                                                        api(
                                                          `courses/${courseId}/activities/${a.activity_id}/publish`,
                                                          {},
                                                        ),
                                                      async () => {
                                                        await loadCourse();
                                                        await load();
                                                      },
                                                    )
                                                  }
                                                >
                                                  Yayımla
                                                </button>
                                              )}
                                          </div>
                                        )}
                                      </article>
                                    ))}
                                  </div>
                                ) : (
                                  <Empty
                                    title="Etkinlikler burada yer alacak"
                                    description={
                                      teacher
                                        ? objectives.length
                                          ? "İlk etkileşimli çalışmanı hazırla."
                                          : "Önce müfredata bir konu ve kazanım ekle."
                                        : "Akademisyenin içerikleri hazırlıyor."
                                    }
                                  >
                                    {teacher && (
                                      <button
                                        className="button secondary"
                                        onClick={() => {
                                          if (objectives.length) {
                                            setEditing(undefined);
                                            setModal("editor");
                                          } else {
                                            setTab("curriculum");
                                            setModal("objective");
                                          }
                                        }}
                                      >
                                        {objectives.length ? "Etkinlik oluştur" : "Kazanım ekle"}
                                      </button>
                                    )}
                                  </Empty>
                                )}
                              </>
                            )}
                            {tab === "curriculum" && (
                              <>
                                <div className="section-heading">
                                  <h3>Konu ve kazanımlar</h3>
                                  {teacher && (
                                    <div className="row-actions">
                                      <button
                                        className="button secondary"
                                        disabled={!objectives.length}
                                        onClick={() => setModal("calendar")}
                                      >
                                        <Clock3 size={16} />
                                        Takvimi düzenle
                                      </button>
                                      <button
                                        className="button primary"
                                        onClick={() => setModal("objective")}
                                      >
                                        <Plus size={16} />
                                        Kazanım ekle
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {objectives.length ? (
                                  <div className="curriculum-list">
                                    {[...new Set(objectives.map((o) => o.week))].map((week) => (
                                      <section className="week-section" key={week}>
                                        <div className="week-number">
                                          <strong>{String(week).padStart(2, "0")}</strong>
                                          <span>HAFTA</span>
                                        </div>
                                        <div className="week-objectives">
                                          {objectives
                                            .filter((o) => o.week === week)
                                            .map((o) => (
                                              <article key={o.id} className="objective-row">
                                                <div>
                                                  <span className="objective-topic">
                                                    {o.topic_title} · {dateLabel(o.scheduled_date)}
                                                  </span>
                                                  <h3>{o.title}</h3>
                                                  {!teacher && (
                                                    <Pill
                                                      tone={
                                                        o.mastery_state === "mastered"
                                                          ? "green"
                                                          : "neutral"
                                                      }
                                                    >
                                                      {o.mastery_state === "mastered"
                                                        ? "Öğrenildi"
                                                        : o.mastery_state === "reinforcing"
                                                          ? "Pekiştiriliyor"
                                                          : o.mastery_state === "needs_review"
                                                            ? "Tekrar gerekli"
                                                            : o.mastery_state === "learning"
                                                              ? "Öğreniliyor"
                                                              : "Henüz başlamadın"}
                                                    </Pill>
                                                  )}
                                                  {!teacher && o.gap_reported && (
                                                    <Pill tone="orange">Destek istedin</Pill>
                                                  )}
                                                </div>
                                                {!teacher && (
                                                  <div className="row-actions">
                                                    <button
                                                      className="icon-button"
                                                      aria-label={
                                                        o.gap_reported
                                                          ? "Destek bildirimini görüntüle"
                                                          : "Bu konuda eksiğim var"
                                                      }
                                                      disabled={busy || !o.accessible}
                                                      onClick={() => setSupportObjective(o)}
                                                    >
                                                      <CircleAlert size={18} />
                                                    </button>
                                                    <button
                                                      className="button small secondary"
                                                      disabled={busy || !o.accessible}
                                                      onClick={() =>
                                                        start(
                                                          courseId,
                                                          o.id,
                                                          o.scheduled_date > today(),
                                                        )
                                                      }
                                                    >
                                                      {o.accessible ? "Çalış" : "Kapalı"}
                                                    </button>
                                                  </div>
                                                )}
                                              </article>
                                            ))}
                                        </div>
                                      </section>
                                    ))}
                                  </div>
                                ) : (
                                  <Empty
                                    title="Müfredat henüz hazırlanmadı"
                                    description={
                                      teacher
                                        ? "Konuları ve ölçülebilir öğrenme kazanımlarını ekle."
                                        : "Öğrenme yolun içerikler yayımlandığında açılacak."
                                    }
                                  />
                                )}
                              </>
                            )}
                            {tab === "ranking" && !teacher && (
                              <ClassRanking key={courseId} courseId={courseId} />
                            )}
                            {tab === "assignments" && (
                              <AssignmentsPanel
                                key={courseId}
                                courseId={courseId}
                                teacher={teacher}
                                initialTarget={assignmentTarget}
                                clearTarget={() => setAssignmentTarget(undefined)}
                                initialAssignment={openAssignmentId}
                              />
                            )}
                            {tab === "gradebook" && teacher && (
                              <TeacherGradebook
                                key={courseId}
                                courseId={courseId}
                                openAssignment={(id) => {
                                  setOpenAssignmentId(id);
                                  setTab("assignments");
                                }}
                              />
                            )}
                            {tab === "documents" && teacher && (
                              <DocumentsPanel
                                key={courseId}
                                courseId={courseId}
                                objectives={objectives}
                                aiConfigured={data.ai_configured}
                                onChange={loadCourse}
                              />
                            )}
                            {tab === "students" && analytics && (
                              <>
                                <div className="section-heading">
                                  <h3>{analytics.students.length} öğrenci</h3>
                                  <button
                                    className="button secondary"
                                    disabled={!visibleStudents.length}
                                    onClick={() =>
                                      downloadCsv(`sinif-raporu-${courseId.slice(0, 8)}.csv`, [
                                        [
                                          "Öğrenci",
                                          "E-posta",
                                          "İlk deneme doğru",
                                          "İlk deneme toplam",
                                          "Tekrar doğru",
                                          "Tekrar toplam",
                                          "Son çalışma",
                                        ],
                                        ...visibleStudents.map((s) => [
                                          s.display_name,
                                          s.email,
                                          s.first_correct,
                                          s.first_attempts,
                                          s.review_correct,
                                          s.review_attempts,
                                          s.last_active,
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
                                      aria-label="Sınıfta öğrenci ara"
                                      placeholder="Öğrenci adı veya e-posta"
                                      value={studentSearch}
                                      onChange={(e) => setStudentSearch(e.target.value)}
                                    />
                                  </label>
                                  <label>
                                    Katılım
                                    <select
                                      aria-label="Katılım"
                                      value={studentFilter}
                                      onChange={(e) => setStudentFilter(e.target.value)}
                                    >
                                      <option value="all">Tüm öğrenciler</option>
                                      <option value="never">Henüz çalışmayanlar</option>
                                      <option value="inactive">Son 7 gündür çalışmayanlar</option>
                                    </select>
                                  </label>
                                  <span className="teacher-result-count" role="status">
                                    {visibleStudents.length} kayıt
                                  </span>
                                </div>
                                {analytics.students.length ? (
                                  <div className="table-wrap">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Öğrenci</th>
                                          <th>İlk denemeler</th>
                                          <th>Tekrar sonrası</th>
                                          <th>Son çalışma</th>
                                          <th>İşlemler</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {visibleStudents.map((s) => (
                                          <tr key={s.id}>
                                            <td>
                                              <strong>{s.display_name}</strong>
                                              <small>{s.email}</small>
                                            </td>
                                            <td>
                                              {s.first_correct}/{s.first_attempts}
                                            </td>
                                            <td>
                                              {s.review_correct}/{s.review_attempts}
                                            </td>
                                            <td>
                                              {s.last_active
                                                ? dateLabel(s.last_active)
                                                : "Henüz çalışmadı"}
                                            </td>
                                            <td>
                                              <button
                                                className="text-button danger-text"
                                                disabled={busy}
                                                onClick={() =>
                                                  act(
                                                    () =>
                                                      api(`courses/${courseId}/remove-student`, {
                                                        user_id: s.id,
                                                      }),
                                                    async () => {
                                                      await loadCourse();
                                                      await load();
                                                    },
                                                  )
                                                }
                                              >
                                                Çıkar
                                              </button>
                                              <button
                                                className="text-button"
                                                onClick={() => setSelectedStudent(s.id)}
                                              >
                                                İncele
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <Empty
                                    title="Sınıfın öğrencilerini bekliyor"
                                    description="Sınıf kodunu öğrencilerinle paylaş."
                                  />
                                )}
                              </>
                            )}
                            {tab === "analytics" && analytics && (
                              <>
                                <div className="stats-grid">
                                  <Stat
                                    icon={<Users />}
                                    number={
                                      analytics.participation.find((p) => p.date === analytics.date)
                                        ?.students || 0
                                    }
                                    label="Bugün çalışan öğrenci"
                                    tone="violet"
                                  />
                                  <Stat
                                    icon={<ListChecks />}
                                    number={
                                      analytics.plans.find((p) => p.date === analytics.date)
                                        ?.completed_items || 0
                                    }
                                    label={`${analytics.plans.find((p) => p.date === analytics.date)?.total_items || 0} günlük adımdan tamamlandı`}
                                    tone="teal"
                                  />
                                  <Stat
                                    icon={<Sparkles />}
                                    number={analytics.pending_content}
                                    label="İnceleme bekleyen içerik"
                                    tone="orange"
                                  />
                                </div>
                                <div className="section-heading">
                                  <h3>Son 7 günün katılımı</h3>
                                  <span className="muted">Ödev ve meydan okuma hariç</span>
                                </div>
                                <div className="participation-strip">
                                  {Array.from({ length: 7 }, (_, i) => {
                                    const day = addDays(analytics.date, i - 6),
                                      p = analytics.participation.find((p) => p.date === day);
                                    return (
                                      <div key={day}>
                                        <span>{dateLabel(day)}</span>
                                        <strong>{p?.students || 0}</strong>
                                        <small>çalışan öğrenci</small>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="section-heading">
                                  <h3>Kazanım analizi</h3>
                                  <Pill>İlk denemelere göre</Pill>
                                </div>
                                <div className="analytics-grid">
                                  {analytics.objectives.map((o) => (
                                    <div className="analytics-card" key={o.id}>
                                      <span className="muted">{o.topic_title}</span>
                                      <h3>{o.title}</h3>
                                      <div className="analysis-rate">
                                        <strong>
                                          {o.attempts
                                            ? Math.round((o.incorrect / o.attempts) * 100)
                                            : 0}
                                          %
                                        </strong>
                                        <span>yanlış · {o.attempts} deneme</span>
                                      </div>
                                      <div className="progress-track">
                                        <span
                                          className="orange-progress"
                                          style={{
                                            width: `${o.attempts ? (o.incorrect / o.attempts) * 100 : 0}%`,
                                          }}
                                        />
                                      </div>
                                      {o.reported_gaps > 0 && (
                                        <p className="field-help">
                                          {o.reported_gaps} öğrenci destek istedi.
                                        </p>
                                      )}
                                      <button
                                        className="text-button"
                                        onClick={() => {
                                          setEditing(undefined);
                                          setModal("editor");
                                        }}
                                      >
                                        Destek etkinliği hazırla
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="section-heading">
                                  <h3>Son cevaplar</h3>
                                  <span className="muted">Sürümleriyle kayıtlı</span>
                                </div>
                                {analytics.attempts.length ? (
                                  <div className="table-wrap">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Öğrenci</th>
                                          <th>Etkinlik</th>
                                          <th>Bağlam</th>
                                          <th>Sonuç</th>
                                          <th>Tarih</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {analytics.attempts.map((a) => (
                                          <tr key={a.id}>
                                            <td>{a.display_name}</td>
                                            <td>
                                              {a.title}
                                              <small>Sürüm {a.version}</small>
                                            </td>
                                            <td>
                                              {a.context === "first"
                                                ? "İlk deneme"
                                                : a.context === "session_review"
                                                  ? "Oturum tekrarı"
                                                  : "Hatalarım"}
                                            </td>
                                            <td>
                                              <Pill tone={a.correct ? "green" : "orange"}>
                                                {a.correct ? "Doğru" : "Yanlış"}
                                              </Pill>
                                            </td>
                                            <td>{dateLabel(a.created_at)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <Empty
                                    title="Henüz cevap yok"
                                    description="Öğrencilerin çalıştığında sonuçlar burada görünecek."
                                  />
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <Empty
                  title="Henüz dersin yok"
                  description={teacher ? "İlk dersini oluştur." : "Bir sınıf koduyla derse katıl."}
                />
              )}
            </>
          )}
          {page === "mistakes" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YANLIŞLARINDAN ÖĞREN</span>
                  <h1>
                    Hatalarım<span className="greeting-dot">.</span>
                  </h1>
                  <p>Her tekrar, bilgini biraz daha sağlamlaştırır.</p>
                </div>
                <button
                  className="button primary"
                  disabled={busy || !data.mistakes.length}
                  onClick={() =>
                    act(async () => {
                      const s = await api<LearningSession>("mistakes/start", {});
                      router.push(`/learn/${s.id}`);
                    })
                  }
                >
                  <Play size={17} />
                  Tümünü pekiştir
                </button>
              </div>
              {data.mistakes.length ? (
                <div className="activity-list">
                  {data.mistakes.map((m) => (
                    <article className="activity-row" key={m.id}>
                      <span className={`activity-row-icon color-${m.color}`}>
                        <CircleAlert size={21} />
                      </span>
                      <div className="activity-row-main">
                        <h3>{m.title}</h3>
                        <p>
                          {m.course_title} · {m.topic_title}
                        </p>
                      </div>
                      <Pill tone="orange">Tekrar bekliyor</Pill>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Bekleyen hatan yok"
                  description="Çalışmalarındaki yanlışlar burada birikecek. Doğru çözerek kapatabilirsin."
                >
                  <button className="button primary" onClick={() => navigate("courses")}>
                    Derslerime dön
                  </button>
                </Empty>
              )}
            </>
          )}
          {page === "history" && !teacher && <LearningHistory />}
          {page === "rewards" && !teacher && <RewardsPanel updated={load} />}
          {page === "challenges" && !teacher && (
            <ChallengesPanel courses={data.courses} userId={data.user.id} />
          )}
          {page === "league" && !teacher && <LeaguePanel updated={load} />}
          {page === "profile" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">HESAP BİLGİLERİ</span>
                  <h1>{teacher ? "Hesap ayarları" : "Profilim"}</h1>
                  <p>İletişim bilgileri ve hesap güvenliği.</p>
                </div>
              </div>
              <div className="account-layout">
                <section className="profile-panel">
                  <span className="avatar profile-avatar">
                    {data.user.display_name
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <h2>{data.user.display_name}</h2>
                  <Pill tone="violet">{teacher ? "Akademisyen" : "Öğrenci"}</Pill>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const values = Object.fromEntries(new FormData(e.currentTarget).entries());
                      void act(async () => {
                        await api("profile", {
                          ...values,
                          public_profile: teacher
                            ? data.user.public_profile
                            : values.public_profile === "on",
                        });
                        await load();
                        setNotice("Profilin güncellendi.");
                      });
                    }}
                  >
                    <Field label="Ad ve soyad">
                      <input
                        name="display_name"
                        defaultValue={data.user.display_name}
                        required
                        minLength={2}
                      />
                    </Field>
                    <Field label="E-posta">
                      <input value={data.user.email} disabled />
                    </Field>
                    <Field label="Üniversite">
                      <input
                        name="university"
                        defaultValue={data.user.university}
                        maxLength={150}
                      />
                    </Field>
                    {!teacher && (
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          name="public_profile"
                          defaultChecked={data.user.public_profile}
                        />
                        Herkese açık sıralamalarda görün
                      </label>
                    )}
                    <button className="button primary full-width" disabled={busy}>
                      Değişiklikleri kaydet
                    </button>
                  </form>
                </section>
                <AccountSecurity />
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>{teacher ? "Dopamin / Öğretmen defteri" : "Dopamin · Öğrenmeye devam."}</span>
          <span>{teacher ? "Ders kayıtları ve değerlendirmeler" : "Her küçük adım değerli."}</span>
        </footer>
      </div>
      {selectedStudent && teacher && (
        <StudentAnalytics
          courseId={courseId}
          studentId={selectedStudent}
          close={() => setSelectedStudent(null)}
          changed={loadCourse}
          assign={() => {
            setAssignmentTarget(selectedStudent);
            setSelectedStudent(null);
            setTab("assignments");
          }}
        />
      )}
      {supportObjective && !teacher && (
        <SupportRequest
          courseId={courseId}
          objective={supportObjective}
          close={() => setSupportObjective(null)}
          saved={async () => {
            await loadCourse();
            await load();
          }}
        />
      )}
      {modal === "course-settings" && course && teacher && (
        <CourseSettings course={course} close={() => setModal(null)} updated={load} />
      )}
      {modal === "course-archive" && teacher && (
        <CourseArchive close={() => setModal(null)} updated={load} />
      )}
      {modal === "course" && (
        <Modal title="Yeni ders oluştur" onClose={() => setModal(null)}>
          <form onSubmit={(e) => formSubmit(e, "course")}>
            <Field label="Ders adı">
              <input
                name="title"
                required
                minLength={2}
                maxLength={140}
                placeholder="Programlamaya Giriş"
              />
            </Field>
            <div className="form-grid">
              <Field label="Ders kodu">
                <input name="code" maxLength={20} placeholder="BIL101" />
              </Field>
              <Field label="Akademik dönem">
                <input name="term" required defaultValue="2026–2027 Güz" />
              </Field>
            </div>
            <Field label="Açıklama">
              <textarea name="description" rows={3} maxLength={2000} />
            </Field>
            <Field label="Ders rengi">
              <select name="color">
                <option value="violet">Mor</option>
                <option value="blue">Mavi</option>
                <option value="orange">Turuncu</option>
                <option value="teal">Yeşil</option>
              </select>
            </Field>
            <ErrorBanner message={error} />
            <button className="button primary full-width" disabled={busy}>
              {busy ? "Oluşturuluyor…" : "Dersi oluştur"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "join" && (
        <Modal title="Sınıfa katıl" onClose={() => setModal(null)}>
          <p className="muted">Akademisyeninden aldığın sınıf kodunu gir.</p>
          <form onSubmit={(e) => formSubmit(e, "join")}>
            <Field label="Sınıf kodu">
              <input
                name="code"
                className="code-input"
                required
                minLength={6}
                maxLength={20}
                autoComplete="off"
                placeholder="A1B2C3D4"
              />
            </Field>
            <ErrorBanner message={error} />
            <button className="button primary full-width" disabled={busy}>
              {busy ? "Kontrol ediliyor…" : "Sınıfa katıl"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "objective" && (
        <Modal title="Konu ve kazanım ekle" onClose={() => setModal(null)}>
          <form onSubmit={(e) => formSubmit(e, "objective")}>
            <Field label="Konu">
              <input name="topic_title" required minLength={2} placeholder="Döngüler" />
            </Field>
            <Field label="Ölçülebilir öğrenme kazanımı">
              <textarea
                name="title"
                required
                minLength={2}
                placeholder="Döngülerin çalışma sırasını belirleyebilme"
                rows={3}
              />
            </Field>
            <div className="form-grid">
              <Field label="Hafta">
                <input name="week" type="number" defaultValue={1} min={1} max={52} required />
              </Field>
              <Field label="İşleneceği tarih">
                <input name="scheduled_date" type="date" required defaultValue={today()} />
              </Field>
            </div>
            <Field label="Akademik önem">
              <select name="importance" defaultValue={2}>
                <option value={1}>Normal</option>
                <option value={2}>Önemli</option>
                <option value={3}>Kritik</option>
              </select>
            </Field>
            <ErrorBanner message={error} />
            <button className="button primary full-width" disabled={busy}>
              Kazanımı ekle
            </button>
          </form>
        </Modal>
      )}
      {modal === "calendar" && (
        <CurriculumCalendar
          courseId={courseId}
          objectives={objectives}
          close={() => setModal(null)}
          saved={async () => {
            await loadCourse();
            await load();
          }}
        />
      )}
      {modal === "editor" && (
        <ActivityEditor
          courseId={courseId}
          objectives={objectives}
          existing={editing}
          onClose={() => setModal(null)}
          onSaved={loadCourse}
        />
      )}
    </div>
  );
}
function Stat({
  icon,
  number,
  label,
  tone,
}: {
  icon: React.ReactNode;
  number: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <span className={`stat-icon color-${tone}`}>{icon}</span>
      <div>
        <strong>{number}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
