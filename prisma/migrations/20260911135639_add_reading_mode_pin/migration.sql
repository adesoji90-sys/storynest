-- AlterTable
ALTER TABLE "families" ADD COLUMN     "reading_mode_pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reading_mode_pin_hash" TEXT,
ADD COLUMN     "reading_mode_pin_locked_until" TIMESTAMP(3);
