/**
 * Shared presentational primitives — terminal-trading design system.
 * Server-safe (no hooks) so any page can import them.
 */
import Link from 'next/link';

/**
 * Page header: dashed lime frame, bold uppercase mono title with a blinking
 * terminal cursor, one-line sub. The signature move of the design.
 */
export function PageHeader({
  eyebrow,
  title,
  emphasis,
  lede,
  children,
}: {
  eyebrow?: string;
  title: string;
  emphasis?: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="shell pt-6">
      <div className="dashed bg-ink/60 px-6 py-5">
        {eyebrow ? <p className="label-lime mb-1.5">{eyebrow}</p> : null}
        <h1 className="headline text-h1">
          {title}
          {emphasis ? <span className="em"> {emphasis}</span> : null}
          <span className="cursor" aria-hidden />
        </h1>
        {lede ? <p className="mt-2 max-w-3xl text-[13px] text-mute">{lede}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </header>
  );
}

/** Section wrapper: small dashed side-tab label + bold mono sub-heading. */
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
    <section className={`shell py-8 ${className}`}>
      {label ? (
        <p className="label-lime mb-2 flex items-center gap-2">
          <span className="inline-block h-px w-5 bg-lime/60" />
          {label}
        </p>
      ) : null}
      {title ? (
        <h2 className="headline text-h2">
          {title}
          {emphasis ? <span className="em"> {emphasis}</span> : null}
        </h2>
      ) : null}
      <div className={label || title ? 'mt-5' : ''}>{children}</div>
    </section>
  );
}

/** Empty state that instructs. Dashed frame, terminal voice. */
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
    <div className="dashed flex flex-col items-center gap-3 bg-ink/40 px-6 py-10 text-center">
      <p className="headline text-lg">{title}</p>
      <p className="max-w-prose text-[12.5px] text-mute">{hint}</p>
      {cta ? (
        <Link href={cta.href} className="btn-ghost mt-1">
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
    <span className="chip chip-lime bg-lime/5">TODO · {children}</span>
  );
}

/** Labelled stat tile: dim label over a big tabular value. */
export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="panel panel-hover px-5 py-4">
      <p className="label">{label}</p>
      <p className="num mt-1.5 font-mono text-[22px] font-semibold text-lime">{value}</p>
      {sub ? <p className="mt-0.5 text-[11.5px] text-mute">{sub}</p> : null}
    </div>
  );
}

/** Button-styled link. */
export function PillLink({
  href,
  children,
  variant = 'lime',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'lime' | 'ghost' | 'ink';
}) {
  const cls = variant === 'lime' ? 'btn-lime' : variant === 'ink' ? 'pill-ink' : 'btn-ghost';
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
