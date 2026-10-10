"use client";
import { useState } from "react";
import { PenguinClothes } from "./penguin-clothes";
export type PenguinMood = "idle" | "wave" | "clap" | "sad" | "celebrate" | "think" | "cry" | "duel";
export function Penguin({
  className = "",
  waving = false,
  mood,
  interactive = false,
  outfit = "penguin",
}: {
  className?: string;
  waving?: boolean;
  mood?: PenguinMood;
  interactive?: boolean;
  outfit?: string;
}) {
  const [replay, setReplay] = useState(0),
    [greeting, setGreeting] = useState(false);
  const expression = mood || (greeting || waving ? "wave" : "idle");
  const scarf =
    outfit === "penguin-rose"
      ? "#f19bad"
      : ["penguin-amber", "penguin-explorer"].includes(outfit)
        ? "#ffc369"
        : outfit === "penguin-lavender"
          ? "#bba6ee"
          : "#36d7b7";
  const art = (
    <svg
      key={replay}
      className={`dopamin-penguin penguin-${expression} ${className}`}
      viewBox="0 0 220 245"
      role="img"
      aria-label={`Dopamin pengueni${expression === "cry" ? ", ağlıyor" : expression === "duel" ? ", kılıcıyla hazır" : ""}${expression === "clap" ? ", alkışlıyor" : ["sad", "cry"].includes(expression) ? ", üzgün" : expression === "celebrate" ? ", kutluyor" : ""}`}
    >
      <ellipse
        className="penguin-shadow"
        cx="111"
        cy="231"
        rx="63"
        ry="8"
        fill="#000"
        opacity=".16"
      />
      <g className="penguin-body">
        <path
          d="M65 209C36 207 36 231 73 229L99 215M125 215C143 237 181 229 179 217C178 205 152 204 139 209"
          fill="#ffb84e"
        />
        <path d="M49 93C49 4 171 4 174 95L182 161C189 244 33 243 42 159Z" fill="#284f66" />
        <path
          d="M66 73C85 49 103 71 111 86C123 64 147 52 161 77L168 160C176 218 50 219 55 159Z"
          fill="#f2faf9"
        />
        <path d="M92 29L82 9Q109 9 117 31L120 17Q136 23 132 36" fill="#284f66" />
        <g className="penguin-face">
          {["clap", "celebrate"].includes(expression) ? (
            <path
              d="M76 103Q84 89 92 103M131 103Q139 89 147 103"
              fill="none"
              stroke="#173746"
              strokeWidth="6"
              strokeLinecap="round"
            />
          ) : (
            <>
              <ellipse cx="83" cy="101" rx="7" ry={expression === "sad" ? 7 : 10} fill="#173746" />
              <ellipse cx="139" cy="101" rx="7" ry={expression === "sad" ? 7 : 10} fill="#173746" />
              <circle cx="85" cy="97" r="2.4" fill="white" />
              <circle cx="141" cy="97" r="2.4" fill="white" />
              {expression === "sad" && (
                <path
                  d="M75 88L91 83M131 83L147 88"
                  fill="none"
                  stroke="#173746"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              )}
            </>
          )}
          <ellipse cx="68" cy="119" rx="10" ry="6" fill="#ffa4ae" opacity=".65" />
          <ellipse cx="154" cy="119" rx="10" ry="6" fill="#ffa4ae" opacity=".65" />
          <path
            d={
              expression === "sad"
                ? "M98 122Q111 112 124 122L111 128Z"
                : "M97 119Q111 106 125 119Q112 140 97 119Z"
            }
            fill="#ffb84e"
          />
        </g>
        {expression === "cry" && (
          <g className="penguin-tears" fill="#7bdaef">
            <path d="M81 108Q67 128 81 136Q95 128 81 108Z" />
            <path d="M142 110Q128 132 142 141Q156 132 142 110Z" />
          </g>
        )}
        <PenguinClothes outfit={outfit} />
        {/* The tail sits behind a scarf that follows the body's full width. */}
        <path d="M133 157L150 156L153 194Q142 194 133 188Z" fill={scarf} />
        <path d="M137 170L148 168L150 187L139 184Z" fill="#173746" opacity=".18" />
        <path d="M44 143Q109 167 178 143L180 162Q109 187 42 162Z" fill={scarf} />
        <path d="M44 157Q109 180 179 157L180 163Q109 187 42 162Z" fill="#173746" opacity=".16" />
        <path
          d="M54 148Q94 160 125 157"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".22"
        />
        <g className="penguin-wing penguin-wing-left">
          <path
            d={
              expression === "clap"
                ? "M48 116C26 128 56 177 97 166Q115 155 97 145L59 120Z"
                : expression === "celebrate"
                  ? "M57 117C25 128 7 82 21 70Q32 61 45 97L65 104Z"
                  : "M53 117C19 116 17 163 34 181L68 153"
            }
            fill="#284f66"
          />
        </g>
        <g className="penguin-wing penguin-wing-right">
          <path
            d={
              expression === "clap"
                ? "M173 116C195 128 165 177 124 166Q106 155 124 145L162 120Z"
                : ["wave", "celebrate", "duel"].includes(expression)
                  ? "M168 124C207 124 217 75 200 72C191 69 185 105 160 99Z"
                  : "M169 118C204 117 208 165 189 183L151 153"
            }
            fill="#284f66"
          />
        </g>
        {expression === "duel" && (
          <g className="penguin-sword" transform="rotate(14 195 105)">
            <path
              d="M193 94L186 33L195 15L204 33L199 94Z"
              fill="#d5e6ec"
              stroke="#6f96ac"
              strokeWidth="3"
            />
            <path d="M195 24V91" stroke="white" strokeWidth="3" />
            <path
              d="M180 94Q195 102 209 94"
              fill="none"
              stroke="#e7b65a"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path d="M195 101V124" stroke="#895b48" strokeWidth="8" strokeLinecap="round" />
            <circle cx="195" cy="127" r="6" fill="#e7b65a" />
          </g>
        )}
        <PenguinClothes outfit={outfit} hat />
        {outfit === "penguin-explorer" && (
          <g>
            <path d="M54 69Q109 48 169 69L164 77H58Z" fill="#e6b675" />
            <path d="M73 60L80 34Q113 20 145 36L153 60Z" fill="#d49a55" />
            <path d="M76 53Q113 43 150 54" fill="none" stroke="#634f42" strokeWidth="8" />
          </g>
        )}
        {outfit === "penguin-headphones" && (
          <g fill="#bba6ee" stroke="#665e96" strokeWidth="5">
            <path d="M54 92C41 7 179 7 168 92" fill="none" strokeWidth="10" />
            <rect x="44" y="80" width="18" height="35" rx="8" />
            <rect x="161" y="80" width="18" height="35" rx="8" />
          </g>
        )}
        {outfit === "astronaut" && (
          <g fill="none" stroke="#adc9d5">
            <ellipse cx="111" cy="84" rx="79" ry="69" strokeWidth="9" />
            <path d="M54 58Q65 35 86 31" stroke="white" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}
      </g>
      {["clap", "celebrate"].includes(expression) && (
        <g
          className="penguin-cheers"
          fill="none"
          stroke={scarf}
          strokeWidth="4"
          strokeLinecap="round"
        >
          <path d="M17 52L10 43M34 39L33 27M184 43L190 32M202 59L213 54" />
        </g>
      )}
    </svg>
  );
  return interactive ? (
    <button
      type="button"
      className="penguin-friend"
      aria-label="Pengueni canlandır"
      onPointerEnter={() => {
        setGreeting(true);
        setReplay((v) => v + 1);
      }}
      onPointerLeave={() => setGreeting(false)}
      onClick={() => {
        setGreeting(true);
        setReplay((v) => v + 1);
      }}
      onBlur={() => setGreeting(false)}
    >
      {art}
    </button>
  ) : (
    art
  );
}
