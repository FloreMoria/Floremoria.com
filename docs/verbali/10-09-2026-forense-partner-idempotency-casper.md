# Verbale forense — test partner Annunci Funebri / cas-per.it (10-09-2026 ~11:31)

**Ambito:** sola lettura (codice + Neon). Nessuna modifica applicata.  
**Endpoint:** `POST /api/v1/partner/order/create`  
**Commit idempotenza:** `7c1d8148` (9 sett 2026, 16:56)  
**Oggetto segnalato:** risposta con ordine `PT-VE-26-002` / id `cmtlm6wyx0001l704ijmac9b2`, `isTest: true`, `TEST_MOCK_PAID`, nessun invio email Resend.

---

## 1. Ispezione endpoint — idempotenza

### Dove vive
- Estrazione chiavi: `lib/partners/partnerOrderIdempotency.ts` → `extractPartnerIdempotencyKeys`
- Lookup: `findExistingPartnerOrderByIdempotency`
- Short-circuit early return: `app/api/v1/partner/order/create/route.ts` righe 163–181 (prima di validare lineItems / create)

### Parametri estratti

| Fonte | Campi | Destino |
|---|---|---|
| Header | `Idempotency-Key` | `paymentKey` (priorità massima) |
| Body | `paymentIntentId` → `stripePaymentIntentId` → `externalTransactionId` → `stripeCheckoutSessionId` | `paymentKey` (primo non vuoto) |
| Body | `externalOrderId` → `annuncioId` → `external_announcement_id` → `externalAnnouncementId` | `externalOrderId` |

Normalizzazione (`trimKey`):
- non-string → `null`
- stringa vuota / solo spazi → `null`
- altrimenti `trim()` e max 255 char

**I valori `undefined` / `null` / `''` non vengono passati a Prisma come predicati.** Entra nell’`OR` solo se la chiave è non-null dopo `trimKey`.

### Query Prisma esatta

```ts
// findExistingPartnerOrderByIdempotency
const or: Prisma.OrderWhereInput[] = [];

if (keys.paymentKey) {
    or.push({ stripeTransactionId: keys.paymentKey });
    or.push({ additionalInstructions: { contains: keys.paymentKey } });
}
if (keys.externalOrderId) {
    or.push({ externalAnnouncementId: keys.externalOrderId });
}

if (or.length === 0) return null;

return db.order.findFirst({
    where: {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        OR: or,
    },
    orderBy: { createdAt: 'asc' },  // ← il più VECCHIO vince
    select: existingOrderSelect,
});
```

Se c’è hit → `200` con `partnerDuplicateOrderResponseBody(existing)` (`duplicate: true`) e **return immediato**. Nessuna create, nessun `after()`.

### Schema reale (importante)
Su `orders` esistono:
- `stripe_transaction_id` (`Order.stripeTransactionId`)
- `external_announcement_id` (`Order.externalAnnouncementId`)

**Non esistono** colonne `stripePaymentIntentId` né `externalTransactionId`. Quei nomi body vengono solo usati come input per costruire `paymentKey` / `externalOrderId`.

---

## 2. Verifica database (Neon)

### Ordine `cmtlm6wyx0001l704ijmac9b2` = `PT-VE-26-002` (3 sett 2026)

| Campo | Valore |
|---|---|
| `stripeTransactionId` | **`null`** |
| `stripePaymentIntentId` | **colonna inesistente** |
| `externalTransactionId` | **colonna inesistente** |
| `externalAnnouncementId` (≈ externalOrderId) | **`"147182"`** |
| `isTest` | **`true`** |
| `paymentMethodLabel` | **`TEST_MOCK_PAID`** |
| `partnerPaymentStatus` | `PAID` |
| `status` | `ACCEPTED` |
| `deletedAt` | `null` |
| `additionalInstructions` | **`null`** |
| `financeNotes` | `Sandbox API (fmp_test_annuncifunebri_2026). Ordine di test: …` |
| `referralPartnerId` | `cmpcosjdo00008oncx62bgs5e` (Annunci Funebri) |
| `createdAt` | `2026-09-03T14:22:41.769Z` |

### PaymentIntent `pi_3UE4KHDRGteEHz9n0gwuunVe`
- Cercato su `stripeTransactionId`, `additionalInstructions`, `financeNotes`.
- **Nessun record** lo contiene. Il PI di oggi **non è mai stato scritto** a DB.

### Ordini creati il 10 settembre 2026
- **Totale ordini con `createdAt` nel giorno 10/09/2026 (Europe/Rome): `0`.**
- Coerente con un early-return `duplicate: true` (nessuna insert).

### Contesto correlato — stesso `externalAnnouncementId = "147182"`
Cinque ordini condividono lo stesso annuncio (campo **non unique** a schema):

| Codice | Creato | Status | isTest |
|---|---|---|---|
| PT-VE-26-002 | 2026-09-03 | ACCEPTED | true |
| PT-VE-26-003 | 2026-09-03 | ACCEPTED | true |
| PT-VE-26-004 | 2026-09-09 09:42 | ACCEPTED | true |
| PT-VE-26-005 | 2026-09-09 09:42 | CANCELLED | true |
| PT-VE-26-006 | 2026-09-09 10:43 | CANCELLED | true |

Nota: 004–006 sono **prima** del deploy idempotenza (`7c1d8148` ~16:56 del 9/09). Dopo quel commit, un nuovo create con lo stesso `147182` non può più passare: torna sempre il più vecchio non-CANCELLED → **002**.

---

## 3. Simulazione query con il payload descritto

### A) Solo `paymentIntentId: "pi_3UE4KHDRGteEHz9n0gwuunVe"` (altri id assenti/`null`/`''`)

