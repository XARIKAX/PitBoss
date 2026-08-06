'use client';

import { useState } from 'react';
import { Markdown } from '@/components/Markdown';
import type { DocEntry } from '@/lib/docs';

/** Docs viewer: sticky sidebar of docs + rendered markdown body. */
export function DocsViewer({ docs }: { docs: DocEntry[] }) {
  const [active, setActive] = useState(docs[0]?.slug ?? '');
  const current = docs.find((d) => d.slug === active) ?? docs[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <nav className="flex flex-row flex-wrap gap-2 lg:flex-col">
          {docs.map((d) => (
            <button
              key={d.slug}
              onClick={() => setActive(d.slug)}
              className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                d.slug === active ? 'bg-ink text-lime' : 'text-mute hover:bg-ink/60 hover:text-paper'
              }`}
            >
              {d.title}
            </button>
          ))}
        </nav>
      </aside>

      <article className="min-w-0">
        {current ? <Markdown source={current.body} /> : <p className="text-mute">No docs found.</p>}
      </article>
    </div>
  );
}
