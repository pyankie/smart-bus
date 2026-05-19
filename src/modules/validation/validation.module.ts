import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MlModule } from '../ml/ml.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TripsModule } from '../trips/trips.module';
import { AnomalyService } from './anomaly.service';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';

@Module({
  imports: [PrismaModule, TicketsModule, TripsModule, MlModule],
  controllers: [ValidationController],
  providers: [ValidationService, AnomalyService],
  exports: [ValidationService],
})
export class ValidationModule {}
