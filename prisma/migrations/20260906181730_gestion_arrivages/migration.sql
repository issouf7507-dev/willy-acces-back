-- CreateTable
CREATE TABLE `shipments` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `shippingCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'FCFA',
    `status` ENUM('DRAFT', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `orderedAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shipments_code_key`(`code`),
    INDEX `shipments_status_receivedAt_idx`(`status`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipment_items` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitCost` DECIMAL(12, 2) NOT NULL,
    `plannedPrice` DECIMAL(12, 2) NULL,
    `unitShipping` DECIMAL(12, 2) NULL,
    `landedCost` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shipment_items_productId_idx`(`productId`),
    UNIQUE INDEX `shipment_items_shipmentId_productId_key`(`shipmentId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shipment_items` ADD CONSTRAINT `shipment_items_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_items` ADD CONSTRAINT `shipment_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
