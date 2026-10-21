import { CURRENT_SCHEMA_VERSION } from '../domain/types';

type RawPlan = Record<string, unknown>;

/**
 * One step of the upgrade chain: takes a plan at version `from` and returns it at `from + 1`.
 *
 * Saved plans outlive the code that wrote them, so every schema change ships with a migration
 * here instead of a breaking read. Version 1 is the first public shape, so the chain is empty
 * today — the machinery exists so that adding v2 never requires touching the call sites.
 */
export type Migration = (plan: RawPlan) => RawPlan;

export const MIGRATIONS: Record<number, Migration> = {
  // 1: (plan) => ({ ...plan, schemaVersion: 2, /* … */ }),
};

export function detectSchemaVersion(plan: unknown): number {
  if (typeof plan !== 'object' || plan === null) return 0;
  const version = (plan as RawPlan).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 1;
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(
    readonly version: number,
    readonly supported: number,
  ) {
    super(
      `Esta planta foi salva no formato ${version}, mais novo que o suportado (${supported}). ` +
        'Atualize o SpaceCraft para abri-la.',
    );
    this.name = 'UnsupportedSchemaVersionError';
  }
}

/**
 * Brings any stored plan up to {@link CURRENT_SCHEMA_VERSION}.
 *
 * Returns the input untouched when it is not an object, so the caller's validator produces the
 * error message rather than this function throwing a less useful one.
 */
export function migratePlan(plan: unknown): unknown {
  if (typeof plan !== 'object' || plan === null) return plan;

  let version = detectSchemaVersion(plan);

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version, CURRENT_SCHEMA_VERSION);
  }

  let current: RawPlan = { ...(plan as RawPlan), schemaVersion: version };

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Migração ausente da versão ${version} para ${version + 1}.`);
    }
    current = migration(current);
    version += 1;
    current.schemaVersion = version;
  }

  return current;
}
