import { useEffect, useId, useState } from 'react';
import { parseMeters } from '@spacecraft/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface NumberFieldProps {
  label: string;
  /** Canonical value in meters (or degrees when `unit` says so). */
  value: number;
  onChange: (value: number) => void;
  /** Multiplier applied for display: 100 shows meters as centimeters. */
  displayFactor?: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * A numeric input that keeps a text draft while the user types and only commits a valid,
 * clamped value on blur or Enter — so typing "1," or deleting the whole field never pushes a
 * NaN into the document or fights the user by reformatting mid-keystroke.
 */
export function NumberField({
  label,
  value,
  onChange,
  displayFactor = 1,
  unit,
  min,
  max,
  step = 1,
  decimals = 0,
  disabled,
  className,
}: NumberFieldProps): JSX.Element {
  const id = useId();
  const format = (input: number): string =>
    (input * displayFactor).toFixed(decimals).replace('.', ',');

  const [draft, setDraft] = useState(() => format(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(format(value));
    // `format` is derived from props that are already in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, displayFactor, decimals]);

  const commit = (raw: string): void => {
    const parsed = parseMeters(raw);
    if (parsed === null) {
      setDraft(format(value));
      return;
    }

    let next = parsed / displayFactor;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);

    onChange(next);
    setDraft(format(next));
  };

  const nudge = (direction: number): void => {
    const next = value + (direction * step) / displayFactor;
    commit(format(next));
  };

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            setFocused(false);
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit(event.currentTarget.value);
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              setDraft(format(value));
              event.currentTarget.blur();
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              nudge(event.shiftKey ? 10 : 1);
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              nudge(event.shiftKey ? -10 : -1);
            }
          }}
          className={cn('tabular pr-9', unit && 'pr-10')}
        />
        {unit ? (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
