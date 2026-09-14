import type { Prisma } from '@prisma/client'

/**
 * Ce qui compte comme une vente.
 *
 * On ne paie pas sur le site : une commande web est une **demande**, avec un
 * paiement `PENDING`, pas un chiffre d'affaires. Elle ne devient une vente qu'à
 * l'encaissement — au comptoir, ou enregistré après une livraison.
 *
 * Compter les commandes non payées gonflerait la recette de tout ce qui n'a
 * jamais été réglé, et fausserait dans la foulée le bénéfice net, les marges,
 * le chiffre d'affaires des clients et le suivi des objectifs. Toutes les
 * lectures d'argent passent donc par ce filtre.
 *
 * Une vente comptoir naît déjà `PAID` : elle est prise en compte immédiatement.
 */
export const PAID_ORDER = {
  status: { not: 'CANCELLED' },
  payment: { is: { status: 'PAID' } },
} satisfies Prisma.OrderWhereInput

/** Le même filtre, pour les requêtes qui partent des lignes de commande. */
export const PAID_ORDER_ITEM = { order: PAID_ORDER } satisfies Prisma.OrderItemWhereInput
