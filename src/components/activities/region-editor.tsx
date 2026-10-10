"use client";
import { useState } from "react";
import type { ActivityInput } from "@/modules/activities/schema";
import { Field, ErrorBanner } from "../ui";
import { errorMessage } from "@/lib/client";
type RegionActivity = Extract<ActivityInput, { kind: "region" }>;
export function RegionEditor({
  courseId,
  existing,
}: {
  courseId: string;
  existing?: RegionActivity;
}) {
  const [image, setImage] = useState(existing?.content.image_url || ""),
    [alt, setAlt] = useState(existing?.content.alt || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [regions, setRegions] = useState(() =>
    existing
      ? existing.content.regions.map((r) => ({ ...r, ...existing.answer_key.regions[r.id] }))
      : [{ id: "r0", label: "", x: 0.25, y: 0.25, width: 0.25, height: 0.25 }],
  );
  const value = {
    content: { image_url: image, alt, regions: regions.map(({ id, label }) => ({ id, label })) },
    answer_key: {
      regions: Object.fromEntries(
        regions.map(({ id, x, y, width, height }) => [id, { x, y, width, height }]),
      ),
    },
  };
  return (
    <section className="region-editor">
      <input type="hidden" name="items" value={JSON.stringify(value)} />
      <ErrorBanner message={error} />
      <Field label="Ders görseli (PNG veya JPEG)">
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const form = new FormData();
              form.set("course_id", courseId);
              form.set("purpose", "image");
              form.set("file", file);
              const response = await fetch("/api/uploads", { method: "POST", body: form });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setImage(result.url);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      <Field label="Görsel açıklaması">
        <input
          required
          value={alt}
          maxLength={1000}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Görselde ne gösteriliyor?"
        />
      </Field>
      {image && (
        <div className="region-image region-edit-preview">
          <img src={image} alt={alt || "Yüklenen ders görseli"} />
          {regions.map((r, i) => (
            <span
              key={r.id}
              className="region-target-box"
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.width * 100}%`,
                height: `${r.height * 100}%`,
              }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      )}
      <p className="muted">
        Doğru bölgeleri görseli inceleyerek sen belirle. Konum ve boyutlar görselin yüzdesidir.
      </p>
      {regions.map((r, index) => (
        <fieldset key={r.id} className="region-editor-target">
          <legend>{index + 1}. hedef bölge</legend>
          <Field label="Öğrencinin bulacağı yapı">
            <input
              value={r.label}
              required
              maxLength={500}
              onChange={(e) =>
                setRegions(
                  regions.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)),
                )
              }
            />
          </Field>
          <div className="region-box-fields">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <Field
                key={key}
                label={
                  key === "x"
                    ? "Soldan (%)"
                    : key === "y"
                      ? "Üstten (%)"
                      : key === "width"
                        ? "Genişlik (%)"
                        : "Yükseklik (%)"
                }
              >
                <input
                  type="number"
                  required
                  min={key === "width" || key === "height" ? 1 : 0}
                  max="100"
                  step="0.1"
                  value={Math.round(r[key] * 1000) / 10}
                  onChange={(e) =>
                    setRegions(
                      regions.map((r, i) =>
                        i === index ? { ...r, [key]: Number(e.target.value) / 100 } : r,
                      ),
                    )
                  }
                />
              </Field>
            ))}
          </div>
          {regions.length > 1 && (
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => setRegions(regions.filter((_, i) => i !== index))}
            >
              Bölgeyi kaldır
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={regions.length >= 12}
        onClick={() =>
          setRegions([
            ...regions,
            { id: crypto.randomUUID(), label: "", x: 0, y: 0, width: 0.2, height: 0.2 },
          ])
        }
      >
        Hedef bölge ekle
      </button>
    </section>
  );
}
