import { Body, Controller, Get, Put } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { ReplaceLeadRecoverySequenceDto } from './dto/replace-lead-recovery-sequence.dto';
import { LeadRecoverySequenceService } from './lead-recovery-sequence.service';
import type { LeadRecoverySequenceView } from './types/lead-recovery-sequence-view.type';

/**
 * Admin editor of the recovery (follow-up) sequence.
 * Registered on CustomerModule before CustomerAdminController.
 */
@Controller('admin/customer/lead-assistant/recovery')
export class LeadRecoverySequenceController {
  constructor(private readonly leadRecoverySequenceService: LeadRecoverySequenceService) {}

  @Get('test')
  testLeadRecovery(): { status: string } {
    return { status: 'lead-recovery-sequence controller alive' };
  }

  @Get()
  getSequence(@JwtUser() jwtUser: OfficeJwtPayload | undefined): Promise<LeadRecoverySequenceView> {
    assertOfficeAdmin(jwtUser);
    return this.leadRecoverySequenceService.executeGet();
  }

  @Put()
  replaceSequence(
    @Body() body: ReplaceLeadRecoverySequenceDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadRecoverySequenceView> {
    assertOfficeAdmin(jwtUser);
    return this.leadRecoverySequenceService.executeReplace(body);
  }
}
