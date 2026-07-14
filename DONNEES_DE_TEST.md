# Données de test (seed)

Ce document décrit le jeu de données de test généré par `prisma/seed.ts` et
comment le relancer.

## Lancer les deux serveurs (backend + frontend)

Depuis la racine du projet :

```bash
./dev.sh
```

- Backend → http://localhost:3001
- Frontend → http://localhost:5173 (proxy `/api` vers le backend)
- `Ctrl+C` arrête les deux.

> Le backend tourne avec le **runtime TypeScript natif de Node**
> (`node --experimental-transform-types --import ./scripts/dev-register.mjs`),
> et non tsx : tsx (≤ 4.23.x) charge mal le paquet dual `@edgestore/server`
> sous Node 24 et renvoie des exports vides. Voir `scripts/dev-register.mjs`.

## Lancer le seed

```bash
cd backend
pnpm db:seed          # ou : ./node_modules/.bin/tsx prisma/seed.ts
```

Le seed est **idempotent** : il nettoie les données de test (dans l'ordre des
dépendances FK) puis les recrée. Le compte **admin** est préservé.

## Connexion base de données

Le seed (et le backend) se connectent via `DATABASE_URL` dans `backend/.env`.

MySQL utilise `caching_sha2_password` sans TLS, ce qui nécessite le paramètre
`allowPublicKeyRetrieval=true` dans l'URL, sinon la connexion échoue avec
« RSA public key is not available client side » :

```
DATABASE_URL="mysql://root:...@localhost:3306/willy_accesoire?allowPublicKeyRetrieval=true"
```

## Comptes de test

| Email                       | Mot de passe   | Rôle     |
| --------------------------- | -------------- | -------- |
| admin@willy-accesoire.com   | `Admin1234!`   | ADMIN    |
| manager@willy-accesoire.com | `Manager1234!` | MANAGER  |
| staff@willy-accesoire.com   | `Staff1234!`   | STAFF    |
| aya@example.com             | `Client1234!`  | CUSTOMER |
| koffi@example.com           | `Client1234!`  | CUSTOMER |
| fatou@example.com           | `Client1234!`  | CUSTOMER |

## Contenu généré

| Données             | Détail                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Utilisateurs        | admin, manager, staff + 3 clients                                                                          |
| Adresses            | 1 par client (Abidjan)                                                                                     |
| Produits            | 46 (24 sacs, 16 accessoires, 6 précommandes) + SKU                                                         |
| Variantes           | 4 (sur 2 sacs)                                                                                             |
| Coupons             | `BIENVENUE10` (-10%), `SACS5000` (-5000 F dès 30000 F), `EXPIRE` (inactif)                                 |
| Avis                | 7, dont certains en attente de modération                                                                  |
| Panier              | 1 panier actif (aya@example.com)                                                                           |
| Commandes           | 7 couvrant **tous les statuts** + paiements (CASH, Mobile Money, carte, virement)                          |
| Mouvements de stock | 8 (restock / vente)                                                                                        |
| Campagnes           | EMAIL, WHATSAPP, SMS                                                                                       |
| Devis salon         | 3 (statuts NEW / IN_REVIEW / QUOTED)                                                                       |
| Carrousel           | 3 slides                                                                                                   |
| FAQ                 | 4 questions                                                                                                |
| Catalogues salon    | 3                                                                                                          |
| Réglages boutique   | 6 (`storeName`, `contactPhone`, `contactEmail`, `whatsappNumber`, `announcement`, `freeShippingThreshold`) |

## Source des données produits

Les produits sont importés depuis les fichiers du frontend :

- `willy-accesoire/src/data/bags.ts`
- `willy-accesoire/src/data/accessories.ts`
- `willy-accesoire/src/data/preorders.ts`
