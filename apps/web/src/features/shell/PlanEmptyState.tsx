import { Frame, PenLine, Sofa } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor-store';

const STEPS = [
  {
    icon: Frame,
    title: 'Comece por um ambiente',
    body: 'Arraste um retângulo na planta para fechar quatro paredes de uma vez.',
    tool: 'room' as const,
    shortcut: 'A',
  },
  {
    icon: PenLine,
    title: 'Ou desenhe parede a parede',
    body: 'Clique em dois pontos. Continue clicando para encadear o traçado.',
    tool: 'wall' as const,
    shortcut: 'P',
  },
  {
    icon: Sofa,
    title: 'Depois mobilie',
    body: 'Arraste peças do catálogo para dentro dos ambientes criados.',
    tool: 'furniture' as const,
    shortcut: 'M',
  },
];

/**
 * Shown over the plan when the level has no geometry at all.
 *
 * A blank grid gives a first-time visitor nothing to act on, so the empty state names the two
 * ways to start and hands the tool over directly. Only the buttons take pointer events: the
 * card must never swallow a drag aimed at the canvas it is floating over.
 */
export function PlanEmptyState(): JSX.Element {
  const setTool = useEditorStore((state) => state.setTool);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
      <div className="max-w-md rounded-xl border border-border bg-surface-panel/85 p-6 shadow-float backdrop-blur">
        <h2 className="text-sm font-semibold tracking-tight">Planta em branco</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Nada foi desenhado ainda. Os ambientes aparecem sozinhos assim que um ciclo de paredes se
          fecha.
        </p>

        <ul className="mt-5 space-y-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.tool} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xs font-medium">{step.title}</h3>
                    <kbd className="rounded border border-border bg-surface-raised px-1 font-mono text-[10px] text-muted-foreground">
                      {step.shortcut}
                    </kbd>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="pointer-events-auto self-center"
                  onClick={() => setTool(step.tool)}
                >
                  Usar
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
