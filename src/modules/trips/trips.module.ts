import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RoutesModule } from '../routes/routes.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [PrismaModule, RoutesModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
