import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Xsite Casinos - Telegram WebApp',
  description: 'မြန်မာ့ အံစာတုံး ထီနှင့် ကာစီနို Telegram WebApp (Real 3D Rolling Dice, KPay/Wave ငွေသွင်းငွေထုတ် & Referral Commission System)',
  openGraph: {
    title: 'Xsite Casinos - Telegram WebApp',
    description: 'မြန်မာ့ အံစာတုံး ထီနှင့် ကာစီနို Telegram WebApp (Real 3D Rolling Dice, KPay/Wave ငွေသွင်းငွေထုတ် & Referral Commission System)',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Xsite Casinos - Telegram WebApp',
    description: 'မြန်မာ့ အံစာတုံး ထီနှင့် ကာစီနို Telegram WebApp (Real 3D Rolling Dice, KPay/Wave ငွေသွင်းငွေထုတ် & Referral Commission System)',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#050811',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="my" className="dark font-sans" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#050811" />
        <meta name="color-scheme" content="dark" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body
        className="bg-[#050811] text-white min-h-screen font-sans antialiased selection:bg-white/20 selection:text-white overflow-x-hidden"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
