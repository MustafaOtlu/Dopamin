"use client";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/client";
import type { Bootstrap } from "@/types/bootstrap";
import { Brand, ErrorBanner, Spinner } from "./ui";
export type { Bootstrap } from "@/types/bootstrap";

type DashboardModule =
  | { role: "student"; Component: ComponentType<{ data: Bootstrap; updated: () => Promise<void> }> }
  | { role: "teacher"; Component: ComponentType<{ initialData: Bootstrap }> };

export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<DashboardModule | null>(null);
  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setError(errorMessage(error));
    },
    [router],
  );
  const load = useCallback(async () => {
    try {
      setData(await api<Bootstrap>("bootstrap"));
    } catch (error) {
      fail(error);
    }
  }, [fail]);
  useEffect(() => {
    let active = true;
    api<Bootstrap>("bootstrap")
      .then(async (value) => {
        const module: DashboardModule =
          value.user.role === "student"
            ? { role: "student", Component: (await import("./student-dashboard")).StudentDashboard }
            : {
                role: "teacher",
                Component: (await import("./teacher-dashboard")).TeacherDashboard,
              };
        if (active) {
          setScreen(module);
          setData(value);
        }
      })
      .catch((error) => {
        if (active) fail(error);
      });
    return () => {
      active = false;
    };
  }, [fail]);
  if (!data || !screen)
    return (
      <main className="initial-loading">
        <Brand />
        <ErrorBanner message={error} />
        {!error && <Spinner />}
      </main>
    );
  return screen.role === "student" ? (
    <screen.Component data={data} updated={load} />
  ) : (
    <screen.Component initialData={data} />
  );
}
