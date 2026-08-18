-- Une précommande devient un panier : les données produit passent de la demande
-- vers des lignes, pour qu'un client puisse réserver plusieurs articles en une
-- seule demande avec un seul statut à suivre côté back-office.

CREATE TABLE `preorder_request_items` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `releaseDate` DATETIME(3) NULL,
    `color` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,

    INDEX `preorder_request_items_requestId_idx`(`requestId`),
    INDEX `preorder_request_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Reprise des demandes existantes : chacune devient une demande à une seule ligne.
INSERT INTO `preorder_request_items` (`id`, `requestId`, `productId`, `productName`, `unitPrice`, `releaseDate`, `color`, `quantity`)
SELECT UUID(), `id`, `productId`, `productName`, `unitPrice`, `releaseDate`, `color`, `quantity`
FROM `preorder_requests`;

ALTER TABLE `preorder_request_items`
    ADD CONSTRAINT `preorder_request_items_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `preorder_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `preorder_request_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `preorder_requests` DROP FOREIGN KEY `preorder_requests_productId_fkey`;
ALTER TABLE `preorder_requests`
    DROP COLUMN `productId`,
    DROP COLUMN `productName`,
    DROP COLUMN `unitPrice`,
    DROP COLUMN `releaseDate`,
    DROP COLUMN `color`,
    DROP COLUMN `quantity`;
