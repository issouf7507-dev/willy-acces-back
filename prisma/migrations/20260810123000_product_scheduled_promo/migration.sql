-- AlterTable
ALTER TABLE `products`
  ADD COLUMN `promoPrice` DECIMAL(12, 2) NULL,
  ADD COLUMN `promoStartsAt` DATETIME(3) NULL,
  ADD COLUMN `promoEndsAt` DATETIME(3) NULL;

-- Reprise de l'ancien modèle, où `price` portait le prix promotionnel et
-- `compareAtPrice` le prix normal barré. On rétablit `price` = prix normal et
-- on déplace la remise dans `promoPrice`. Sans dates : la promo est considérée
-- comme déjà démarrée et sans échéance, donc l'affichage reste identique tant
-- que le back-office ne lui a pas fixé de fenêtre.
UPDATE `products`
SET `promoPrice` = `price`,
    `price` = `compareAtPrice`
WHERE `compareAtPrice` IS NOT NULL
  AND `compareAtPrice` > `price`;

-- DropColumn : le prix barré n'est plus stocké, il se déduit de la promo en
-- cours (c'est `price` qui s'affiche barré tant que la fenêtre est ouverte).
ALTER TABLE `products` DROP COLUMN `compareAtPrice`;
