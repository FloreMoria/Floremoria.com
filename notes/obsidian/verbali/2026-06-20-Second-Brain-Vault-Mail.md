---
date: 20-06-2026
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, Second_Brain, automazione, mail]
sommario: "Verbale operativo FloreMoria — 20/06/2026"
sync_sources: ["consolidate-clean-move"]
synced_at: 2026-07-24T08:41:46.365Z
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: consolidate-clean-move.

> Verbale consolidato **20/06/2026** — memoria storica Second Brain e automazione giornaliera.

# Verbale operativo FloreMoria — 20/06/2026

| Campo | Valore |
| --- | --- |
| **Data sessione** | 20/06/2026 (Europe/Rome) |
| **Tipologia** | Verbale consolidato (Regola Aurea: un giorno = un verbale) |
| **Redazione** | BARBARA / DEVIN |
| **Deposito** | `10_FLOREMORIA/10_VERBALI/` |

---

## 1. PREMESSA

In data **20/06/2026** si è completata la riorganizzazione del vault Obsidian **Second Brain** su Mac, con separazione netta delle aree operative (FloreMoria, Galleria MAG, Personale) e messa in opera dell’automazione notturna alle **23:00** per consolidamento di verbali, log, email e hub. Obiettivo: memoria storica unificata, consultabile e aggiornata senza intervento manuale quotidiano.

---

## 2. ANALISI

### 2.1 Struttura vault Second Brain

- **`10_FLOREMORIA/`** — verbali ufficiali (`10_VERBALI/`), archivio log, email importanti, progetti attivi.
- **`20_GALLERIA_MAG/`** — hub e cartelle speculari (verbali, log, email) pronte per il lavoro galleria.
- **`30_PERSONALE/`** — diario e email personale (Gmail `salvatoremarsiglione@gmail.com`).
- **`00_SISTEMA/`** — playbook automazione, setup mail, script launchd.

### 2.2 Automazione 23:00 (launchd)

- Timer **`com.floremoria.second-brain-daily`** → script `run-daily-second-brain.sh`.
- **`collect_daily_context.py`** rileva i file del vault modificati nel giorno.
- Prompt agente ampliato: verbali + log + mail + hub (non solo posta in arrivo).

### 2.3 Multi-fonte mail

| Fonte | Stato 20/06/2026 |
|-------|------------------|
| Mail.app FloreMoria (7 account) | ✅ Attivo |
| Export giornaliero inbox | ✅ OK (0 mail operative oggi) |
| Gmail personale IMAP | ⏳ App Password in `mail.env` |
| Galleria MAG (utente macOS dedicato) | ⏳ LaunchAgent 22:55 da installare |
| Aruba IMAP (`assistenza@floremoria.eu`) | ✅ Configurato; altre caselle da aggiungere |

Configurazione centralizzata: `00_SISTEMA/mail-sources.json` + secret `00_SISTEMA/.secrets/mail.env`.

### 2.4 Verbali FloreMoria

- **25 verbali storici** consolidati in `10_FLOREMORIA/10_VERBALI/`.
- Convenzione titolo aggiornata: **prefisso ordine + data DD-MM-AAAA + tag** (max 4 parole).
- Indice: `00_INDEX Verbali.md` + vista **Verbali.base** (ordinamento per data decrescente).

---

## 3. DECISIONE

1. **Second Brain** è il deposito canonico locale; ogni sessione con decisioni va consolidata in un verbale giornaliero in `10_VERBALI/`.
2. **Automazione 23:00** resta attiva; verificare periodicamente `CURSOR_API_KEY` per l’agente headless.
3. **Prossimi passi operativi:** completare credenziali Gmail/Aruba in `mail.env`; installare LaunchAgent su utente **GalleriaMAG**; estendere `mail-sources.json` per caselle galleria (`info@`, `direzione@`).
4. **Formato date:** ovunque **DD/MM/AAAA** in testo e frontmatter `data_display`; nei nomi file **DD-MM-AAAA** (equivalente senza slash per compatibilità filesystem).

---

## 4. Riferimenti

- [[20-06-2026]]
- [[00_SISTEMA/20-06-2026_Log_Setup_Automazione]]
- [[00_SISTEMA/Automazione_23h]]
- [[00_SISTEMA/Setup_Mail_Gmail_Aruba]]
- [[00_SISTEMA/Setup_Mail_GalleriaMAG]]
- [[10_FLOREMORIA/00_HUB]]

**Consolidamento 20/06/2026:** verbale completato e archiviato in Obsidian.
