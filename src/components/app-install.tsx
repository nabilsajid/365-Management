'use client';

import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Registers the service worker and offers to install the app.
 *
 * In the top bar the button appears only where the browser offers a one-tap
 * install. On the login page it is always there (unless the app is already
 * installed and open): where the browser has no one-tap install, such as
 * Safari on iPhone, tapping it shows how to add the app by hand.
 */
export function AppInstall({ variant = 'bar' }: { variant?: 'bar' | 'login' }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Without it the site still works; only the offline page is lost.
      });
    }
    // Opened from the home screen or as an installed window: nothing to offer.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setHelp((value) => !value);
      return;
    }
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    setPrompt(null);
  }

  if (variant === 'login') {
    if (installed) return null;
    return (
      <div className="install-box">
        <button type="button" className="install" onClick={install} aria-expanded={prompt ? undefined : help}>
          <Download size={15} aria-hidden />
          Install the app
        </button>
        {help && !prompt ? (
          <ul className="install-help">
            <li>
              <strong>iPhone or iPad:</strong> open this page in Safari, tap Share, then “Add to Home Screen”.
            </li>
            <li>
              <strong>Android:</strong> open the browser menu (⋮) and tap “Install app” or “Add to Home screen”.
            </li>
            <li>
              <strong>Computer:</strong> in Chrome or Edge, click the install icon at the end of the address bar.
            </li>
          </ul>
        ) : null}
      </div>
    );
  }

  if (!prompt) return null;

  return (
    <button
      type="button"
      onClick={install}
      title="Install 365 Frames as an app on this device"
      className="flex h-9 items-center gap-2 rounded-control border border-line-strong px-3 text-[13px] font-medium text-ink transition-colors duration-100 hover:bg-subtle active:scale-95"
    >
      <Download size={15} aria-hidden />
      <span className="hidden sm:inline">Install app</span>
    </button>
  );
}
