import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AdminActionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: 'Filter by the admin who performed the action' })
  actorId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Filter by target entity type (e.g. "User", "Route")' })
  targetType?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Filter by action name (partial match, e.g. "user.disable")' })
  action?: string;
}
