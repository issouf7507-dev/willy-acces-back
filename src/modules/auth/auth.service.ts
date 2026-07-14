import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'
import { AppError } from '../../middlewares/errors.js'
import type { LoginInput, RegisterInput } from './auth.types.js'

function signTokens(userId: string, role: string) {
  const accessToken = jwt.sign({ userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
  const refreshToken = jwt.sign({ userId, role }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
  return { accessToken, refreshToken }
}

export async function register(input: RegisterInput, userAgent?: string, ip?: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new AppError('Email déjà utilisé', 409)

  const hashed = await bcrypt.hash(input.password, 12)
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, password: hashed, phone: input.phone },
    select: { id: true, name: true, email: true, role: true },
  })

  const { accessToken, refreshToken } = signTokens(user.id, user.role)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  await prisma.session.create({
    data: {
      userId: user.id,
      token: accessToken,
      expiresAt,
      userAgent,
      ipAddress: ip,
    },
  })

  return { user, accessToken, refreshToken }
}

export async function login(input: LoginInput, userAgent?: string, ip?: string) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true, role: true, password: true, isActive: true },
  })

  if (!user || !(await bcrypt.compare(input.password, user.password))) {
    throw new AppError('Email ou mot de passe incorrect', 401)
  }

  if (!user.isActive) throw new AppError('Compte désactivé', 403)

  const { accessToken, refreshToken } = signTokens(user.id, user.role)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  await prisma.session.create({
    data: { userId: user.id, token: accessToken, expiresAt, userAgent, ipAddress: ip },
  })

  const { password: _, ...safeUser } = user
  return { user: safeUser, accessToken, refreshToken }
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { token } })
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  })
  return user
}
