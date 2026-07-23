import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "DBラボ：学園祭データベース";
const description =
  "表・主キー・外部キー・CREATE・INSERT・SELECTを、ブラウザ内のSQLiteで体験する初学者向けデータベースラボ。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : undefined;

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      title,
      description,
      images: origin
        ? [
            {
              url: `${origin}/og.png`,
              width: 1731,
              height: 909,
              alt: "DBラボ 学園祭データベース",
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: origin ? [`${origin}/og.png`] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
