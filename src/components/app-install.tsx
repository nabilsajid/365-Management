'use client';

import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Registers the service worker and, where the browser offers it, shows an
 * "Install app" button. Nothing is shown once the app is installed, or in
 * browsers (such as Safari on iPhone) that only install from their own menu.
 */
export function AppInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Without it the site still works; only the offline page is lost.
      });
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    setPrompt(null);
  }

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
