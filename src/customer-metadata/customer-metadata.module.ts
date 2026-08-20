import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Customer,
  CustomerSchema,
} from '../customer/schemas/customer.schema';
import { CustomerMetadataController } from './customer-metadata.controller';
import { CustomerMetadataService } from './customer-metadata.service';
import {
  CustomerMetadata,
  CustomerMetadataSchema,
} from './schemas/customer-metadata.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerMetadata.name, schema: CustomerMetadataSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [CustomerMetadataController],
  providers: [CustomerMetadataService],
  exports: [CustomerMetadataService],
})
export class CustomerMetadataModule {}
