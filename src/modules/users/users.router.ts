import { Router } from 'express'
import { CreateUserSchema, UpdateUserSchema, UserQuerySchema } from './users.types.js'
import * as usersService from './users.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

// La gestion des comptes est réservée aux ADMIN : aucune route publique ici.
router.use(authenticate, requireRole('ADMIN'))

router.get('/', async (req, res, next) => {
  try {
    const query = UserQuerySchema.parse(req.query)
    res.json({ success: true, data: await usersService.listUsers(query) })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await usersService.getUser(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const input = CreateUserSchema.parse(req.body)
    res.status(201).json({ success: true, data: await usersService.createUser(input) })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const input = UpdateUserSchema.parse(req.body)
    const user = await usersService.updateUser(String(req.params.id), input, req.user!.userId)
    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await usersService.deleteUser(String(req.params.id), req.user!.userId)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
