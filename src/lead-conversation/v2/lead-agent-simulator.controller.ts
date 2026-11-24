import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { JwtUser } from '../../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../../core/utils/assert-office-admin.util';
import { SimulateLeadAgentDto } from './dto/simulate-lead-agent.dto';
import { LeadAgentSimulatorService } from './lead-agent-simulator.service';
import type { LeadAgentSimulateResponse } from './types/lead-agent-simulate-response.type';

/**
 * Admin sandbox of the V2 lead agent. Two path segments after `admin/customer`, so it is not captured
 * by `admin/customer/:customerId/...` (no `:customerId/simulate` route exists).
 */
@Controller('admin/customer/lead-assistant/simulate')
export class LeadAgentSimulatorController {
  constructor(private readonly simulatorService: LeadAgentSimulatorService) {}

  @Get('test')
  testLeadAgentSimulator(): { status: string } {
    return { status: 'lead-agent-simulator controller alive' };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  simulate(
    @Body() body: SimulateLeadAgentDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadAgentSimulateResponse> {
    assertOfficeAdmin(jwtUser);
    return this.simulatorService.executeSimulate(body);
  }
}
