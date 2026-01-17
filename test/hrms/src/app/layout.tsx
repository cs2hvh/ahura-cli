import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { GAME_INFO } from '@/lib/constants';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: `${GAME_INFO.title} - ${GAME_INFO.tagline}`,
  description: GAME_INFO.description,
  keywords: ['cartoon game', 'adventure game', 'RPG', 'mobile game', 'online game', 'multiplayer'],
  authors: [{ name: GAME_INFO.title }],
  creator: GAME_INFO.title,
  publisher: GAME_INFO.title,
  metadataBase: new URL('https://adventurequest.com'),
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://adventurequest.com',
    title: `${GAME_INFO.title} - ${GAME_INFO.tagline}`,
    description: GAME_INFO.description,
    siteName: GAME_INFO.title,
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: `${GAME_INFO.title} - Epic Adventure Game`
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: `${GAME_INFO.title} - ${GAME_INFO.tagline}`,
    description: GAME_INFO.description,
    images: ['/images/og-image.jpg'],
    creator: '@adventurequest'
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  },
  manifest: '/site.webmanifest',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: GAME_INFO.title,
    description: GAME_INFO.description,
    genre: ['Adventure', 'RPG', 'Action'],
    gamePlatform: ['iOS', 'Android', 'Web'],
    applicationCategory: 'Game',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '15000',
      bestRating: '5',
      worstRating: '1'
    },
    publisher: {
      '@type': 'Organization',
      name: GAME_INFO.title,
      url: 'https://adventurequest.com'
    }
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
