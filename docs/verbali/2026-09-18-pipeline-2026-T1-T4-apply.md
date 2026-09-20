# Pipeline audit/pulizia/riconciliazione 2026 (T1–T4)

Mode: **APPLY** · Generato: 2026-09-18T10:07:47.623Z

| Trimestre | Doppioni eliminati | Riconciliazioni | C VERDI | C FAIL | C N/V | Residuo alg. € |
|---|---:|---:|---:|---:|---:|---:|
| T1 2026 | 0 | 21 | 0 | 13 | 1 | 737.08 |
| T2 2026 | 0 | 44 | 1 | 12 | 1 | 746.11 |
| T3 2026 | 15 | 50 | 1 | 11 | 2 | 309.15 |
| T4 2026 | 0 | 0 | 8 | 4 | 2 | — |

## T1 2026

- Doppioni: 0 · Manuali protette nel trimestre gateway: 18
- Match kinds: {"algebraic_partial":3,"payout_1to1":16,"sdd_1to1":2}
- C1: FAIL — estratto=41 · PN banca=37
- C2: FAIL — Δ€76.9 — Σ PN=438.66 · net estratto=361.76 (E 5388.92 − U 5027.16)
- C3: FAIL — doc=1° trimestre Fineco.pdf · open=32120.48 · Σ=361.76 · close=32442.24 · nLinee=41
- C4: FAIL — Δ€-363.23 — gateway=675.00 (Stripe charges/payments 655.84 + PayPal) · corrispettivi report=1038.23 · nCorrispettivi=25
- C13: FAIL — Δ€1851.02 — STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87

| Ctrl | Esito | Δ | Dettaglio |
|---|---|---:|---|
| C1 | FAIL | 0.04 | estratto=41 · PN banca=37 |
| C2 | FAIL | 76.90 | Σ PN=438.66 · net estratto=361.76 (E 5388.92 − U 5027.16) |
| C3 | FAIL | 40.00 | doc=1° trimestre Fineco.pdf · open=32120.48 · Σ=361.76 · close=32442.24 · nLinee=41 |
| C4 | FAIL | -363.23 | gateway=675.00 (Stripe charges/payments 655.84 + PayPal) · corrispettivi report=1038.23 · nCorrispettivi=25 |
| C5 | FAIL | 19.84 | manual=24 · saas=1 · parti=5158.23 · totali=5138.39 |
| C6 | FAIL | 0.01 | coppie=1 · invoice-n2ujnhg9-0001.pdf imponibile ±25.42 (manual↔saas) · negativi sistema senza coppia=0 · manual=24 · saas=1 |
| C7 | FAIL | 0.02 | esempi: Google Ireland Ltd; Google Ireland Ltd |
| C8 | FAIL | 0.01 | esempi: Contributi pubblici (altri ricavi — non vendite)→Contributi pubblici (altri ricavi — non vendite) |
| C9 | FAIL | 0.11 | righe ledger T2 ispezionate=156 |
| C10 | FAIL | 0.01 | STRIPE:KO · PAYPAL:OK |
| C11 | FAIL | 0.55 | n canali: Corrispettivi=48 · Ledger ricavi=26 · taxRegister=78 · taxQuarterly=78 · cfoTools=78 · divergenti=55 · FT-SA-26-001[+ledger/taxRegister/taxQuarterly/cfoTools/−corrispettivi]; FT-PA-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CO-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-RC-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-VR-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PA-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-005[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger] |
| C12 | FAIL | 0.02 | universo corrispettivi=48 · verificati=45 · esclusi_non_risolvibili=3 (FF-VE-26-001, FT-CA-26-001, FF-PN-26-005) · tolleranza fuso=24h · divergenze=2 · cmtvn3fp ordine=2026-03-22 incasso=2026-03-24 (Δ48h); cmtvn3fy ordine=2026-03-24 incasso=2026-03-22 (Δ48h) |
| C13 | FAIL | 1851.02 | STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87 |
| C14 | N/V | 0.00 | C14 non verificabile su T1 2026: manca fattura mensile (non fallito). |

## T2 2026

- Doppioni: 0 · Manuali protette nel trimestre gateway: 26
- Match kinds: {"payout_1to1":26,"algebraic_partial":12,"sdd_1to1":6}
- C1: FAIL — estratto=72 · PN banca=53
- C2: FAIL — Δ€387.9 — Σ PN=363.64 · net estratto=-24.26 (E 1291.54 − U 1315.80)
- C3: PASS — doc=2 Trimestre Fineco 2026.pdf · open=32442.24 · Σ=-24.26 · close=32417.98 · nLinee=72
- C4: FAIL — Δ€387.06 — gateway=1633.08 (Stripe charges/payments 1524.86 + PayPal) · corrispettivi report=1246.02 · nCorrispettivi=27
- C13: FAIL — Δ€1851.02 — STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87

