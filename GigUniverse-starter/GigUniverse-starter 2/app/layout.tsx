import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "GigUniverse",
  description: "Your music. Your history. Your universe."
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
