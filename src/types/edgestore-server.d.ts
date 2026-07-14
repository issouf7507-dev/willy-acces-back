// Shim de types pour `@edgestore/server`.
//
// Le package @edgestore 0.7 publie des `dist/*.d.ts` qui ré-exportent leurs
// sources `.ts` (`export * from '../src/...'`). Ces sources sont écrites pour
// zod 3 (`AnyZodObject`, supprimé en zod 4) et importent `cookie` sans types,
// ce qui casse `tsc` (skipLibCheck n'ignore que les `.d.ts`, pas les `.ts`).
//
// On type ici de façon souple l'API réellement utilisée. `paths` (tsconfig)
// redirige le typage vers ce fichier ; le runtime importe le vrai package.

declare const initEdgeStore: {
  create(): {
    router(routes: Record<string, unknown>): unknown
    imageBucket(config?: { maxSize?: number; accept?: string[] }): unknown
  }
}

export { initEdgeStore }
