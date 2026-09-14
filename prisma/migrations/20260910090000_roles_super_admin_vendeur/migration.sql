-- Passage à trois rôles de back-office : SUPER_ADMIN (tous les droits),
-- ADMIN (tous les droits sauf les écrans d'argent de la gestion) et
-- VENDEUR (le comptoir). MANAGER disparaît.
--
-- MySQL n'ayant pas de type énuméré partagé, on élargit d'abord la colonne à
-- l'union des anciennes et des nouvelles valeurs, on remappe, puis on la
-- resserre sur les seules valeurs conservées.

ALTER TABLE `users` MODIFY `role`
  ENUM('CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN', 'VENDEUR', 'SUPER_ADMIN')
  NOT NULL DEFAULT 'CUSTOMER';

-- L'ordre compte : l'ancien ADMIN doit devenir SUPER_ADMIN avant que MANAGER
-- ne prenne le nom d'ADMIN, sinon les deux populations se confondraient.
UPDATE `users` SET `role` = 'SUPER_ADMIN' WHERE `role` = 'ADMIN';
UPDATE `users` SET `role` = 'ADMIN'       WHERE `role` = 'MANAGER';
UPDATE `users` SET `role` = 'VENDEUR'     WHERE `role` = 'STAFF';

ALTER TABLE `users` MODIFY `role`
  ENUM('CUSTOMER', 'VENDEUR', 'ADMIN', 'SUPER_ADMIN')
  NOT NULL DEFAULT 'CUSTOMER';
