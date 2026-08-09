import rateLimit from 'express-rate-limit'

/**
 * Limiteur strict pour l'authentification (login / register).
 * Protège contre le brute-force : 10 tentatives / 15 min par IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Trop de tentatives. Réessayez dans quelques minutes.',
  },
})

/**
 * Dépôt d'avis depuis la boutique : route publique, sans compte.
 * 5 avis / heure par IP, de quoi noter quelques produits sans permettre
 * d'inonder la file de modération.
 */
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Vous avez déjà envoyé plusieurs avis. Merci de réessayer plus tard.',
  },
})

/**
 * Limiteur global, appliqué à toute l'API.
 * Garde-fou raisonnable : 300 requêtes / minute par IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Trop de requêtes. Merci de patienter.',
  },
})
