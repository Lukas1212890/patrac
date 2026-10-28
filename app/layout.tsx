import type { Metadata, Viewport } from "next";
import "./patrac.css";
import "./community.css";
export const metadata: Metadata = {
 title: "Pátrač — dobrodružství ze světa Stopíka",
 description: "Týmové GPS výpravy za pokladem, hádanky a šifry pro děti i dospělé.",
 manifest: "/manifest.webmanifest",
 referrer: "no-referrer",
 appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Pátrač" },
 icons: { icon: "/favicon.svg", apple: "/patrac-icon-192.png" }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#2348df" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="cs"><head><link rel="stylesheet" href="/vendor/maplibre-gl.css"/></head><body>{children}</body></html>;
}
