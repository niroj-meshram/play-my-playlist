import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { ErrorCode } from '@pmp/shared';
import { AppException } from '../errors/app.exception.js';

interface FieldError {
  field: string;
  messages: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Strict DTO validation: unknown properties are rejected, payloads are transformed to DTO classes. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed.',
        HttpStatus.BAD_REQUEST,
        flatten(errors),
      ),
  });
}
