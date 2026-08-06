import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { PortalAuthController } from './portal-auth.controller';
import { PortalController } from './portal.controller';

@Module({
  imports: [DocumentsModule],
  controllers: [PortalAuthController, PortalController],
})
export class PortalModule {}
