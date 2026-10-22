import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Copy, HardDrive, Plus, Server, Trash2 } from 'lucide-react';
import { createEmptyProject, createSampleProject, formatArea } from '@plan-b/shared';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { getRepository } from '@/services/repository';
import { openProject, useBackendStatus } from '@/services/useProjectSync';
import { setLastProjectId } from '@/services/workspace';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function StorageBadge({ remote }: { remote: boolean }): JSX.Element {
  const Icon = remote ? Server : HardDrive;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium',
        remote
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-border bg-surface-raised text-muted-foreground',
      )}
    >
      <Icon className="size-3" />
      {remote ? 'Salvando no servidor' : 'Salvando neste navegador'}
    </span>
  );
}

export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const backend = useBackendStatus();
  const currentId = useProjectStore((state) => state.projectId);

  const projects = useQuery({
    queryKey: ['projects', backend.available],
    queryFn: () => getRepository().list(),
    enabled: backend.resolved,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const create = useMutation({
    mutationFn: async (kind: 'empty' | 'sample') => {
      const project = kind === 'empty' ? createEmptyProject() : createSampleProject();
      return getRepository().create({
        ...project,
        id: `pr_${Math.random().toString(36).slice(2, 10)}`,
        name: kind === 'empty' ? 'Novo projeto' : 'Apartamento Aurora',
      });
    },
    onSuccess: (project) => {
      useProjectStore.getState().loadProject(project);
      setLastProjectId(project.id);
      invalidate();
      navigate('/');
    },
    onError: (error: Error) =>
      toast.error('Não foi possível criar o projeto.', {
        description: error.message,
      }),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => getRepository().duplicate(id),
    onSuccess: (project) => {
      toast.success(`"${project.name}" criado.`);
      invalidate();
    },
    onError: (error: Error) => toast.error('Falha ao duplicar.', { description: error.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => getRepository().remove(id),
    onSuccess: () => {
      toast.success('Projeto excluído.');
      invalidate();
    },
    onError: (error: Error) => toast.error('Falha ao excluir.', { description: error.message }),
  });

  const open = async (id: string): Promise<void> => {
    const ok = await openProject(id);
    if (ok) navigate('/');
    else toast.error('Projeto não encontrado.');
  };

  const items = projects.data ?? [];

  return (
    <div className="min-h-dvh bg-surface-base text-foreground">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-surface-panel/95 px-4 backdrop-blur">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar ao editor"
          onClick={() => navigate('/')}
        >
          <ArrowLeft />
        </Button>
        <Logo className="size-6" />
        <span className="text-sm font-semibold tracking-tight">Projetos</span>
        <div className="flex-1" />
        <StorageBadge remote={backend.available} />
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Seus projetos</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {backend.available
                ? 'Este é um espaço de demonstração anônimo, identificado apenas por um código guardado neste navegador. Os dados são descartáveis e podem ser removidos a qualquer momento.'
                : 'O servidor não está disponível, então os projetos ficam salvos no armazenamento deste navegador. Exporte o JSON para não perder seu trabalho.'}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => create.mutate('sample')}
              disabled={create.isPending}
            >
              Usar o apartamento demo
            </Button>
            <Button onClick={() => create.mutate('empty')} disabled={create.isPending}>
              <Plus />
              Novo projeto
            </Button>
          </div>
        </div>

        {projects.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-xl border border-border bg-surface-panel"
              />
            ))}
          </div>
        ) : null}

        {projects.isError ? (
          <div className="panel p-8 text-center">
            <p className="text-sm font-medium">Não foi possível listar os projetos.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(projects.error as Error).message}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => projects.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {projects.isSuccess && items.length === 0 ? (
          <div className="panel bg-grid flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Logo className="size-10 opacity-70" />
            <h2 className="text-sm font-semibold">Nenhum projeto por aqui ainda</h2>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Comece com uma planta em branco ou carregue o apartamento de demonstração para
              explorar o editor.
            </p>
            <Button size="sm" className="mt-2" onClick={() => create.mutate('sample')}>
              Abrir o apartamento demo
            </Button>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((project) => (
              <li
                key={project.id}
                className={cn(
                  'panel group flex flex-col justify-between p-4 transition-colors hover:border-primary/40',
                  project.id === currentId && 'border-primary/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => void open(project.id)}
                  className="text-left focus-visible:outline-none"
                >
                  <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    Atualizado em {dateFormatter.format(new Date(project.updatedAt))}
                  </p>

                  <dl className="tabular mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Ambientes', value: String(project.stats.rooms) },
                      { label: 'Área', value: formatArea(project.stats.floorArea) },
                      { label: 'Móveis', value: String(project.stats.furniture) },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-md bg-surface-raised px-1.5 py-2">
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {stat.label}
                        </dt>
                        <dd className="mt-0.5 truncate text-xs font-medium">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>
                </button>

                <div className="mt-4 flex items-center gap-1">
                  <Button size="xs" variant="subtle" onClick={() => void open(project.id)}>
                    Abrir
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Duplicar ${project.name}`}
                    disabled={duplicate.isPending}
                    onClick={() => duplicate.mutate(project.id)}
                  >
                    <Copy />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Excluir ${project.name}`}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir "${project.name}"? Esta ação não pode ser desfeita.`,
                        )
                      ) {
                        remove.mutate(project.id);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
