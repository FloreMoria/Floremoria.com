# FloreMoria — Chi fa cosa (AI & strumenti)

**Versione:** 1.0 · **Data:** 2026-05-11  
**Scopo:** una sola regola chiara per evitare doppio lavoro, contesti duplicati e decisioni “a metà”.

---

## Ruoli (non negoziabili)

| Ruolo | Strumento | Cosa fa |
|--------|-----------|---------|
| **Execution (codice)** | **Cursor** | Implementazione nel repo: patch, refactor mirati, lint, build, debug, deploy script, verifica file reali. |
| **Strategia & orchestrazione agenti** | **Antigravity (Gemini)** | Visione, priorità, uso dei 22 agent FLOREM_NET, brief multi-ruolo, allineamento operativo, “direttore d’orchestra”. |
| **Secondo parere (opzionale)** | **Claude** | Solo quando serve un confronto puntuale su testo/decisione complessa — **non** terza piattaforma operativa quotidiana. |

**Regola d’oro:** una decisione strategica nasce in Antigravity; il codice che la rende vera nasce in Cursor. Non invertire l’ordine senza motivo documentato.

---

## Flusso standard (handoff in 10 righe)

1. **Antigravity:** obiettivo, vincoli (SOFIA/ALMA, VITO, tempi), output atteso, agenti coinvolti.  
2. **Antigravity:** elenco file/pagine toccate (se già noto) o “da individuare in repo”.  
3. **Cursor:** prompt con **copia-incolla** del punto 1–2 + link o path espliciti.  
4. **Cursor:** implementa, testa localmente, elenca file modificati e comandi usati.  
5. **Antigravity:** validazione strategica / messaggio utente / rollout comms se serve.  
6. **Deploy:** secondo checklist unica (es. `deploy-incremental.sh`); niente deploy “a voce” senza verifica.

Se Antigravity e Cursor discutono della stessa cosa **senza** questo handoff, hai già perso tempo: fermati e scrivi i punti 1–2.

---

## Cosa non fare

- Non usare due chat parallele per lo **stesso** task (stesso bug, stessa feature).  
- Non mettere **segreti** o chiavi in chat: solo env / secret manager (VITO).  
- Non fare “strategia in Cursor” e “codice in Antigravity”: rovescia solo se Antigravity genera snippet da incollare **una tantum**, poi il mantenimento resta in Cursor/repo.

---

## Fonte di verità

- **Protocollo operativo e agenti:** file master in `agents/` + organigramma `agents/FLOREM_NET_organigramma.md`.  
- **Convenzioni repo / sicurezza:** `.cursorrules` e `CLAUDE.md` (allineati): Cursor li applica in esecuzione.  
- **Decisione “chi ha ragione” su priorità business:** Antigravity; **chi ha ragione sul codice che compila:** Cursor + CI/real build.

---

## Revisione

Ogni trimestre (o dopo un progetto grosso): 15 minuti — “abbiamo rispettato la tabella?” Se no, correggi processo, non aggiungere un quarto tool.

---

## Verbali giornalieri (BARBARA + DEVIN) — automatico

**Problema risolto:** BARBARA (Antigravity/Gemini) scrive nel Second Brain; DEVIN (Cursor) scrive in `docs/verbali/`. Entrambi devono finire in Obsidian repo e dashboard **senza copia manuale**.

| Chi | Dove scrive | Strumento |
|-----|-------------|-------------|
| **BARBARA** | Second Brain → repo GitHub `FloreMoria/Second_Brain_Sync` | Antigravity |
| **DEVIN** | `docs/verbali/DD-MM-YYYY.md` nel repo `floremoria` | Cursor |
| **Pipeline** | `notes/obsidian/verbali/YYYY-MM-DD-Verbale-Giornaliero.md` + `floremoria_logs` | GitHub Actions |

**Flusso (Mac spento = OK):**

1. BARBARA redige in Antigravity → auto-sync al repo `Second_Brain_Sync` (già attivo sul Mac).
2. DEVIN/Cursor aggiorna `docs/verbali/` e fa push su `main`.
3. GitHub Actions (`verbale-pipeline.yml`, ogni 4h + push su `docs/verbali/`): scarica `Second_Brain_Sync`, unisce BARBARA + DEVIN, committa Obsidian, aggiorna dashboard.
4. Alle ~08:00 Roma: `daily-verbale.yml` chiude il giorno precedente (Regola Aurea).

**Comandi locali (debug):**

```bash
npm run log:verbale:pipeline   # merge BARBARA (vault locale o .barbara-sync) + docs → Obsidian
npm run log:verbale:daily      # + riga dashboard per ieri
```

**Secret opzionale GitHub:** `BARBARA_SYNC_GITHUB_TOKEN` (PAT read) se il checkout cross-repo di `Second_Brain_Sync` fallisce con il token predefinito.

**Regola Aurea:** un giorno = un verbale in `notes/obsidian/verbali/`. Per bloccare overwrite manuale: `lock_manual: true` nel frontmatter.
