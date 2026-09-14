-- CreateTable
CREATE TABLE `expenses` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `storeId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `expenses_date_idx`(`date`),
    INDEX `expenses_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `monthly_closings` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `rent` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `salaries` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `utilities` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `transportTaxes` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `other` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `purchaseRate` DECIMAL(5, 4) NOT NULL DEFAULT 0.65,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `monthly_closings_month_key`(`month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
