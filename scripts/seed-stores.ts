/**
 * Installe le socle du module Gestion : les points de vente, puis rattache les
 * commandes déjà enregistrées à la boutique en ligne.
 *
 * Sans ce rattachement, tout l'historique du site resterait hors des recettes
 * par boutique et fausserait le comparatif dès la première clôture.
 *
 * Idempotent : relançable sans risque, il ne réécrit jamais une boutique
 * existante (nom, adresse et téléphone restent modifiables depuis le
 * back-office) et ne touche qu'aux commandes encore sans boutique.
 *
 * Lancer depuis `backend/` :
 *   pnpm run gestion:init
 */
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";

config();

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

/** Les 4 points de vente repris du classeur Excel de suivi. */
const STORES = [
  { name: "Palmeraie", slug: "palmeraie", type: "PHYSICAL" as const, sortOrder: 1 },
  { name: "Grand Marché de Marcory", slug: "grand-marche-marcory", type: "PHYSICAL" as const, sortOrder: 2 },
  { name: "Cocody", slug: "cocody", type: "PHYSICAL" as const, sortOrder: 3 },
  {
    name: "WillyAccessoires Pro (en ligne)",
    slug: "en-ligne",
    type: "ONLINE" as const,
    sortOrder: 4,
    isDefaultOnline: true,
  },
];

async function main() {
  for (const store of STORES) {
    const existing = await prisma.store.findUnique({ where: { slug: store.slug } });
    if (existing) {
      console.log(`↷ ${store.name} — déjà présente, inchangée`);
      continue;
    }
    await prisma.store.create({ data: store });
    console.log(`✅ ${store.name} créée`);
  }

  const online = await prisma.store.findFirst({ where: { isDefaultOnline: true } });
  if (!online) {
    console.warn("⚠️  Aucune boutique en ligne par défaut : rattachement des commandes ignoré.");
    return;
  }

  // Seules les commandes orphelines sont touchées : une vente déjà rattachée à
  // un point de vente ne doit jamais être ramenée vers le web.
  const { count } = await prisma.order.updateMany({
    where: { storeId: null },
    data: { storeId: online.id, channel: "ONLINE" },
  });
  console.log(
    count > 0
      ? `✅ ${count} commande(s) rattachée(s) à « ${online.name} »`
      : "↷ Aucune commande à rattacher",
  );
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