```
paymentKey = "pi_3UE4KHDRGteEHz9n0gwuunVe"
externalOrderId = null
OR = [
  { stripeTransactionId: PI },
  { additionalInstructions: { contains: PI } },
]
```

**Risultato misurato su Neon adesso: `null` (nessun hit).**  
→ Il codice proseguirebbe alla create (non spiegherebbe da solo il ritorno di `PT-VE-26-002`).

**Non è un match su campi nulli/vuoti.** I null non entrano nell’`OR`.

### B) Stesso PI **più** `annuncioId` / `externalOrderId` = `"147182"` (scenario tipico CasPer)

```
OR include anche { externalAnnouncementId: "147182" }
orderBy createdAt asc
```

**Risultato misurato: `PT-VE-26-002` (`cmtlm6wyx0001l704ijmac9b2`).**

Questa è la spiegazione oggettiva del codice restituito: **match sull’annuncio esterno riusato**, non sul PaymentIntent nuovo.

### Perché `isTest: true` e `TEST_MOCK_PAID` nella risposta?

Non vengono ricalcolati dal body `isTest: false` del tentativo odierno.

1. Early return legge l’ordine **già in DB** (002).
2. `partnerDuplicateOrderResponseBody` copia i campi persistiti:
   - `data.isTest` ← `order.isTest` (**true** dal 3/09, credenziale `fmp_test_…`)
   - `data.paymentMethodLabel` ← `order.paymentMethodLabel` (**`TEST_MOCK_PAID`**)
3. Inoltre, anche in un create fresco, `isTest` **non** viene dal body: viene da `auth.isTestCredential` (`publicId` che inizia con `fmp_test_`). Il body `isTest` è ignorato.

Origine label: `lib/partnerTestCredential.ts` → `resolvePartnerApiPaymentKind(true) → 'TEST_MOCK_PAID'`.

---

## 4. Analisi email (Resend) — perché nessun invio

Path notifiche (create riuscita):

```ts
after(async () => {
  // …
  await sendPartnerOrderNotifications(createdOrder.id, { sandboxOrder: isTestOrder });
});
```

Path duplicate (righe 167–180):

```ts
if (existing) {
  console.info('[B2B Partner API] order/create idempotent hit', { … });
  return NextResponse.json(partnerDuplicateOrderResponseBody(existing), { status: 200, … });
}
```

**`after()` non viene mai registrato sull’early return.**  
Quindi: nessun touch credential, nessuna auto-assign, nessuna `sendPartnerOrderNotifications`, nessun log Resend per quel tentativo.  
Non è un guasto Resend: è il disegno dell’idempotenza (retry silenzioso senza ripeti-notifiche).

Log Vercel: CLI/`npx vercel logs` non ha restituito righe filtrabili in questa sessione (auth/CLI assente o senza match). Il codice e il DB bastano a chiudere il punto 4.

---

## Sintesi dei fatti

| Domanda | Accertamento |
|---|---|
| Match su null vuoti? | **No.** |
| Il PI di oggi è a DB? | **No.** |
| Nuovi ordini oggi? | **Zero.** |
| Perché `PT-VE-26-002`? | Quasi certamente **`externalAnnouncementId = "147182"`** (stesso annuncio dei test 3–9 sett), con `findFirst` ordinato per `createdAt asc`. |
| Perché test flags in risposta? | Copia dell’ordine sandbox del 3/09, non del payload odierno. |
| Perché no email? | `duplicate: true` → return prima di `after()`. |

## Implicazioni (solo diagnosi — nessuna fix qui)

1. L’idempotenza su **annuncio** tratta “stesso defunto/annuncio, nuovo pagamento” come retry dello stesso ordine.
2. `externalAnnouncementId` non è unique: storicamente ha permesso 5 ordini con lo stesso `147182`; oggi il lookup blocca sui nuovi create.
3. Il PI non viene mai persistito se si esce in duplicate prima della create.

**Prossimo passo (da decidere dopo lettura):** se l’idempotenza deve essere solo su PaymentIntent / Idempotency-Key, e l’annuncio deve essere chiave debole o chiave composta (annuncio + PI).

---

## Fix applicata (10-09-2026, post-diagnosi)

**Decisione:** deduplica **solo** su chiave di pagamento. L’annuncio funebre non entra più nell’`OR`.

### Modifiche
- `lib/partners/partnerOrderIdempotency.ts` — `findExistingPartnerOrderByIdempotency` richiede `paymentKey`; cerca solo `stripeTransactionId` + `additionalInstructions contains`; **rimosso** `externalAnnouncementId`.
- `app/api/v1/partner/order/create/route.ts` — early return / check in-tx / catch P2002 solo se `paymentKey` presente (non più se c’è solo `externalOrderId`).
- Create: resta `stripeTransactionId: idempotencyKeys.paymentKey` (persistenza per retry).
- `externalAnnouncementId` continua a essere salvato come metadato ordine, senza deduplica.

### Comportamento atteso post-fix
| Payload | Esito |
|---|---|
| Stesso `annuncioId`, **nuovo** `paymentIntentId` | **Nuovo ordine** + notifiche `after()` |
| Stesso `paymentIntentId` (retry) | `duplicate: true` → ordine esistente, no email |
| Solo annuncio, senza PI / Idempotency-Key | Create senza short-circuit idempotenza |

### Verifiche
- `npx tsc --noEmit`
- `npm run build`

---

*Probe RO usati (da cancellare / non in repo di prodotto):*  
`scripts/_tmp_forensic_partner_idempotency.ts`, `scripts/_tmp_forensic_partner_idempotency2.ts`
