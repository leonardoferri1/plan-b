import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  createProjectSchema,
  duplicateProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type DuplicateProjectInput,
  type Project,
  type ProjectSummary,
  type UpdateProjectInput,
} from '@plan-b/shared';
import { WORKSPACE_HEADER, Workspace } from '../common/workspace.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CreateProjectDto,
  DuplicateProjectDto,
  ProjectDto,
  ProjectSummaryDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiHeader({
  name: WORKSPACE_HEADER,
  required: true,
  description:
    'Anonymous demo workspace id minted by the browser. There is no authentication in this ' +
    'MVP: anyone holding the id can read and write its projects, and the data is disposable.',
  example: 'ws-8f2c1a9d4b',
})
@ApiServiceUnavailableResponse({
  description: 'The database is unreachable; the client should fall back to local storage.',
})
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List the workspace projects, most recently updated first' })
  @ApiOkResponse({ type: [ProjectSummaryDto] })
  list(@Workspace() workspaceId: string): Promise<ProjectSummary[]> {
    return this.projects.list(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one project, migrated to the current schema version' })
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ description: 'No such project in this workspace.' })
  findOne(@Workspace() workspaceId: string, @Param('id') id: string): Promise<Project> {
    return this.projects.findOne(workspaceId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  @ApiCreatedResponse({ type: ProjectDto })
  @ApiBadRequestResponse({ description: 'The floor plan failed schema validation.' })
  create(
    @Workspace() workspaceId: string,
    @Body(new ZodValidationPipe(createProjectSchema))
    body: CreateProjectInput & CreateProjectDto,
  ): Promise<Project> {
    return this.projects.create(workspaceId, { name: body.name, plan: body.plan });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project name, its plan, or both' })
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ description: 'No such project in this workspace.' })
  @ApiBadRequestResponse({ description: 'The floor plan failed schema validation.' })
  update(
    @Workspace() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema))
    body: UpdateProjectInput & UpdateProjectDto,
  ): Promise<Project> {
    return this.projects.update(workspaceId, id, body);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Copy a project into the same workspace' })
  @ApiCreatedResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ description: 'No such project in this workspace.' })
  duplicate(
    @Workspace() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(duplicateProjectSchema))
    body: DuplicateProjectInput & DuplicateProjectDto,
  ): Promise<Project> {
    return this.projects.duplicate(workspaceId, id, body.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project permanently' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiNotFoundResponse({ description: 'No such project in this workspace.' })
  remove(@Workspace() workspaceId: string, @Param('id') id: string): Promise<void> {
    return this.projects.remove(workspaceId, id);
  }
}
