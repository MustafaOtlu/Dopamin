"use client";
import { useState } from "react";
import { Camera } from "lucide-react";
import { AvatarArt } from "./avatar-art";
import { errorMessage } from "@/lib/client";
export function ProfilePhoto({
  url,
  name = "Profil fotoğrafı",
}: {
  url?: string | null;
  name?: string;
}) {
  // Session-protected images must bypass the public Next image optimizer.
  return url ? (
    <img className="dp-profile-photo" src={url} alt={name} width={512} height={512} />
  ) : (
    <AvatarArt value="penguin" />
  );
}
export function PhotoUpload({ updated }: { updated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="dp-photo-upload">
      <label className={"button secondary photo-picker" + (busy ? " is-busy" : "")}>
        <Camera size={17} /> {busy ? "Yükleniyor…" : "Fotoğrafını yükle"}
        <input
          type="file"
          accept="image/png,image/jpeg"
          aria-label="Profil fotoğrafı yükle"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setMessage("");
            try {
              const body = new FormData();
              body.set("file", file);
              const response = await fetch("/api/profile/photo", { method: "POST", body });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || "Fotoğraf yüklenemedi.");
              await updated();
              setMessage("Fotoğrafın güncellendi.");
            } catch (error) {
              setMessage(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <small>PNG veya JPEG · En fazla 5 MB</small>
      {message && <span role="status">{message}</span>}
    </div>
  );
}
