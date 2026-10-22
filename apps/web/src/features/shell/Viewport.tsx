import { useCallback, useRef, useState } from 'react';
import { currentLevel } from '@plan-b/shared';
import { PlanCanvas } from '@/canvas2d/PlanCanvas';
import { SceneCanvas } from '@/viewer3d/SceneCanvas';
import { useEditorStore } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import { clamp } from '@/lib/utils';
import { PlanEmptyState } from './PlanEmptyState';

const MIN_RATIO = 0.22;
const MAX_RATIO = 0.78;

/**
 * Hosts the canvases and the split-view divider.
 *
 * The 3D canvas is unmounted outside of 3D and split mode on purpose: a WebGL context, its
 * shadow maps and the environment cube are not worth keeping alive behind a 2D plan, and
 * `SceneCanvas` releases every cached material and geometry when it goes away.
 */
export function Viewport(): JSX.Element {
  const viewMode = useEditorStore((state) => state.viewMode);
  const empty = useProjectStore((state) => {
    const level = currentLevel(state.plan);
    return level.walls.length === 0 && level.furniture.length === 0;
  });
  const [ratio, setRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleDividerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setRatio(clamp((event.clientX - rect.left) / rect.width, MIN_RATIO, MAX_RATIO));
  }, []);

  if (viewMode === '2d') {
    return (
      <div className="relative size-full" data-plan-canvas>
        <PlanCanvas />
        {empty ? <PlanEmptyState /> : null}
      </div>
    );
  }

  if (viewMode === '3d') {
    return <SceneCanvas />;
  }

  return (
    <div ref={containerRef} className="flex size-full">
      <div className="relative min-w-0" style={{ width: `${ratio * 100}%` }} data-plan-canvas>
        <PlanCanvas />
        {empty ? <PlanEmptyState /> : null}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar divisão entre planta e 3D"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        tabIndex={0}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={handleDividerMove}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft')
            setRatio((value) => clamp(value - 0.04, MIN_RATIO, MAX_RATIO));
          if (event.key === 'ArrowRight')
            setRatio((value) => clamp(value + 0.04, MIN_RATIO, MAX_RATIO));
        }}
        className="group relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary focus-visible:bg-primary"
      >
        <span className="absolute inset-y-0 -left-2 -right-2" />
      </div>

      <div className="min-w-0 flex-1">
        <SceneCanvas />
      </div>
    </div>
  );
}
