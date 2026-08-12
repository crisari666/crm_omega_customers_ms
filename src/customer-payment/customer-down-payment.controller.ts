import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { buildCustomerDownPaymentFileMulterOptions } from './customer-down-payment-file-multer-options';
import { CustomerDownPaymentService } from './customer-down-payment.service';
import { CustomerPaymentAccessService } from './customer-payment-access.service';
import { CreateCustomerDownPaymentMultipartDto } from './dto/create-customer-down-payment-multipart.dto';
import { CreateCustomerPaymentFeeMultipartDto } from './dto/create-customer-payment-fee-multipart.dto';
import { ListCustomerDownPaymentsQueryDto } from './dto/list-customer-down-payments-query.dto';

/**
 * HTTP API for down payments (enganche) and child fee payments.
 */
@Controller('customer-down-payment')
export class CustomerDownPaymentController {
  constructor(
    private readonly downPaymentService: CustomerDownPaymentService,
    private readonly paymentAccessService: CustomerPaymentAccessService,
  ) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'contract', maxCount: 1 },
        { name: 'evidence', maxCount: 1 },
      ],
      buildCustomerDownPaymentFileMulterOptions(),
    ),
  )
  async createDownPayment(
    @Body() body: CreateCustomerDownPaymentMultipartDto,
    @UploadedFiles()
    files:
      | {
          contract?: Express.Multer.File[];
          evidence?: Express.Multer.File[];
        }
      | undefined,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const recordedBy =
      await this.paymentAccessService.assertCanRecordCustomerPayment({
        jwtUser,
        customerId: body.customerId,
      });
    return this.downPaymentService.createDownPaymentWithFiles({
      dto: body,
      contract: files?.contract?.[0],
      evidence: files?.evidence?.[0],
      recordedBy,
    });
  }

  @Post(':downPaymentId/fees')
  @UseInterceptors(
    FileInterceptor('evidence', buildCustomerDownPaymentFileMulterOptions()),
  )
  async addFee(
    @Param('downPaymentId') downPaymentId: string,
    @Body() body: CreateCustomerPaymentFeeMultipartDto,
    @UploadedFile() evidence: Express.Multer.File | undefined,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const customerId =
      await this.downPaymentService.getDownPaymentCustomerId(downPaymentId);
    const recordedBy =
      await this.paymentAccessService.assertCanRecordCustomerPayment({
        jwtUser,
        customerId,
      });
    return this.downPaymentService.addFeeWithOptionalEvidence({
      downPaymentId,
      dto: body,
      evidence,
      recordedBy,
    });
  }

  @Get()
  async listDownPayments(
    @Query() query: ListCustomerDownPaymentsQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.downPaymentService.listDownPayments(query);
  }

  @Get('by-customer/:customerId')
  async listByCustomer(
    @Param('customerId') customerId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    await this.paymentAccessService.assertCanRecordCustomerPayment({
      jwtUser,
      customerId,
    });
    return this.downPaymentService.listByCustomer(customerId);
  }

  @Get('fees/:feeId/evidence')
  async getFeeEvidence(
    @Param('feeId') feeId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<StreamableFile> {
    const customerId = await this.downPaymentService.getFeeCustomerId(feeId);
    await this.paymentAccessService.assertCanRecordCustomerPayment({
      jwtUser,
      customerId,
    });
    const { stream, mimeType } =
      await this.downPaymentService.openFeeEvidenceReadStream(feeId);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: 'inline; filename="fee-evidence"',
    });
  }

  @Get(':downPaymentId/fees')
  async listFees(
    @Param('downPaymentId') downPaymentId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const customerId =
      await this.downPaymentService.getDownPaymentCustomerId(downPaymentId);
    await this.paymentAccessService.assertCanRecordCustomerPayment({
      jwtUser,
      customerId,
    });
    return this.downPaymentService.listFeesForDownPayment(downPaymentId);
  }

  @Get(':downPaymentId/contract')
  async getContract(
    @Param('downPaymentId') downPaymentId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<StreamableFile> {
    const customerId =
      await this.downPaymentService.getDownPaymentCustomerId(downPaymentId);
    await this.paymentAccessService.assertCanRecordCustomerPayment({
      jwtUser,
      customerId,
    });
    const { stream, mimeType } =
      await this.downPaymentService.openContractReadStream(downPaymentId);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: 'inline; filename="down-payment-contract"',
    });
  }
}
