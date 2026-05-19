-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AnomalySource" AS ENUM ('ML', 'RULE_FALLBACK');

-- CreateTable
CREATE TABLE "anomaly_flags" (
    "id" TEXT NOT NULL,
    "scan_event_id" TEXT,
    "source" "AnomalySource" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "anomaly_score" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anomaly_flags_severity_created_at_idx" ON "anomaly_flags"("severity", "created_at");

-- CreateIndex
CREATE INDEX "anomaly_flags_scan_event_id_idx" ON "anomaly_flags"("scan_event_id");

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_scan_event_id_fkey" FOREIGN KEY ("scan_event_id") REFERENCES "scan_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
