import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * These classes exist purely so that `@nestjs/swagger` can describe the HTTP contract.
 *
 * Runtime validation is done by the zod schemas in `@plan-b/shared` — the same ones the
 * browser uses — rather than by decorators, so there is exactly one definition of what a valid
 * floor plan is. Keeping the two concerns apart avoids the usual drift between a DTO and the
 * domain model it is supposed to mirror.
 */

export class CreateProjectDto {
  @ApiProperty({ example: 'Apartamento Aurora', maxLength: 120 })
  name!: string;

  @ApiProperty({
    description: 'Floor plan document, validated against the shared schema for its version.',
    type: 'object',
    additionalProperties: true,
    example: {
      schemaVersion: 1,
      levels: [
        {
          id: 'lv-ground',
          name: 'Pavimento térreo',
          elevation: 0,
          nodes: [],
          walls: [],
          openings: [],
          rooms: [],
          furniture: [],
        },
      ],
      settings: {
        gridSize: 0.5,
        snapEnabled: true,
        defaultWallHeight: 2.7,
        defaultWallThickness: 0.15,
        wallMaterialId: 'white-plaster',
        floorMaterialId: 'oak',
      },
    },
  })
  plan!: Record<string, unknown>;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Apartamento Aurora v2', maxLength: 120 })
  name?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  plan?: Record<string, unknown>;
}

export class DuplicateProjectDto {
  @ApiPropertyOptional({
    description: 'Name for the copy. Defaults to the source name followed by "(cópia)".',
    example: 'Apartamento Aurora (estudo B)',
  })
  name?: string;
}

class ProjectStatsDto {
  @ApiProperty({ example: 5 }) rooms!: number;
  @ApiProperty({ example: 16 }) walls!: number;
  @ApiProperty({ example: 25 }) furniture!: number;
  @ApiProperty({ example: 63.0, description: 'Square meters' }) floorArea!: number;
}

export class ProjectSummaryDto {
  @ApiProperty({ example: 'clz2k9x0h0000qw3f' }) id!: string;
  @ApiProperty({ example: 'Apartamento Aurora' }) name!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ example: 1 }) schemaVersion!: number;
  @ApiProperty({ type: ProjectStatsDto }) stats!: ProjectStatsDto;
}

export class ProjectDto {
  @ApiProperty({ example: 'clz2k9x0h0000qw3f' }) id!: string;
  @ApiProperty({ example: 'Apartamento Aurora' }) name!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) plan!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({ example: 'ws-8f2c1a9d4b' }) workspaceId?: string;
}
