import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: '365 Management',
  description: 'Projects, logistics, cash flow and team rewards in one place.',
  applicationName: '365 Frames',
  // On iPhone and iPad: open full screen from the home screen, with this name under the icon.
  appleWebApp: { capable: true, title: '365 Frames', statusBarStyle: 'black' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Keeps phones from zooming in on a field when it is tapped, so form text can stay the same size as the rest.
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

// Runs before the page paints, so the saved theme never flashes the wrong way.
// With nothing saved, the device's own light or dark setting is used.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

// The opening animation plays only when the app is started: the first page of
// a new session, arrived at from outside the app. Moving between pages,
// reloading, going back or returning to the app never plays it again. The
// splash is hidden unless this script switches it on, and it removes itself.
const splashScript = `(function(){try{var d=document.documentElement,s=sessionStorage;if(s.getItem('opened'))return;s.setItem('opened','1');var n=performance.getEntriesByType('navigation')[0];if(n&&n.type!=='navigate')return;if(document.referrer&&document.referrer.indexOf(location.origin)===0)return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.dataset.splash='1';setTimeout(function(){delete d.dataset.splash;var e=document.querySelector('.splash');if(e)e.style.display='none';},1300);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
      </head>
      <body>
        {/* Opening animation: the logo with a soft glow, fading into the app. Decorative only. */}
        <div className="splash" aria-hidden>
          <div className="splash-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={188} height={56} className="splash-logo" />
        </div>
        {children}
      </body>
    </html>
  );
}
