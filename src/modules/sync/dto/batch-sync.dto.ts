import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { OfflineScanDto } from './offline-scan.dto';

export class BatchSyncDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfflineScanDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ApiProperty({ type: [OfflineScanDto] })
  scans!: OfflineScanDto[];
}