| Ctrl | Esito | Δ | Dettaglio |
|---|---|---:|---|
| C1 | FAIL | 0.19 | estratto=72 · PN banca=53 |
| C2 | FAIL | 387.90 | Σ PN=363.64 · net estratto=-24.26 (E 1291.54 − U 1315.80) |
| C3 | PASS | 0.00 | doc=2 Trimestre Fineco 2026.pdf · open=32442.24 · Σ=-24.26 · close=32417.98 · nLinee=72 |
| C4 | FAIL | 387.06 | gateway=1633.08 (Stripe charges/payments 1524.86 + PayPal) · corrispettivi report=1246.02 · nCorrispettivi=27 |
| C5 | FAIL | 18.40 | manual=33 · saas=6 · parti=843.99 · totali=825.59 |
| C6 | FAIL | 0.06 | coppie=6 · cursor-invoice-2026-05-02-in_1tsamub4tzwxsigupiu imponibile ±17.75 (manual↔saas); cursor-invoice-2026-06-02-in_1tdp9yb4tzwxsigum4a imponibile ±17.75 (manual↔saas); stripe tax invoice 4pzwhsus-2026-05.pdf imponibile ±3.14 (manual↔saas); i tuoi acquisti apple3.pdf imponibile ±0.81 (manual↔saas); invoice-efh5u5af-0001.pdf imponibile ±18.00 (manual↔saas); invoice-efh5u5af-0002.pdf imponibile ±18.00 (manual↔saas) · negativi sistema senza coppia=0 · manual=33 · saas=6 |
| C7 | FAIL | 0.12 | esempi: Cursor; Cursor; Stripe Payments Europe; Apple; Anthropic, PBC… |
| C8 | FAIL | 0.01 | esempi: Altri ricavi e proventi→Altri ricavi e proventi |
| C9 | FAIL | 0.22 | righe ledger T2 ispezionate=278 |
| C10 | FAIL | 0.01 | STRIPE:KO · PAYPAL:OK |
| C11 | FAIL | 0.55 | n canali: Corrispettivi=48 · Ledger ricavi=26 · taxRegister=78 · taxQuarterly=78 · cfoTools=78 · divergenti=55 · FT-SA-26-001[+ledger/taxRegister/taxQuarterly/cfoTools/−corrispettivi]; FT-PA-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CO-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-RC-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-VR-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PA-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-005[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger] |
| C12 | FAIL | 0.02 | universo corrispettivi=48 · verificati=45 · esclusi_non_risolvibili=3 (FF-VE-26-001, FT-CA-26-001, FF-PN-26-005) · tolleranza fuso=24h · divergenze=2 · cmtvn3fp ordine=2026-03-22 incasso=2026-03-24 (Δ48h); cmtvn3fy ordine=2026-03-24 incasso=2026-03-22 (Δ48h) |
| C13 | FAIL | 1851.02 | STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87 |
| C14 | N/V | 0.00 | C14 non verificabile su T2 2026: manca fattura mensile (non fallito). |

## T3 2026

- Doppioni: 15 · Manuali protette nel trimestre gateway: 39
- Match kinds: {"algebraic_partial":15,"payout_1to1":30,"sdd_1to1":5}
- C1: FAIL — estratto=83 · PN banca=61
- C2: FAIL — Δ€402.89 — Σ PN=-47.38 · net estratto=-450.27 (E 1742.96 − U 2193.23)
- C3: N/V — non verificabile — nessun estratto ufficiale del periodo con saldo iniziale e finale dichiarati (METODO §2 v1.10: lista movimenti = dato provvisorio, C3 non si misura fino al passaggio a definitivo)
- C4: FAIL — Δ€552.62 — gateway=2535.55 (Stripe charges/payments 2420.20 + PayPal) · corrispettivi report=1982.93 · nCorrispettivi=42
- C13: FAIL — Δ€1851.02 — STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87

