import { Module } from '@nestjs/common';
import { SupportTicketsController } from './support-tickets.controller';

@Module({
  controllers: [SupportTicketsController],
})
export class SupportModule {}
