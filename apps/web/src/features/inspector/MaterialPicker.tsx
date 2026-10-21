import { MATERIAL_PRESETS, getMaterial, type MaterialPreset } from '@spacecraft/shared';
import { Label } from '@/components/ui/label';
import { HintTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** A swatch that hints at the material's finish: grain, veins, speckle or a flat sheen. */
function Swatch({ material }: { material: MaterialPreset }): JSX.Element {
  const { color, accent, pattern } = material;

  return (
    <span
      className="relative block size-full overflow-hidden rounded-[5px]"
      style={{ background: color }}
    >
      {pattern === 'wood' ? (
        <span
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: `repeating-linear-gradient(105deg, ${accent} 0 1px, transparent 1px 5px)`,
          }}
        />
      ) : null}

      {pattern === 'marble' ? (
        <span
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: `linear-gradient(118deg, transparent 38%, ${accent} 44%, transparent 48%), linear-gradient(62deg, transparent 62%, ${accent} 66%, transparent 70%)`,
          }}
        />
      ) : null}

      {pattern === 'concrete' ? (
        <span
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: `radial-gradient(${accent} 0.5px, transparent 0.6px)`,
            backgroundSize: '4px 4px',
          }}
        />
      ) : null}

      {pattern === 'weave' ? (
        <span
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${accent} 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, ${accent} 0 1px, transparent 1px 3px)`,
          }}
        />
      ) : null}

      {pattern === 'tile' ? (
        <span
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${accent} 0 1px, transparent 1px 7px), repeating-linear-gradient(90deg, ${accent} 0 1px, transparent 1px 7px)`,
          }}
        />
      ) : null}

      {material.metalness > 0.5 ? (
        <span
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage: `linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.45) 46%, transparent 62%)`,
          }}
        />
      ) : null}
    </span>
  );
}

export function MaterialPicker({
  label = 'Material',
  value,
  onChange,
  options = MATERIAL_PRESETS,
}: {
  label?: string;
  value: string;
  onChange: (materialId: string) => void;
  options?: readonly MaterialPreset[];
}): JSX.Element {
  const current = getMaterial(value);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="truncate text-2xs text-foreground/70">{current.name}</span>
      </div>

      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((material) => {
          const selected = material.id === value;
          return (
            <HintTooltip key={material.id} side="top" label={material.name}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={material.name}
                onClick={() => onChange(material.id)}
                className={cn(
                  'aspect-square rounded-md border p-[2px] transition-all',
                  selected
                    ? 'border-primary ring-1 ring-primary/50'
                    : 'border-border/70 hover:border-muted-foreground/60',
                )}
              >
                <Swatch material={material} />
              </button>
            </HintTooltip>
          );
        })}
      </div>
    </div>
  );
}
