# Floremoria Web Platform

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Aggiornamento Dati Comuni

Il dataset dei comuni per il servizio dinamico in /consegna-fiori-cimitero si trova in `data/municipalities.json`.
Se desideri rimpiazzare o aggiornare l'intero dataset dei comuni italiani (~8000 comuni), segui questi passi:

1. Inserisci i dati grezzi in un file denominato `data/raw_municipalities.json` seguendo questo formato di base:
```json
[
  {
    "name": "Nome Comune",
    "province": "PR",
    "description": "Descrizione opzionale personalizzata per il comune..."
  }
]
```
*(Nota: il campo `description` è opzionale, e verrà usato all'interno della pagina)*

2. Esegui lo script di utilità preparato appositamente per generare gli slug e validare l'integrità del tuo dataset:
```bash
node Script/generate-municipalities.js
```
Questo script:
- Genererà automaticamente gli slug normalizzati nel formato standard (es. `nome-comune-pr`).
- Rimuoverà automaticamente accenti (es. `Città` → `Citta`), caratteri speciali e spazi, sostituendoli in base alle regole di routing.
- Verificherà che non esistano slug duplicati affinché Next.js non trovi conflitti in produzione.
- Salverà il file finale verificato e pronto per il sito su `data/municipalities.json`.

*(Il file caricato attualmente in `data/municipalities.json` contiene alcuni comuni di esempio utilizzati per lo sviluppo e i test)*

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Design Tokens (Global CSS, Tailwind v4)
The project now ships with a standardized design system built with tailwind tokens:
- **Fonts**: Manrope (headings), Inter (body text).
- **Palette Primary**: bg (white), section (f7f7f7), text (2b2b2b), muted (6f6f6f).
- **Palette Secondary**: rose (c78fa1), rose-soft (e8c9c2), cta (4da3ff), cta-hover (2f8ef5).

## Database (Prisma + PostgreSQL)

We use Prisma ORM and PostgreSQL. Configuration details:
- **Environment**: Your `.env.local` or `.env` should contain the `DATABASE_URL` connecting to your Postgres instance (often provided via local Docker container).

### Commands
- **Run migration**: 
  ```bash
  npm run db:migrate
  ```
  Applies the SQL schema to the database.

- **Seed the database**:
  ```bash
  npm run db:seed
  ```
  Inserts default categories, products, and placeholder images.

- **Open Prisma Studio**:
  ```bash
  npm run db:studio
  ```
  Provides a visual web interface to browse and edit local DB rows easily.
