'use client';

import { PartyPopper } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { NotificationItem } from './assignment-popup';

const COLORS = ['#ff5d5d', '#ffb347', '#ffe066', '#7ee081', '#5fd3f3', '#8f7bff', '#ff7ac6', '#ffffff'];

/** Fireworks across the whole screen for a few seconds. Nothing moves for people who ask for less motion. */
function Fireworks() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      element.width = window.innerWidth * ratio;
      element.height = window.innerHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
    type Rocket = { x: number; y: number; vy: number; targetY: number; color: string };
    const sparks: Spark[] = [];
    const rockets: Rocket[] = [];
    const width = () => window.innerWidth;
    const height = () => window.innerHeight;
    const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)];

    const burst = (x: number, y: number, color: string) => {
      const count = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 2 + Math.random() * 4.5;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          max: 55 + Math.random() * 35,
          color: Math.random() < 0.25 ? pick() : color,
          size: 1.6 + Math.random() * 1.8,
        });
      }
    };
    const launch = () =>
      rockets.push({ x: width() * (0.15 + Math.random() * 0.7), y: height(), vy: -(9 + Math.random() * 4), targetY: height() * (0.15 + Math.random() * 0.35), color: pick() });

    // About two and a half seconds of launches, then the last sparks fade out.
    let launched = 0;
    const timer = window.setInterval(() => {
      launch();
      if (Math.random() < 0.5) launch();
      launched += 1;
      if (launched >= 9) window.clearInterval(timer);
    }, 280);
    launch();
    launch();

    let frame = 0;
    const start = performance.now();
    const draw = () => {
      context.globalCompositeOperation = 'destination-out';
      context.fillStyle = 'rgba(0, 0, 0, 0.22)';
      context.fillRect(0, 0, width(), height());
      context.globalCompositeOperation = 'lighter';

      for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const rocket = rockets[i];
        rocket.y += rocket.vy;
        rocket.vy *= 0.985;
        context.fillStyle = rocket.color;
        context.beginPath();
        context.arc(rocket.x, rocket.y, 2.2, 0, Math.PI * 2);
        context.fill();
        if (rocket.y <= rocket.targetY || rocket.vy > -2) {
          burst(rocket.x, rocket.y, rocket.color);
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.life += 1;
        spark.vx *= 0.975;
        spark.vy = spark.vy * 0.975 + 0.06;
        spark.x += spark.vx;
        spark.y += spark.vy;
        const fade = 1 - spark.life / spark.max;
        if (fade <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        context.globalAlpha = fade;
        context.fillStyle = spark.color;
        context.beginPath();
        context.arc(spark.x, spark.y, spark.size * fade + 0.4, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (performance.now() - start < 6000 && (rockets.length > 0 || sparks.length > 0 || launched < 9)) {
        frame = requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, width(), height());
      }
    };
    frame = requestAnimationFrame(draw);

    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvas} className="fireworks" aria-hidden />;
}

/** Fireworks and a "Well done!" card for finished work. */
export function Celebration({ items, busy, onClose }: { items: NotificationItem[]; busy: boolean; onClose: (goTo: string | null) => void }) {
  const project = items.some((item) => item.title.includes('Project'));
  return (
    <>
      <Fireworks />
      <div className="popup-back celebrate-back" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
        <div className="popup celebrate">
          <span className="celebrate-icon" aria-hidden>
            <PartyPopper size={30} />
          </span>
          <h2 id="celebrate-title">Well done!</h2>
          <p className="celebrate-lead">
            {project
              ? 'The project is complete. Great work, everyone.'
              : items.length === 1
                ? 'Your work was approved. Great job.'
                : `${items.length} pieces of your work were approved. Great job.`}
          </p>
          <ul className="celebrate-list">
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.title.replace(/^Well done! /, '')}</span>
                <strong>{item.body}</strong>
              </li>
            ))}
          </ul>
          <div className="popup-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => onClose(null)}>
              Thanks!
            </button>
            {items.length === 1 && items[0].href ? (
              <button type="button" disabled={busy} onClick={() => onClose(items[0].href)}>
                Open it
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
