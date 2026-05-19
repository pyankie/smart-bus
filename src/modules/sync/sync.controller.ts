import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { BatchSyncDto } from './dto';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('validations')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync a batch of offline ticket scans' })
  @ApiResponse({ status: 200, description: 'Reconciliation report with per-scan results' })
  @ApiResponse({ status: 422, description: 'Validation error (empty or oversized batch)' })
  syncValidations(@CurrentUser() user: JwtPayload, @Body() dto: BatchSyncDto) {
    return this.sync.reconcile(user.sub, dto);
  }
}
