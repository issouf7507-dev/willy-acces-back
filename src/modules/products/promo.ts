import type { Prisma } from '@prisma/client'

/**
 * Une promotion se décrit par un prix (`promoPrice`) et une fenêtre
 * (`promoStartsAt` → `promoEndsAt`). Rien n'est réécrit en base au fil du
 * temps : la promo s'ouvre et se referme d'elle-même, ce qui permet de la
 * planifier à l'avance et de la programmer sur une période précise.
 *
 * Bornes ouvertes acceptées : début vide = démarre immédiatement, fin vide =
 * sans échéance (cas des promos reprises de l'ancien modèle).
 */
export interface PromoFields {
  price: Prisma.Decimal
  promoPrice?: Prisma.Decimal | null
  promoStartsAt?: Date | null
  promoEndsAt?: Date | null
}

export function isPromoActive(p: PromoFields, now = new Date()): boolean {
  if (p.promoPrice == null) return false
  if (p.promoStartsAt && p.promoStartsAt.getTime() > now.getTime()) return false
  if (p.promoEndsAt && p.promoEndsAt.getTime() <= now.getTime()) return false
  return true
}
