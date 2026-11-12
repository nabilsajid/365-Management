'use client';

import { ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { locate, navFor } from './nav';

const STORAGE_KEY = 'sidebar-collapsed';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function SidebarNav({
  isAdmin,
  collapsed,
  pathname,
  onNavigate,
}: {
  isAdmin: boolean;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const current = locate(pathname)?.href;
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
      {navFor(isAdmin).map((group) => (
        <div key={group.title} className="mb-5">
          <p
            className={cn(
              'mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted',
              collapsed && 'sr-only',
            )}
          >
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === current;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex h-9 items-center gap-3 rounded-control px-3 text-[13px] font-medium no-underline transition-colors hover:no-underline',
                      active
                        ? 'bg-primary text-white'
                        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon size={17} aria-hidden className="shrink-0" />
                    <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ orgName, collapsed }: { orgName: string; collapsed: boolean }) {
  return (
    <div className={cn('flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary text-xs font-bold text-white">
        365
      </span>
      <span className={cn('min-w-0', collapsed && 'sr-only')}>
        <span className="block truncate text-sm font-semibold text-white">{orgName}</span>
        <span className="block text-[11px] text-sidebar-muted">Management</span>
      </span>
    </div>
  );
}

function UserMenu({ name, jobTitle, isAdmin }: { name: string; jobTitle: string | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-control py-1 pl-1 pr-2 transition-colors hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-hover">
          {initials(name) || '?'}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium text-ink">{name}</span>
          <span className="block text-[11px] text-muted">{jobTitle ?? 'No job role set'}</span>
        </span>
        <ChevronDown size={15} aria-hidden className="text-muted" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 rounded-card border border-line bg-card p-1.5 shadow-lg shadow-slate-900/5">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-[13px] font-medium text-ink">{name}</p>
            <p className="text-xs text-muted">
              {jobTitle ?? 'No job role set'} · {isAdmin ? 'Admin' : 'Employee'}
            </p>
          </div>
          <form action="/auth/signout" method="post" className="pt-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-slate-100"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  orgName,
  userName,
  jobTitle,
  isAdmin,
  children,
}: {
  orgName: string;
  userName: string;
  jobTitle: string | null;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const here = locate(pathname);

  // Remember the collapsed sidebar on this device.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '0' : '1');
      } catch {
        // Ignore: the choice just won't be remembered.
      }
      return !value;
    });
  }

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-20 hidden flex-col bg-sidebar transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16' : 'w-[250px]',
        )}
      >
        <Brand orgName={orgName} collapsed={collapsed} />
        <SidebarNav isAdmin={isAdmin} collapsed={collapsed} pathname={pathname} />
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-control px-3 text-[13px] font-medium text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
            <span className={cn(collapsed && 'sr-only')}>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 h-full w-full cursor-default bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[250px] max-w-[85vw] flex-col bg-sidebar">
            <Brand orgName={orgName} collapsed={false} />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-control text-sidebar-text hover:bg-sidebar-hover hover:text-white"
            >
              <X size={18} aria-hidden />
            </button>
            <SidebarNav isAdmin={isAdmin} collapsed={false} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-[250px]')}>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-card/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-control text-ink transition-colors hover:bg-slate-100 lg:hidden"
          >
            <Menu size={19} aria-hidden />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
            {here ? (
              <>
                <span className="hidden text-muted sm:inline">{here.group}</span>
                <ChevronRight size={14} aria-hidden className="hidden text-slate-300 sm:inline" />
                {pathname === here.href ? (
                  <span className="truncate font-medium text-ink">{here.label}</span>
                ) : (
                  <>
                    <Link href={here.href} className="truncate text-muted hover:text-ink">
                      {here.label}
                    </Link>
                    <ChevronRight size={14} aria-hidden className="text-slate-300" />
                    <span className="font-medium text-ink">Details</span>
                  </>
                )}
              </>
            ) : (
              <span className="font-medium text-ink">365 Management</span>
            )}
          </nav>
          <UserMenu name={userName} jobTitle={jobTitle} isAdmin={isAdmin} />
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
