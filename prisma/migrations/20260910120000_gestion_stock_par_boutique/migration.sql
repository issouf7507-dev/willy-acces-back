-- Stock tenu par boutique.
--
-- `products.stock` reste le total de l'entreprise — la boutique en ligne, le
-- panier et les fiches produit le lisent tel quel. `store_stocks` en donne la
-- répartition, et c'est elle qui commande désormais la caisse et les alertes.

-- ─── 1. Mouvements d'inventaire : type TRANSFER, et la boutique concernée ───

ALTER TABLE `inventory_movements`
  MODIFY `type` ENUM('RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN', 'DAMAGE', 'TRANSFER') NOT NULL,
  ADD COLUMN `storeId` VARCHAR(191) NULL;

CREATE INDEX `inventory_movements_storeId_idx` ON `inventory_movements`(`storeId`);

ALTER TABLE `inventory_movements`
  ADD CONSTRAINT `inventory_movements_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 2. Arrivage : la boutique par défaut du lot ────────────────────────────

ALTER TABLE `shipments` ADD COLUMN `storeId` VARCHAR(191) NULL;

CREATE INDEX `shipments_storeId_idx` ON `shipments`(`storeId`);

ALTER TABLE `shipments`
  ADD CONSTRAINT `shipments_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 3. Ligne d'arrivage : la boutique créditée à la réception ──────────────
-- Ajoutée nullable et renseignée avant d'être exigée : une colonne NOT NULL
-- posée d'emblée casserait sur les lignes déjà saisies.

ALTER TABLE `shipment_items` ADD COLUMN `storeId` VARCHAR(191) NULL;

UPDATE `shipment_items`
SET `storeId` = (
  SELECT `id` FROM `stores`
  ORDER BY `isDefaultOnline` DESC, `sortOrder` ASC, `name` ASC
  LIMIT 1
)
WHERE `storeId` IS NULL;

ALTER TABLE `shipment_items` MODIFY `storeId` VARCHAR(191) NOT NULL;

-- Le même produit peut désormais figurer deux fois dans un lot, à condition
-- d'aller dans deux boutiques différentes.
--
-- L'ordre compte : la clé étrangère `shipmentId` s'appuie sur l'ancien index
-- composite, et MySQL refuse de le supprimer tant qu'aucun autre index ne peut
-- le remplacer. Le nouvel index commence lui aussi par `shipmentId` : créé
-- d'abord, il prend le relais et l'ancien devient supprimable.
CREATE UNIQUE INDEX `shipment_items_shipmentId_productId_storeId_key`
  ON `shipment_items`(`shipmentId`, `productId`, `storeId`);

DROP INDEX `shipment_items_shipmentId_productId_key` ON `shipment_items`;

CREATE INDEX `shipment_items_storeId_idx` ON `shipment_items`(`storeId`);

ALTER TABLE `shipment_items`
  ADD CONSTRAINT `shipment_items_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 4. Le stock par boutique ───────────────────────────────────────────────

CREATE TABLE `store_stocks` (
  `id`        VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `storeId`   VARCHAR(191) NOT NULL,
  `quantity`  INTEGER      NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3)  NOT NULL,

  UNIQUE INDEX `store_stocks_productId_storeId_key`(`productId`, `storeId`),
  INDEX `store_stocks_storeId_idx`(`storeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `store_stocks`
  ADD CONSTRAINT `store_stocks_productId_fkey`
  FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `store_stocks_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 5. Les transferts entre boutiques ──────────────────────────────────────

CREATE TABLE `stock_transfers` (
  `id`          VARCHAR(191) NOT NULL,
  `productId`   VARCHAR(191) NOT NULL,
  `fromStoreId` VARCHAR(191) NOT NULL,
  `toStoreId`   VARCHAR(191) NOT NULL,
  `quantity`    INTEGER      NOT NULL,
  `note`        TEXT         NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `stock_transfers_productId_idx`(`productId`),
  INDEX `stock_transfers_fromStoreId_idx`(`fromStoreId`),
  INDEX `stock_transfers_toStoreId_idx`(`toStoreId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stock_transfers`
  ADD CONSTRAINT `stock_transfers_productId_fkey`
  FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_transfers_fromStoreId_fkey`
  FOREIGN KEY (`fromStoreId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_transfers_toStoreId_fkey`
  FOREIGN KEY (`toStoreId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_transfers_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 6. Répartition initiale ────────────────────────────────────────────────
-- Le stock déjà en base est affecté en bloc à une boutique, faute de savoir où
-- il se trouve réellement. Ce qui est ailleurs se régularise ensuite par un
-- transfert. Sans cette étape, la caisse refuserait toutes les ventes : la
-- boutique de la vendeuse afficherait zéro.

INSERT INTO `store_stocks` (`id`, `productId`, `storeId`, `quantity`, `updatedAt`)
SELECT UUID(), p.`id`,
       (SELECT `id` FROM `stores`
        ORDER BY `isDefaultOnline` DESC, `sortOrder` ASC, `name` ASC LIMIT 1),
       p.`stock`, NOW(3)
FROM `products` p
WHERE p.`stock` > 0
  AND EXISTS (SELECT 1 FROM `stores`);
