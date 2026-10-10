import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";
import { requireTeacher } from "@/modules/auth/service";
import { ownCourse } from "@/modules/courses/service";

export interface WorkspaceCourse {
  id: string;
  title: string;
  code: string;
  term: string;
  students: number;
  published: number;
  review: number;
  grading: number;
  support: number;
}
export interface WorkspaceItem {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  detail: string;
  kind: "grading" | "content" | "support";
  created_at: string;
}
export interface TeacherWorkspace {
  courses: WorkspaceCourse[];
  queue: WorkspaceItem[];
  deadlines: {
    id: string;
    course_id: string;
    course_title: string;
    title: string;
    due_at: string;
    targets: number;
    submitted: number;
  }[];
}
export async function teacherWorkspace(tx: Database, user: User): Promise<TeacherWorkspace> {
  requireTeacher(user);
  const courses = await tx.query<WorkspaceCourse>(
    `select c.id,c.title,c.code,c.term,
    (select count(*)::int from enrollments e where e.course_id=c.id) students,
    (select count(*)::int from activities a where a.course_id=c.id and a.published_version is not null and a.status!='archived') published,
    (select count(*)::int from activities a where a.course_id=c.id and a.status='needs_review') review,
    (select count(*)::int from submissions s where s.course_id=c.id and s.status='submitted') grading,
    (select count(*)::int from gap_reports g join enrollments e on e.user_id=g.user_id and e.course_id=g.course_id where g.course_id=c.id and not g.resolved) support
    from courses c where c.owner_id=$1 and not c.archived order by c.title`,
    [user.id],
  );
  const queue = await tx.query<WorkspaceItem>(
    `select * from (
    (select a.id,c.id course_id,c.title course_title,a.title,p.display_name detail,'grading' kind,s.submitted_at created_at
      from submissions s join assignments a on a.id=s.assignment_id join courses c on c.id=s.course_id join profiles p on p.id=s.user_id
      where c.owner_id=$1 and not c.archived and s.status='submitted' order by s.submitted_at,s.id limit 40)
    union all
    (select a.id,c.id course_id,c.title course_title,v.title,'İçerik incelemesi' detail,'content' kind,v.created_at
      from activities a join courses c on c.id=a.course_id join activity_versions v on v.activity_id=a.id and v.version=a.current_version
      where c.owner_id=$1 and not c.archived and a.status='needs_review' order by v.created_at,a.id limit 40)
    union all
    (select g.user_id id,c.id course_id,c.title course_title,o.title,p.display_name detail,'support' kind,g.created_at
      from gap_reports g join courses c on c.id=g.course_id join objectives o on o.id=g.objective_id join profiles p on p.id=g.user_id
      join enrollments e on e.user_id=g.user_id and e.course_id=g.course_id
      where c.owner_id=$1 and not c.archived and not g.resolved order by g.created_at,o.id limit 40)
    ) items order by created_at,id`,
    [user.id],
  );
  const deadlines = await tx.query<TeacherWorkspace["deadlines"][number]>(
    `select a.id,a.course_id,c.title course_title,a.title,a.due_at,
    (select count(*)::int from assignment_targets t where t.assignment_id=a.id) targets,
    (select count(*)::int from submissions s where s.assignment_id=a.id and s.status in ('submitted','reviewed','returned')) submitted
    from assignments a join courses c on c.id=a.course_id where c.owner_id=$1 and not c.archived and a.status='published'
    and a.due_at>=now() and a.due_at<now()+interval '14 days' order by a.due_at,a.id limit 8`,
    [user.id],
  );
  return { courses, queue, deadlines };
}

export interface GradebookRow {
  assignment_id: string;
  assignment_title: string;
  user_id: string;
  display_name: string;
  email: string;
  due_at: string;
  status: string;
  submitted_at: string | null;
  late: boolean | null;
  grade: number | null;
  feedback: string | null;
  revision: number | null;
}
export async function courseGradebook(tx: Database, user: User, courseId: string) {
  await ownCourse(tx, user, courseId);
  return tx.query<GradebookRow>(
    `select a.id assignment_id,a.title assignment_title,p.id user_id,p.display_name,p.email,a.due_at,
    case when s.status in ('submitted','reviewed','returned') then s.status
      when a.due_at<now() then 'missing' else coalesce(s.status,'not_started') end status,
    v.submitted_at,v.late,f.grade::float8,f.feedback,s.current_revision revision
    from assignments a join assignment_targets t on t.assignment_id=a.id join profiles p on p.id=t.user_id
    join enrollments e on e.user_id=t.user_id and e.course_id=a.course_id
    left join submissions s on s.assignment_id=a.id and s.user_id=t.user_id
    left join submission_versions v on v.submission_id=s.id and v.revision=s.current_revision and s.status in ('submitted','reviewed','returned')
    left join assignment_feedback f on f.submission_id=s.id and f.revision=s.current_revision and s.status in ('submitted','reviewed','returned')
    where a.course_id=$1 and a.status in ('published','closed') order by a.due_at desc,a.id,p.display_name,p.id`,
    [courseId],
  );
}
