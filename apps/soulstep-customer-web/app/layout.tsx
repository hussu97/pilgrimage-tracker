import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { AppClientShell } from './AppClientShell';

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID ?? 'ca-pub-7902951158656200';
const UMAMI_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '';

export const metadata: Metadata = {
  title: {
    default: 'SoulStep — Sacred Sites Discovery Platform',
    template: '%s | SoulStep',
  },
  description:
    'Discover sacred sites, mosques, temples, churches, and places of worship worldwide. Track your spiritual journey, check in at holy places, and explore religious heritage with SoulStep.',
  openGraph: {
    type: 'website',
    siteName: 'SoulStep',
    title: 'SoulStep — Sacred Sites Discovery Platform',
    description:
      'Discover mosques, temples, churches, and sacred sites worldwide. Track your spiritual journey with SoulStep.',
    url: 'https://www.soul-step.org',
    images: [{ url: 'https://www.soul-step.org/logo.png' }],
  },
  twitter: {
    card: 'summary',
    title: 'SoulStep — Sacred Sites Discovery Platform',
    description: 'Discover mosques, temples, churches, and sacred sites worldwide.',
  },
  other: {
    // Google AdSense verification tag
    'google-adsense-account': ADSENSE_ID,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Security headers as meta equivalents */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://www.googletagservices.com https://adservice.google.com https://tpc.googlesyndication.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://localhost:* http://127.0.0.1:* https://*.run.app https://soul-step.org https://api.soul-step.org https://pagead2.googlesyndication.com https://*.adtrafficquality.google; frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com; frame-ancestors 'none';"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Round&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />

        {/* Google AdSense */}
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />

        {/* Google Consent Mode v2 — default deny until user grants consent */}
        <Script id="google-consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent','default',{
              ad_storage:'denied',
              ad_user_data:'denied',
              ad_personalization:'denied',
              analytics_storage:'denied'
            });
          `}
        </Script>

        {/* Umami analytics — proxied via /umami to bypass adblockers */}
        {UMAMI_ID && (
          <Script
            async
            defer
            src="/umami/script.js"
            data-website-id={UMAMI_ID}
            data-host-url="/umami"
            data-domains="soul-step.org"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body>
        <noscript>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui,sans-serif' }}>
            <h1>SoulStep — Sacred Sites Discovery Platform</h1>
            <p>
              SoulStep connects spiritual travelers with mosques, temples, churches, gurdwaras,
              synagogues, and other houses of worship worldwide.
            </p>
            <h2>Explore Sacred Sites</h2>
            <p>
              Discover and explore sacred sites across Islam, Christianity, Hinduism, Buddhism,
              Sikhism, Judaism, Baha&apos;i, and Zoroastrianism. Check in at locations you visit,
              share reviews with fellow travelers, and create journey groups to plan pilgrimages
              with friends and family.
            </p>
            <h2>Features</h2>
            <ul>
              <li>Interactive map with thousands of sacred sites</li>
              <li>Check in at religious sites to track your spiritual journey</li>
              <li>Read and write reviews from fellow visitors</li>
              <li>Create journey groups and plan pilgrimages together</li>
              <li>Save favourite places and get personalised recommendations</li>
              <li>Available in English, Arabic, Hindi, Telugu, and Malayalam</li>
            </ul>
            <h2>Quick Links</h2>
            <ul>
              <li><a href="/about">About SoulStep</a></li>
              <li><a href="/privacy">Privacy Policy</a></li>
              <li><a href="/terms">Terms of Service</a></li>
              <li><a href="/contact">Contact Us</a></li>
              <li><a href="/developers">API for Developers</a></li>
            </ul>
            <p>
              Visit <a href="https://soul-step.org">soul-step.org</a> with JavaScript enabled for
              the full experience.
            </p>
          </div>
        </noscript>
        {/* AppClientShell is a 'use client' component that wraps all providers + page content */}
        <AppClientShell>{children}</AppClientShell>
      </body>
    </html>
  );
}
