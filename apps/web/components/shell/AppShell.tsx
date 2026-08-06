'use client';

/**
 * App shell: fixed sidebar + top bar + content column. Holds the mobile drawer
 * state. Content is offset by the sidebar width on desktop and by the bottom
 * ticker height everywhere.
 */
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <div className="bg-field" aria-hidden />
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-[var(--sidebar-w)]">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="flex-1 pb-20">{children}</main>
      </div>
    </div>
  );
}
