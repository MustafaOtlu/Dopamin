"use client";
import { useState } from "react";
import { KeyRound, MonitorOff, ShieldCheck, FileDown } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { ErrorBanner, Field } from "./ui";

export function AccountSecurity() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function change(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      values = Object.fromEntries(new FormData(form));
    setError("");
    setNotice("");
    if (values.password !== values.confirm_password) {
      setError("Yeni şifreler birbiriyle eşleşmiyor.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ others_revoked: boolean }>("auth/password", {
        current_password: values.current_password,
        password: values.password,
      });
      form.reset();
      setNotice(
        result.others_revoked
          ? "Şifren değiştirildi. Diğer cihazlarda yeniden giriş gerekecek."
          : "Şifren değiştirildi. Diğer cihazları kapatmak için aşağıdaki oturum düğmesini kullan.",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-security-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">HESAP GÜVENLİĞİ</span>
          <h2>
            <ShieldCheck size={22} /> Şifre ve oturumlar
          </h2>
        </div>
      </div>
      <ErrorBanner message={error} />
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <form onSubmit={change}>
        <Field label="Mevcut şifre">
          <input
            type="password"
            name="current_password"
            required
            maxLength={128}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Yeni şifre">
          <input
            type="password"
            name="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Yeni şifreyi doğrula">
          <input
            type="password"
            name="confirm_password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <p className="field-help">
          En az 12 karakter kullan. Şifre değişiminden sonra bu cihazda açık kalırsın.
        </p>
        <button className="button primary full-width" disabled={busy}>
          <KeyRound size={17} /> Şifremi değiştir
        </button>
      </form>
      <div className="course-settings-section">
        <h3>Diğer cihazlar</h3>
        <p className="muted">Bu cihazı açık tutup diğer cihazlarda yeniden giriş isteyebilirsin.</p>
        <button
          className="button secondary full-width"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await api("auth/logout-others", {});
              setNotice("Diğer cihazlar mevcut oturum süreleri dolunca yeniden giriş yapacak.");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <MonitorOff size={17} /> Diğer cihazlardan çık
        </button>
      </div>
      <div className="course-settings-section">
        <h3>Verilerin sende</h3>
        <p className="muted">
          Profilini, öğrenme geçmişini, ödev teslimlerini ve ödül kayıtlarını indirebilirsin.
        </p>
        <a className="button secondary full-width" href="/api/account/export">
          <FileDown size={17} /> Verilerimi indir
        </a>
        <p className="field-help">JSON dosyası yalnızca kendi kayıtlarını içerir.</p>
      </div>
    </section>
  );
}
