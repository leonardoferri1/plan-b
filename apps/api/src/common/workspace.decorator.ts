import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const WORKSPACE_HEADER = 'x-workspace-id';

const WORKSPACE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The anonymous demo workspace a request belongs to.
 *
 * There is no authentication in the MVP by design, so a browser mints an opaque id once and
 * sends it with every call. It scopes reads and writes well enough for a public demo while
 * making it obvious — in the header name and in the docs — that the data is not private.
 */
export const Workspace = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<Request>();
  const value = request.header(WORKSPACE_HEADER);

  if (!value || !WORKSPACE_PATTERN.test(value)) {
    throw new BadRequestException(
      `Cabeçalho ${WORKSPACE_HEADER} ausente ou inválido (8 a 64 caracteres A-Z, a-z, 0-9, _ ou -).`,
    );
  }

  return value;
});
