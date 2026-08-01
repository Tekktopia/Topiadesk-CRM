import type { ArgumentsHost, ExceptionFilter} from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Consistent error envelope + server-side logging for unhandled exceptions (never leaks stack traces to clients). */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException ? exception.getResponse() : { message: 'Internal server error' };

    if (!isHttpException) {
      this.logger.error(`Unhandled exception on ${req.method} ${req.url}`, (exception as Error)?.stack);
    }

    res.status(status).json({
      statusCode: status,
      path: req.url,
      timestamp: new Date().toISOString(),
      ...(typeof body === 'object' ? body : { message: body }),
    });
  }
}
