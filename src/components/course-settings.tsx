"use client";
import { useEffect, useState } from "react";
import { Archive, Copy, RotateCw, Settings2 } from "lucide-react";
import type { Course } from "@/types/domain";
import { api, errorMessage } from "@/lib/client";
import { Empty, ErrorBanner, Field, Modal, Pill } from "./ui";

export function CourseSettings({
  course,
  close,
  updated,
}: {
  course: Course;
  close: () => void;
  updated: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [archiveConfirm, setArchiveConfirm] = useState(false),
    [publishMode, setPublishMode] = useState(course.publish_mode),
    [consent, setConsent] = useState(false);
  async function act(action: () => Promise<unknown>, message: string, finish = false) {
    setError("");
    setBusy(true);
    try {
      await action();
      await updated();
      setNotice(message);
      if (finish) close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Ders ayarları" onClose={close} wide>
      <ErrorBanner message={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          void act(
            () => api(`courses/${course.id}/settings`, values),
            "Ders bilgileri kaydedildi.",
          );
        }}
      >
        <div className="form-grid">
          <Field label="Ders adı">
            <input
              name="title"
              required
              minLength={2}
              maxLength={140}
              defaultValue={course.title}
            />
          </Field>
          <Field label="Ders kodu">
            <input name="code" maxLength={20} defaultValue={course.code} />
          </Field>
          <Field label="Dönem">
            <input name="term" required minLength={2} maxLength={100} defaultValue={course.term} />
          </Field>
          <Field label="Ders rengi">
            <select name="color" defaultValue={course.color}>
              <option value="violet">Mor</option>
              <option value="blue">Mavi</option>
              <option value="orange">Turuncu</option>
              <option value="teal">Turkuaz</option>
            </select>
          </Field>
        </div>
        <Field label="Açıklama">
          <textarea
            name="description"
            rows={2}
            maxLength={2000}
            defaultValue={course.description}
          />
        </Field>
        <div className="form-actions">
          <button className="button primary" disabled={busy}>
            <Settings2 size={16} /> Bilgileri kaydet
          </button>
        </div>
      </form>
      <section className="course-settings-section publication-policy">
        <div className="section-heading">
          <div>
            <h3>AI içeriklerinin yayını</h3>
            <p className="muted">Her ders için yayın biçimini sen seçersin.</p>
          </div>
          <Pill tone={course.publish_mode === "automatic" ? "green" : "violet"}>
            {course.publish_mode === "automatic" ? "Otomatik" : "Hoca onayı"}
          </Pill>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () =>
                api(`courses/${course.id}/publication`, {
                  publish_mode: publishMode,
                  automatic_consent: consent,
                }),
              "Yayın tercihi kaydedildi.",
            );
          }}
        >
          <Field label="Yayın biçimi">
            <select
              aria-label="Yayın biçimi"
              value={publishMode}
              onChange={(e) => {
                setPublishMode(e.target.value as Course["publish_mode"]);
                setConsent(false);
              }}
            >
              <option value="review">Önce ben inceleyeyim</option>
              <option value="automatic">Kontrolden geçenleri otomatik yayımla</option>
            </select>
          </Field>
          <p className="field-help">
            Otomatik yayında kaynak, cevap ve kazanım için ayrı bir AI kontrolü yapılır. Belirsiz
            sorular incelemende kalır. AI kontrolü akademik doğruluk garantisi vermez; inceleme ve
            üretim aynı günlük maliyet bütçesini kullanır.
          </p>
          {publishMode === "automatic" && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              AI kontrolünden geçen soruların öğrencilerime doğrudan açılmasını onaylıyorum.
            </label>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy || (publishMode === "automatic" && !consent)}
            >
              Yayın tercihini kaydet
            </button>
          </div>
        </form>
      </section>
      <section className="course-settings-section">
        <div className="section-heading">
          <div>
            <h3>Sınıf daveti</h3>
            <p className="muted">Kod iptali mevcut öğrencilerin üyeliğini değiştirmez.</p>
          </div>
          <Pill tone={course.invite_code ? "green" : "orange"}>
            {course.invite_code ? "Aktif" : "Kapalı"}
          </Pill>
        </div>
        {course.invite_code && <p className="invite-code-display">{course.invite_code}</p>}
        {course.invite_expires_at && (
          <p className="field-help">
            Son geçerlilik: {new Date(course.invite_expires_at).toLocaleDateString("tr-TR")}
          </p>
        )}
        <div className="form-actions">
          {course.invite_code && (
            <button
              className="button secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(course.invite_code!)
                  .then(() => setNotice("Sınıf kodu kopyalandı."))
                  .catch(() => setError("Kod kopyalanamadı."))
              }
            >
              <Copy size={16} /> Kopyala
            </button>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              act(() => api(`courses/${course.id}/invite`, {}), "Yeni sınıf kodu oluşturuldu.")
            }
          >
            <RotateCw size={16} /> Yeni kod oluştur
          </button>
          {course.invite_code && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act(
                  () => api(`courses/${course.id}/invite`, { revoke: true }),
                  "Sınıf daveti kapatıldı.",
                )
              }
            >
              Kodu iptal et
            </button>
          )}
        </div>
      </section>
      <section className="course-settings-section">
        <h3>Dersi arşivle</h3>
        <p className="muted">
          Ders aktif listelerden kalkar, yeni katılım ve öğrenci çalışmaları kapanır. İçerikler,
          ödevler ve geçmiş sonuçlar korunur. Arşivden geri açabilirsin.
        </p>
        {archiveConfirm ? (
          <div className="form-actions">
            <button className="button secondary" onClick={() => setArchiveConfirm(false)}>
              Vazgeç
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act(() => api(`courses/${course.id}/archive`, {}), "Ders arşivlendi.", true)
              }
            >
              Onayla ve arşivle
            </button>
          </div>
        ) : (
          <button className="button secondary" onClick={() => setArchiveConfirm(true)}>
            <Archive size={16} /> Dersi arşivle
          </button>
        )}
      </section>
    </Modal>
  );
}

export function CourseArchive({
  close,
  updated,
}: {
  close: () => void;
  updated: () => Promise<void>;
}) {
  const [courses, setCourses] = useState<Course[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<Course[]>("courses/archived")
      .then((value) => {
        if (active) setCourses(value);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Modal wide title="Arşivdeki dersler" onClose={close}>
      <ErrorBanner message={error} />
      <p className="muted">
        Geri açılan derslerde eski öğrenciler ve içerikler korunur. Yeni katılım için ders
        ayarlarından yeni sınıf kodu oluştur.
      </p>
      {courses?.length ? (
        <div className="activity-list">
          {courses.map((course) => (
            <article key={course.id} className="activity-row">
              <span className={`activity-row-icon color-${course.color}`}>
                <Archive size={20} />
              </span>
              <div className="activity-row-main">
                <h3>{course.title}</h3>
                <p>
                  {course.code} · {course.term} · {course.student_count} öğrenci
                </p>
              </div>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(`courses/${course.id}/restore`, {});
                    setCourses((old) => old!.filter((c) => c.id !== course.id));
                    await updated();
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Dersi geri aç
              </button>
            </article>
          ))}
        </div>
      ) : (
        courses && <Empty title="Arşivin boş" description="Arşivlediğin dersler burada görünür." />
      )}
    </Modal>
  );
}
