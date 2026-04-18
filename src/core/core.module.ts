import { Global, Module } from '@nestjs/common';
import { JwtVerificationService } from './services/jwt-verification.service';

@Global()
@Module({
  providers: [JwtVerificationService],
  exports: [JwtVerificationService],
})
export class CoreModule {}
