"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, MailCheck } from "lucide-react";
import { Brand, ErrorBanner, Field } from "./ui";
import { api, errorMessage } from "@/lib/client";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false),
    [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    api<{ local: boolean }>("auth/me")
      .then((value) => {
        if (!active) return;
        setLocal(value.local);
        if (new URLSearchParams(window.location.search).get("error") === "callback")
          setError("Doğrulama bağlantısı geçersiz ya da süresi dolmuş. Yeni bir bağlantı iste.");
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    if (reset && values.password !== values.confirm_password) {
      setError("Yeni şifreler birbiriyle eşleşmiyor.");
      return;
    }
    setBusy(true);
    try {
      await api(`auth/${reset ? "reset-password" : "forgot-password"}`, values);
      if (reset) {
        router.replace("/app?page=profile");
        router.refresh();
      } else setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow">YOLCULUĞUNA DEVAM ET</span>
          <h1>
            Öğrenme alanın
            <br />
            seni bekliyor.
          </h1>
          <p>
            Hesabına güvenle dön.
            <br />
            Kaldığın yerden devam et.
          </p>
          <div className="auth-path">
            <span>
              <KeyRound size={30} />
            </span>
            <i />
            <span>
              <MailCheck size={30} />
            </span>
          </div>
        </div>
        <small>Dopamin · Birlikte öğreniyoruz.</small>
      </section>
      <section className="auth-form-panel">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-content">
          <span className="eyebrow">HESAP KURTARMA</span>
          <h2>{reset ? "Yeni şifreni belirle." : "Şifreni mi unuttun?"}</h2>
          <p className="muted">
            {reset
              ? "E-postadaki bağlantıyla hesabın doğrulandıktan sonra yeni şifreni kaydet."
              : "Kayıtlı e-posta adresine bir kurtarma bağlantısı iste."}
          </p>
          <ErrorBanner message={error} />
          {local && (
            <p className="notice">
              Bu yerel önizlemede e-posta ile kurtarma henüz bağlı değil. Örnek hesap şifresi:
              PusulaDemo2026!
            </p>
          )}
          {sent ? (
            <div className="notice" role="status">
              Bu e-posta ile bir hesap varsa kurtarma bağlantısı gönderilir. İsteği başlattığın
              tarayıcıda bağlantıyı aç.
            </div>
          ) : (
            <form onSubmit={submit}>
              {reset ? (
                <>
                  <Field label="Yeni şifre">
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Yeni şifreyi doğrula">
                    <input
                      name="confirm_password"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </Field>
                  <p className="field-help">En az 12 karakter kullan.</p>
                </>
              ) : (
                <Field label="E-posta adresi">
                  <input name="email" type="email" required maxLength={254} autoComplete="email" />
                </Field>
              )}
              <button className="button primary full-width" disabled={busy || local !== false}>
                {busy
                  ? "Biraz bekle…"
                  : reset
                    ? "Yeni şifreyi kaydet"
                    : "Kurtarma bağlantısı gönder"}
              </button>
            </form>
          )}
          <p className="auth-switch">
            <Link href="/login">Girişe dön</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
