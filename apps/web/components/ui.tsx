/**
 * Small shared presentational primitives used across the app routes.
 * Kept server-safe (no hooks) so any page can import them.
 */
import Link from 'next/link';

/** Page header with mono eyebrow, serif headline (lime emphasis words), lede. */
export function PageHeader({
  eyebrow,
  title,
  emphasis,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  emphasis?: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="shell pt-14">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="headline mt-3 text-section text-balance">
        {title} {emphasis ? <span className="em">{emphasis}</span> : null}
      </h1>
      {lede ? <p className="mt-4 max-w-2xl text-mute">{lede}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}

/** Section wrapper with a mono label + serif sub-heading. */
export function Section({
  label,
  title,
  emphasis,
  children,
  className = '',
}: {
  label?: string;
  title?: string;
  emphasis?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`shell py-10 ${className}`}>
      {label ? <p className="eyebrow">{label}</p> : null}
      {title ? (
        <h2 className="headline mt-2 text-2xl sm:text-3xl">
          {title} {emphasis ? <span className="em">{emphasis}</span> : null}
        </h2>
      ) : null}
      <div className={label || title ? 'mt-6' : ''}>{children}</div>
    </section>
  );
}

/** Empty state that instructs. Use where contract reads aren't wired yet. */
export function EmptyState({
  title,
  hint,
  cta,
  todo,
}: {
  title: string;
  hint: string;
  cta?: { href: string; label: string };
  todo?: string;
}) {
  return (
    <div className="card flex flex-col items-start gap-3">
      <p className="font-serif text-xl">{title}</p>
      <p className="max-w-prose text-sm text-mute">{hint}</p>
      {cta ? (
        <Link href={cta.href} className="pill-ghost mt-1">
          {cta.label}
        </Link>
      ) : null}
      {todo ? <TodoTag>{todo}</TodoTag> : null}
    </div>
  );
}

/** Clearly-marked placeholder tag for contract wiring points. */
export function TodoTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="data inline-flex items-center gap-1.5 rounded-md border border-lime/40 bg-lime/5 px-2 py-1 text-[11px] uppercase tracking-wider text-lime">
      TODO · {children}
    </span>
  );
}

/** A labelled stat tile. `mono` renders the value in the data font. */
export function Stat({
  label,
  value,
  sub,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="card">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 text-2xl ${mono ? 'data' : 'font-serif'}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-mute">{sub}</p> : null}
    </div>
  );
}

/** Simple pill-style link button. */
export function PillLink({
  href,
  children,
  variant = 'lime',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'lime' | 'ghost' | 'ink';
}) {
  const cls = variant === 'lime' ? 'pill-lime' : variant === 'ink' ? 'pill-ink' : 'pill-ghost';
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
