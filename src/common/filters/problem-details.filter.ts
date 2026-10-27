import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { REQUEST_ID_HEADER, resolveRequestId } from '../request-id.util';

const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';

const PROBLEM_TYPE_BASE_URL = 'https://protocolo-nacional.dev/problems/';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

interface ExceptionDescription {
  status: number;
  title: string;
  detail?: string;
  extensions?: Record<string, unknown>;
  known?: boolean;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const instance = request?.originalUrl ?? request?.url;

    const { status, title, detail, extensions, known } = this.describe(exception);
    this.logException(exception, status, request);

    const body: ProblemDetails = {
      type: known ? problemTypeUri(title) : 'about:blank',
      title,
      status,
      ...(detail ? { detail } : {}),
      ...(instance ? { instance } : {}),
      ...extensions,
    };

    if (request) {
      response.setHeader(REQUEST_ID_HEADER, resolveRequestId(request));
    }
    response.status(status).contentType(PROBLEM_JSON_CONTENT_TYPE).send(body);
  }

  private describe(exception: unknown): ExceptionDescription {
    if (exception instanceof HttpException) {
      return this.describeHttpException(exception);
    }

    const payloadTooLarge = describePayloadTooLargeError(exception);
    if (payloadTooLarge) {
      return payloadTooLarge;
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: httpStatusTitle(HttpStatus.INTERNAL_SERVER_ERROR),
      detail: 'An unexpected error occurred.',
    };
  }

  private describeHttpException(exception: HttpException): ExceptionDescription {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { status, title: httpStatusTitle(status), detail: response, known: true };
    }

    const body = { ...(response as Record<string, unknown>) };
    const message = body.message;
    const error = body.error;
    delete body.message;
    delete body.error;
    delete body.statusCode;

    if (Array.isArray(message)) {
      return {
        status,
        title: typeof error === 'string' ? error : httpStatusTitle(status),
        extensions: { errors: message, ...body },
        known: true,
      };
    }

    return {
      status,
      title: typeof error === 'string' ? error : httpStatusTitle(status),
      detail: typeof message === 'string' ? message : undefined,
      extensions: body,
      known: true,
    };
  }

  private logException(exception: unknown, status: number, request?: Request): void {
    const method = request?.method ?? 'UNKNOWN';
    const url = request?.originalUrl ?? request?.url ?? 'unknown';
    const message = `${method} ${url} -> ${status}`;

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(message, stack, ProblemDetailsFilter.name);
    } else {
      this.logger.warn(message, ProblemDetailsFilter.name);
    }
  }
}

function describePayloadTooLargeError(exception: unknown): ExceptionDescription | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }

  const candidate = exception as {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
    message?: unknown;
  };
  const status = candidate.status ?? candidate.statusCode;
  if (status !== HttpStatus.PAYLOAD_TOO_LARGE || candidate.type !== 'entity.too.large') {
    return undefined;
  }

  return {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    title: httpStatusTitle(HttpStatus.PAYLOAD_TOO_LARGE),
    detail: typeof candidate.message === 'string' ? candidate.message : 'Payload too large.',
    known: true,
  };
}

function problemTypeUri(title: string): string {
  const slug = title.trim().toLowerCase().replace(/\s+/g, '-');
  return `${PROBLEM_TYPE_BASE_URL}${slug}`;
}

function httpStatusTitle(status: number): string {
  const key = HttpStatus[status] as string | undefined;
  if (!key) {
    return 'Error';
  }
  return key
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
