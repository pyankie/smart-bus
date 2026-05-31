-- DropForeignKey
ALTER TABLE "scan_events" DROP CONSTRAINT "scan_events_ticket_id_fkey";

-- AlterTable
ALTER TABLE "scan_events" ALTER COLUMN "ticket_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
