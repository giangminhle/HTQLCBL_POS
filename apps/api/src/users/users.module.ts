import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [BranchesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
