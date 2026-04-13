import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as any;
        message = res.message || exception.message;
        errors = Array.isArray(res.message) ? res.message : null;
        if (Array.isArray(res.message)) message = 'Validation failed';
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      const detail = (exception as any).detail;
      if (detail?.includes('already exists')) {
        message = 'Record already exists with the provided data';
      } else {
        message = 'Database operation failed';
      }
      this.logger.error(`DB Error: ${exception.message}`);
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled Error: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
