import { Body, Controller, Get, Patch } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { UpdateLeadAssistantSettingsDto } from './dto/update-lead-assistant-settings.dto';
import { LeadAssistantSettingsService } from './lead-assistant-settings.service';
import type { LeadAssistantSettingsView } from './types/lead-assistant-settings-view.type';

/**
 * Admin settings of the lead assistant.
 * Registered on CustomerModule before CustomerAdminController (see MetaLeadFormsController).
 */
@Controller('admin/customer/lead-assistant/settings')
export class LeadAssistantSettingsController {
  constructor(private readonly leadAssistantSettingsService: LeadAssistantSettingsService) {}

  @Get('test')
  testLeadAssistantSettings(): { status: string } {
    return { status: 'lead-assistant-settings controller alive' };
  }

  @Get()
  getSettings(@JwtUser() jwtUser: OfficeJwtPayload | undefined): Promise<LeadAssistantSettingsView> {
    assertOfficeAdmin(jwtUser);
    return this.leadAssistantSettingsService.executeGetOrCreate();
  }

  @Patch()
  updateSettings(
    @Body() body: UpdateLeadAssistantSettingsDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadAssistantSettingsView> {
    assertOfficeAdmin(jwtUser);
    return this.leadAssistantSettingsService.executeUpdate(body);
  }
}
