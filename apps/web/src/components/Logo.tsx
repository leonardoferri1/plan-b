import { cn } from '@/lib/utils';

/**
 * The Plan B mark: an isometric cube drawn from three rhombi, echoing the extruded volumes
 * the product builds. Rendered as inline SVG so it inherits colour and stays crisp at any size.
 */
export function Logo({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('size-7', className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" className="fill-primary/12" />
      <path
        d="M16 5.5 27 11.75v8.5L16 26.5 5 20.25v-8.5L16 5.5Z"
        className="stroke-primary"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M16 5.5 27 11.75 16 18 5 11.75 16 5.5Z" className="fill-primary/70" />
      <path d="M16 18v8.5L5 20.25v-8.5L16 18Z" className="fill-primary/25" />
      <path d="M16 18v8.5l11-6.25v-8.5L16 18Z" className="fill-primary/40" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }): JSX.Element {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Logo className="size-6" />
      <span className="text-sm font-semibold tracking-tight">Plan B</span>
    </span>
  );
}
