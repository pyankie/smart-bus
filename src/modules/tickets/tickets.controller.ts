import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdempotencyGuard } from '../../common/guards/idempotency.guard';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Roles(UserRole.PASSENGER)
@Controller('tickets')
export class TicketsController {
  constructor(private tickets: TicketsService) {}

  @Post('purchase')
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Purchase a ticket' })
  @ApiResponse({ status: 201, description: 'Ticket purchased with QR payload' })
  @ApiResponse({ status: 402, description: 'Insufficient wallet balance' })
  @ApiResponse({ status: 404, description: 'Route or stop not found' })
  @ApiResponse({ status: 409, description: 'Idempotency key already used' })
  purchase(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PurchaseTicketDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.tickets.purchase(user.sub, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'List own tickets with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated ticket list' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: TicketQueryDto) {
    return this.tickets.findAllForUser(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full ticket detail including QR payload' })
  @ApiResponse({ status: 200, description: 'Ticket detail' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tickets.findOneForUser(user.sub, id);
  }
}
