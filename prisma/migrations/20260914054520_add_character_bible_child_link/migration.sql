-- AlterTable
ALTER TABLE "character_bibles" ADD COLUMN     "child_id" UUID;

-- AddForeignKey
ALTER TABLE "character_bibles" ADD CONSTRAINT "character_bibles_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;
