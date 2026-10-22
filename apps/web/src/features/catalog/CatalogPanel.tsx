import { useMemo, useState } from 'react';
import { ChevronLeft, PanelLeftOpen, Search } from 'lucide-react';
import {
  FURNITURE_CATALOG,
  FURNITURE_CATEGORIES,
  formatCentimeters,
  type CatalogItem,
} from '@plan-b/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HintTooltip } from '@/components/ui/tooltip';
import { FurniturePreview } from '@/components/FurniturePreview';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function CatalogCard({ item }: { item: CatalogItem }): JSX.Element {
  const armed = useEditorStore((state) => state.pendingCatalogId === item.id);
  const armCatalogItem = useEditorStore((state) => state.armCatalogItem);

  return (
    <HintTooltip side="right" label={item.description}>
      <button
        type="button"
        draggable
        aria-pressed={armed}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-plan-b-item', item.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => armCatalogItem(armed ? null : item.id)}
        className={cn(
          'group flex flex-col gap-1.5 rounded-lg border border-border/70 bg-surface-raised p-2 text-left transition-all',
          'hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          armed && 'border-primary bg-primary/10 ring-1 ring-primary/40',
        )}
      >
        <span className="relative block h-16 w-full overflow-hidden rounded-md bg-gradient-to-b from-surface-sunken to-surface-panel">
          <FurniturePreview catalogId={item.id} className="p-1.5" />
        </span>

        <span className="block truncate text-2xs font-medium leading-tight text-foreground/90">
          {item.name}
        </span>
        <span className="tabular block text-[10px] leading-none text-muted-foreground">
          {formatCentimeters(item.defaultSize.width)} × {formatCentimeters(item.defaultSize.depth)}
        </span>
      </button>
    </HintTooltip>
  );
}

export function CatalogPanel(): JSX.Element {
  const open = useEditorStore((state) => state.catalogOpen);
  const setOpen = useEditorStore((state) => state.setCatalogOpen);
  const pendingCatalogId = useEditorStore((state) => state.pendingCatalogId);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('todos');

  const items = useMemo(() => {
    const term = normalize(query.trim());
    return FURNITURE_CATALOG.filter((item) => {
      if (category !== 'todos' && item.category !== category) return false;
      if (!term) return true;
      return normalize(item.name).includes(term) || normalize(item.description).includes(term);
    });
  }, [category, query]);

  if (!open) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-border bg-surface-panel py-3">
        <HintTooltip label="Abrir catálogo">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Abrir catálogo"
            onClick={() => setOpen(true)}
          >
            <PanelLeftOpen />
          </Button>
        </HintTooltip>
      </div>
    );
  }

  return (
    <aside
      aria-label="Catálogo de móveis"
      className="flex w-64 shrink-0 flex-col border-r border-border bg-surface-panel"
    >
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Catálogo
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Recolher catálogo"
          onClick={() => setOpen(false)}
        >
          <ChevronLeft />
        </Button>
      </div>

      <div className="px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar móveis…"
            aria-label="Buscar móveis"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {FURNITURE_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setCategory(entry.id)}
            aria-pressed={category === entry.id}
            className={cn(
              'rounded-full border border-transparent px-2 py-[3px] text-[10px] font-medium transition-colors',
              category === entry.id
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'bg-surface-raised text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            Nenhuma peça encontrada para “{query}”.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 pt-1">
            {items.map((item) => (
              <CatalogCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </ScrollArea>

      <p className="border-t border-border px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        {pendingCatalogId
          ? 'Clique na planta para posicionar. R gira 90°, Esc cancela.'
          : 'Arraste para a planta ou clique numa peça para armá-la.'}
      </p>
    </aside>
  );
}
