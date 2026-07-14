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

export const ForgotPasswordSchema = z.object({
  email: z.email(),
})

export const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
