import { Penguin } from "./penguin";

export function AvatarArt({ value }: { value?: string | null }) {
  if (!value || value.startsWith("penguin") || value === "astronaut")
    return <Penguin outfit={value || "penguin"} />;
  if (value === "rocket")
    return (
      <svg className="dp-avatar-art" viewBox="0 0 220 245" role="img" aria-label="Roket avatarı">
        <ellipse cx="110" cy="225" rx="65" ry="10" fill="#000" opacity=".15" />
        <path d="M89 179Q85 211 110 232Q135 211 131 179" fill="#ffb84e" />
        <path d="M99 183Q98 205 110 215Q122 205 121 183" fill="#fff0b7" />
        <path d="M76 120Q32 142 41 192L80 174M144 120Q188 142 179 192L140 174" fill="#36d7b7" />
        <path d="M79 182C52 111 74 60 110 21C146 60 168 111 141 182Z" fill="#f2faf9" />
        <path d="M84 54Q110 14 136 54L143 73Q110 60 77 73Z" fill="#e9919e" />
        <circle cx="110" cy="116" r="28" fill="#284f66" />
        <circle cx="110" cy="116" r="20" fill="#7dd5dd" />
        <path
          d="M98 112Q100 101 110 102"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M79 174H141L137 187H83Z" fill="#284f66" />
      </svg>
    );
  const owl = value === "owl",
    cat = value === "cat";
  if (!["owl", "cat", "fox"].includes(value)) return <Penguin />;
  return (
    <svg
      className="dp-avatar-art"
      viewBox="0 0 220 245"
      role="img"
      aria-label={`${owl ? "Baykuş" : cat ? "Kedi" : "Tilki"} avatarı`}
    >
      <ellipse cx="110" cy="229" rx="67" ry="9" fill="#000" opacity=".15" />
      <path
        d="M44 96L35 26L90 54Q110 44 133 53L184 26L175 104L180 164Q179 227 110 226Q39 227 40 164Z"
        fill={owl ? "#90739f" : cat ? "#7fabb7" : "#e59b64"}
      />
      <path d="M54 55L60 88L80 68M168 55L160 88L140 68" fill="#efb6ba" />
      <path d="M52 119Q68 84 110 126Q151 85 170 120L161 172Q110 219 58 172Z" fill="#f2faf9" />
      <ellipse cx="82" cy="115" rx={owl ? 14 : 7} ry={owl ? 18 : 10} fill="#284f66" />
      <ellipse cx="139" cy="115" rx={owl ? 14 : 7} ry={owl ? 18 : 10} fill="#284f66" />
      <circle cx="85" cy="110" r="3" fill="white" />
      <circle cx="142" cy="110" r="3" fill="white" />
      <path d="M99 140Q110 134 122 140L111 152Z" fill={owl ? "#ffb84e" : "#284f66"} />
      {cat && (
        <path
          d="M59 143L30 135M59 153L28 154M160 143L190 135M160 153L191 154"
          stroke="#284f66"
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
      <path d="M42 182Q110 200 179 181L174 199Q110 219 47 199Z" fill="#36d7b7" />
    </svg>
  );
}
