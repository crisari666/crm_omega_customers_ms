import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CustomerMetadataService } from './customer-metadata.service';
import { UpsertCustomerMetadataDto } from './dto/upsert-customer-metadata.dto';
import type { CustomerMetadataResponse } from './types/customer-metadata-response.type';

/**
 * HTTP API for Stage 3 customer qualification metadata.
 */
@Controller('customer')
export class CustomerMetadataController {
  constructor(
    private readonly customerMetadataService: CustomerMetadataService,
  ) {}

  /**
   * Smoke endpoint for health checks.
   */
  @Get('metadata/test')
  executeTest(): { status: string } {
    return { status: 'ok' };
  }

  @Get(':customerId/metadata')
  getCustomerMetadata(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
  ): Promise<CustomerMetadataResponse> {
    return this.customerMetadataService.getByCustomerId(customerId);
  }

  @Put(':customerId/metadata')
  upsertCustomerMetadata(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @Body() body: UpsertCustomerMetadataDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<CustomerMetadataResponse> {
    return this.customerMetadataService.upsertByCustomerId({
      customerId,
      values: body.values,
      actorUserId: resolveOfficeUserId(jwtUser),
    });
  }
}
