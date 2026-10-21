import { useState } from 'react';
import { toast } from 'sonner';
import {
  Camera,
  Download,
  FileJson,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportPlanPng } from '@/export/export-png';
import { exportProjectJson, parseProjectFile, pickProjectFile } from '@/export/project-file';
import { captureScene, hasScene } from '@/export/screenshot-3d';
import { adoptImportedProject, saveNow } from '@/services/useProjectSync';
import { useEditorStore } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';

export function ExportMenu(): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const viewMode = useEditorStore((state) => state.viewMode);

  const run = async (key: string, task: () => Promise<void> | void): Promise<void> => {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      toast.error('A operação falhou.', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const handlePng = (): Promise<void> =>
    run('png', async () => {
      const { plan, name } = useProjectStore.getState();
      await exportPlanPng(plan, name, {
        showDimensions: useEditorStore.getState().dimensionsVisible,
        showFurniture: useEditorStore.getState().furnitureVisible,
      });
      toast.success('Planta exportada em PNG.');
    });

  const handleScreenshot = (): Promise<void> =>
    run('screenshot', async () => {
      const { name } = useProjectStore.getState();
      captureScene(name);
      toast.success('Captura da vista 3D salva.');
    });

  const handleJson = (): Promise<void> =>
    run('json', () => {
      const project = useProjectStore.getState().toProject();
      exportProjectJson(project);
      toast.success('Projeto exportado em JSON.');
    });

  const handleImport = (): Promise<void> =>
    run('import', async () => {
      const raw = await pickProjectFile();
      if (raw === null) return;

      const parsed = parseProjectFile(raw);
      if (!parsed.project) {
        toast.error('Arquivo inválido.', {
          description: parsed.errors.slice(0, 3).join('\n'),
        });
        return;
      }

      const imported = await adoptImportedProject(parsed.project);
      toast.success(`"${imported.name}" importado.`);
    });

  const handleSave = (): Promise<void> =>
    run('save', async () => {
      await saveNow();
      toast.success('Projeto salvo.');
    });

  const icon = busy ? <Loader2 className="animate-spin" /> : <Download />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={busy !== null}>
          {icon}
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Projeto</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void handleSave()}>
          <Save />
          Salvar agora
          <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleJson()}>
          <FileJson />
          Exportar JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleImport()}>
          <FileUp />
          Importar JSON…
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Imagens</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void handlePng()}>
          <ImageIcon />
          Planta em PNG
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void handleScreenshot()}
          disabled={viewMode === '2d' || !hasScene()}
        >
          <Camera />
          Captura da vista 3D
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
