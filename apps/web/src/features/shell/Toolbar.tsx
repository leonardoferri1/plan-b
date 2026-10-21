import {
  AppWindow,
  DoorOpen,
  Frame,
  Grid3x3,
  MousePointer2,
  PenLine,
  Ruler,
  Sofa,
  Tag,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useEditorStore, type ToolId } from '@/store/editor-store';

interface ToolDefinition {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: LucideIcon;
  hint: string;
}

export const TOOLS: ToolDefinition[] = [
  {
    id: 'select',
    label: 'Selecionar',
    shortcut: 'V',
    icon: MousePointer2,
    hint: 'Clique para selecionar, arraste para mover.',
  },
  {
    id: 'wall',
    label: 'Parede',
    shortcut: 'P',
    icon: PenLine,
    hint: 'Clique em dois pontos. Continue clicando para encadear.',
  },
  {
    id: 'room',
    label: 'Ambiente',
    shortcut: 'A',
    icon: Frame,
    hint: 'Arraste para criar um retângulo fechado de paredes.',
  },
  {
    id: 'door',
    label: 'Porta',
    shortcut: 'D',
    icon: DoorOpen,
    hint: 'Clique sobre uma parede para encaixar a porta.',
  },
  {
    id: 'window',
    label: 'Janela',
    shortcut: 'J',
    icon: AppWindow,
    hint: 'Clique sobre uma parede para encaixar a janela.',
  },
  {
    id: 'furniture',
    label: 'Móveis',
    shortcut: 'M',
    icon: Sofa,
    hint: 'Escolha uma peça no catálogo e clique na planta.',
  },
  {
    id: 'measure',
    label: 'Medir',
    shortcut: 'T',
    icon: Ruler,
    hint: 'Arraste entre dois pontos para medir a distância.',
  },
];

function ToolButton({ tool }: { tool: ToolDefinition }): JSX.Element {
  const active = useEditorStore((state) => state.tool === tool.id);
  const setTool = useEditorStore((state) => state.setTool);
  const Icon = tool.icon;

  return (
    <HintTooltip label={tool.label} shortcut={tool.shortcut}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={tool.label}
        aria-pressed={active}
        onClick={() => setTool(tool.id)}
        className={cn(
          'relative size-10 rounded-lg text-muted-foreground transition-colors',
          active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
        )}
      >
        <Icon className="size-[18px]" />
        {active ? (
          <span className="absolute -left-[9px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
        ) : null}
      </Button>
    </HintTooltip>
  );
}

function ToggleButton({
  label,
  shortcut,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <HintTooltip label={label} shortcut={shortcut}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn('size-10 rounded-lg text-muted-foreground', active && 'text-foreground')}
      >
        <Icon className="size-[18px]" />
      </Button>
    </HintTooltip>
  );
}

export function Toolbar(): JSX.Element {
  const gridVisible = useEditorStore((state) => state.gridVisible);
  const toggleGrid = useEditorStore((state) => state.toggleGrid);
  const dimensionsVisible = useEditorStore((state) => state.dimensionsVisible);
  const toggleDimensions = useEditorStore((state) => state.toggleDimensions);
  const furnitureVisible = useEditorStore((state) => state.furnitureVisible);
  const toggleFurniture = useEditorStore((state) => state.toggleFurniture);

  return (
    <nav
      aria-label="Ferramentas"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface-panel py-3"
    >
      {TOOLS.map((tool) => (
        <ToolButton key={tool.id} tool={tool} />
      ))}

      <Separator className="my-2 w-7" />

      <ToggleButton
        label="Grade"
        shortcut="G"
        icon={Grid3x3}
        active={gridVisible}
        onClick={toggleGrid}
      />
      <ToggleButton
        label="Cotas"
        shortcut="C"
        icon={Tag}
        active={dimensionsVisible}
        onClick={toggleDimensions}
      />
      <ToggleButton
        label={furnitureVisible ? 'Ocultar móveis' : 'Mostrar móveis'}
        shortcut="H"
        icon={furnitureVisible ? Eye : EyeOff}
        active={furnitureVisible}
        onClick={toggleFurniture}
      />
    </nav>
  );
}
