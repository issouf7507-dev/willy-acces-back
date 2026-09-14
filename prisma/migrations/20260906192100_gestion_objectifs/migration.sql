-- CreateTable
CREATE TABLE `sales_targets` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sales_targets_month_idx`(`month`),
    UNIQUE INDEX `sales_targets_month_storeId_key`(`month`, `storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sales_targets` ADD CONSTRAINT `sales_targets_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
