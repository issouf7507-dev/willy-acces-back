-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `discountAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `discountReason` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `channel` ENUM('ONLINE', 'IN_STORE') NOT NULL DEFAULT 'ONLINE',
    ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `sellerId` VARCHAR(191) NULL,
    ADD COLUMN `storeId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `storeId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `stores` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `type` ENUM('PHYSICAL', 'ONLINE') NOT NULL DEFAULT 'PHYSICAL',
    `address` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `isDefaultOnline` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stores_name_key`(`name`),
    UNIQUE INDEX `stores_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_phone_key`(`phone`),
    UNIQUE INDEX `customers_userId_key`(`userId`),
    INDEX `customers_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `orders_storeId_createdAt_idx` ON `orders`(`storeId`, `createdAt`);

-- CreateIndex
CREATE INDEX `orders_sellerId_idx` ON `orders`(`sellerId`);

-- CreateIndex
CREATE INDEX `orders_customerId_idx` ON `orders`(`customerId`);

-- CreateIndex
CREATE INDEX `orders_channel_idx` ON `orders`(`channel`);

-- CreateIndex
CREATE INDEX `users_storeId_idx` ON `users`(`storeId`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
