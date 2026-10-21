import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EditorPage } from '@/pages/EditorPage';
import { ProjectsPage } from '@/pages/ProjectsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  { path: '/', element: <EditorPage /> },
  { path: '/projeto/:projectId', element: <EditorPage /> },
  { path: '/projetos', element: <ProjectsPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={320} skipDelayDuration={120}>
        <RouterProvider router={router} />
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast: 'bg-surface-raised border border-border text-foreground shadow-float text-sm',
              description: 'text-muted-foreground',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
