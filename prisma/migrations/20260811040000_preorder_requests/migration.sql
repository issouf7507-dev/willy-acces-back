-- CreateTable
CREATE TABLE `preorder_requests` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `releaseDate` DATETIME(3) NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `message` TEXT NULL,
    `status` ENUM('NEW', 'CONFIRMED', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `adminNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `preorder_requests_status_idx`(`status`),
    INDEX `preorder_requests_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `preorder_requests` ADD CONSTRAINT `preorder_requests_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
