import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MlService } from './ml.service';

@Module({
  imports: [PrismaModule],
  providers: [MlService],
  exports: [MlService],
})
export class MlModule {}
