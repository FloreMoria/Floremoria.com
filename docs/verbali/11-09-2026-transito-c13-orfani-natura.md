# Verbale 11-09-2026 — Orfani per natura + conto di transito + C13

**Vincoli:** Passo 0 sola lettura; poi costruzione ledger transito (scritture idempotenti). Corrispettivi non toccati. METODO → **v1.17**.

Artefatti: `docs/verbali/11-09-2026-diag-orfani-natura.json`

---

## Passo 0 — Natura dei 114 orfani (€4.427,79 grezzi pool)

Pool = stesso del bridge C12 (Stripe charge/payment `orderId=null` + PayPal `RICAVI_VENDITE` `orderId=null`).

| Natura | n | € |
|--------|---|---|
| **pagamento_cliente** | 93 | 3.509,23 |
| **duplicato_canali** | 21 | 918,56 |
| bonifico gateway→Fineco | 0 | 0 |
| commissione | 0 | 0 |
| rimborso | 0 | 0 |
| movimento_interno | 0 | 0 |
| non_classificabile | 0 | 0 |

Nel pool «114» non compaiono payout/fee/rimborsi: erano già filtrati a candidati-incasso.  
**Fuori pool** (stesso anno, `orderId=null`): Stripe payout 124 (€7.004,92), hold/release minimi, `stripe_fee`, contribution; PayPal `PAYPAL_PAYOUT` 38 (€1.086), fee 28 (€48,42), rimborsi 21, SaaS 24. Il fondo PayPal €500 rientra nei funding/skip, non nei 114.

### Compatibilità vs fatturato lordo €4.046,20

| | € |
|--|--|
| Ordini già in corrispettivi | 2.624,21 |
| Orfani *pagamento_cliente* (dopo dedup token) | 3.509,23 |
| **Somma ingenua** | **6.133,44** |
| Trio taxRegister | 4.046,20 |
| **Eccesso** | **+2.087,24** |

**Perché non quadra se si sommano tutti i pagamenti orfani:** non sono tutti «vendite nette mancanti». L’eccesso è soprattutto (1) TX PayPal/Stripe che **matchano per data±3+importo** ordini già nel perimetro ma restano `orderId=null` sul movimento (doppio conteggio concettuale), (2) cloni non deduplicabili per token diverso, (3) pagamenti fuori trio.  
Se si contano solo i pagamenti orfani **net-new** rispetto al buco dei 30 (€1.421,99 di cui A+B €1.392), allora **2.624 + ~1.392 ≈ 4.016 ≈ 4.046** (residuo C €29,99).  
**Conclusione:** i soli `pagamento_cliente` orfani **unici e non già rappresentati** sono compatibili col fatturato; la somma grezza 93×€3.509 **no**.

Solo `pagamento_cliente` entra nella gamba di entrata del transito; duplicati = nessuna seconda gamba.

---

## Costruzione conto di transito

Implementato:

- `lib/financial/gatewayTransitSync.ts` — `STRIPE_TX` / `STRIPE_PAYOUT` / `STRIPE_REFUND` (dedup token EU/COM); fee già `STRIPE_FEE`
- PayPal: gambe già su `PAYPAL_TX` / `FEE` / `PAYOUT` / `REFUND`
- `historicalLedgerSync`: ORDER con TX gateway **deferito** al gateway event (niente doppio ricavo); insert gambe Stripe in sync
- Idempotenza: `sourceKey` = id evento (`commitLedgerEntries`)

### Accettazione (post-sync)

| Metrica | Valore |
|---------|--------|
| Ordini corrispettivi con gamba in entrata | **44 / 44 (100%)** |
| Saldo ledger Transito Stripe (oggi) | **−€1.524,39** |
| Saldo ledger Transito PayPal (oggi) | **−€2.057,58** |

Prefissi ledger: `STRIPE_TX` 80 · `STRIPE_PAYOUT` 101 · `STRIPE_FEE` 124 · `STRIPE_REFUND` 4 · `PAYPAL_TX` 111 · `PAYPAL_PAYOUT` 38 · `PAYPAL_FEE` 15 · `PAYPAL_REFUND` 11.

I saldi negativi sono lo stato contabile attuale (payout/fee storici vs TX appena ancorate; PayPal include uscite SaaS sul wallet). **C13 non verificabile** finché non si inseriscono i saldi dichiarati dal cruscotto.

---

## C13 + saldi dichiarati

- `lib/financial/gatewayDeclaredBalance.ts` + API `PUT/GET …/gateway-declared-balance`
- Controllo **C13**: ledger − dichiarato = 0; senza dichiarato → `verifiable: false` (non fallito)
- METODO **§5 C13**, **§6.2.1** tre gambe; versione **1.17**

---

## Commissioni 2026 (costo vero — impatto RAI)

| Trimestre | Stripe n / € | PayPal n / € |
|-----------|--------------|--------------|
| T1 | 21 / 15,55 | 10 / 16,50 |
| T2 | 33 / 40,11 | 9 / 14,43 |
| T3 | 40 / 74,41 | 9 / 17,49 |
| T4 | 0 / 0 | 0 / 0 |
| **Totale** | **€130,07** | **€48,42** |

**Commissioni gateway 2026 ≈ €178,49** — se non erano in CE, i costi (e quindi il RAI) sono sottostimati di quell’importo. Non passano da Fineco.

Corrispettivi: invariati (lordo su data pagamento).
