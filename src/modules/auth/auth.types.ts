import { z } from 'zod'

export const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
  phone: z.string().optional(),
})

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const RefreshSchema = z.object({
  refreshToken: z.string(),
})

/** Changement de son propre mot de passe, depuis un compte déjà connecté. */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Le nouveau mot de passe fait 8 caractères minimum'),
})

export const ForgotPasswordSchema = z.object({
  email: z.email(),
})

export const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
})

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
