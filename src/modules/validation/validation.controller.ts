import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { ValidateTicketDto } from './dto/validate-ticket.dto';
import { ValidationService } from './validation.service';

@ApiTags('Validation')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller()
export class ValidationController {
  constructor(private validation: ValidationService) {}

  @Post('tickets/validate')
  @ApiOperation({ summary: 'Validate a passenger QR ticket' })
  @ApiResponse({ status: 200, description: 'VALID or INSPECTION_ONLY' })
  @ApiResponse({ status: 400, description: 'Invalid signature or malformed payload' })
  @ApiResponse({ status: 409, description: 'Ticket already used' })
  @ApiResponse({ status: 410, description: 'Ticket expired' })
  validateTicket(@CurrentUser() user: JwtPayload, @Body() dto: ValidateTicketDto) {
    return this.validation.validateTicket(user.sub, dto);
  }

  @Get('trips/:tripId/scans')
  @ApiOperation({ summary: 'List scanned passengers for a trip' })
  @ApiResponse({ status: 200, description: 'Paginated scan list with isPreviouslySeen flag' })
  @ApiResponse({ status: 400, description: 'Trip not found or not owned by driver' })
  getScans(
    @CurrentUser() user: JwtPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.validation.getScansForTrip(user.sub, tripId, query);
  }
}
