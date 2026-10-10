"use client";
import { useEffect, useState } from "react";
import { Trophy, Globe, Check } from "lucide-react";
import { api, dateLabel, errorMessage } from "@/lib/client";
import { addDays } from "@/lib/time";
import { Empty, ErrorBanner, Spinner } from "./ui";
import { PublicProfileDialog } from "./public-profile";
interface League {
  week: string;
  your_id: string;
  membership: { tier: number; withdrawn: boolean } | null;
  entries: { user_id: string; display_name: string; points: number; rank: number }[];
  history: {
    week: string;
    tier: number;
    final_points: number | null;
    final_rank: number | null;
    next_tier: number | null;
    withdrawn: boolean;
  }[];
}
const tiers = ["Kaşif", "Gezgin", "Usta"];
export function LeaguePanel({ updated }: { updated: () => Promise<void> }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [data, setData] = useState<League | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false);
  useEffect(() => {
    let active = true;
    api<League>("league")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(route: string) {
    setBusy(true);
    setError("");
    try {
      await api(route, { consent });
      setData(await api<League>("league"));
      await updated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const joined = data?.membership && !data.membership.withdrawn;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KÜÇÜK ADIMLAR, ORTAK YOLCULUK</span>
          <h1>
            Haftalık lig<span className="greeting-dot">.</span>
          </h1>
          <p>Kendi seviyene yakın bir grupta öğrenme alışkanlığını sürdür.</p>
        </div>
        {joined && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void act("league/leave")}
          >
            Bu haftanın liginden ayrıl
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
      <div className="league-hero">
        <span className="league-emblem">
          <Trophy size={50} />
        </span>
        <div>
          <span className="eyebrow">DOPAMİN LİGLERİ</span>
          <h2>{joined ? `${tiers[data!.membership!.tier]} ligi` : "Birlikte öğrenmeye katıl"}</h2>
          <p>
            Bu hafta kazandığın her XP lig puanına eklenir. Öğren, maç yap, sıralamada yüksel.
          </p>
          <small>
            <Globe size={14} />
            En fazla 30 kişi · Her pazartesi yeni hafta · Eşit puan, aynı sıra
          </small>
        </div>
      </div>
      {!data ? (
        <Spinner />
      ) : joined ? (
        <>
          <div className="section-heading">
            <h2>Bu haftaki grubun</h2>
            <span className="muted">
              {dateLabel(data.week)} – {dateLabel(addDays(data.week, 6))}
            </span>
          </div>
          <div className="ranking-list">
            {data.entries.map((e) => (
              <article
                key={e.user_id}
                className={`ranking-row ${e.user_id === data.your_id ? "your-rank" : ""}`}
              >
                <span className={`rank-number rank-${e.rank}`} aria-label={`${e.rank}. sıra`}>
                  {e.rank <= 3 && <Trophy size={16} />} {e.rank}
                </span>
                <div>
                  <button className="dp-link" onClick={() => setProfileId(e.user_id)}>{e.display_name}</button>
                  {e.user_id === data.your_id && <small>Sen</small>}
                </div>
                <span className="rank-points">{e.points} XP</span>
              </article>
            ))}
          </div>
          <p className="league-rules">
            <Check size={18} />
            En az 5 kişilik grupta üst %20 bir üst lige çıkar, alt %20 bir alt lige iner. Sınırdaki
            eşitlikte kimse ayrıştırılmaz. Bütün puanlar eşitse lig seviyesi korunur.
          </p>
        </>
      ) : data.membership?.withdrawn ? (
        <Empty
          title="Bu hafta ligden ayrıldın"
          description="Adın bu haftanın sıralamasında görünmez. Gelecek hafta yeniden katılabilirsin."
        />
      ) : (
        <div className="league-opt-in">
          <h2>Katılım senin seçimin</h2>
          <p>
            Lig arkadaşların görünen adını ve bu haftanın lig puanını görür. Cevapların, ödevlerin
            ve akademik eksiklerin özel kalır.
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Profilimin herkese açık olmasını ve adımın lig grubunda görünmesini kabul ediyorum.
            </span>
          </label>
          <button
            className="button primary"
            disabled={busy || !consent}
            onClick={() => void act("league/join")}
          >
            <Trophy size={18} />
            Bu haftanın ligine katıl
          </button>
          <p className="muted">
            Ligden ayrılırsan aynı hafta yeniden katılamazsın. Profil görünürlüğünü kapatmak da bu
            haftanın liginden çıkarır.
          </p>
        </div>
      )}
      {data && data.history.length > 0 && (
        <>
          <div className="section-heading">
            <h2>Geçmiş haftaların</h2>
          </div>
          <div className="league-history">
            {data.history.map((h) => (
              <article key={h.week}>
                <div>
                  <strong>{dateLabel(h.week)} haftası</strong>
                  <span>{tiers[h.tier]} ligi</span>
                </div>
                <p>
                  {h.withdrawn
                    ? "Ligden ayrıldın"
                    : h.final_rank === null
                      ? "Yeni katılımında hafta sonucu kesinleşir"
                      : `${h.final_rank}. sıra · ${h.final_points} puan → ${tiers[h.next_tier ?? h.tier]} ligi`}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
      {profileId && <PublicProfileDialog userId={profileId} close={() => setProfileId(null)}/>}
    </>
  );
}
