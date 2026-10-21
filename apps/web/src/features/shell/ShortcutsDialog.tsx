import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor-store';
import { formatShortcut } from '@/lib/utils';

interface ShortcutGroup {
  title: string;
  items: { keys: string; description: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Ferramentas',
    items: [
      { keys: 'V', description: 'Selecionar' },
      { keys: 'P', description: 'Desenhar parede' },
      { keys: 'A', description: 'Ambiente retangular' },
      { keys: 'D', description: 'Porta' },
      { keys: 'J', description: 'Janela' },
      { keys: 'M', description: 'Móveis' },
      { keys: 'T', description: 'Medir distância' },
    ],
  },
  {
    title: 'Edição',
    items: [
      { keys: 'Ctrl+Z', description: 'Desfazer' },
      { keys: 'Ctrl+Shift+Z', description: 'Refazer' },
      { keys: 'Ctrl+D', description: 'Duplicar móvel' },
      { keys: 'Ctrl+A', description: 'Selecionar tudo' },
      { keys: 'Delete', description: 'Excluir seleção' },
      { keys: '[  ]', description: 'Girar móvel 15°' },
      { keys: '↑ ↓ ← →', description: 'Mover 5 cm' },
      { keys: 'Shift + setas', description: 'Mover 1 módulo da grade' },
      { keys: 'R', description: 'Girar a peça antes de posicionar' },
      { keys: 'Esc', description: 'Cancelar / limpar seleção' },
    ],
  },
  {
    title: 'Visualização',
    items: [
      { keys: '1 / 2 / 3', description: 'Planta, 3D, dividido' },
      { keys: 'G', description: 'Mostrar grade' },
      { keys: 'C', description: 'Mostrar cotas' },
      { keys: 'H', description: 'Mostrar móveis' },
      { keys: 'Shift+F', description: 'Enquadrar planta' },
      { keys: 'Espaço + arrastar', description: 'Mover a vista' },
      { keys: 'Scroll', description: 'Aproximar e afastar' },
    ],
  },
];

export function ShortcutsDialog(): JSX.Element {
  const open = useEditorStore((state) => state.shortcutsOpen);
  const setOpen = useEditorStore((state) => state.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Atalhos do teclado</DialogTitle>
          <DialogDescription>
            Todas as ações principais do editor têm equivalente no teclado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-7 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <dl className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-foreground/80">{item.description}</dt>
                    <dd>
                      <kbd className="whitespace-nowrap rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {formatShortcut(item.keys)}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
