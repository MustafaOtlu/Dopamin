"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Sparkles, Layers, GraduationCap } from "lucide-react";
import { Brand, Field, ErrorBanner } from "./ui";
import { api, errorMessage } from "@/lib/client";
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState("student"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const result = await api<{ confirmation_required?: boolean }>(
        `auth/${register ? "signup" : "login"}`,
        { ...values, role },
      );
      if (result.confirmation_required) setConfirmed(true);
      else {
        router.push("/app");
        router.refresh();
      }
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
          <span className="eyebrow">HER GÜN BİR ADIM İLERİ</span>
          <h1>
            Öğrenmek,
            <br />
            bir yolculuk.
          </h1>
          <p>
            Derslerini keşfet, bilgini pekiştir.
            <br />
            Merakının peşinden git.
          </p>
          <div className="auth-path">
            <span>
              <BookOpen size={30} />
            </span>
            <i />
            <span>
              <Layers size={30} />
            </span>
            <i />
            <span>
              <Sparkles size={30} />
            </span>
          </div>
          <div className="auth-note">
            <GraduationCap size={24} />
            <span>
              Üniversite hayatına eşlik eden
              <br />
              kişisel öğrenme alanın.
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
          <span className="eyebrow">ÖĞRENME ALANIN</span>
          <h2>{register ? "Yolculuğa katıl." : "Tekrar hoş geldin."}</h2>
          <p className="muted">
            {register ? "Hesabını oluştur, ilk adımını at." : "Kaldığın yerden devam edelim."}
          </p>
          {confirmed ? (
            <div className="notice">
              Hesabını doğrulamak için e-posta kutunu kontrol et.{" "}
              <Link href="/login">Girişe dön</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <ErrorBanner message={error} />
              {register && (
                <>
                  <div className="role-picker">
                    <button
                      type="button"
                      aria-pressed={role === "student"}
                      className={role === "student" ? "selected" : ""}
                      onClick={() => setRole("student")}
                    >
                      Öğrenciyim
                    </button>
                    <button
                      type="button"
                      aria-pressed={role === "teacher"}
                      className={role === "teacher" ? "selected" : ""}
                      onClick={() => setRole("teacher")}
                    >
                      Akademisyenim
                    </button>
                  </div>
                  <Field label="Adın ve soyadın">
                    <input
                      name="display_name"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      placeholder="Ad Soyad"
                    />
                  </Field>
                </>
              )}
              <Field label="E-posta adresi">
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="sen@universite.edu.tr"
                />
              </Field>
              <Field label="Şifre">
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder="En az 8 karakter"
                />
              </Field>
              {register && role === "teacher" && (
                <>
                  <Field label="Akademisyen davet kodu (varsa)">
                    <input name="invite_code" autoComplete="off" />
                  </Field>
                  <p className="field-help">
                    Akademisyen yetkileri hesabın doğrulandıktan sonra açılır.
                  </p>
                </>
              )}
              <button className="button primary full-width" disabled={busy}>
                {busy ? "Biraz bekle…" : register ? "Hesabımı oluştur" : "Giriş yap"}
              </button>
              {!register && (
                <p className="auth-switch">
                  <Link href="/forgot-password">Şifremi unuttum</Link>
                </p>
              )}
            </form>
          )}
          <p className="auth-switch">
            {register ? "Zaten hesabın var mı?" : "İlk kez mi buradasın?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Giriş yap" : "Hesap oluştur"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
