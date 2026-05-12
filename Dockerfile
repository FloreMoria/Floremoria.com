FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# `postinstall` → `prisma generate`: URL valido a build-time (nessuna connessione reale richiesta).
ENV DATABASE_URL="postgresql://docker:docker@127.0.0.1:5432/docker?schema=public"

# Dipendenze + schema Prisma prima di `npm ci` (postinstall esegue `prisma generate`)
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --legacy-peer-deps

# Resto dell'app (rispetta `.dockerignore`)
COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
