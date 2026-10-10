"use client";
import { useEffect, useState } from "react";
import { Award, Star, Trophy } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { levelProgress } from "@/lib/levels";
import { ErrorBanner, Modal, Spinner } from "./ui";
import { badges, type Wallet } from "./rewards-panel";
import { ProfilePhoto } from "./profile-photo";
import { Penguin } from "./penguin";
interface PublicProfile {
  id: string;
  display_name: string;
  university: string;
  photo_url?: string | null;
  xp: number;
  weekly_xp: number;
  cosmetics: Wallet["cosmetics"];
  achievements: { achievement_id: string; earned_at: string }[];
  league_tier: number | null;
}
export function PublicProfileDialog({ userId, close }: { userId: string; close: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<PublicProfile>(`students/${userId}/profile`)
      .then((v) => {
        if (active) setProfile(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <Modal title="Öğrenci profili" onClose={close}>
      <ErrorBanner message={error} />
      {!profile && !error && <Spinner />}
      {profile && (
        <>
          <section className={`dp-profile-hero dp-banner-${profile.cosmetics.banner || "polar"}`}>
            <span
              className={`dp-avatar dp-profile-avatar dp-frame-${profile.cosmetics.frame || "none"}`}
            >
              <ProfilePhoto url={profile.photo_url} name={profile.display_name} />
            </span>
            <div className="dp-profile-companion">
              <Penguin outfit={profile.cosmetics.outfit || "penguin"} interactive />
            </div>
            <h2 className={`dp-font-${profile.cosmetics.font || "default"}`}>
              {profile.display_name}
            </h2>
            <p>{profile.university}</p>
            <span className="dp-level-pill">Seviye {levelProgress(profile.xp).level}</span>
          </section>
          <div className="dp-profile-stats">
            <div>
              <Star />
              <strong>{profile.xp}</strong>
              <span>Toplam XP</span>
            </div>
            <div>
              <Star />
              <strong>{profile.weekly_xp}</strong>
              <span>Haftalık XP</span>
            </div>
            <div>
              <Trophy />
              <strong>
                {profile.league_tier === null
                  ? "—"
                  : ["Kaşif", "Gezgin", "Usta"][profile.league_tier]}
              </strong>
              <span>Lig</span>
            </div>
          </div>
          <h3>Başarımlar</h3>
          {profile.achievements.length ? (
            profile.achievements.map((a) => (
              <p className="dp-list-row" key={a.achievement_id}>
                <Award />
                {badges.find((b) => b.id === a.achievement_id)?.title || "Başarım"}
              </p>
            ))
          ) : (
            <p className="muted">Yeni bir yolculuk başlıyor.</p>
          )}
        </>
      )}
    </Modal>
  );
}
