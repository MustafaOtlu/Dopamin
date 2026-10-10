import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./dopamin.css";
import "./student-refinements.css";
import "./teacher.css";
export const metadata: Metadata = {
  title: "Dopamin · Her gün bir keşif",
  description:
    "Üniversite derslerin, kişisel öğrenme yolculuğun ve etkileşimli çalışmaların tek yerde.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Dopamin", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#101f28" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
