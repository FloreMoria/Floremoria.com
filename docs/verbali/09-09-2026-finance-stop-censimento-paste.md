# Verbale — STOP censimento paste Fineco (METODO §2)

**Data:** 2026-09-09  
**Commit base:** `3162def5` (stato repo al momento del censimento)  
**Script di lettura (non commitato, fuori perimetro):** `scripts/_census-fineco-paste.ts`

## Decisione

**STOP sul punto 1 (chiusura ingresso / sostituzione dati paste)** per i periodi coperti **solo** da documenti `fineco_paste`, come richiesto prima di procedere.

L’ingresso UI/API per nuovi paste risulta già disattivato dal refactor precedente (`410` su `/api/dashboard/finance/bank-statements/paste`). Quella chiusura dell’*ingresso* non elimina i documenti già in archivio: restano la fonte unica per alcuni trimestri.

## Censimento BankStatementDocument

| Metrica | Valore |
|---|---:|
| Documenti totali | 9 |
| Documenti `source: fineco_paste` | **7** |
| Righe `BankStatementLine` da paste | **73** |
| Documenti da file ufficiale (PDF) | **2** |
| Righe da file ufficiale | **113** |

### File ufficiali presenti (sostituibili / già presenti)

| File | Periodo | Righe | Trimestri |
|---|---|---:|---|
| `1° trimestre Fineco.pdf` | 2026-01-02 → 2026-03-30 | 41 | 2026-T1 |
| `2 Trimestre Fineco 2026.pdf` | 2026-04-01 → 2026-06-25 | 72 | 2026-T2 |

### Documenti paste (tutti senza opening/closing dichiarati)

| fileName | Periodo | Righe | Trimestri |
|---|---|---:|---|
| `fineco-paste-2026-08-21…txt` | 2026-07-01 → 2026-08-20 | 39 | 2026-T3 |
| `fineco-paste-2026-08-24…txt` | 2025-12-02 → 2026-08-24 | 4 | 2025-T4, T1, T2, T3 |
| `fineco-paste-2026-08-26…txt` | 2026-07-06 → 2026-08-26 | 15 | 2026-T3 |
| `fineco-paste-2026-08-31…txt` | 2026-08-27 → 2026-08-31 | 4 | 2026-T3 |
| `fineco-paste-2026-09-02…08-57…txt` | 2026-09-01 → 2026-09-02 | 5 | 2026-T3 |
| `fineco-paste-2026-09-02…19-48…txt` | 2026-09-02 | 1 | 2026-T3 |
| `fineco-paste-2026-09-06…txt` | 2026-09-03 → 2026-09-05 | 5 | 2026-T3 |

### Periodi coperto **solo** da paste (buco se si rimuove/sostituisce senza file ufficiale)

| Trimestre | Docs paste | Righe | File ufficiale sostitutivo |
|---|---:|---:|---|
| **2025-T4** | 1 | 4 | **ASSENTE** |
| **2026-T3** | 7 | 73 | **ASSENTE** |

### Periodi con file ufficiale (paste non unica fonte)

| Trimestre | Solo paste? | Nota |
|---|---|---|
| 2026-T1 | no | PDF Q1 presente (41 righe) |
| 2026-T2 | no | PDF Q2 presente (72 righe) |

## Implicazione METODO §2

Senza PDF/CSV/XLS ufficiali per **2025-T4** e **2026-T3**, chiudere l’ingresso paste *e* trattare i paste storici come non-fonte lascerebbe quei periodi senza estratto verificabile (niente saldi dichiarati; provenienza non portale).

## Cosa non è stato fatto in questo giro (per STOP)

- Nessuna cancellazione/soft-delete dei 7 documenti paste.
- Nessun avanzamento su punti 2–4 di questo brief oltre al fermo.
- Nessun commit di codice nuovo in questo verbale (solo questo file docs).

## Controlli C1–C10

| Quando | Fonte | Periodo | Nota |
|---|---|---|---|
| Prima (ultima misura in repo) | `docs/verbali/dossier_fase1_controlli_t2_2026.json` | T2 2026 · 2026-09-08T13:37:56Z | C1=19 FAIL, C2=€387,90 FAIL, C3=0 OK, C4=€1.699,90 FAIL, C5=€18,40 FAIL, C6=6 FAIL, C7=12 FAIL, C8=0 OK, C9=10 FAIL, C10=2 FAIL |
| Dopo questo intervento | — | — | **Non ricalcolati** (STOP prima del lavoro struttuale) |

## Prossimo passo richiesto all’operatore

1. Caricare estratti ufficiali Fineco per **2025-T4** (se in scope) e **2026-T3** (almeno luglio–settembre 2026) con saldo iniziale e finale.
2. Dopo upload e verifica C3, autorizzare: (a) eventuale supersede delle righe paste duplicate; (b) ripresa punti 2–4 del brief (corrispettivi da gateway, badge da ultima esecuzione persistita, inventario costanti patrimoniali, versione metodo solo se requisiti v1.7 tutti soddisfatti).

## File toccati da questo verbale

- `docs/verbali/09-09-2026-finance-stop-censimento-paste.md` (questo file)
