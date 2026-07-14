// Hook de résolution pour lancer le backend TypeScript avec le runtime NATIF de
// Node (type stripping), au lieu de tsx.
//
// Pourquoi : tsx (jusqu'à 4.23.x) résout mal le paquet dual CJS/ESM
// `@edgestore/server` sous Node 24 et renvoie un module aux exports vides
// (« does not provide an export named createEdgeStoreExpressHandler »).
// Le loader natif de Node charge ce paquet correctement.
//
// Le seul manque du natif : il ne réécrit pas les imports `./x.js` vers `./x.ts`
// (convention TypeScript NodeNext utilisée dans le code source). Ce hook s'en
// charge : pour un import relatif en `.js`, il essaie d'abord le `.ts`
// correspondant, et retombe sur l'original sinon (vrais fichiers `.js`).

import { register } from 'node:module'

const hook = `
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    try {
      return await next(specifier.slice(0, -3) + '.ts', context)
    } catch {
      // pas de .ts correspondant : on garde le specifier d'origine
    }
  }
  return next(specifier, context)
}
`

register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url)
