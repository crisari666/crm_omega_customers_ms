import { Controller, Get } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { LeadReadinessService } from './lead-readiness.service';
import type { LeadReadinessResponse } from './types/lead-readiness-response.type';

/**
 * Readiness checklist of the lead assistant.
 * Registered on CustomerModule before CustomerAdminController.
 */
@Controller('admin/customer/lead-assistant/readiness')
export class LeadReadinessController {
  constructor(private readonly leadReadinessService: LeadReadinessService) {}

  @Get('test')
  testLeadReadiness(): { status: string } {
    return { status: 'lead-readiness controller alive' };
  }

  @Get()
  getReadiness(@JwtUser() jwtUser: OfficeJwtPayload | undefined): Promise<LeadReadinessResponse> {
    assertOfficeAdmin(jwtUser);
    return this.leadReadinessService.executeGetReadiness();
  }
}
