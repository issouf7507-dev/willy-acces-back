-- Rattrapage d'un écart appliqué directement à la base (via db push),
-- sans migration correspondante : table salon_services, et avis
-- déposables sans compte (reviews.authorName + userId nullable).
-- Migration marquée comme déjà appliquée en dev ; elle rejoue
-- normalement sur une base neuve et en production.

-- AlterTable
ALTER TABLE `reviews` ADD COLUMN `authorName` VARCHAR(191) NULL,
    MODIFY `userId` varchar(191) NULL;

-- CreateTable
CREATE TABLE `salon_services` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `priceFrom` INTEGER NOT NULL DEFAULT 0,
    `gradientFrom` VARCHAR(191) NOT NULL DEFAULT 'from-rose-700',
    `gradientTo` VARCHAR(191) NOT NULL DEFAULT 'to-rose-950',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `reviews_productId_isApproved_idx` ON `reviews`(`productId` ASC, `isApproved` ASC);

