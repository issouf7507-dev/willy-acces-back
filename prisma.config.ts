import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

config()

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL as string,
    // Base jetable utilisée par `migrate diff --from-migrations` et par le
    // contrôle de drift. Optionnelle : renseigner SHADOW_DATABASE_URL seulement
    // en développement, quand une de ces commandes la réclame.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
