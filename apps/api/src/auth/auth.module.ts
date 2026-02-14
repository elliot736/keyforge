import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RootKeyGuard } from './guards/root-key.guard';
import { SessionGuard } from './guards/session.guard';
import { WorkspaceRoleGuard } from './guards/workspace-role.guard';
import { CombinedAuthGuard } from './decorators/auth.decorator';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    RootKeyGuard,
    SessionGuard,
    WorkspaceRoleGuard,
    CombinedAuthGuard,
  ],
  exports: [
    AuthService,
    RootKeyGuard,
    SessionGuard,
    WorkspaceRoleGuard,
    CombinedAuthGuard,
  ],
})
export class AuthModule {}
