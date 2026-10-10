import { z } from "zod";
import { lessonPreparation } from "@/modules/learning/preparation";
import { getDb, asUser } from "@/lib/db";
import { apiError, readJson, checkOrigin, json } from "@/lib/http";
import { AppError } from "@/lib/errors";
import {
  signup,
  login,
  logout,
  currentUser,
  requireUser,
  changePassword,
  logoutOthers,
  rateLimit,
} from "@/modules/auth/service";
import { exportPersonalData } from "@/modules/auth/export";
import { publicStudentProfile } from "@/modules/rewards/profiles";
import { requestPasswordReset, resetPassword } from "@/modules/auth/recovery";
import {
  createCourse,
  listCourses,
  joinCourse,
  rotateInvite,
  listObjectives,
  createObjective,
  ownCourse,
  removeStudent,
  updateCourse,
  archivedCourses,
  archiveCourse,
  updatePublicationPolicy,
} from "@/modules/courses/service";
import { listActivities, saveActivity, publishActivity } from "@/modules/activities/service";
import {
  startPractice,
  sessionView,
  submitAnswer,
  listMistakes,
  startMistakes,
  pauseSession,
} from "@/modules/learning/service";
import { courseAnalytics, studentAnalytics } from "@/modules/analytics/service";
import { learningHistory } from "@/modules/learning/history";
import { changeGap, gapDetail } from "@/modules/learning/gaps";
import {
  rewardSummary,
  rewardView,
  purchase,
  equip,
  classRanking,
  protectDay,
  claimChest,
} from "@/modules/rewards/service";
import { after } from "next/server";
import { leagueView, joinLeague, leaveLeague } from "@/modules/competition/leagues";
import {
  listChallenges,
  challengeRoster,
  createChallenge,
  respondChallenge,
  startChallenge,
  findMatch,
  cancelMatchSearch,
} from "@/modules/competition/service";
import {
  listDocuments,
  documentDetail,
  deleteDocument,
  reprocessDocument,
  setDocumentAccess,
} from "@/modules/documents/service";
import {
  contentStatus,
  queueAI,
  answerClarification,
  approveCurriculum,
} from "@/modules/ai/service";
import { aiConfigured } from "@/modules/ai/provider";
import { retryContentJob } from "@/modules/ai/queue";
import {
  webSources,
  setSourcePolicy,
  addWebSource,
  setWebPermission,
  queueWebFetch,
} from "@/modules/documents/web-sources";
import { drainJobs } from "@/workers/runner";
import { ensureDailyPlan, startPlanItem } from "@/modules/scheduling/service";
import { reviseCurriculum } from "@/modules/curriculum/service";
import {
  listAssignments,
  assignmentDetail,
  saveAssignment,
  publishAssignment,
  startAssignment,
  submitTraditional,
  withdrawSubmission,
  reviewSubmission,
  manageAssignment,
} from "@/modules/assignments/service";