| Ctrl | Esito | Δ | Dettaglio |
|---|---|---:|---|
| C1 | FAIL | 0.22 | estratto=83 · PN banca=61 |
| C2 | FAIL | 402.89 | Σ PN=-47.38 · net estratto=-450.27 (E 1742.96 − U 2193.23) |
| C3 | N/V | — | non verificabile — nessun estratto ufficiale del periodo con saldo iniziale e finale dichiarati (METODO §2 v1.10: lista movimenti = dato provvisorio, C3 non si misura fino al passaggio a definitivo) |
| C4 | FAIL | 552.62 | gateway=2535.55 (Stripe charges/payments 2420.20 + PayPal) · corrispettivi report=1982.93 · nCorrispettivi=42 |
| C5 | FAIL | 7.22 | manual=37 · saas=14 · parti=1108.26 · totali=1101.04 |
| C6 | FAIL | 0.14 | coppie=14 · invoice-hh4vmwho-0001.pdf imponibile ±17.27 (manual↔saas); invoice-jupl1vc3-0005.pdf imponibile ±17.75 (manual↔saas); cursor-invoice-2026-07-02-in_1tohrhb4tzwxsiguqka imponibile ±17.75 (manual↔saas); cursor-invoice-2026-08-02-in_1tzwdob4tzwxsiguexm imponibile ±17.75 (manual↔saas); stripe tax invoice kwwcywep-2026-08.pdf imponibile ±8.17 (manual↔saas); stripe tax invoice kwwcywep-2026-07.pdf imponibile ±5.70 (manual↔saas) · negativi sistema senza coppia=0 · manual=37 · saas=14 |
| C7 | FAIL | 0.31 | esempi: Vercel Inc.; Fioreria Rossella; Cursor; Fioreria Rossella; Fioreria Rossella… |
| C8 | PASS | 0.00 | tutte le 61 righe PN in elenco chiuso (dopo normalizzazione legacy) |
| C9 | FAIL | 0.27 | righe ledger T2 ispezionate=412 |
| C10 | FAIL | 0.01 | STRIPE:KO · PAYPAL:OK |
| C11 | FAIL | 0.55 | n canali: Corrispettivi=48 · Ledger ricavi=26 · taxRegister=78 · taxQuarterly=78 · cfoTools=78 · divergenti=55 · FT-SA-26-001[+ledger/taxRegister/taxQuarterly/cfoTools/−corrispettivi]; FT-PA-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CO-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-RC-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-VR-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PA-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-005[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger] |
| C12 | FAIL | 0.02 | universo corrispettivi=48 · verificati=45 · esclusi_non_risolvibili=3 (FF-VE-26-001, FT-CA-26-001, FF-PN-26-005) · tolleranza fuso=24h · divergenze=2 · cmtvn3fp ordine=2026-03-22 incasso=2026-03-24 (Δ48h); cmtvn3fy ordine=2026-03-24 incasso=2026-03-22 (Δ48h) |
| C13 | FAIL | 1851.02 | STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87 |
| C14 | N/V | 0.00 | C14 non verificabile su T3 2026: manca fattura mensile (non fallito). |

### ID eliminati

- `cmt2m63oj0000jt04bfjfr3g0` (manual) SHOPPINGARDEN DI ANNA BRUNO €20.00 2026-08-19 — stesso fornitore+importo+data · keep `cmtr92mee0002lc048j0jz2y9`
- `cmtr92vgr0003lc04l3zqyy74` (manual) SHOPPINGARDEN di Anna Bruno €20.00 2026-08-03 — stesso fornitore+importo+data · keep `cmt2m644k0001jt04u67710tj`
- `cmtr933460004lc04a305oe1i` (manual) Battistella Fioreria srl €140.00 2026-07-31 — stesso fornitore+importo+data · keep `cmt2m65800004jt04oz8ucks1`
- `cmtr93tbd0007lc049tn2sb69` (manual) Margherita Flower Studio di Lo Monaco Martina €30.00 2026-07-22 — stesso fornitore+importo+data · keep `cmt2m65st0006jt041gem9qw4`
- `cmtr93csd0005lc0417z98loi` (manual) CINGOLANI ANTONELLA €20.00 2026-07-30 — stesso fornitore+importo+data · keep `cmt2m663d0008jt041ed2s8ah`
- `cmtr93mk20006lc04ywtoi297` (manual) MASPES PIANTE E FIORI DI MASPES & C. SNC €133.00 2026-07-26 — stesso fornitore+importo+data · keep `cmt2m66dy000ajt04q6k3o67j`
- `cmtr942q50008lc046go2j9hq` (manual) LA BAITA DEL FIORE S.N.C. €20.00 2026-07-22 — stesso fornitore+importo+data · keep `cmt2m66w4000cjt04bwh6ruas`
- `cmtr94gkj000alc04ipcz0913` (manual) SHOPPINGARDEN di Anna Bruno €20.00 2026-07-07 — stesso fornitore+importo+data · keep `cmt2m67ju000gjt04jrukbvdu`
- `cmtve2aze0000i604p5siaen7` (manual) CINGOLANI ANTONELLA €20.00 2026-07-01 — stesso fornitore+importo+data · keep `cmt2m67uf000ijt04jznzu1tc`
- `cmtaa7v980002i804fx4yvv86` (manual) Fioreria Rossella €17.00 2026-08-04 — stesso fornitore+importo+data · keep `cmtaa5u7l0000i804nra2seoa`
- `cmtabi0bu0002l804r6ni51no` (manual) Fioreria Rossella €17.00 2026-08-26 — stesso fornitore+importo+data · keep `cmtabgxus0000l8040f8ki60n`
- `cmthejl510002l404n8sl48aa` (manual) Fioreria Rossella €17.00 2026-08-28 — stesso fornitore+importo+data · keep `cmtheioa40000l4040kpent27`
- `cmthekww70004l404itu8uc1f` (manual) Fioreria Rossella €17.00 2026-08-28 — stesso fornitore+importo+data · keep `cmtheioa40000l4040kpent27`
- `cmtr92em20001lc048iteix7w` (manual) Battistella Fioreria srl €138.00 2026-08-31 — stesso fornitore+importo+data · keep `cmtjxel1a0000jv04lta819f8`
- `cmtr926d40000lc04aeeda5zg` (manual) SHOPPINGARDEN di Anna Bruno €20.00 2026-09-03 — stesso fornitore+importo+data · keep `cmtm1jwck0000l504w3tzrdhy`

