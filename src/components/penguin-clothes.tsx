export function PenguinClothes({ outfit, hat = false }: { outfit: string; hat?: boolean }) {
  if (hat) {
    if (outfit === "chef")
      return (
        <g fill="#fff8e9" stroke="#cadde3" strokeWidth="3">
          <path d="M70 55V33C46 15 79 0 90 15C99-6 129-5 137 15C165-2 180 25 155 36V55Z" />
          <path d="M72 43H154V60H72Z" />
        </g>
      );
    if (outfit === "sailor")
      return (
        <g>
          <path d="M60 43Q112 7 163 43L153 66H70Z" fill="#fff8e9" />
          <path d="M67 54H158V65H67Z" fill="#315c82" />
          <circle cx="112" cy="41" r="6" fill="#e8b75f" />
        </g>
      );
    if (outfit === "scholar")
      return (
        <g fill="#413f69">
          <path d="M53 39L111 17L173 39L111 61Z" />
          <path d="M77 48V65Q111 77 145 65V48Z" />
          <path d="M163 40V76" stroke="#e8b75f" strokeWidth="4" />
        </g>
      );
    if (outfit === "fox-hood")
      return (
        <g fill="#c97342" stroke="#844f35" strokeWidth="3">
          <path d="M51 76L48 25L83 49Q111 33 142 49L176 25L172 80L156 67Q111 42 67 80Z" />
          <path d="M57 54V40L72 56M154 56L168 40V59" fill="#fff2d8" stroke="none" />
        </g>
      );
    if (outfit === "knight")
      return (
        <g fill="#819cae" stroke="#466479" strokeWidth="3">
          <path d="M58 63Q56 9 113 13Q167 12 166 65L153 55Q113 34 71 65Z" />
          <path d="M106 17V51" fill="none" stroke="#d8e5ee" strokeWidth="7" />
          <path d="M110 14Q111-7 140 3L130 24" fill="#b85963" stroke="none" />
        </g>
      );
    return null;
  }
  const color =
    outfit === "raincoat"
      ? "#edbd48"
      : outfit === "scientist"
        ? "#eaf2f2"
        : outfit === "chef"
          ? "#395b79"
          : outfit === "knight"
            ? "#819cae"
            : outfit === "scholar"
              ? "#514d78"
              : outfit === "night-suit"
                ? "#595888"
                : outfit === "sailor"
                  ? "#edf7f8"
                  : null;
  if (!color) return null;
  return (
    <g className="penguin-clothing">
      {outfit === "knight" && (
        <path d="M51 131L32 213Q58 225 85 213L164 220L183 131Z" fill="#a74c61" />
      )}
      <path d="M49 135Q111 152 174 135L179 181Q179 220 112 223Q43 219 43 181Z" fill={color} />
      {outfit === "sailor" ? (
        <g stroke="#3d7293" strokeWidth="8">
          <path d="M46 166H176M44 186H178M57 207H165" />
        </g>
      ) : (
        <path
          d="M111 153V218"
          stroke={outfit === "scientist" ? "#a5bdc7" : "#173746"}
          strokeWidth="3"
          opacity=".4"
        />
      )}
      {["scientist", "raincoat"].includes(outfit) && (
        <>
          <path
            d="M59 178H85V193Q71 204 59 193Z M137 178H164V193Q150 204 137 193Z"
            fill="none"
            stroke={outfit === "scientist" ? "#a5bdc7" : "#b28436"}
            strokeWidth="3"
          />
          <path d="M146 173V184" stroke="#4ebdaa" strokeWidth="5" />
        </>
      )}
      {outfit === "knight" && (
        <path
          d="M84 177L112 165L140 177V197Q112 218 84 197Z"
          fill="#d8e5ee"
          stroke="#506e83"
          strokeWidth="3"
        />
      )}
      {outfit === "chef" && <path d="M79 160H146L156 206Q114 225 68 206Z" fill="#f7eee2" />}
      {outfit === "night-suit" && (
        <g fill="#f3d482">
          <path d="M74 185L77 177L81 185L90 188L81 191L77 200L74 191L65 188Z" />
          <circle cx="145" cy="201" r="4" />
        </g>
      )}
    </g>
  );
}
