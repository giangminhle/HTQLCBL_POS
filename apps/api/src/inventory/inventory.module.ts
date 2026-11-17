import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BranchesModule } from '../branches/branches.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockCountsController } from './stock-counts.controller';
import { StockCountsService } from './stock-counts.service';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [PrismaModule, BranchesModule, ProductsModule, UsersModule, AuditModule],
  controllers: [
    InventoryController,
    SuppliersController,
    GoodsReceiptsController,
    StockTransfersController,
    StockCountsController,
  ],
  providers: [
    InventoryService,
    SuppliersService,
    GoodsReceiptsService,
    StockTransfersService,
    StockCountsService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
