import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { ProductsModule } from '../products/products.module';
import { PriceListsService } from './price-lists.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [ProductsModule, BranchesModule],
  controllers: [PricingController],
  providers: [PriceListsService],
  exports: [PriceListsService],
})
export class PricingModule {}
