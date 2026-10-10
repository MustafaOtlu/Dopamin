"use client";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, Plus } from "lucide-react";

export function CoursePicker({
  courses,
  value,
  onChange,
  onJoin,
}: {
  courses: { id: string; title: string; code?: string | null }[];
  value: string;
  onChange: (id: string) => void;
  onJoin: () => void;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const pick = (index: number) => {
    if (courses[index]) onChange(courses[index].id);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="dp-course-controls"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className="dp-course-select">
        <button
          type="button"
          className="dp-course-trigger"
          ref={trigger}
          role="combobox"
          aria-label="Ders seç"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-haspopup="listbox"
          aria-activedescendant={open && courses.length ? `${id}-${active}` : undefined}
          onClick={() => {
            setActive(
              Math.max(
                0,
                courses.findIndex((c) => c.id === value),
              ),
            );
            setOpen(!open);
          }}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Enter", " "].includes(e.key)) {
              e.preventDefault();
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "Enter" || e.key === " ") {
                if (open) pick(active);
                else {
                  setActive(
                    Math.max(
                      0,
                      courses.findIndex((c) => c.id === value),
                    ),
                  );
                  setOpen(true);
                }
              } else {
                setOpen(true);
                setActive((i) =>
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? courses.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            courses.length - 1,
                            (open ? i : courses.findIndex((c) => c.id === value)) +
                              (e.key === "ArrowDown" ? 1 : -1),
                          ),
                        ),
                );
              }
            }
          }}
        >
          <BookOpen size={21} />
          <span>
            <small>DERSİN</small>
            <strong>{courses.find((c) => c.id === value)?.title || "Ders seç"}</strong>
          </span>
          <ChevronDown size={18} />
        </button>
        {open && (
          <div className="dp-course-menu" id={id} role="listbox" aria-label="Derslerin">
            {courses.length ? (
              courses.map((c, i) => (
                <div
                  key={c.id}
                  id={`${id}-${i}`}
                  role="option"
                  tabIndex={-1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(i);
                    }
                  }}
                  aria-selected={c.id === value}
                  className={active === i ? "highlighted" : ""}
                  onPointerMove={() => setActive(i)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                >
                  <span className="dp-course-monogram">
                    {c.code?.slice(0, 3) || c.title.slice(0, 2).toLocaleUpperCase("tr")}
                  </span>
                  <span>
                    <strong>{c.title}</strong>
                    <small>{c.code || "Katıldığın ders"}</small>
                  </span>
                  {c.id === value && <Check size={18} />}
                </div>
              ))
            ) : (
              <p>Henüz bir derse katılmadın.</p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="dp-add-course"
        aria-label="Sınıfa katıl"
        title="Ders ekle / sınıfa katıl"
        onClick={onJoin}
      >
        <Plus size={20} />
        <span>Ders ekle</span>
      </button>
    </div>
  );
}
