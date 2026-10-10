"use client";
import { useState } from "react";
import { Globe, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import type { SourcePolicy, WebPermission } from "@/modules/documents/web-sources";
import { ErrorBanner, Field, Modal, Pill } from "./ui";
export type WebSourceState = SourcePolicy & { permissions: WebPermission[] };

export function WebSourceSettings({
  courseId,
  value,
  changed,
}: {
  courseId: string;
  value: WebSourceState;
  changed: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await changed();
      setNotice(message);
    } catch (err) {
      setError(errorMessage(err));
      await changed().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const enabled = value.source_mode === "approved_web";
  return (
    <section className="web-source-settings" aria-label="Kaynak izinleri">
      <div className="section-heading">
        <div>
          <h3>
            <ShieldCheck size={19} /> Kaynak izinleri
          </h3>
          <p className="muted">İçerik üretiminde hangi kaynakların kullanılacağını sen belirle.</p>
        </div>
        <Pill tone={enabled ? "violet" : "neutral"}>
          {enabled ? "İzinli adresler açık" : "Yalnız belgeler"}
        </Pill>
      </div>
      <ErrorBanner message={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <Field label="Kaynak kapsamı">
        <select
          aria-label="Kaynak kapsamı"
          value={value.source_mode}
          disabled={busy}
          onChange={(event) =>
            void act(
              () =>
                api(`courses/${courseId}/source-policy`, {
                  mode: event.target.value,
                  expected_revision: value.source_policy_revision,
                }),
              "Kaynak tercihin kaydedildi. Web kaynaklarını kullanmak için güncel izinle yeniden oku.",
            )
          }
        >
          <option value="documents_only">Yalnız yüklediğim belgeler</option>
          <option value="approved_web">Belgeler ve izinli web adresleri</option>
        </select>
      </Field>
      <p className="field-help">
        Yalnız eklediğin sayfa okunur. Diğer bağlantılar taranmaz. İzni kapatmak yeni üretimi ve
        öğrenci erişimini durdurur; yayımlanmış soruların geçmişi korunur.
      </p>
      {value.permissions.length > 0 && (
        <div className="web-permission-list">
          {value.permissions.map((permission) => (
            <article key={permission.id}>
              <Globe size={21} />
              <div className="web-permission-main">
                <h4>{permission.title}</h4>
                <a href={permission.url} target="_blank" rel="noopener noreferrer">
                  {permission.url}
                </a>
                <p>
                  {!permission.enabled || !enabled
                    ? "İzin kapalı"
                    : permission.allowed
                      ? "Kayıtlı metin kullanıma hazır"
                      : "Güncel izinle okunması bekleniyor"}
                </p>
              </div>
              <div className="web-permission-actions">
                <button
                  className="button small secondary"
                  disabled={busy || !enabled || !permission.enabled}
                  aria-label={`${permission.title} web kaynağını yeniden oku`}
                  onClick={() =>
                    void act(
                      () => api(`courses/${courseId}/web-sources/${permission.id}/fetch`, {}),
                      "Sayfa okuma sırasına alındı. Sonucu işlem merkezinden takip edebilirsin.",
                    )
                  }
                >
                  <RefreshCw size={15} /> Yeniden oku
                </button>
                <button
                  className="text-button"
                  disabled={busy || (!enabled && !permission.enabled)}
                  aria-label={`${permission.title} iznini ${permission.enabled ? "kapat" : "aç"}`}
                  onClick={() =>
                    void act(
                      () =>
                        api(`courses/${courseId}/web-sources/${permission.id}/permission`, {
                          enabled: !permission.enabled,
                          expected_revision: permission.revision,
                        }),
                      permission.enabled
                        ? "Kaynak izni kapatıldı."
                        : "İzin açıldı. Kaynağı yeniden okuyarak güncel metni alabilirsin.",
                    )
                  }
                >
                  {permission.enabled ? "İzni kapat" : "İzni aç"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <button
        className="button secondary"
        disabled={!enabled || busy}
        onClick={() => setAdding(true)}
      >
        <Plus size={17} /> Web adresi ekle
      </button>
      {adding && (
        <Modal title="Web kaynağına izin ver" onClose={() => setAdding(false)}>
          <p className="muted">
            Giriş gerektirmeyen bir ders sayfası veya makalenin tam HTTPS adresini ekle. Sayfanın
            yalnız metni kaydedilir.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void act(async () => {
                await api(`courses/${courseId}/web-sources`, {
                  title: form.get("title"),
                  url: form.get("url"),
                });
                setAdding(false);
              }, "Adresine izin verildi ve okuma sırasına alındı.");
            }}
          >
            <ErrorBanner message={error} />
            <Field label="Kaynak adı">
              <input
                name="title"
                required
                minLength={2}
                maxLength={200}
                placeholder="Örneğin: Algoritmalara giriş"
              />
            </Field>
            <Field label="Tam web adresi">
              <input
                name="url"
                type="url"
                required
                maxLength={2000}
                placeholder="https://..."
                autoComplete="off"
              />
            </Field>
            <p className="field-help">
              Sayfayı dersinde kullanmaya uygun bulduğunu onaylıyorsun. Alan adının tamamına izin
              verilmez.
            </p>
            <button className="button primary full-width" disabled={busy}>
              İzin ver ve metni al
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
