import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [PrismaModule, TicketsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
