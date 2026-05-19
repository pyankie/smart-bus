import { Module } from '@nestjs/common';
import { MlModule } from '../ml/ml.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RoutesModule } from '../routes/routes.module';
import { TripsModule } from '../trips/trips.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [UsersModule, RoutesModule, TripsModule, NotificationsModule, MlModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
