# Riconciliazione corrispettivi → CE — 21 settembre 2026

**Riferimento:** freeze `2026-09-21-freeze-risultati.md`.

## Domanda
Corrispettivi **€4377,16** vs CE pre-fix **€3.278,51** → gap storico **€1.098,65**.  
Dopo i fix: vendite CE **€4000,80**, gap residuo **€376,36**.

## Correzioni applicate
1. **PayPal HAYUM**: **€722,29** da `TRASFERIMENTO_INTERNO` → `RICAVI_VENDITE`.
2. **TD17** → `AUTOFATTURE_REVERSE_CHARGE`: **34** righe / **23** eventi; IVA debito = credito €257,17 (effetto CE nullo).

## Ponte euro-per-euro

| # | Step | Euro | Perché |
|---|------|-----:|--------|
| A | Registro corrispettivi (gateway) | €4377,16 | fonte fiscale LIPE / F2 |
| B | − gateway senza match in RICAVI_VENDITE (38) | €-2151,34 | assenza ledger o id charge/py ≠ txn |
| C | + RICAVI_VENDITE ledger oltre match gateway (36) | €1962,39 | JSON/ORDER/manuali o match fallito lato gateway |
| D | Σ RICAVI_VENDITE grezzi | €4355,63 | controllo A+B+C ≈ D |
| E | − pose prepagate escluse dal CE (3) | €-89,97 | corretto: anticipo pose ≠ vendita periodo |
| F | − doppi soppressi gerarchia (3) | €-124,91 | corretto: stessa vendita già tenuta |
| G | Σ RICAVI post-gerarchia | €4140,75 | base PnL prima rimborsi |
| H | − rimborsi cliente USCITA (2) | €-84,97 | corretto: riduzione ricavo |
| I | ± altri filtri PnL | €-54,98 | quarantena/seed residui |
| J | Vendite caratteristiche CE | €4000,80 | conto economico freeze |
| K | Gap gateway − CE | €376,36 | residuo aperto (non blocca LIPE) |

### E — Pose prepagate escluse
- €29,99 · `JSON_ENTRY:entry_manual_gross_cmr3cfnah0000jv04uua7zk1k`
- €29,99 · `JSON_ENTRY:entry_manual_gross_cmr3hrlmg0000l804yuv8me43`
- €29,99 · `JSON_ENTRY:entry_manual_gross_cmr9cbwna000fjy045fho41q0`

### F — Doppi soppressi (corretti)
- €47,46 · `JSON_ENTRY:entry_manual_gross_cmszsj71a0001l1047w7iat7v` · Incasso ordine manuale confermato/pagato - Ordine FT-RC-26-003
- €29,99 · `STRIPE_TX:txn_3TVvy64W4pZWhSUs0pnQ5h0r` · Incasso Stripe charge — txn_3TVvy64W4pZWhSUs0pnQ5h0r
- €47,46 · `STRIPE_TX:stripe_tx_txn_3U0cT94W4pZWhSUs0qUXOKG7` · Incasso Stripe charge — stripe_tx_txn_3U0cT94W4pZWhSUs0qUXOKG7

### H — Rimborsi cliente
- €54,98 · `STRIPE_REFUND:stripe_tx_txn_3TcirV4W4pZWhSUs00pnO7he` · Rimborso Stripe — REFUND FOR CHARGE
- €29,99 · `STRIPE_REFUND:stripe_eu_tx_txn_3THRDzRrkwwcYwep1VFhNywK` · Rimborso Stripe — REFUND FOR CHARGE

