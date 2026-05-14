import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { buildCustomerPaymentEvidenceMulterOptions } from './customer-payment-evidence-multer-options';
import { CustomerPaymentService } from './customer-payment.service';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { CreateCustomerPaymentMultipartDto } from './dto/create-customer-payment-multipart.dto';
import { ListCustomerPaymentsQueryDto } from './dto/list-customer-payments-query.dto';

/**
 * HTTP API for customer payment records.
 */
@Controller('customer-payment')
export class CustomerPaymentController {
  constructor(
    private readonly customerPaymentService: CustomerPaymentService,
  ) {}

  @Post()
  async createPayment(
    @Body() body: CreateCustomerPaymentDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const recordedBy = resolveOfficeUserId(jwtUser);
    return this.customerPaymentService.createPayment(body, recordedBy);
  }

  @Post('with-evidence')
  @UseInterceptors(
    FileInterceptor('evidence', buildCustomerPaymentEvidenceMulterOptions()),
  )
  async createPaymentWithEvidence(
    @Body() body: CreateCustomerPaymentMultipartDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const recordedBy = resolveOfficeUserId(jwtUser);
    return this.customerPaymentService.createPaymentWithEvidence(
      body,
      file,
      recordedBy,
    );
  }

  @Get()
  async listPayments(@Query() query: ListCustomerPaymentsQueryDto) {
    return this.customerPaymentService.listPayments(query);
  }

  @Get('by-customer/:customerId')
  async listByCustomer(@Param('customerId') customerId: string) {
    return this.customerPaymentService.listByCustomer(customerId);
  }

  @Get('summary/by-customer/:customerId')
  async getSummaryByCustomer(@Param('customerId') customerId: string) {
    return this.customerPaymentService.getSummaryByCustomer(customerId);
  }

  @Get(':paymentId/evidence')
  async getEvidence(
    @Param('paymentId') paymentId: string,
  ): Promise<StreamableFile> {
    const { stream, mimeType } =
      await this.customerPaymentService.openEvidenceReadStream(paymentId);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: 'inline; filename="payment-evidence"',
    });
  }
}
