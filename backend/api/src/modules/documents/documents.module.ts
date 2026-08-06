import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  // Exported for PortalModule's PortalController, which reuses
  // getDownloadStream() for the portal's own document-download endpoint
  // rather than duplicating MinIO streaming logic.
  exports: [DocumentsService],
})
export class DocumentsModule {}
