"use client";
import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";

export function SortableSteps({
  items,
  value,
  onChange,
  disabled,
}: {
  items: { id: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const original = useRef<string[]>([]);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function move(id: string, target: number) {
    const from = value.indexOf(id);
    if (from === target || target < 0 || target >= value.length) return;
    const next = [...value];
    next.splice(from, 1);
    next.splice(target, 0, id);
    onChange(next);
    setAnnouncement(
      (items.find((item) => item.id === id)?.label || "Adım") + ", " + (target + 1) + ". sırada.",
    );
  }
  return (
    <>
      <span className="sr-only" id="sort-help">
        Adımı sürükleyip bırak. Klavyede boşlukla tut, oklarla taşı, tekrar boşlukla bırak. Escape
        değişikliği geri alır.
      </span>
      <ol className="ordering-list sortable-steps" ref={list}>
        {value.map((id, index) => (
          <li key={id} data-step-id={id} className={grabbed === id ? "is-dragging" : ""}>
            <button
              type="button"
              disabled={disabled}
              aria-describedby="sort-help"
              aria-label={
                (items.find((item) => item.id === id)?.label || "Adım") +
                ", " +
                (index + 1) +
                ". sıra"
              }
              aria-pressed={grabbed === id}
              onPointerDown={(event) => {
                if (event.button !== 0 || disabled) return;
                original.current = [...value];
                setGrabbed(id);
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (grabbed !== id || !event.currentTarget.hasPointerCapture(event.pointerId))
                  return;
                const rows = Array.from(list.current?.children || []);
                let target = index,
                  distance = Infinity;
                rows.forEach((row, position) => {
                  const box = row.getBoundingClientRect();
                  const gap = Math.abs(event.clientY - box.top - box.height / 2);
                  if (gap < distance) {
                    distance = gap;
                    target = position;
                  }
                });
                move(id, target);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                setGrabbed(null);
              }}
              onPointerCancel={() => {
                if (grabbed) onChange(original.current);
                setGrabbed(null);
              }}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  if (grabbed === id) setGrabbed(null);
                  else {
                    original.current = [...value];
                    setGrabbed(id);
                  }
                } else if (grabbed === id && ["ArrowUp", "ArrowDown"].includes(event.key)) {
                  event.preventDefault();
                  move(id, index + (event.key === "ArrowUp" ? -1 : 1));
                } else if (event.key === "Escape" && grabbed) {
                  event.preventDefault();
                  onChange(original.current);
                  setGrabbed(null);
                }
              }}
            >
              <span className="order-number">{index + 1}</span>
              <span>{items.find((item) => item.id === id)?.label}</span>
              <GripVertical size={20} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
