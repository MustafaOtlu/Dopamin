"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowLeft, Check, Lightbulb } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { ErrorBanner, Spinner } from "./ui";
import { Penguin } from "./penguin";
interface Preparation {
  cards: { term: string; fact: string; example?: string; question?: string }[];
}
export function LessonPreparation({
  courseId,
  topicId,
  title,
  done,
}: {
  courseId: string;
  topicId: string;
  title: string;
  done: () => void;
}) {
  const [data, setData] = useState<Preparation | null>(null),
    [error, setError] = useState(""),
    [step, setStep] = useState(0);
  useEffect(() => {
    let active = true;
    api<Preparation>("courses/" + courseId + "/topics/" + topicId + "/preparation")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [courseId, topicId]);
  const current = data?.cards[step];
  return (
    <div className="dp-preparation">
      <div className="dp-prep-intro">
        <Penguin mood="think" />
        <div>
          <span className="eyebrow">DERSTEN ÖNCE · HAP BİLGİLER</span>
          <h3>{title}</h3>
        </div>
      </div>
      <ErrorBanner message={error} />
      {!data && !error && <Spinner />}
      {data && !current && <p>Bu konu için hazırlık notları henüz yayımlanmadı.</p>}
      {current && (
        <article key={step} className="dp-prep-card">
          <span className="dp-prep-count">
            {step + 1} / {data!.cards.length}
          </span>
          <h3>{current.term}</h3>
          <p className="dp-prep-fact">{current.fact}</p>
          {current.example && (
            <div className="dp-prep-example">
              <Lightbulb size={20} />
              <p>{current.example}</p>
            </div>
          )}
          {current.question && (
            <p className="dp-prep-curiosity">
              <strong>Derste aklında olsun</strong>
              {current.question}
            </p>
          )}
        </article>
      )}
      {data && (
        <div className="dp-prep-navigation">
          <button
            className="button secondary"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            aria-label="Önceki bilgi"
          >
            <ArrowLeft size={18} />
          </button>
          {step < data.cards.length - 1 ? (
            <button className="button primary" onClick={() => setStep(step + 1)}>
              Sonraki bilgi <ArrowRight size={18} />
            </button>
          ) : (
            <button className="button primary" onClick={done}>
              Derse hazırım <Check size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
