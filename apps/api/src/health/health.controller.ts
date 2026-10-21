import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CURRENT_SCHEMA_VERSION } from '@spacecraft/shared';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness and database readiness',
    description:
      'Always answers 200 so the web client can distinguish "API is down" from ' +
      '"API is up but the database is not", and fall back to local storage accordingly.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        database: { type: 'string', enum: ['up', 'down'] },
        schemaVersion: { type: 'number', example: CURRENT_SCHEMA_VERSION },
        uptime: { type: 'number' },
      },
    },
  })
  async check(): Promise<{
    status: 'ok';
    database: 'up' | 'down';
    schemaVersion: number;
    uptime: number;
  }> {
    const database = (await this.prisma.ping()) ? 'up' : 'down';

    return {
      status: 'ok',
      database,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      uptime: Math.round(process.uptime()),
    };
  }
}