### B — Gateway senza match ledger (38 / €2151,34)
- €29,99 · Stripe · `ch_3TVvy64W4pZWhSUs0qSKhm1P`
- €34,99 · Stripe · `ch_3TYqjZ4W4pZWhSUs1mfz1KqI`
- €31,48 · Stripe · `py_3TZBBT4W4pZWhSUs1wFm0e3s`
- €31,48 · Stripe · `py_3TZBFq4W4pZWhSUs13kgc1OA`
- €43,97 · Stripe · `ch_3ThmH14W4pZWhSUs1NIVn7o6`
- €31,48 · Stripe · `py_3TjJBK4W4pZWhSUs1mfvQoPS`
- €31,48 · Stripe · `py_3TjJKX4W4pZWhSUs0BjNn3RV`
- €64,98 · Stripe · `ch_3Tl97E4W4pZWhSUs1iFeGfkw`
- €104,98 · Stripe · `ch_3TonoCRrkwwcYwep1fIXGchS` · eu-2026-035
- €69,99 · Stripe · `ch_3Tp8tnRrkwwcYwep012NNPQm` · eu-2026-036
- €144,98 · Stripe · `py_3TpOrX4W4pZWhSUs0bWli3kl`
- €31,48 · Stripe · `py_3TpPFc4W4pZWhSUs0s0z7zvu`
- €31,48 · Stripe · `py_3TpPJU4W4pZWhSUs1N3Am5Ht`
- €39,99 · Stripe · `ch_3TrNudRrkwwcYwep0kVBwEIg` · eu-2026-037
- €37,99 · Stripe · `ch_3TtjecRrkwwcYwep1xLy9t6o` · eu-2026-038
- €31,48 · Stripe · `py_3TyuIF4W4pZWhSUs01ynUG53`
- €31,48 · Stripe · `py_3TyuTV4W4pZWhSUs00PZNqwe`
- €29,99 · Stripe · `ch_3TzcRERrkwwcYwep0rjIsUMl` · eu-2026-039
- €47,46 · Stripe · `ch_3U0cT94W4pZWhSUs0zCmlTCo`
- €39,99 · Stripe · `ch_3U1Yc8RrkwwcYwep1XybNoro` · eu-2026-040
- €69,99 · Stripe · `ch_3U2vU2RrkwwcYwep04oD6I6g` · eu-2026-041
- €52,48 · Stripe · `py_3U44XP4W4pZWhSUs0AsseGiK`
- €31,48 · Stripe · `py_3U5QyD4W4pZWhSUs1Lgk1VNp`
- €31,48 · Stripe · `py_3U5R2d4W4pZWhSUs0IA5ZBux`
- €39,99 · Stripe · `ch_3U5RyERrkwwcYwep07vHGBQU` · eu-2026-042
- €89,99 · Stripe · `ch_3U6no5RrkwwcYwep05NA53JR` · eu-2026-043
- €53,97 · Stripe · `py_3U7xmV4W4pZWhSUs1jsIcoHv` · FT-LC-26-001
- €52,98 · Stripe · `py_3U8bE54W4pZWhSUs0d0lZ0mq` · FF-VI-26-003
- €29,99 · Stripe · `ch_3U9K9m4W4pZWhSUs1IPbnlJU` · FT-TO-26-001
- €29,99 · Stripe · `ch_3U9KCm4W4pZWhSUs0BoXHsPT` · FT-TO-26-002
- €84,98 · Stripe · `ch_3UAa8I4W4pZWhSUs1NAjQZ84` · FF-SO-26-001
- €31,48 · Stripe · `py_3UAtNU4W4pZWhSUs0GIsyQ6L` · FT-CS-26-007
- €31,48 · Stripe · `py_3UAtR64W4pZWhSUs1GjkLyY7` · FT-PA-26-009
- €104,98 · Stripe · `ch_3UCKIc4W4pZWhSUs1QeFUJTm` · FF-MC-26-001
- €204,98 · Stripe · `ch_3UCNGm4W4pZWhSUs0Bj6kFOX` · FF-MC-26-002
- €29,99 · Stripe · `ch_3UFsdS4W4pZWhSUs1jZEbaY6`
- €129,99 · Stripe · `ch_3UGKB9RrkwwcYwep0iX4YzwT`
- €109,98 · Stripe · `ch_3UGhhKRrkwwcYwep0oDybDle`

