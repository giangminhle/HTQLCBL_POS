import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BranchesModule } from '../branches/branches.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [PrismaModule, BranchesModule, UsersModule, ProductsModule, InventoryModule, AuditModule],
  controllers: [SalesController, ShiftsController],
  providers: [SalesService, ShiftsService],
  exports: [SalesService, ShiftsService],
})
export class SalesModule {}
