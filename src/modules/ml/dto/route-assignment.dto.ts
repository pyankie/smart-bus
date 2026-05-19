import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsISO8601, IsString, IsUUID } from 'class-validator';

export class RouteAssignmentRequestDto {
  @IsString()
  @ApiProperty({ description: 'Target route identifier (UUID in production, demo IDs allowed in capstone mode)' })
  routeId!: string;

  @IsISO8601()
  @ApiProperty({ description: 'ISO 8601 timestamp of the scheduled trip' })
  scheduledFor!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ApiProperty({ type: [String], description: 'Candidate driver IDs to rank' })
  candidateDriverIds!: string[];
}

export class DriverSuggestionDto {
  @ApiProperty()
  driverId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiProperty({ description: 'Probability of trip success, 0.0–1.0' })
  confidence!: number;

  @ApiProperty({ type: [String], description: 'Explainable reasons backing the rank' })
  reasons!: string[];
}

export class RouteAssignmentResponseDto {
  @ApiProperty()
  routeId!: string;

  @ApiProperty({ type: [DriverSuggestionDto] })
  suggestions!: DriverSuggestionDto[];

  @ApiProperty({ description: '"ml" if the model served the response, "fallback" if the local heuristic did' })
  source!: 'ml' | 'fallback';
}

// Internal shape passed from admin controller to the ML service
export class SuggestAssignmentDto {
  @IsUUID()
  @ApiProperty()
  routeId!: string;

  @IsISO8601()
  @ApiProperty()
  scheduledFor!: string;
}
