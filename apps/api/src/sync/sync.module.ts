import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { ProductsModule } from '../products/products.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [ProductsModule, PricingModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
