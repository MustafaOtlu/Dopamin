"use client";
import { useState, type CSSProperties } from "react";

type Item = { id: string; label: string };
export function TileMatching({
  left,
  right,
  value,
  onChange,
  disabled,
}: {
  left: Item[];
  right: Item[];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<{ side: "left" | "right"; id: string } | null>(null);
  const [rightOrder] = useState(() =>
    [...right].sort((a, b) => a.id.localeCompare(b.id)).reverse(),
  );
  function choose(side: "left" | "right", id: string) {
    if (disabled) return;
    if (selected?.side === side && selected.id === id) {
      setSelected(null);
      return;
    }
    if (!selected || selected.side === side) {
      setSelected({ side, id });
      return;
    }
    const l = side === "left" ? id : selected.id;
    const r = side === "right" ? id : selected.id;
    const next = Object.fromEntries(
      Object.entries(value).filter(([key, val]) => key !== l && val !== r),
    );
    onChange({ ...next, [l]: r });
    setSelected(null);
  }
  return (
    <div className="tile-matching" aria-label="Eşleştirme kartları">
      {(
        [
          ["left", left],
          ["right", rightOrder],
        ] as const
      ).map(([side, items]) => (
        <div className="match-column" key={side}>
          {items.map((item) => {
            const pairId =
              side === "left"
                ? value[item.id]
                  ? item.id
                  : null
                : Object.keys(value).find((key) => value[key] === item.id);
            const pair = left.findIndex((i) => i.id === pairId);
            const active = selected?.side === side && selected.id === item.id;
            return (
              <button
                type="button"
                key={item.id}
                disabled={disabled}
                className={
                  "match-tile" + (pairId ? " is-paired" : "") + (active ? " is-selected" : "")
                }
                style={{ "--pair-hue": (pair * 73 + 180) % 360 } as CSSProperties}
                aria-pressed={active}
                aria-label={
                  item.label + (pairId ? ", " + (pair + 1) + ". çift. Değiştirmek için seç." : "")
                }
                onClick={() => choose(side, item.id)}
              >
                {pairId && (
                  <span className="pair-marker" aria-hidden="true">
                    {pair + 1}
                  </span>
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
      <span className="sr-only" role="status">
        {Object.keys(value).length} / {left.length} çift eşleşti.
      </span>
    </div>
  );
}
