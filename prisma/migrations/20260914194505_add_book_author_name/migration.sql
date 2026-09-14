-- AlterTable
ALTER TABLE "ai_usage_records" ALTER COLUMN "family_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "author_name" TEXT,
ADD COLUMN     "pdf_asset_id" UUID;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_pdf_asset_id_fkey" FOREIGN KEY ("pdf_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
