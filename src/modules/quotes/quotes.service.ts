import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateQuoteInput, UpdateQuoteInput, QuoteQuery } from './quotes.types.js'

export async function createQuote(input: CreateQuoteInput) {
  const quote = await prisma.quoteRequest.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      services: input.services,
      occasion: input.occasion,
      eventDate: input.eventDate,
      location: input.location,
      guests: input.guests,
      budget: input.budget,
      message: input.message,
    },
  })
  return quote
}

export async function listQuotes(query: QuoteQuery) {
  const { page, limit, status } = query

  const where: Prisma.QuoteRequestWhereInput = {
    ...(status && { status }),
  }

  const [total, items] = await prisma.$transaction([
    prisma.quoteRequest.count({ where }),
    prisma.quoteRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return {
    items,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}

export async function getQuote(id: string) {
  const quote = await prisma.quoteRequest.findUnique({ where: { id } })
  if (!quote) throw new AppError('Demande de devis introuvable', 404)
  return quote
}

export async function updateQuote(id: string, input: UpdateQuoteInput) {
  await getQuote(id)
  return prisma.quoteRequest.update({ where: { id }, data: input })
}

export async function deleteQuote(id: string) {
  await getQuote(id)
  await prisma.quoteRequest.delete({ where: { id } })
}
