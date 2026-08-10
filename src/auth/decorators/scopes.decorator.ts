import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'pabip:auth:scopes';

export const Scopes = (...scopes: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(SCOPES_KEY, scopes);
