import { prisma } from './prisma.js'
import { AppError } from '../middlewares/errors.js'

interface Actor {
  userId: string
  role: string
}

/**
 * La boutique sur laquelle une action de stock a le droit de porter.
 *
 * Une vendeuse ne sort et n'entre de la marchandise que là où elle travaille —
 * même règle qu'à la caisse. Sans cette borne, un compte de comptoir pourrait
 * gonfler ou vider le stock d'une autre boutique en nommant simplement son
 * identifiant dans la requête.
 *
 * Les administrateurs, eux, désignent la boutique qu'ils veulent : c'est tout
 * l'objet des écrans Arrivages et Transferts.
 */
export async function resolveStoreScope(
  actor: Actor,
  requested: string | undefined,
  /** Refus adapté à l'action : tout ce qui est borné ici n'est pas du stock. */
  refusal = 'Vous ne pouvez agir que sur le stock de votre boutique.',
): Promise<string | undefined> {
  if (actor.role !== 'VENDEUR') return requested

  const me = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { storeId: true },
  })
  if (!me?.storeId) {
    throw new AppError(
      'Votre compte n’est rattaché à aucune boutique : demandez à un administrateur de vous en affecter une.',
      403,
    )
  }
  if (requested && requested !== me.storeId) {
    throw new AppError(refusal, 403)
  }
  return me.storeId
}
