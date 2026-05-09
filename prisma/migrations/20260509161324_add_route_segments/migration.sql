-- CreateTable
CREATE TABLE "route_segments" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "from_stop_id" TEXT NOT NULL,
    "to_stop_id" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "route_segments_route_id_idx" ON "route_segments"("route_id");

-- CreateIndex
CREATE INDEX "route_segments_from_stop_id_idx" ON "route_segments"("from_stop_id");

-- CreateIndex
CREATE INDEX "route_segments_to_stop_id_idx" ON "route_segments"("to_stop_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_segments_route_id_from_stop_id_to_stop_id_key" ON "route_segments"("route_id", "from_stop_id", "to_stop_id");

-- AddForeignKey
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_from_stop_id_fkey" FOREIGN KEY ("from_stop_id") REFERENCES "stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_to_stop_id_fkey" FOREIGN KEY ("to_stop_id") REFERENCES "stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
