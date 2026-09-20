-- Douane des arrivages.
--
-- Deux montants, comme au dédouanement réel : celui annoncé pour le lot entier
-- à la commande (`shipments.customsCost`, prévisionnel) et celui réellement
-- payé sur chaque livraison (`shipment_groups.customsCost`), qui se répartit à
-- l'unité comme le transport et entre dans le coût de revient.

ALTER TABLE `shipments` ADD COLUMN `customsCost` DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE `shipment_groups` ADD COLUMN `customsCost` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Nulle sur les livraisons déjà réceptionnées : leur coût de revient est figé,
-- le recalculer réécrirait la marge de ventes déjà enregistrées.
ALTER TABLE `shipment_group_items` ADD COLUMN `unitCustoms` DECIMAL(12, 2) NULL;
