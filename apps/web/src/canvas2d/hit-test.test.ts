import { describe, expect, it } from 'vitest';
import { createSampleLevel } from '@spacecraft/shared';
import { buildScene, furnitureHandles } from './scene';
import { hitTest, hitTestRect, hitsFurniture } from './hit-test';

const scene = buildScene(createSampleLevel());

const sofa = scene.furniture.find((item) => item.id === 'f-sofa')!;

describe('hitsFurniture', () => {
  it('accepts the item centre', () => {
    expect(hitsFurniture(sofa.position, sofa)).toBe(true);
  });

  it('rejects a point outside the footprint', () => {
    expect(hitsFurniture({ x: sofa.position.x + 5, y: sofa.position.y }, sofa)).toBe(false);
  });

  it('respects rotation', () => {
    const chair = scene.furniture.find((item) => item.id === 'f-chair-1')!;
    // The chair is rotated 90°, so its depth now runs along X.
    const alongDepth = { x: chair.position.x + chair.depth / 2 - 0.02, y: chair.position.y };
    const alongWidth = { x: chair.position.x, y: chair.position.y + chair.width / 2 - 0.02 };

    expect(hitsFurniture(alongDepth, chair)).toBe(true);
    expect(hitsFurniture(alongWidth, chair)).toBe(true);
  });
});

describe('hitTest', () => {
  it('picks furniture over the room it stands on', () => {
    const hit = hitTest(scene, sofa.position, { tolerance: 0.1 });

    expect(hit?.ref).toEqual({ kind: 'furniture', id: 'f-sofa' });
  });

  it('falls through to the room on empty floor', () => {
    const hit = hitTest(scene, { x: 4.6, y: 3.6 }, { tolerance: 0.1 });

    expect(hit?.ref.kind).toBe('room');
  });

  it('picks a wall when the probe lands on it', () => {
    // The north facade runs along y = 0.
    const hit = hitTest(scene, { x: 2.8, y: 0 }, { tolerance: 0.05 });

    expect(hit?.ref.kind).toBe('wall');
  });

  it('prefers an opening to the wall hosting it', () => {
    const opening = scene.openings.find((candidate) => candidate.id === 'o-liv-1')!;
    const hit = hitTest(scene, opening.center, { tolerance: 0.05 });

    expect(hit?.ref).toEqual({ kind: 'opening', id: 'o-liv-1' });
  });

  it('prefers a visible node handle to everything else', () => {
    const hit = hitTest(
      scene,
      { x: 0, y: 0 },
      {
        tolerance: 0.2,
        visibleNodeIds: new Set(['n-a']),
      },
    );

    expect(hit?.ref).toEqual({ kind: 'node', id: 'n-a' });
  });

  it('ignores node handles that are not drawn', () => {
    const hit = hitTest(scene, { x: 0, y: 0 }, { tolerance: 0.2 });

    expect(hit?.ref.kind).not.toBe('node');
  });

  it('honours the ignore set', () => {
    const hit = hitTest(scene, sofa.position, {
      tolerance: 0.1,
      ignore: new Set(['furniture' as const]),
    });

    expect(hit?.ref.kind).toBe('room');
  });

  it('returns null far outside the plan', () => {
    expect(hitTest(scene, { x: -50, y: -50 }, { tolerance: 0.1 })).toBeNull();
  });

  it('picks the smaller room when two overlap at a point', () => {
    // The bathroom is the smallest space; its centre must resolve to it.
    const bathroom = scene.rooms.find((room) => room.name === 'Banheiro')!;
    const hit = hitTest(scene, bathroom.centroid, { tolerance: 0.05 });

    expect(hit?.ref).toEqual({ kind: 'room', id: bathroom.id });
  });
});

describe('hitTestRect', () => {
  it('collects the furniture whose centre falls inside the band', () => {
    const refs = hitTestRect(scene, { x: 0, y: 0 }, { x: 5.4, y: 4.2 });
    const ids = refs.filter((ref) => ref.kind === 'furniture').map((ref) => ref.id);

    expect(ids).toContain('f-sofa');
    expect(ids).not.toContain('f-bed');
  });

  it('only takes walls that are fully enclosed', () => {
    const refs = hitTestRect(scene, { x: -1, y: -1 }, { x: 10, y: 8 });

    expect(refs.filter((ref) => ref.kind === 'wall').length).toBe(scene.walls.length);
  });
});

describe('furnitureHandles', () => {
  it('places the rotation handle in front of the item', () => {
    const handles = furnitureHandles(sofa);

    // The sofa is unrotated, so "in front" is towards negative y on the plan.
    expect(handles.rotate.y).toBeLessThan(sofa.position.y);
    expect(handles.rotate.x).toBeCloseTo(sofa.position.x, 6);
  });

  it('exposes the four oriented corners', () => {
    expect(furnitureHandles(sofa).corners).toHaveLength(4);
  });
});
