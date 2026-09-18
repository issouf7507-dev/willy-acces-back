-- Séparation arrivage / groupe.
--
-- Un arrivage (A1, A2…) est ce que le cargo livre ; ses produits sont ensuite
-- répartis dans des groupes (G1, G2…) qui portent chacun leur transport.
-- Jusqu'ici l'arrivage *était* le groupe : chaque arrivage existant devient un
-- arrivage à un seul groupe, qui garde son code et son transport.

-- ─── 1. Table des groupes ───────────────────────────────────────────────────

CREATE TABLE `shipment_groups` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `shippingCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shipment_groups_code_key`(`code`),
    INDEX `shipment_groups_shipmentId_idx`(`shipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shipment_groups` ADD CONSTRAINT `shipment_groups_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2. Rattachement des lignes ─────────────────────────────────────────────

ALTER TABLE `shipment_items` ADD COLUMN `groupId` VARCHAR(191) NULL;

CREATE INDEX `shipment_items_groupId_idx` ON `shipment_items`(`groupId`);

ALTER TABLE `shipment_items` ADD CONSTRAINT `shipment_items_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `shipment_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 3. Reprise des données : un groupe par arrivage existant ───────────────
-- Le groupe hérite du code (G1…) : c'est lui que citent les mouvements de
-- stock déjà écrits. Les coûts figés des lignes réceptionnées sont inchangés.

INSERT INTO `shipment_groups` (`id`, `shipmentId`, `code`, `label`, `shippingCost`, `createdAt`, `updatedAt`)
SELECT CONCAT('grp_', `id`), `id`, `code`, NULL, `shippingCost`, `createdAt`, `updatedAt`
FROM `shipments`;

UPDATE `shipment_items` SET `groupId` = CONCAT('grp_', `shipmentId`);

-- L'arrivage passe dans sa propre série : G3 devient A3.
UPDATE `shipments` SET `code` = CONCAT('A', SUBSTRING(`code`, 2)) WHERE `code` REGEXP '^G[0-9]+$';

-- ─── 4. Le transport ne vit plus que sur le groupe ──────────────────────────

ALTER TABLE `shipments` DROP COLUMN `shippingCost`;
