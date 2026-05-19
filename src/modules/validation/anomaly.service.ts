import { Injectable, Logger } from '@nestjs/common';
import {
  AnomalySeverity,
  AnomalySource,
} from '@prisma-generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ScanAnomalyResponseDto } from '../ml/dto/scan-anomaly.dto';

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a MEDIUM or HIGH severity audit. LOW results are not stored to
   * keep the table focused on actionable signals.
   */
  async record(audit: ScanAnomalyResponseDto, scanEventId: string | null): Promise<void> {
    if (audit.severity === 'LOW') return;

    try {
      await this.prisma.anomalyFlag.create({
        data: {
          scanEventId,
          source: audit.source === 'ml' ? AnomalySource.ML : AnomalySource.RULE_FALLBACK,
          severity: audit.severity as AnomalySeverity,
          anomalyScore: audit.anomalyScore,
          reasons: audit.reasons,
        },
      });
    } catch (err) {
      // Audit persistence must never break the scan flow. Log and move on.
      this.logger.warn(`Failed to persist anomaly flag for ${audit.eventId}: ${(err as Error).message}`);
    }
  }
}
