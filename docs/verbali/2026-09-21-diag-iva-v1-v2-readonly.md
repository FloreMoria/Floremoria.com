# Diagnosi IVA V1/V2 — sola lettura — 21 settembre 2026

**Nessuna correzione applicata.**

## V1 — Autofatture TD17: debito vs credito per evento

Eventi distinti: **23** (righe ledger ARC grezze: 45).

| Esito | n |
|-------|--:|
| OK bilanciato | 21 |
| Manca debito | 1 |
| Manca credito | 0 |
| Squilibrio importi | 1 |
| Σ IVA debito (max per evento) | €251,58 |
| Σ IVA credito (max per evento) | €257,17 |
| Saldo Σ | €-5,59 |

### Tabella riga per riga

| Data | Fornitore / evento | IVA debito | IVA credito | Saldo | Esito |
|------|--------------------|----------:|------------:|------:|-------|
| 2026-02-18 | Google Ireland Ltd | €25,42 | €25,42 | €0,00 | OK bilanciato |
| 2026-05-02 | Cursor | €17,75 | €17,75 | €0,00 | OK bilanciato |
| 2026-05-06 | Anthropic, PBC | €18,00 | €18,00 | €0,00 | OK bilanciato |
| 2026-05-31 | Autofattura TD17 Stripe Payments Europe Limited n. | €0,00 | €3,14 | €-3,14 | MANCA DEBITO |
| 2026-05-31 | Stripe Payments Europe Limited | €0,69 | €3,14 | €-2,45 | SQUILIBRIO Δ€-2,45 |
| 2026-05-31 | Stripe Payments Europe | €3,14 | €3,14 | €0,00 | OK bilanciato |
| 2026-06-02 | Cursor | €17,75 | €17,75 | €0,00 | OK bilanciato |
| 2026-06-06 | Anthropic, PBC | €18,00 | €18,00 | €0,00 | OK bilanciato |
| 2026-06-16 | Apple | €0,81 | €0,81 | €0,00 | OK bilanciato |
| 2026-07-02 | Cursor | €17,75 | €17,75 | €0,00 | OK bilanciato |
| 2026-07-06 | Anthropic, PBC | €18,00 | €18,00 | €0,00 | OK bilanciato |
| 2026-07-16 | Apple | €0,81 | €0,81 | €0,00 | OK bilanciato |
| 2026-07-31 | Stripe Payments Europe | €5,70 | €5,70 | €0,00 | OK bilanciato |
| 2026-08-02 | Cursor | €17,75 | €17,75 | €0,00 | OK bilanciato |
| 2026-08-06 | Anthropic, PBC | €18,00 | €18,00 | €0,00 | OK bilanciato |
| 2026-08-16 | Apple | €0,81 | €0,81 | €0,00 | OK bilanciato |
| 2026-08-31 | Stripe Payments Europe | €8,17 | €8,17 | €0,00 | OK bilanciato |
| 2026-08-31 | Stripe Payments Europe | €6,62 | €6,62 | €0,00 | OK bilanciato |
| 2026-09-01 | Meta Platforms | €1,24 | €1,24 | €0,00 | OK bilanciato |
| 2026-09-02 | Cursor | €17,75 | €17,75 | €0,00 | OK bilanciato |
| 2026-09-03 | Vercel Inc. | €17,27 | €17,27 | €0,00 | OK bilanciato |
| 2026-09-06 | Anthropic, PBC | €18,00 | €18,00 | €0,00 | OK bilanciato |
| 2026-09-06 | Vercel Inc. | €2,15 | €2,15 | €0,00 | OK bilanciato |

### Lettura
- Il PnL oggi prende **una sola volta** per evento l'importo e lo mette su **entrambi** i lati (€257,17).
- Se a livello documento manca la registrazione a debito (o a credito), quel credito **non è detraibile** finché non esiste la coppia reverse charge.
- Righe duplicate ENTRATA/USCITA sullo stesso evento: in tabella usiamo il **max** per lato (evita doppio conteggio).

## V2 — Due IVA a debito

| Fonte | IVA a debito | Ruolo |
|-------|-------------:|-------|
| **Registro corrispettivi** (gateway, 10% scorporo) | **€397,97** | **Dichiarazione / LIPE** |
| di cui T1 | €94,43 | |
| di cui T2 | €113,29 | |
| di cui T3 | €190,25 | |
| **Conto economico** (ledger `vatCents`) | **€262,89** | Gestione / PnL |
| **Differenza** | **€135,08** | |

### Scomposizione CE €262,89
| Componente | Euro |
|------------|-----:|
| Autofatture TD17 (ARC, stesso importo su debito e credito) | €257,17 |
| IVA da campo `vatCents` su RICAVI_VENDITE | €5,72 |
| Altri ricavi / contributi / rimborsi ENTRATA | €0,00 |
| − IVA su rimborsi USCITA | €-0,00 |
| **Totale CE** | **€262,89** |

### Perché divergono
1. **Fonti diverse:** corrispettivi = scorporo 10% sul lordo gateway; CE = somma `vatCents` delle righe ledger.
2. **Molte vendite in ledger hanno `vatCents = 0`** anche se sono in corrispettivi: match con vat=0 = **17** righe (IVA “persa” lato CE ≈ €65,67); gateway senza match ledger = **61**.
3. **Il CE include l’IVA ARC TD17 (€257,17)** che **non** è nel registro corrispettivi (è reverse charge, altro meccanismo).
4. **Rimborsi / note:** 0 rettifiche IVA su rimborsi USCITA (€0,00).

### Fonte per la dichiarazione
**Solo il registro corrispettivi (€397,97).** Il CE non è fonte di liquidazione IVA a debito sulle vendite.

Identità di controllo attesa (post-correzione futura):  
`IVA debito CE (solo vendite, senza ARC) = IVA debito corrispettivi (± rettifiche documentate)`.
