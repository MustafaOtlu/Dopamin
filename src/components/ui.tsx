"use client";
import { X, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Penguin } from "./penguin";

export function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:enabled, a[href], input:enabled, select:enabled, textarea:enabled, summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
  const first = controls[0],
    last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <span className="brand-icon">
        <Penguin />
      </span>
      <span>
        dopamin<span className="brand-period">.</span>
      </span>
    </span>
  );
}
export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={26} />
      <span>Yükleniyor…</span>
    </div>
  );
}
export function ErrorBanner({ message }: { message: string }) {
  return message ? (
    <div className="error-banner" role="alert">
      {message}
    </div>
  ) : null;
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">
        <Penguin mood="think" />
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onKeyDown={trapFocus}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Kapat" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
