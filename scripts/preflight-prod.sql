-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles facultatifs sur la base de PRODUCTION, en lecture seule.
--
-- La reprise des données est automatique : `scripts/pre-deploy.ts` s'exécute
-- pendant le déploiement, avant `prisma db push`. Ce fichier ne sert qu'à
-- regarder l'état de la base avant et après, si l'on veut vérifier soi-même.
--
--   mysql -u <user> -p <base> < scripts/preflight-prod.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── AVANT le déploiement ─────────────────────────────────────────────────────

-- Combien de produits portent un prix barré, et combien décrivent une vraie
-- remise (seuls ceux-là seront convertis en promotion).
SELECT
  COUNT(*)                                                    AS produits_total,
  SUM(compareAtPrice IS NOT NULL)                             AS avec_prix_barre,
  SUM(compareAtPrice IS NOT NULL AND compareAtPrice > price)  AS a_convertir_en_promo,
  SUM(compareAtPrice IS NOT NULL AND compareAtPrice <= price) AS valeurs_sans_reprise
FROM products;

-- Le détail, à garder sous les yeux pour comparer après coup.
SELECT id, name, price AS prix_actuel, compareAtPrice AS prix_barre_actuel
FROM products
WHERE compareAtPrice IS NOT NULL
ORDER BY name;

-- Les variantes gardent leur propre prix barré : ce compte doit être identique
-- avant et après le déploiement.
SELECT COUNT(*) AS variantes_avec_prix_barre
FROM product_variants
WHERE compareAtPrice IS NOT NULL;


-- ── APRÈS le déploiement ─────────────────────────────────────────────────────

-- Chaque produit qui était en promotion doit apparaître ici, prix normal
-- rétabli et remise conservée. `promoEndsAt` est vide : les promotions reprises
-- n'ont pas d'échéance tant qu'on ne leur en fixe pas une au back-office.
-- SELECT id, name, price AS prix_normal, promoPrice AS prix_promo, promoEndsAt
-- FROM products
-- WHERE promoPrice IS NOT NULL
-- ORDER BY name;
