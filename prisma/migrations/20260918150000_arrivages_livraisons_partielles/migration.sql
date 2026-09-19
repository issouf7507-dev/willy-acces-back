-- Arrivage = commande, groupe = livraison partielle.
--
-- Une commande de 10 articles peut arriver en 5 + 3 + 2 : chaque livraison
-- est un groupe, qui a son transport et crédite le stock à sa réception.
-- Les quantités livrées et les coûts figés passent donc de la ligne
-- commandée (shipment_items) à la ligne livrée (shipment_group_items).

-- ─── 1. Nouveaux états ──────────────────────────────────────────────────────

ALTER TABLE `shipments` MODIFY `status` ENUM('DRAFT', 'PARTIAL', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT';

ALTER TABLE `shipment_groups` ADD COLUMN `receivedAt` DATETIME(3) NULL,
    ADD COLUMN `status` ENUM('DRAFT', 'RECEIVED') NOT NULL DEFAULT 'DRAFT';

CREATE INDEX `shipment_groups_status_receivedAt_idx` ON `shipment_groups`(`status`, `receivedAt`);

-- ─── 2. Lignes livrées ──────────────────────────────────────────────────────

CREATE TABLE `shipment_group_items` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `shipmentItemId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitShipping` DECIMAL(12, 2) NULL,
    `landedCost` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shipment_group_items_shipmentItemId_idx`(`shipmentItemId`),
    UNIQUE INDEX `shipment_group_items_groupId_shipmentItemId_key`(`groupId`, `shipmentItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shipment_group_items` ADD CONSTRAINT `shipment_group_items_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `shipment_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `shipment_group_items` ADD CONSTRAINT `shipment_group_items_shipmentItemId_fkey` FOREIGN KEY (`shipmentItemId`) REFERENCES `shipment_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 3. Reprise des données ─────────────────────────────────────────────────
-- Chaque ligne rangée dans un groupe y est livrée en totalité, avec ses coûts
-- figés. Un groupe d'arrivage réceptionné est lui-même réceptionné.

INSERT INTO `shipment_group_items` (`id`, `groupId`, `shipmentItemId`, `quantity`, `unitShipping`, `landedCost`, `createdAt`, `updatedAt`)
SELECT CONCAT('gi_', `id`), `groupId`, `id`, `quantity`, `unitShipping`, `landedCost`, `createdAt`, `updatedAt`
FROM `shipment_items`
WHERE `groupId` IS NOT NULL;

UPDATE `shipment_groups` g
JOIN `shipments` s ON s.`id` = g.`shipmentId`
SET g.`status` = 'RECEIVED', g.`receivedAt` = s.`receivedAt`
WHERE s.`status` = 'RECEIVED';

-- Groupes vides d'un arrivage réceptionné : sans livraison, ils n'ont pas de sens.
DELETE g FROM `shipment_groups` g
WHERE g.`status` = 'RECEIVED'
  AND NOT EXISTS (SELECT 1 FROM `shipment_group_items` gi WHERE gi.`groupId` = g.`id`);

-- ─── 4. La ligne commandée ne porte plus ni groupe ni coûts figés ───────────

ALTER TABLE `shipment_items` DROP FOREIGN KEY `shipment_items_groupId_fkey`;

DROP INDEX `shipment_items_groupId_idx` ON `shipment_items`;

ALTER TABLE `shipment_items` DROP COLUMN `groupId`,
    DROP COLUMN `landedCost`,
    DROP COLUMN `unitShipping`;
