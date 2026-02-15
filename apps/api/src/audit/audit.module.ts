import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditDashboardController } from './audit-dashboard.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Global()
@Module({
  imports: [WorkspacesModule],
  controllers: [AuditController, AuditDashboardController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
