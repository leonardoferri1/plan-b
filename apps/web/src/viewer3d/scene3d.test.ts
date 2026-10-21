import { describe, expect, it } from 'vitest';
import { createSampleLevel, type Level, type Opening } from '@spacecraft/shared';
import { buildScene3D, planRotationToThree } from './scene3d';

const sample = (): Level => createSampleLevel();

const doorOf = (level: Level, id: string) => {
  const scene = buildScene3D(level);
  const wall = scene.walls.find((group) => group.doors.some((door) => door.ownerId === id));
  return wall?.doors.find((door) => door.ownerId === id);
};

const setOpening = (level: Level, id: string, patch: Partial<Opening>): Level => {
  const next = JSON.parse(JSON.stringify(level)) as Level;
  const opening = next.openings.find((candidate) => candidate.id === id)!;
  Object.assign(opening, patch);
  return next;
};

describe('buildScene3D', () => {
  it('groups every wall with its own joinery', () => {
    const level = sample();
    const scene = buildScene3D(level);

    expect(scene.walls).toHaveLength(level.walls.length);

    const framed = scene.walls.flatMap((wall) => wall.frames.map((frame) => frame.ownerId));
    for (const opening of level.openings) {
      expect(framed, `no reveal built for ${opening.id}`).toContain(opening.id);
    }
  });

  it('cuts the wall into solid pieces around every opening', () => {
    const scene = buildScene3D(sample());
    const partition = scene.walls.find((wall) => wall.id === 'w-i1')!;

    // The bedroom partition carries one door, so it survives as three solid pieces: the two
    // stretches either side plus the lintel over the opening.
    expect(partition.pieces).toHaveLength(3);
    expect(partition.doors).toHaveLength(1);
    expect(partition.glass).toHaveLength(0);
  });

  it('mitres wall bodies instead of overlapping them', () => {
    const scene = buildScene3D(createSampleLevel());
    const facade = scene.walls.find((wall) => wall.id === 'w-n1')!;
    const partition = scene.walls.find((wall) => wall.id === 'w-i1')!;

    // The partition meets the facade at node n-b; both pieces must stop on the same edge.
    const facadeCorners = facade.pieces.flatMap((piece) => piece.footprint);
    const partitionCorners = partition.pieces.flatMap((piece) => piece.footprint);

    const shared = facadeCorners.filter((corner) =>
      partitionCorners.some(
        (other) => Math.abs(other.x - corner.x) < 1e-9 && Math.abs(other.y - corner.y) < 1e-9,
      ),
    );

    expect(shared.length).toBeGreaterThan(0);
  });

  it('emits one filler per junction of three or more walls', () => {
    const scene = buildScene3D(createSampleLevel());

    // n-b, n-e, n-f, n-d, n-g, n-i, n-j all gather three walls or more.
    expect(scene.junctions.length).toBeGreaterThan(0);
    for (const filler of scene.junctions) {
      expect(filler.footprint.length).toBeGreaterThanOrEqual(3);
      expect(filler.top).toBeGreaterThan(filler.bottom);
    }
  });

  it('gives every wall piece a four-cornered footprint', () => {
    const scene = buildScene3D(createSampleLevel());

    for (const wall of scene.walls) {
      for (const piece of wall.pieces) {
        expect(piece.footprint, piece.key).toHaveLength(4);
        expect(piece.top).toBeGreaterThan(piece.bottom);
      }
    }
  });

  it('glazes windows and leaves doors open', () => {
    const scene = buildScene3D(sample());
    const facade = scene.walls.find((wall) => wall.id === 'w-n1')!;

    expect(facade.glass).toHaveLength(2);
    expect(facade.doors).toHaveLength(0);
  });

  it('hangs the leaf on the hinged end', () => {
    const level = sample();
    const normal = doorOf(level, 'o-bed-door')!;
    const flipped = doorOf(setOpening(level, 'o-bed-door', { flipped: true }), 'o-bed-door')!;

    // The hinge moves to the opposite end of the opening.
    expect(flipped.position[2]).not.toBeCloseTo(normal.position[2], 3);
  });

  it('mirrors the leaf across the wall when the swing side is reversed', () => {
    const level = sample();
    const normal = doorOf(level, 'o-bed-door')!;
    const reversed = doorOf(
      setOpening(level, 'o-bed-door', { swingReversed: true }),
      'o-bed-door',
    )!;

    // Same hinge, opposite quarter turn.
    expect(reversed.position).toEqual(normal.position);
    expect(Math.abs(reversed.rotationY - normal.rotationY)).toBeCloseTo(Math.PI, 5);
  });

  it('gives the four hand/swing combinations four distinct leaves', () => {
    const level = sample();
    const rotations = new Set<number>();

    for (const flipped of [false, true]) {
      for (const swingReversed of [false, true]) {
        const door = doorOf(
          setOpening(level, 'o-bed-door', { flipped, swingReversed }),
          'o-bed-door',
        )!;
        rotations.add(Math.round((door.rotationY + Number.EPSILON) * 1e6));
      }
    }

    // Two hinge positions times two swing sides: two rotations, each used by two hands.
    expect(rotations.size).toBe(2);
  });

  it('maps a plan rotation onto the three.js axis', () => {
    expect(planRotationToThree(Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('places furniture at its plan position with the elevation on Y', () => {
    const level = sample();
    const scene = buildScene3D(level);
    const sofa = level.furniture.find((item) => item.id === 'f-sofa')!;
    const built = scene.furniture.find((item) => item.id === 'f-sofa')!;

    expect(built.position).toEqual([sofa.position.x, sofa.elevation, sofa.position.y]);
    expect(built.parts.length).toBeGreaterThan(0);
  });

  it('gives the floor lamp a light and nothing else', () => {
    const scene = buildScene3D(sample());
    const withLights = scene.furniture.filter((item) => item.light !== null);

    expect(withLights).toHaveLength(2);
    expect(withLights.every((item) => item.id.includes('lamp'))).toBe(true);
  });
});
