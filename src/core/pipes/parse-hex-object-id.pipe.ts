import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

const HEX_OBJECT_ID = /^[a-fA-F0-9]{24}$/;

/**
 * Validates route `customerId` params as 24-char hex MongoDB ObjectIds before Mongoose queries.
 * Avoids CastError logs when clients send values like `[object Object]` from stringified objects.
 */
@Injectable()
export class ParseHexObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string, _metadata: ArgumentMetadata): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid customer id');
    }
    const trimmed = value.trim();
    if (!HEX_OBJECT_ID.test(trimmed)) {
      throw new BadRequestException('Invalid customer id');
    }
    return trimmed;
  }
}
