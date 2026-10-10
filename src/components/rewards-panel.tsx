"use client";
import { useEffect, useState } from "react";
import { Award, Gem, Shield, Sparkles, Eye, LockKeyhole, Star } from "lucide-react";
import { api, errorMessage, dateLabel } from "@/lib/client";
import { ErrorBanner, Modal, Pill, Spinner } from "./ui";
import { levelProgress } from "@/lib/levels";
import { StreakCard, type StreakView } from "./streak-card";
import { ProfilePhoto } from "./profile-photo";
import { Penguin } from "./penguin";
export interface Wallet {
  photo_url?: string | null;
  xp: number;
  tokens: number;
  streak?: number;
  cosmetics: {
    avatar: string | null;
    outfit?: string | null;
    frame: string | null;
    theme: string | null;
    banner?: string | null;
    font?: string | null;
  };
}
interface Product {
  id: string;
  title: string;
  description: string;
  kind: "outfit" | "frame" | "theme" | "shield" | "banner" | "font";
  min_level: number;
  price: number;
  value: string;
  consumable: boolean;
}
interface Rewards extends StreakView {
  wallet: Wallet;
  products: Product[];
  inventory: { product_id: string; quantity: number }[];
  achievements: { achievement_id: string; earned_at: string }[];
  transactions: { id: string; reason: string; amount: number; kind: string; created_at: string }[];
}
export const badges = [
  { id: "first_step", title: "İlk adım", description: "Bir öğrenme çalışmasını tamamla." },
  {
    id: "first_mastery",
    title: "Sağlam temel",
    description: "Bir kazanımda farklı gün ve sorularla yeterli başarı göster.",
  },
  {
    id: "mistakes_fixed",
    title: "Yeniden keşif",
    description: "Hatalarım'da bir yanlışını düzelt.",
  },
  { id: "five_topics", title: "Meraklı kaşif", description: "Beş farklı kazanımda çalış." },
  {
    id: "weekly_complete",
    title: "Bir haftalık yolculuk",
    description: "Haftanın hedeflerini tamamlayıp sandığını aç.",
  },
];
const reasonLabels: Record<string, string> = {
  daily_item: "Günlük adım tamamlandı",
  daily_goal: "Günlük hedef tamamlandı",
  new_objective: "Yeni kazanımda gönüllü çalışma",
  mistake_review: "Eksik kazanım tekrarı",
  purchase: "Mağaza alışverişi",
  weekly_chest: "Haftalık sandık",
  manual_test_credit: "Deneme için eklenen elmas",
  challenge_win: "Maç galibiyeti",
  challenge_complete: "Maç tamamlandı",
};
const categories = [
  ["all", "Tümü"],
  ["theme", "Temalar"],
  ["outfit", "Kıyafetler"],
  ["frame", "Çerçeveler"],
  ["banner", "Bannerlar"],
  ["font", "Yazı stilleri"],
  ["shield", "Destekler"],
];
function ProductPreview({
  product: p,
  name = "Sen",
  photoUrl,
}: {
  product: Product;
  cosmetics?: Wallet["cosmetics"];
  name?: string;
  photoUrl?: string | null;
}) {
  return (
    <div className={`shop-product-preview shop-${p.kind} dp-product-${p.value}`}>
      {p.kind === "outfit" ? (
        <Penguin outfit={p.value} />
      ) : p.kind === "shield" ? (
        <Shield size={46} />
      ) : p.kind === "theme" ? (
        <div className={`dopamin-app dp-theme-preview`} data-theme={p.value}>
          <span />
          <div>
            <i />
            <Star size={21} fill="currentColor" />
            <Star size={21} fill="currentColor" />
          </div>
        </div>
      ) : p.kind === "banner" ? (
        <div className={`dp-banner-preview dp-banner-${p.value}`}>
          <span>
            <ProfilePhoto url={photoUrl} />
          </span>
        </div>
      ) : p.kind === "font" ? (
        <span className={`dp-font-preview dp-font-${p.value}`}>{name}</span>
      ) : (
        <span className={`dp-avatar dp-frame-${p.value}`}>
          <ProfilePhoto url={photoUrl} />
        </span>
      )}
    </div>
  );
}
export function RewardsPanel({
  updated,
  section,
  profile,
}: {
  updated: () => Promise<void>;
  section?: "shop" | "inventory" | "profile" | "streak";
  profile?: { display_name: string; university?: string | null };
}) {
  const [data, setData] = useState<Rewards | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [requestKeys] = useState(() => new Map<string, string>());
  const [category, setCategory] = useState("all"),
    [preview, setPreview] = useState<Product | null>(null);
  useEffect(() => {
    let active = true;
    api<Rewards>("rewards")
      .then((r) => {
        if (active) setData(r);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setData(await api<Rewards>("rewards"));
      await updated();
      setNotice(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {(!section || section === "shop") && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">Senin Dopamin’in</span>
            <h1>
              Mağaza<span className="greeting-dot">.</span>
            </h1>
            <p>Yeni bir atkı, gece gökyüzü, sevdiğin bir renk. Önce üzerinde dene.</p>
          </div>
        </div>
      )}
      <ErrorBanner message={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <Spinner />
      ) : (
        <>
          {(!section || section === "shop") && (
            <div className="reward-wallet">
              <div>
                <span className="reward-wallet-icon">
                  <Sparkles />
                </span>
                <div>
                  <strong>{data.wallet.xp}</strong>
                  <span>Toplam XP</span>
                </div>
              </div>
              <div>
                <span className="reward-wallet-icon elmas-icon">
                  <Gem fill="currentColor" className="dp-diamond" />
                </span>
                <div>
                  <strong>{data.wallet.tokens}</strong>
                  <span>Elmas bakiyen</span>
                </div>
              </div>
              <p>Günlük adımların XP, günlük hedefin 10 elmas kazandırır.</p>
            </div>
          )}
          {(!section || section === "profile" || section === "streak") && (
            <StreakCard
              data={data}
              showWeekly={section !== "profile"}
              shields={data.inventory.find((i) => i.product_id === "streak-shield")?.quantity || 0}
              busy={busy}
              act={act}
            />
          )}
          {(!section || section === "shop" || section === "inventory") && (
            <>
              <div className="section-heading">
                <h2>{section === "inventory" ? "Sahip olduklarım" : "Kendine bir renk kat"}</h2>
                <span className="muted">Kozmetikler ve seri koruyucu</span>
              </div>
              <div className="dp-tabs dp-shop-categories" aria-label="Ürün kategorileri">
                {categories.map(([id, label]) => (
                  <button
                    key={id}
                    className={category === id ? "active" : ""}
                    aria-pressed={category === id}
                    onClick={() => setCategory(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {section === "inventory" && !data.inventory.some((i) => i.quantity > 0) && (
                <p className="muted">İlk ürününü Mağaza’dan alabilirsin.</p>
              )}
              {section === "inventory" && (
                <div className="dp-reset-cosmetics">
                  {categories
                    .filter(([id]) => id !== "all" && id !== "shield")
                    .map(([id, label]) => (
                      <button
                        key={id}
                        className="text-button"
                        disabled={busy || !data.wallet.cosmetics[id as keyof Wallet["cosmetics"]]}
                        onClick={() =>
                          void act(
                            () => api("rewards/equip", { product_id: `reset:${id}` }),
                            `${label} varsayılana döndü.`,
                          )
                        }
                      >
                        {label}: varsayılan
                      </button>
                    ))}
                </div>
              )}
              <div className="shop-grid">
                {data.products
                  .filter((p) => category === "all" || p.kind === category)
                  .filter(
                    (p) =>
                      section !== "inventory" ||
                      data.inventory.some((i) => i.product_id === p.id && i.quantity > 0),
                  )
                  .map((p) => {
                    const owned = data.inventory.find((i) => i.product_id === p.id)?.quantity || 0,
                      active = p.kind !== "shield" && data.wallet.cosmetics[p.kind] === p.value;
                    const locked = levelProgress(data.wallet.xp).level < p.min_level;
                    return (
                      <article className="shop-card" key={p.id}>
                        <button
                          className="dp-preview-button"
                          aria-label={`${p.title} önizle`}
                          onClick={() => setPreview(p)}
                        >
                          <ProductPreview
                            product={p}
                            cosmetics={data.wallet.cosmetics}
                            photoUrl={data.wallet.photo_url}
                            name={profile?.display_name}
                          />
                          <span>
                            <Eye size={14} /> Önizle
                          </span>
                        </button>
                        <div className="shop-product-info">
                          <h3>{p.title}</h3>
                          <p>{p.description}</p>
                          {p.min_level > 1 && (
                            <small className="dp-product-level">
                              {locked && <LockKeyhole size={12} />}Seviye {p.min_level}
                            </small>
                          )}
                          <div className="section-heading">
                            <strong className="product-price">
                              <Gem fill="currentColor" className="dp-diamond" size={16} />
                              {p.price} elmas
                            </strong>
                            {owned > 0 && (
                              <Pill tone="green">
                                {p.consumable ? `${owned} adet` : active ? "Etkin" : "Envanterinde"}
                              </Pill>
                            )}
                          </div>
                        </div>
                        {owned > 0 && !p.consumable ? (
                          <button
                            className="button secondary full-width"
                            disabled={busy || active}
                            onClick={() =>
                              void act(
                                () => api("rewards/equip", { product_id: p.id }),
                                "Profil ürünün etkinleştirildi.",
                              )
                            }
                          >
                            {active ? "Etkin" : "Etkinleştir"}
                          </button>
                        ) : (
                          <button
                            className="button primary full-width"
                            disabled={busy || locked || data.wallet.tokens < p.price}
                            onClick={() => {
                              const key = requestKeys.get(p.id) || crypto.randomUUID();
                              requestKeys.set(p.id, key);
                              void act(async () => {
                                await api("rewards/purchase", {
                                  product_id: p.id,
                                  request_key: key,
                                });
                                requestKeys.delete(p.id);
                              }, "Ürün envanterine eklendi.");
                            }}
                          >
                            {locked
                              ? `Seviye ${p.min_level} gerekli`
                              : data.wallet.tokens < p.price
                                ? "Elmas biriktir"
                                : "Satın al"}
                          </button>
                        )}
                      </article>
                    );
                  })}
              </div>
            </>
          )}
          {(!section || section === "profile") && (
            <>
              <div className="section-heading">
                <h2>Başarımların</h2>
                <span className="muted">Her biri bir öğrenme adımı</span>
              </div>
              <div className="badge-grid">
                {badges.map((b) => {
                  const earned = data.achievements.find((a) => a.achievement_id === b.id);
                  return (
                    <article className={`badge-card ${earned ? "earned" : "locked"}`} key={b.id}>
                      <span className="badge-icon">
                        <Award size={28} />
                      </span>
                      <h3>{b.title}</h3>
                      <p>{b.description}</p>
                      <small>
                        {earned
                          ? `${dateLabel(earned.earned_at)} tarihinde kazanıldı`
                          : "Henüz kazanılmadı"}
                      </small>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {(!section || section === "shop") && (
            <>
              <div className="section-heading">
                <h2>İşlem geçmişin</h2>
                <span className="muted">Son 30 kayıt</span>
              </div>
              {!data.transactions.length ? (
                <p className="muted">İlk ödülünü kazandığında burada görünecek.</p>
              ) : (
                <div className="reward-transactions">
                  {data.transactions.map((t) => (
                    <div key={t.id}>
                      <span>
                        {reasonLabels[t.reason] || "Öğrenme ödülü"}
                        <small>{dateLabel(t.created_at)}</small>
                      </span>
                      <strong className={t.amount < 0 ? "muted" : "positive-reward"}>
                        {t.amount > 0 ? "+" : ""}
                        {t.amount} {t.kind === "xp" ? "XP" : "elmas"}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      {preview && data && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          {preview.kind === "shield" ? (
            <ProductPreview product={preview} />
          ) : (
            <PersonalPreview product={preview} wallet={data.wallet} profile={profile} />
          )}
          <p className="dp-preview-description">{preview.description}</p>
          <p className="muted">
            {preview.price} elmas · Seviye {preview.min_level}
          </p>
          <p className="dp-preview-hint">
            Bu sadece bir önizleme. Seçimlerin ve bakiyen değişmedi.
          </p>
          <button className="button secondary full-width" onClick={() => setPreview(null)}>
            Mağazaya dön
          </button>
        </Modal>
      )}
    </>
  );
}

function PersonalPreview({
  product,
  wallet,
  profile,
}: {
  product: Product;
  wallet: Wallet;
  profile?: { display_name: string; university?: string | null };
}) {
  const look = { ...wallet.cosmetics, [product.kind]: product.value };
  return (
    <div
      className="dopamin-app dp-personal-preview"
      data-theme={look.theme || "polar"}
      aria-label="Profilinde önizleme"
    >
      <span className="dp-preview-label">SENİN PROFİLİNDE</span>
      <section className={`dp-profile-hero dp-banner-${look.banner || "polar"}`}>
        <span className={`dp-avatar dp-profile-avatar dp-frame-${look.frame || "none"}`}>
          <ProfilePhoto url={wallet.photo_url} name={profile?.display_name} />
        </span>
        <div className="dp-profile-companion">
          <Penguin outfit={look.outfit || "penguin"} interactive />
        </div>
        <h3 className={`dp-font-${look.font || "default"}`}>{profile?.display_name || "Sen"}</h3>
        {profile?.university && <p>{profile.university}</p>}
        <span className="dp-level-pill">
          Seviye {levelProgress(wallet.xp).level} · {wallet.xp} XP
        </span>
      </section>
      {product.kind === "theme" && (
        <div className="dp-preview-lesson">
          <span>Öğrenme yolun</span>
          <div>
            <Star fill="currentColor" />
            <span />
            <Star fill="currentColor" />
          </div>
          <button type="button" tabIndex={-1} className="button primary" disabled>
            Temanın düğme rengi
          </button>
        </div>
      )}
    </div>
  );
}
