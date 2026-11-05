import type { Metadata } from "next";
import "../styles.css";
import "./app.css";

export const metadata: Metadata = {
  title: "Frame — Movies, your way",
  description: "Stream your authorized movie collection across your devices."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