import { teacherWorkspace, courseGradebook } from "@/modules/analytics/teacher-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path.join("/") === "auth/me")
      return json({ user: await currentUser(), local: process.env.AUTH_PROVIDER !== "supabase" });
    const user = await requireUser(),
      db = await getDb();
    if (path.join("/") === "account/export") {
      await rateLimit(db, `account-export:${user.id}`, 5, 3600);
      const data = await asUser(db, user.id, (tx) => exportPersonalData(tx, user));
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="pusula-verilerim-${new Date().toISOString().slice(0, 10)}.json"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return json(
      await asUser(db, user.id, async (tx) => {
        if (path.join("/") === "teacher/workspace") return teacherWorkspace(tx, user);
        if (path[0] === "bootstrap") {
          const courses = await listCourses(tx, user);
          const mistakes = user.role === "student" ? await listMistakes(tx, user) : [];
          const sessions =
            user.role === "student"
              ? await tx.query(
                  "select * from learning_sessions where user_id=$1 and status!='completed' order by created_at desc",
                  [user.id],
                )
              : [];
          const daily = user.role === "student" ? await ensureDailyPlan(tx, user) : null;
          return {
            user,
            courses,
            mistakes,
            sessions: sessions.map((s) =>
              s.mode === "challenge" ? { ...s, first_correct: 0 } : s,
            ),
            daily,
            rewards: user.role === "student" ? await rewardSummary(tx, user) : null,
            ai_configured: aiConfigured(),
          };
        }
        if (
          path[0] === "courses" &&
          path[2] === "topics" &&
          path[4] === "preparation" &&
          path.length === 5
        )
          return lessonPreparation(tx, user, z.uuid().parse(path[1]), z.uuid().parse(path[3]));
        if (path[0] === "courses" && path.length === 1) return listCourses(tx, user);
        if (path.join("/") === "courses/archived") return archivedCourses(tx, user);
        if (path[0] === "rewards" && path.length === 1) return rewardView(tx, user);
        if (path[0] === "challenges" && path.length === 1) return listChallenges(tx, user);
        if (path.join("/") === "matches/status")
          return {
            queue:
              (
                await tx.query(
                  "select course_id,mode,expires_at from match_queue where user_id=$1 and expires_at>clock_timestamp()",
                  [user.id],
                )
              )[0] || null,
          };
        if (path[0] === "league" && path.length === 1) return leagueView(tx, user);
        if (path[0] === "students" && path.length === 3 && path[2] === "profile")
          return publicStudentProfile(tx, user, path[1]);
        if (path[0] === "history" && path.length === 1)
          return learningHistory(tx, user, new URL(request.url).searchParams);
        if (
          path[0] === "courses" &&
          path[2] === "students" &&
          path[4] === "analytics" &&
          path.length === 5
        )
          return studentAnalytics(tx, user, z.uuid().parse(path[1]), z.uuid().parse(path[3]));
        if (path[0] === "courses" && path.length === 3) {
          const id = z.uuid().parse(path[1]);
          if (path[2] === "objectives") return listObjectives(tx, user, id);
          if (path[2] === "activities") return listActivities(tx, user, id);
          if (path[2] === "analytics") return courseAnalytics(tx, user, id);
          if (path[2] === "gradebook") return courseGradebook(tx, user, id);
          if (path[2] === "ranking")
            return classRanking(tx, user, id, new URL(request.url).searchParams);
          if (path[2] === "challenge-roster") return challengeRoster(tx, user, id);
          if (path[2] === "documents") return listDocuments(tx, user, id);
          if (path[2] === "web-sources") return webSources(tx, user, id);
          if (path[2] === "content") {
            if (!process.env.DATABASE_URL) after(() => drainJobs(db));
            return contentStatus(tx, user, id);
          }
          if (path[2] === "assignments") return listAssignments(tx, user, id);
          if (path[2] === "assignment-options") {
            await ownCourse(tx, user, id);
            return {
              activities: await tx.query(
                "select v.id,v.title,v.kind from activities a join activity_versions v on v.activity_id=a.id and v.version=a.published_version where a.course_id=$1 and a.status!='archived' order by v.title",
                [id],
              ),
              students: await tx.query(
                "select p.id,p.display_name from enrollments e join profiles p on p.id=e.user_id where e.course_id=$1 order by p.display_name",
                [id],
              ),
              files: await tx.query(
                "select f.id,f.original_name from files f join documents d on d.file_id=f.id where f.course_id=$1 and d.status='ready' and d.source_kind='pdf' and d.superseded_by is null",
                [id],
              ),
            };
          }
        }
        if (path[0] === "courses" && path[2] === "assignments" && path.length === 4)
          return assignmentDetail(tx, user, z.uuid().parse(path[1]), z.uuid().parse(path[3]));
        if (path[0] === "courses" && path[2] === "documents" && path.length === 4)
          return documentDetail(tx, user, z.uuid().parse(path[1]), z.uuid().parse(path[3]));
        if (path[0] === "courses" && path[2] === "gaps" && path.length === 4)
          return gapDetail(tx, user, z.uuid().parse(path[1]), z.uuid().parse(path[3]));
        if (path[0] === "sessions" && path.length === 2)
          return sessionView(tx, user, z.uuid().parse(path[1]));
        if (path[0] === "mistakes")
          return listMistakes(
            tx,
            user,
            new URL(request.url).searchParams.get("course") || undefined,
          );
        if (path[0] === "daily") return ensureDailyPlan(tx, user);
        throw new AppError(404, "İşlem bulunamadı.");
      }),
    );
  } catch (err) {
    return apiError(err);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { path } = await context.params,
      route = path.join("/");
    const data = await readJson(request);
    if (route === "auth/login") return json(await login(data));
    if (route === "auth/signup") return json(await signup(data));
    if (route === "auth/password") return json(await changePassword(data));
    if (route === "auth/logout-others") return json(await logoutOthers());
    if (route === "auth/forgot-password") return json(await requestPasswordReset(data));
    if (route === "auth/reset-password") return json(await resetPassword(data));
    if (route === "auth/logout") {
      await logout();
      return json({ success: true });
    }
    const user = await requireUser(),
      db = await getDb();
    return json(
      await asUser(db, user.id, async (tx) => {
        if (route === "courses") return createCourse(tx, user, data);
        if (route === "rewards/purchase") return purchase(tx, user, data);
        if (route === "rewards/equip") return equip(tx, user, data);
        if (route === "rewards/protect") return protectDay(tx, user, data);
        if (route === "rewards/chest") return claimChest(tx, user, data);
        if (route === "challenges") return createChallenge(tx, user, data);
        if (route === "matches/find") return findMatch(tx, user, data);
        if (route === "matches/cancel") return cancelMatchSearch(tx, user);
        if (route === "league/join") return joinLeague(tx, user, data);
        if (route === "league/leave") return leaveLeague(tx, user);
        if (path[0] === "challenges" && path.length === 3 && path[2] === "respond")
          return respondChallenge(tx, user, z.uuid().parse(path[1]), data);
        if (path[0] === "challenges" && path.length === 3 && path[2] === "start")
          return startChallenge(tx, user, z.uuid().parse(path[1]));
        if (route === "courses/join") return joinCourse(tx, user, data);
        if (route === "sessions") return startPractice(tx, user, data);
        if (path[0] === "daily" && path[2] === "start" && path.length === 3)
          return startPlanItem(tx, user, z.uuid().parse(path[1]));
        if (path[0] === "sessions" && path[2] === "pause" && path.length === 3)
          return pauseSession(tx, user, z.uuid().parse(path[1]));
        if (route === "mistakes/start")
          return startMistakes(
            tx,
            user,
            z.object({ course_id: z.uuid().optional() }).parse(data).course_id,
          );
        if (route === "profile") {
          const profile = z
            .object({
              display_name: z.string().trim().min(2).max(80),
              university: z.string().max(150),
              public_profile: z.boolean(),
            })
            .parse(data);
          if (!profile.public_profile && user.role === "student") await leaveLeague(tx, user);
          return (
            await tx.query(
              "update profiles set display_name=$2,university=$3,public_profile=$4 where id=$1 returning *",
              [user.id, profile.display_name, profile.university, profile.public_profile],
            )
          )[0];
        }
        if (route === "gaps") return changeGap(tx, user, data, "report");
        if (route === "gaps/resolve") return changeGap(tx, user, data, "resolve");
        if (path[0] === "sessions" && path[2] === "answers" && path.length === 3)
          return submitAnswer(tx, user, z.uuid().parse(path[1]), data);
        if (path[0] === "courses" && path.length >= 3) {
          const id = z.uuid().parse(path[1]);
          if (
            path[2] === "students" &&
            path[4] === "gaps" &&
            path[6] === "resolve" &&
            path.length === 7
          )
            return changeGap(
              tx,
              user,
              {
                ...z.record(z.string(), z.unknown()).parse(data),
                course_id: id,
                objective_id: z.uuid().parse(path[5]),
              },
              "resolve",
              z.uuid().parse(path[3]),
            );
          if (path[2] === "jobs" && path[4] === "retry" && path.length === 5) {
            const result = await retryContentJob(tx, user, id, z.uuid().parse(path[3]));
            if (!process.env.DATABASE_URL) after(() => drainJobs(db));
            return result;
          }
          if (path[2] === "settings" && path.length === 3) return updateCourse(tx, user, id, data);
          if (path[2] === "publication" && path.length === 3)
            return updatePublicationPolicy(tx, user, id, data);
          if (path[2] === "restore" && path.length === 3) return archiveCourse(tx, user, id, false);
          if (path[2] === "assignments") {
            if (path.length === 3) return saveAssignment(tx, user, id, data);
            if (path.length === 5) {
              const assignmentId = z.uuid().parse(path[3]);
              if (path[4] === "edit") return saveAssignment(tx, user, id, data, assignmentId);
              if (path[4] === "publish") return publishAssignment(tx, user, id, assignmentId);
              if (path[4] === "manage") return manageAssignment(tx, user, id, assignmentId, data);
              // Detail verifies the course route and target authorization before any student action.
              await assignmentDetail(tx, user, id, assignmentId);
              if (path[4] === "start") return startAssignment(tx, user, assignmentId);
              if (path[4] === "submit") return submitTraditional(tx, user, assignmentId, data);
              if (path[4] === "withdraw") return withdrawSubmission(tx, user, assignmentId);
            }
          }
          if (path[2] === "submissions" && path[4] === "review" && path.length === 5)
            return reviewSubmission(tx, user, id, z.uuid().parse(path[3]), data);
          if (path[2] === "curriculum" && path[3] === "revise" && path.length === 4)
            return reviseCurriculum(tx, user, id, data);
          if (path[2] === "ai" && path.length === 4) {
            if (!process.env.DATABASE_URL) after(() => drainJobs(db));
            if (path[3] === "analyze") return queueAI(tx, user, id, data, "ai_analyze");
            if (path[3] === "generate") return queueAI(tx, user, id, data, "ai_generate");
            if (path[3] === "clarify") return answerClarification(tx, user, id, data);
            if (path[3] === "approve-curriculum") return approveCurriculum(tx, user, id, data);
          }
          if (path[2] === "source-policy" && path.length === 3)
            return setSourcePolicy(tx, user, id, data);
          if (path[2] === "web-sources") {
            if (path.length === 3) {
              const result = await addWebSource(tx, user, id, data);
              if (!process.env.DATABASE_URL) after(() => drainJobs(db));
              return result;
            }
            if (path.length === 5) {
              const permissionId = z.uuid().parse(path[3]);
              if (path[4] === "permission")
                return setWebPermission(tx, user, id, permissionId, data);
              if (path[4] === "fetch") {
                const result = await queueWebFetch(tx, user, id, permissionId);
                if (!process.env.DATABASE_URL) after(() => drainJobs(db));
                return result;
              }
            }
          }
          if (path[2] === "documents" && path.length === 5) {
            const documentId = z.uuid().parse(path[3]);
            if (path[4] === "reprocess") {
              if (!process.env.DATABASE_URL) after(() => drainJobs(db));
              return reprocessDocument(tx, user, id, documentId);
            }
            if (path[4] === "access") return setDocumentAccess(tx, user, id, documentId, data);
            if (path[4] === "delete") {
              return deleteDocument(tx, user, id, documentId);
            }
          }
          if (path[2] === "objectives" && path.length === 3)
            return createObjective(tx, user, id, data);
          if (path[2] === "activities" && path.length === 3)
            return saveActivity(tx, user, id, data);
          if (path[2] === "activities" && path.length === 5) {
            const activityId = z.uuid().parse(path[3]);
            if (path[4] === "publish") return publishActivity(tx, user, id, activityId);
            if (path[4] === "edit") return saveActivity(tx, user, id, data, activityId);
            if (path[4] === "archive") {
              await ownCourse(tx, user, id);
              await tx.query(
                "update activities set status='archived' where id=$1 and course_id=$2",
                [activityId, id],
              );
              await tx.query("select invalidate_course_plans($1)", [id]);
              return { archived: true };
            }
          }
          if (path[2] === "invite")
            return rotateInvite(
              tx,
              user,
              id,
              z.object({ revoke: z.boolean().default(false) }).parse(data).revoke,
            );
          if (path[2] === "archive") {
            return archiveCourse(tx, user, id, true);
          }
          if (path[2] === "remove-student")
            return removeStudent(tx, user, id, z.object({ user_id: z.uuid() }).parse(data).user_id);
        }
        throw new AppError(404, "İşlem bulunamadı.");
      }),
    );
  } catch (err) {
    return apiError(err);
  }
}
