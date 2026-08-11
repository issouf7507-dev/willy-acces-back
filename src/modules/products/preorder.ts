import type { Prisma } from '@prisma/client'

/**
 * Fenêtre de précommande : les commandes ouvrent à `preorderStartsAt` (vide =
 * ouvertes tout de suite) et se ferment à `releaseDate`, qui est aussi la date
 * de sortie annoncée au client.
 *
 * Comme pour les promotions, rien n'est réécrit en base : l'état se déduit de
 * l'heure courante, ce qui permet de préparer une précommande à l'avance et de
 * la voir se fermer d'elle-même le jour de la sortie.
 */
export interface PreorderFields {
  isPreorder: boolean
  preorderStartsAt?: Date | null
  releaseDate?: Date | null
  /** Prix pendant la précommande ; vide = le prix normal s'applique déjà. */
  preorderPrice?: Prisma.Decimal | null
}

/**
 * Vrai tant que le produit n'est pas sorti — y compris avant l'ouverture des
 * commandes. C'est ce drapeau qui tient le produit hors du catalogue normal :
 * un article non sorti ne doit pas se retrouver en vente classique. Le jour de
 * la sortie il bascule à faux et le produit rejoint les collections.
 */
export function isPreorderActive(p: PreorderFields, now = new Date()): boolean {
  if (!p.isPreorder) return false
  return !p.releaseDate || p.releaseDate.getTime() > now.getTime()
}

/**
 * Vrai quand les commandes sont effectivement ouvertes. Se distingue de
 * `isPreorderActive` sur la période qui précède l'ouverture : le produit est
 * déjà en précommande, mais pas encore proposé.
 */
export function isPreorderOpen(p: PreorderFields, now = new Date()): boolean {
  if (!isPreorderActive(p, now)) return false
  return !p.preorderStartsAt || p.preorderStartsAt.getTime() <= now.getTime()
}

export function withPreorderState<T extends PreorderFields>(product: T) {
  return {
    ...product,
    isPreorderActive: isPreorderActive(product),
    isPreorderOpen: isPreorderOpen(product),
  }
}
