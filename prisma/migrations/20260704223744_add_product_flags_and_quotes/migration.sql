-- AlterTable
ALTER TABLE `products` ADD COLUMN `isNew` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isPreorder` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `releaseDate` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `sessions` MODIFY `token` VARCHAR(512) NOT NULL;

-- CreateTable
CREATE TABLE `quote_requests` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `services` JSON NOT NULL,
    `occasion` VARCHAR(191) NULL,
    `eventDate` DATETIME(3) NULL,
    `location` VARCHAR(191) NOT NULL DEFAULT 'salon',
    `guests` INTEGER NOT NULL DEFAULT 1,
    `budget` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `status` ENUM('NEW', 'IN_REVIEW', 'QUOTED', 'ACCEPTED', 'DECLINED', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `adminNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `quote_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
