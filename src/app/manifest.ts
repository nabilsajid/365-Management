import type { MetadataRoute } from 'next';

// Makes the site installable as an app: on a phone it gets a home-screen icon
// and opens full screen without the browser bars; on a computer it gets its
// own window and taskbar icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '365 Frames Management',
    short_name: '365 Frames',
    description: 'Projects, logistics, cash flow and team rewards in one place.',
    id: '/',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My Tasks', url: '/my-tasks' },
      { name: 'Mark attendance', url: '/employees?tab=attendance' },
      { name: 'Broadcasts', url: '/broadcasts' },
    ],
  };
}
