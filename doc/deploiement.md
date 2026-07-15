# Déploiement backend — Willy Accessoire

Domaine backend : **backend.willyaccessoire.com** → app Node/Express sur `localhost:3001` (PM2).

## 1. Reverse-proxy Nginx

Fichier : `/etc/nginx/sites-available/backend.willyaccessoire.com`

```nginx
server {
    listen 80;
    server_name backend.willyaccessoire.com;

    # Redirection HTTPS (après obtention du certificat, voir §2)
    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Uploads EdgeStore (images jusqu'à 10 Mo)
        client_max_body_size 12M;
    }
}
```

Activation :

```bash
sudo ln -s /etc/nginx/sites-available/backend.willyaccessoire.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> `app.set('trust proxy', 1)` est déjà configuré côté Express : la vraie IP client
> (rate-limiting, sessions) est lue depuis `X-Forwarded-For`.

## 2. HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d backend.willyaccessoire.com
```

Certbot ajoute automatiquement le bloc `listen 443 ssl` et la redirection 80→443.

## 3. Variables d'environnement (VPS)

Sur le serveur, dans le `.env` du backend (jamais commité) :

- `NODE_ENV=production`
- `PORT=3001`
- `DATABASE_URL=...` (MariaDB de prod)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` : secrets forts (voir `.env.example`)
- `ALLOWED_ORIGINS=https://willyaccessoire.com` (domaine du front — CORS ;
  ajouter `,https://www.willyaccessoire.com` si le www est aussi servi)
- `EDGE_STORE_ACCESS_KEY` / `EDGE_STORE_SECRET_KEY`

## 4. Front → back

Le front appelle le backend en cross-origin. Définir dans la CI front (secret GitHub) :

```
VITE_API_BASE = https://backend.willyaccessoire.com/api
```

`src/lib/api.ts` l'utilise (fallback `/api` si vide). Sans cette variable, le front
appellerait `/api` en same-origin (ne fonctionnerait pas si front et back sont sur
des domaines séparés).

## 5. Migrations Prisma (manuel, au 1er déploiement et à chaque changement de schéma)

```bash
cd /home/dev-issouf/apps/backend
pnpm prisma migrate deploy
```

## 6. Déploiement automatique

Géré par `.github/workflows/deploy.yml` (build + lint + déploiement SSH + `pm2 reload`).
Valeurs configurées : app `/home/dev-issouf/apps/backend`, process PM2 `backend`.

Secrets GitHub requis : `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`.

Premier démarrage du process (une seule fois, sur le VPS) :

```bash
cd /home/dev-issouf/apps/backend
pm2 start dist/index.js --name backend
pm2 save
```

NODE_ENV=production
PORT=4000

# MySQL — format: mysql://user:password@host:port/database

DATABASE_URL="mysql://ecom_user:0990@localhost:3306/willy_accesoire?allowPublicKeyRetrieval=true"

# JWT

JWT_SECRET="M8cTKREB84ziLLBNcmfjIXyojFyaLZtq8dCrLr0Qta2jNdhqcYHwM0n/Iw/68h/cV8roeyzO4JNAyrZgAEr1JQ=="
JWT_EXPIRES_IN="7d"
JWT_REFRESH_SECRET="aZALS3is7OE1/NmzP9RuPi2OhqhE7NcTNXjl9a5UbZPA9xa6pSl1rr/okCDTeR0LQwxXDAoxlp7Je9YSMbCwaw=="
JWT_REFRESH_EXPIRES_IN="30d"

# CORS

ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"

# Store

DEFAULT_CURRENCY="FCFA"
STORE_NAME="Willy Accessoire"

# EdgeStore — get your keys at https://edgestore.dev/dashboard

EDGE_STORE_ACCESS_KEY=Y7fpTtZYtx7mI8XuliSuPUyPtrpJ30Bn
EDGE_STORE_SECRET_KEY=EmrwsXY52Qv9Vd6ySWWzz4XB0HIomQ8YsuIcMrwrSdjv0pzj
