import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Section({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section
      className={cn('space-y-3 border-b border-border px-4 py-4 last:border-b-0', className)}
    >
      {title ? (
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

export function FieldRow({ children }: { children: ReactNode }): JSX.Element {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

export function InspectorHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="border-b border-border px-4 py-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-primary/80">{eyebrow}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}
