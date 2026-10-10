import { writeFile, mkdir, readFile } from "node:fs/promises";
// Reproducible random coordinates: one sky, no tile and no hydration randomness.
let seed = 91723;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const stars = Array.from({ length: 420 }, () => {
  const x = random() * 1800,
    y = random() * 1200,
    bright = random();
  const r = bright > 0.975 ? 1.9 : bright > 0.8 ? 1.05 : 0.35 + random() * 0.45;
  const color = ["#e1efff", "#fff3d8", "#adbfe5"][Math.floor(random() * 3)];
  return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${(0.22 + random() * 0.65).toFixed(2)}"/>${bright > 0.985 ? `<path d="M${x - 4} ${y}h8M${x} ${y - 4}v8" stroke="${color}" stroke-width=".5" opacity=".4"/>` : ""}`;
}).join("");
await mkdir("public/themes", { recursive: true });
await writeFile(
  "public/themes/night-sky.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 1200"><defs><radialGradient id="cloud"><stop stop-color="#627293" stop-opacity=".13"/><stop offset="1" stop-color="#132035" stop-opacity="0"/></radialGradient></defs><ellipse cx="1350" cy="490" rx="720" ry="300" transform="rotate(-32 1350 490)" fill="url(#cloud)"/>${stars}</svg>`,
);
await writeFile(
  "public/themes/peaks.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500"><rect width="1000" height="500" fill="#192b44"/><circle cx="765" cy="96" r="32" fill="#e7d9b4"/><path d="M0 310L142 172L288 347L432 112L703 387L820 211L1000 345V500H0" fill="#35536a"/><path d="M432 112L361 214L410 195L447 222L478 168Z" fill="#a1c4cf"/><path d="M0 403L170 311L396 426L602 290L899 430L1000 341V500H0" fill="#243f55"/><path d="M0 480Q215 391 475 459T1000 428V500H0" fill="#122739"/></svg>`,
);
await writeFile(
  "public/themes/tide.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500"><rect width="1000" height="500" fill="#164746"/><circle cx="800" cy="88" r="38" fill="#eadba7"/><path d="M0 245Q180 193 383 250T1000 232V500H0" fill="#245f61"/><path d="M0 319Q184 255 463 325T1000 313V500H0" fill="#32797b"/><path d="M0 397Q230 328 497 399T1000 375V500H0" fill="#459293"/><path d="M0 469Q280 422 480 464T1000 447V500H0" fill="#87b6aa"/></svg>`,
);
const icon = await readFile("public/icon.svg", "utf8");
await writeFile("mobile/www/penguin.svg", icon);
for (const file of ["mobile/www/index.html", "mobile/www/offline.html"]) {
  let html = await readFile(file, "utf8");
  html = html.replace(
    /\p{Extended_Pictographic}/gu,
    '<img src="penguin.svg" width="96" height="96" alt="Dopamin pengueni" style="display:block;margin:0 auto 20px">',
  );
  await writeFile(file, html);
}
