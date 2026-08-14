import type { Prisma } from '@prisma/client'
import { isPromoActive, type PromoFields } from './promo.js'
import { isPreorderOpen, type PreorderFields } from './preorder.js'

/**
 * Un produit peut porter deux tarifs datés : un prix de précommande, valable
 * tant que les commandes sont ouvertes, et un prix promotionnel sur sa propre
 * fenêtre. Aucun n'est écrit dans `price`, qui reste le prix normal de
 * référence — celui qui reprend la main dès qu'aucune fenêtre n'est ouverte.
 */
export type PricingFields = PromoFields & PreorderFields

/**
 * Ordre de priorité : précommande, puis promo, puis prix normal.
 *
 * La précommande passe devant parce qu'elle décrit un produit qui n'est pas
 * encore en vente ordinaire : son tarif est la condition d'entrée, pas une
 * remise ponctuelle. Le cas où les deux sont réglés en même temps reste rare,
 * mais il faut bien qu'un seul prix soit facturé.
 */
export function effectivePrice(p: PricingFields, now = new Date()): Prisma.Decimal {
  if (p.preorderPrice != null && isPreorderOpen(p, now)) return p.preorderPrice
  if (isPromoActive(p, now)) return p.promoPrice!
  return p.price
}

/**
 * Traduit les tarifs datés en couple d'affichage `{ price, compareAtPrice }`,
 * le format que la boutique et l'app mobile consomment déjà : le prix applicable
 * devient `price`, et le prix normal passe en prix barré — mais seulement s'il
 * est plus élevé, sinon on afficherait une remise négative.
 *
 * `price` étant écrasé par le tarif du moment, le prix normal est republié tel
 * quel dans `basePrice`. Sans lui, un client de l'API ne peut plus retrouver le
 * prix de référence dès qu'une fenêtre est ouverte : le back-office rechargeait
 * le prix promo/précommande dans le champ « Prix normal » et l'écrasait en base
 * au premier enregistrement, et la boutique ne pouvait pas annoncer le prix qui
 * reprendra la main à la sortie d'une précommande.
 */
export function withPricing<T extends PricingFields>(product: T) {
  const price = effectivePrice(product)
  const discounted = price.lessThan(product.price)

  return {
    ...product,
    price,
    basePrice: product.price,
    compareAtPrice: discounted ? product.price : null,
    isPromoActive: isPromoActive(product),
  }
}
