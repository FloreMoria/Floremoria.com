# WhatsApp KB - FloreMoria

Questa cartella contiene la base conoscitiva per il flusso WhatsApp (Twilio + assistente).

## File

- `knowledge_base_whatsapp.txt`
  - Archivio originale esteso (storico annuale chat reali — CAPITOLO 1 utenti, CAPITOLO 2 fioristi).
  - Runtime: estratto da `lib/whatsapp/historicalToneKb.ts` nel prompt VERA (non caricare l'intero file grezzo).
- `knowledge_base_whatsapp_core.txt`
  - Versione operativa corta da usare come contesto principale runtime.
- `knowledge_base_whatsapp_examples.txt`
  - Esempi anonimizzati di conversazione per tono e gestione casi.

## Uso consigliato nel backend

1. Caricare sempre `knowledge_base_whatsapp_core.txt`.
2. Aggiungere `knowledge_base_whatsapp_examples.txt` solo quando serve few-shot style.
3. Non usare l'archivio completo grezzo in prompt runtime diretto (troppo lungo e con dati sensibili).

## Regola critica

Il trigger `UMANO` (maiuscolo) deve forzare handoff operatore e sospendere la risposta AI.