### C — Ledger RICAVI senza match gateway (36 / €1962,39)
- €31,48 · `ORDER:cmub9oh3p0001jy04dxyb15dg` · Incasso lordo clienti tramite Stripe - Ordine FT-PA-26-010
- €31,48 · `ORDER:cmub9to8c000fl204aya67vhj` · Incasso lordo clienti tramite Stripe - Ordine FT-CS-26-008
- €89,99 · `CONNECT_TX:FF-VE-26-001` · Incasso Connect partner — corrispettivo FF-VE-26-001
- €29,99 · `MANUAL_INBOUND:cmpcb2j7y0004jv04xlc7wvb2` · [FUORI_GATEWAY] Incasso da identificare — ordine FT-SA-26-00
- €44,98 · `MANUAL_INBOUND:cmrusit6y0000l8046wbck8a9` · [FUORI_GATEWAY] Incasso da identificare — ordine FF-CO-26-00
- €34,99 · `STRIPE_TX:txn_3TYqjZ4W4pZWhSUs1SlZrQ1q` · Incasso Stripe charge — txn_3TYqjZ4W4pZWhSUs1SlZrQ1q
- €29,99 · `STRIPE_TX:stripe_tx_txn_3TVvy64W4pZWhSUs0pnQ5h0r` · Incasso Stripe charge — stripe_tx_txn_3TVvy64W4pZWhSUs0pnQ5h
- €31,48 · `STRIPE_TX:txn_3TZBFq4W4pZWhSUs1kRE0CNZ` · Incasso Stripe payment — txn_3TZBFq4W4pZWhSUs1kRE0CNZ
- €31,48 · `STRIPE_TX:stripe_tx_txn_3TjJBK4W4pZWhSUs1SYv8DdG` · Incasso Stripe payment — stripe_tx_txn_3TjJBK4W4pZWhSUs1SYv8
- €31,48 · `STRIPE_TX:stripe_tx_txn_3TjJKX4W4pZWhSUs0oQvh7vx` · Incasso Stripe payment — stripe_tx_txn_3TjJKX4W4pZWhSUs0oQvh
- €31,48 · `STRIPE_TX:txn_3TpPFc4W4pZWhSUs0a5P7iqY` · Incasso Stripe payment — txn_3TpPFc4W4pZWhSUs0a5P7iqY
- €31,48 · `STRIPE_TX:stripe_tx_txn_3TyuIF4W4pZWhSUs0hkSIqAs` · Incasso Stripe payment — stripe_tx_txn_3TyuIF4W4pZWhSUs0hkSI
- €31,48 · `STRIPE_TX:txn_3TyuTV4W4pZWhSUs0M1W5j6g` · Incasso Stripe payment — txn_3TyuTV4W4pZWhSUs0M1W5j6g
- €47,46 · `STRIPE_TX:txn_3U0cT94W4pZWhSUs0qUXOKG7` · Incasso Stripe charge — txn_3U0cT94W4pZWhSUs0qUXOKG7
- €31,48 · `STRIPE_TX:stripe_tx_txn_3U5QyD4W4pZWhSUs13SNdOmE` · Incasso Stripe payment — stripe_tx_txn_3U5QyD4W4pZWhSUs13SNd
- €29,99 · `STRIPE_TX:stripe_tx_txn_3UFsdS4W4pZWhSUs1xLHuMvw` · Incasso Stripe charge — stripe_tx_txn_3UFsdS4W4pZWhSUs1xLHuM
- €129,99 · `STRIPE_TX:stripe_eu_tx_txn_3UGKB9RrkwwcYwep0aNuCa57` · Incasso Stripe charge — stripe_eu_tx_txn_3UGKB9RrkwwcYwep0aN
- €37,99 · `STRIPE_TX:stripe_eu_tx_txn_3TtjecRrkwwcYwep1EDBi6dh` · Incasso Stripe charge — stripe_eu_tx_txn_3TtjecRrkwwcYwep1ED
- €89,99 · `STRIPE_TX:stripe_eu_tx_txn_3U6no5RrkwwcYwep0uomtdte` · Incasso Stripe charge — stripe_eu_tx_txn_3U6no5RrkwwcYwep0uo
- €54,98 · `STRIPE_TX:txn_3TcirV4W4pZWhSUs05MMgxPE` · Incasso Stripe charge — txn_3TcirV4W4pZWhSUs05MMgxPE
- €43,97 · `STRIPE_TX:stripe_tx_txn_3ThmH14W4pZWhSUs14CAHHaS` · Incasso Stripe charge — stripe_tx_txn_3ThmH14W4pZWhSUs14CAHH
- €104,98 · `STRIPE_TX:stripe_eu_tx_txn_3TonoCRrkwwcYwep1GA8NIWP` · Incasso Stripe charge — stripe_eu_tx_txn_3TonoCRrkwwcYwep1GA
- €64,98 · `STRIPE_TX:stripe_tx_txn_3Tl97E4W4pZWhSUs1948B9mT` · Incasso Stripe charge — stripe_tx_txn_3Tl97E4W4pZWhSUs1948B9
- €69,99 · `STRIPE_TX:stripe_eu_tx_txn_3Tp8tnRrkwwcYwep0biMYl7Q` · Incasso Stripe charge — stripe_eu_tx_txn_3Tp8tnRrkwwcYwep0bi
- €52,48 · `STRIPE_TX:txn_3U44XP4W4pZWhSUs0Ikhhvek` · Incasso Stripe payment — txn_3U44XP4W4pZWhSUs0Ikhhvek
- €39,99 · `STRIPE_TX:stripe_eu_tx_txn_3TrNudRrkwwcYwep0zY0M7LI` · Incasso Stripe charge — stripe_eu_tx_txn_3TrNudRrkwwcYwep0zY
- €29,99 · `STRIPE_TX:stripe_eu_tx_txn_3TzcRERrkwwcYwep0NIP8g6r` · Incasso Stripe charge — stripe_eu_tx_txn_3TzcRERrkwwcYwep0NI
- €39,99 · `STRIPE_TX:stripe_eu_tx_txn_3U1Yc8RrkwwcYwep1l4tJnL9` · Incasso Stripe charge — stripe_eu_tx_txn_3U1Yc8RrkwwcYwep1l4
- €69,99 · `STRIPE_TX:stripe_eu_tx_txn_3U2vU2RrkwwcYwep06Fy5g4j` · Incasso Stripe charge — stripe_eu_tx_txn_3U2vU2RrkwwcYwep06F
- €39,99 · `STRIPE_TX:stripe_eu_tx_txn_3U5RyERrkwwcYwep0qd5uTzR` · Incasso Stripe charge — Subscription creation
- €47,46 · `STRIPE_TX:stripe_tx_txn_3U64Fm4W4pZWhSUs0zv3AM23` · Incasso Stripe charge — stripe_tx_txn_3U64Fm4W4pZWhSUs0zv3AM
- €29,99 · `STRIPE_TX:stripe_tx_txn_3U9K9m4W4pZWhSUs1N4SXPkI` · Incasso Stripe charge — stripe_tx_txn_3U9K9m4W4pZWhSUs1N4SXP
- €29,99 · `STRIPE_TX:stripe_tx_txn_3U9KCm4W4pZWhSUs0wI7vlzm` · Incasso Stripe charge — stripe_tx_txn_3U9KCm4W4pZWhSUs0wI7vl
- €84,98 · `STRIPE_TX:stripe_tx_txn_3UAa8I4W4pZWhSUs1ui4IlqC` · Incasso Stripe charge — stripe_tx_txn_3UAa8I4W4pZWhSUs1ui4Il
- €104,98 · `STRIPE_TX:stripe_tx_txn_3UCKIc4W4pZWhSUs1A6Thkoj` · Incasso Stripe charge — stripe_tx_txn_3UCKIc4W4pZWhSUs1A6Thk
- €204,98 · `STRIPE_TX:stripe_tx_txn_3UCNGm4W4pZWhSUs0AnTRWbQ` · Incasso Stripe charge — stripe_tx_txn_3UCNGm4W4pZWhSUs0AnTRW

## Lettura del gap storico €1.098,65

| Voce | Euro | Stato |
|------|-----:|-------|
| Gap iniziale | €1.098,65 | — |
| PayPal riclassificati | €722,29 | **chiuso** |
| Residuo post-fix (K) | €376,36 | **aperto** — mismatch Stripe id + extra ledger; non blocca LIPE |

## TD17 / reverse charge
| | |
|--|--:|
| Righe ARC | 34 (23 eventi) |
| IVA a debito | €257,17 |
| IVA a credito | €257,17 |
| Effetto su vendite CE | €0,00 |

## Numeri CE live
| Voce | Euro |
|------|-----:|
| Vendite caratteristiche | €4000,80 |
| Esercizio | €-3602,81 |
| Gestione | €-8200,47 |
| IVA debito | €262,89 |
| IVA credito | €1194,06 |
