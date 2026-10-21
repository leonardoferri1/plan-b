import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma connection lifecycle.
 *
 * The API deliberately starts even when the database is unreachable: the web client treats the
 * server as an optional upgrade over local storage, so a developer running `pnpm dev` without
 * Docker should get a clear 503 from the project routes rather than a process that refuses to
 * boot. `isReady` reports which of the two situations we are in.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('Connected to PostgreSQL');
    } catch (error) {
      this.connected = false;
      this.logger.warn(
        `Database unavailable — project routes will answer 503 until it comes back. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) await this.$disconnect();
  }

  get isReady(): boolean {
    return this.connected;
  }

  /** Re-checks the connection; used by the health endpoint and after a transient failure. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
    } catch {
      this.connected = false;
    }
    return this.connected;
  }
}