## T4 2026

- Doppioni: 0 · Manuali protette nel trimestre gateway: 0
- Match kinds: {}
- C1: PASS — estratto=0 · PN banca=0
- C2: PASS — Δ€0 — Σ PN=0.00 · net estratto=0.00 (E 0.00 − U 0.00)
- C3: N/V — non verificabile — nessun estratto ufficiale del periodo con saldo iniziale e finale dichiarati (METODO §2 v1.10: lista movimenti = dato provvisorio, C3 non si misura fino al passaggio a definitivo)
- C4: PASS — Δ€0 — gateway=0.00 (Stripe charges/payments 0.00 + PayPal) · corrispettivi report=0.00 · nCorrispettivi=0
- C13: FAIL — Δ€1851.02 — STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87

| Ctrl | Esito | Δ | Dettaglio |
|---|---|---:|---|
| C1 | PASS | 0.00 | estratto=0 · PN banca=0 |
| C2 | PASS | 0.00 | Σ PN=0.00 · net estratto=0.00 (E 0.00 − U 0.00) |
| C3 | N/V | — | non verificabile — nessun estratto ufficiale del periodo con saldo iniziale e finale dichiarati (METODO §2 v1.10: lista movimenti = dato provvisorio, C3 non si misura fino al passaggio a definitivo) |
| C4 | PASS | 0.00 | gateway=0.00 (Stripe charges/payments 0.00 + PayPal) · corrispettivi report=0.00 · nCorrispettivi=0 |
| C5 | PASS | 0.00 | manual=0 · saas=0 · parti=0.00 · totali=0.00 |
| C6 | PASS | 0.00 | coppie=0 · negativi sistema senza coppia=0 · manual=0 · saas=0 |
| C7 | PASS | 0.00 | tutti i documenti hanno P.IVA/CF |
| C8 | PASS | 0.00 | tutte le 0 righe PN in elenco chiuso (dopo normalizzazione legacy) |
| C9 | PASS | 0.00 | righe ledger T2 ispezionate=0 |
| C10 | FAIL | 0.01 | STRIPE:KO · PAYPAL:OK |
| C11 | FAIL | 0.55 | n canali: Corrispettivi=48 · Ledger ricavi=26 · taxRegister=78 · taxQuarterly=78 · cfoTools=78 · divergenti=55 · FT-SA-26-001[+ledger/taxRegister/taxQuarterly/cfoTools/−corrispettivi]; FT-PA-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CO-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-RC-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-CS-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-004[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-VR-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-002[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PD-26-003[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FF-PA-26-001[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger]; FT-PA-26-005[+taxRegister/taxQuarterly/cfoTools/−corrispettivi/ledger] |
| C12 | FAIL | 0.02 | universo corrispettivi=48 · verificati=45 · esclusi_non_risolvibili=3 (FF-VE-26-001, FT-CA-26-001, FF-PN-26-005) · tolleranza fuso=24h · divergenze=2 · cmtvn3fp ordine=2026-03-22 incasso=2026-03-24 (Δ48h); cmtvn3fy ordine=2026-03-24 incasso=2026-03-22 (Δ48h) |
| C13 | FAIL | 1851.02 | STRIPE(transito vendite): ledger=61.85 · dich.=100.00 · Δ=-38.15 · PAYPAL(conto pagamento): ledger=-1812.87 · dich.=0.00 · Δ=-1812.87 |
| C14 | N/V | 0.00 | C14 non verificabile su T4 2026: manca fattura mensile (non fallito). |
