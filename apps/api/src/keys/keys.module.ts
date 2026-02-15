import { Module } from '@nestjs/common';
import { KeysService } from './keys.service';
import { KeysController } from './keys.controller';
import { KeysDashboardController } from './keys-dashboard.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [KeysController, KeysDashboardController],
  providers: [KeysService],
  exports: [KeysService],
})
export class KeysModule {}
