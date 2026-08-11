import { z } from 'zod'

export const ProductImageSchema = z.object({
  url: z.url(),
  alt: z.string().optional(),
  sortOrder: z.number().int().default(0),
})

export const ProductVariantSchema = z.object({
  name: z.string().min(1),
  options: z.record(z.string(), z.string()),
  sku: z.string().optional(),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  stock: z.number().int().min(0).default(0),
  isDefault: z.boolean().default(false),
  imageUrl: z.string().optional(),
})

const ProductFieldsSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  categoryId: z.string().optional(),
  price: z.number().positive(),
  // Promotion planifiée. `null` = retirer la promo (Prisma efface la colonne) ;
  // `undefined` = ne pas toucher au champ lors d'une mise à jour partielle.
  promoPrice: z.number().positive().nullable().optional(),
  promoStartsAt: z.coerce.date().nullable().optional(),
  promoEndsAt: z.coerce.date().nullable().optional(),
  costPrice: z.number().positive().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  trackInventory: z.boolean().default(true),
  stock: z.number().int().min(0).default(0),
  lowStockAlert: z.number().int().min(0).default(5),
  weight: z.number().positive().optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isPreorder: z.boolean().default(false),
  // Fenêtre de précommande. `releaseDate` en est la borne de fin : c'est aussi
  // la date de sortie affichée au client.
  preorderStartsAt: z.coerce.date().nullable().optional(),
  releaseDate: z.coerce.date().nullable().optional(),
  // Facultatif : sans prix de précommande, c'est le prix normal qui s'applique
  // déjà pendant la période.
  preorderPrice: z.number().positive().nullable().optional(),
  tags: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  seoKeywords: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  images: z.array(ProductImageSchema).default([]),
  variants: z.array(ProductVariantSchema).default([]),
})

/**
 * Cohérence de la promotion. Sur une mise à jour partielle, un champ absent
 * (`undefined`) n'est pas contrôlé : il conserve la valeur déjà en base.
 *
 * La date de fin est exigée dès qu'un prix promo est saisi — sans échéance, la
 * remise courrait indéfiniment. La date de début reste facultative : vide, la
 * promo démarre immédiatement.
 */
function promoRule(
  data: {
    price?: number
    promoPrice?: number | null
    promoStartsAt?: Date | null
    promoEndsAt?: Date | null
  },
  ctx: z.RefinementCtx,
) {
  const hasPromoPrice = typeof data.promoPrice === 'number'
  const hasDates = data.promoStartsAt instanceof Date || data.promoEndsAt instanceof Date

  if (hasPromoPrice && data.promoEndsAt == null) {
    ctx.addIssue({
      code: 'custom',
      path: ['promoEndsAt'],
      message: 'La date de fin de promotion est obligatoire quand un prix promo est renseigné',
    })
  }
  if (hasDates && data.promoPrice === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['promoPrice'],
      message: 'Une période de promotion suppose un prix promo',
    })
  }
  if (
    data.promoStartsAt instanceof Date &&
    data.promoEndsAt instanceof Date &&
    data.promoEndsAt.getTime() <= data.promoStartsAt.getTime()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['promoEndsAt'],
      message: 'La fin de la promotion doit être postérieure à son début',
    })
  }
  // Un « prix promo » supérieur au prix normal afficherait une remise négative :
  // c'est une erreur de saisie, pas une offre.
  if (hasPromoPrice && typeof data.price === 'number' && data.promoPrice! >= data.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['promoPrice'],
      message: 'Le prix promo doit être inférieur au prix normal',
    })
  }
}

/**
 * Cohérence de la précommande. La date de sortie ferme la fenêtre : sans elle,
 * le produit resterait indéfiniment « à paraître » et n'entrerait jamais dans
 * le catalogue normal. L'ouverture reste facultative : vide, les commandes sont
 * ouvertes dès l'enregistrement.
 */
function preorderRule(
  data: {
    isPreorder?: boolean
    preorderStartsAt?: Date | null
    releaseDate?: Date | null
    preorderPrice?: number | null
  },
  ctx: z.RefinementCtx,
) {
  const hasDates = data.preorderStartsAt instanceof Date || data.releaseDate instanceof Date

  if (data.isPreorder === false && typeof data.preorderPrice === 'number') {
    ctx.addIssue({
      code: 'custom',
      path: ['preorderPrice'],
      message: 'Un prix de précommande suppose que le produit soit en précommande',
    })
  }
  if (data.isPreorder === true && data.releaseDate == null) {
    ctx.addIssue({
      code: 'custom',
      path: ['releaseDate'],
      message: 'La date de sortie est obligatoire pour une précommande',
    })
  }
  if (data.isPreorder === false && hasDates) {
    ctx.addIssue({
      code: 'custom',
      path: ['isPreorder'],
      message: 'Une période de précommande suppose que le produit soit en précommande',
    })
  }
  if (
    data.preorderStartsAt instanceof Date &&
    data.releaseDate instanceof Date &&
    data.releaseDate.getTime() <= data.preorderStartsAt.getTime()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['releaseDate'],
      message: 'La date de sortie doit être postérieure à l\'ouverture des précommandes',
    })
  }
}

export const CreateProductSchema = ProductFieldsSchema.superRefine((data, ctx) => {
  promoRule(data, ctx)
  preorderRule(data, ctx)
})

export const UpdateProductSchema = ProductFieldsSchema.partial().superRefine((data, ctx) => {
  promoRule(data, ctx)
  preorderRule(data, ctx)
})

export const ProductQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  isFeatured: z.enum(['true', 'false']).optional(),
  isNew: z.enum(['true', 'false']).optional(),
  isPreorder: z.enum(['true', 'false']).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sortBy: z.enum(['name', 'price', 'createdAt', 'stock', 'releaseDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
export type ProductQuery = z.infer<typeof ProductQuerySchema>
