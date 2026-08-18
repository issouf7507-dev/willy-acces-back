-- Lieu de livraison demandé à la précommande (nullable : les demandes déjà en base n'en ont pas).
ALTER TABLE `preorder_requests` ADD COLUMN `deliveryPlace` VARCHAR(191) NULL;
