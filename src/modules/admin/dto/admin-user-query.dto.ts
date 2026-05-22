import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma-generated/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AdminUserQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  @ApiPropertyOptional({ enum: UserRole })
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  @ApiPropertyOptional({ enum: UserStatus })
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Search by name, phone, or email' })
  q?: string;
}
