/**
 * Transforme les sous-catégories d'accessoires — jusqu'ici figées dans le code
 * front (ACCESSORY_CATEGORIES) et portées par `metadata.accessoryCategory` — en
 * vraies catégories enfants de « Accessoires », gérables depuis le back-office.
 *
 * Idempotent : relançable sans risque (upsert des catégories, et on ne
 * réaffecte qu'un produit encore rattaché au parent).
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning \
 *     scripts/migrate-accessory-subcategories.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { config } from 'dotenv'

config()

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const DRY_RUN = process.argv.includes('--dry-run')

/** Slugs historiques de `metadata.accessoryCategory` → libellé affiché. */
const SUBCATEGORIES = [
  { slug: 'porte-cles', name: 'Porte-clés', sortOrder: 1 },
  { slug: 'sangles', name: 'Sangles', sortOrder: 2 },
  { slug: 'casquettes', name: 'Casquettes', sortOrder: 3 },
  { slug: 'gourdes', name: 'Gourdes', sortOrder: 4 },
  { slug: 'pochettes', name: 'Pochettes', sortOrder: 5 },
  { slug: 'entretien', name: 'Entretien', sortOrder: 6 },
]

async function main() {
  if (DRY_RUN) console.log('— DRY RUN : aucune écriture —\n')

  const parent = await prisma.category.findUnique({ where: { slug: 'accessoires' } })
  if (!parent) throw new Error("Catégorie « accessoires » introuvable : lance d'abord le seed.")

  // 1. Les sous-catégories, rattachées à Accessoires.
  // En dry-run on note quand même le slug comme cible valide, sinon l'étape 2
  // signalerait à tort tous les produits comme « catégorie inconnue ».
  const idBySlug: Record<string, string> = {}
  for (const sub of SUBCATEGORIES) {
    if (DRY_RUN) {
      const existing = await prisma.category.findUnique({ where: { slug: sub.slug } })
      console.log(`  ${existing ? 'existe déjà' : 'à créer   '} : ${sub.slug}`)
      idBySlug[sub.slug] = existing?.id ?? '(à créer)'
      continue
    }
    const cat = await prisma.category.upsert({
      where: { slug: sub.slug },
      update: { name: sub.name, parentId: parent.id, sortOrder: sub.sortOrder, isActive: true },
      create: { ...sub, parentId: parent.id },
    })
    idBySlug[sub.slug] = cat.id
  }
  console.log(`✅ ${SUBCATEGORIES.length} sous-catégories sous « ${parent.name} »`)

  // 2. Réaffectation des produits encore rattachés au parent.
  const products = await prisma.product.findMany({
    where: { categoryId: parent.id },
    select: { id: true, name: true, metadata: true },
  })

  let moved = 0
  const orphans: string[] = []
  for (const p of products) {
    const meta = p.metadata as Record<string, unknown> | null
    const slug = meta?.accessoryCategory as string | undefined
    if (!slug) {
      orphans.push(p.name)
      continue
    }
    const targetId = idBySlug[slug]
    if (!targetId) {
      console.warn(`  ⚠️  ${p.name} : accessoryCategory « ${slug} » inconnue, laissé sur le parent`)
      continue
    }
    if (!DRY_RUN) {
      await prisma.product.update({ where: { id: p.id }, data: { categoryId: targetId } })
    }
    moved++
  }

  console.log(`✅ ${moved} produit(s) déplacé(s) vers leur sous-catégorie`)
  if (orphans.length) {
    console.log(
      `ℹ️  ${orphans.length} produit(s) sans accessoryCategory laissé(s) sur « ${parent.name} » ` +
        `(visibles dans l'onglet « Tous ») : ${orphans.join(', ')}`,
    )
  }
}

main()
  .catch((e) => {
    console.error('❌', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
