import { z } from 'zod'

/** Rôles donnant accès au back-office. CUSTOMER en est exclu. */
export const STAFF_ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const

export const RoleSchema = z.enum(['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'])

export const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  // Aligné sur RegisterSchema (min 8). Le hash est fait côté service.
  password: z.string().min(8),
  role: RoleSchema,
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
})

export const UpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.email().optional(),
  role: RoleSchema.optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  /** Réinitialisation : mot de passe remplacé s'il est fourni. */
  password: z.string().min(8).optional(),
})

export const UserQuerySchema = z.object({
  search: z.string().optional(),
  role: RoleSchema.optional(),
  /** Par défaut on ne liste que les comptes du back-office. */
  scope: z.enum(['staff', 'all']).default('staff'),
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>
export type UserQuery = z.infer<typeof UserQuerySchema>
