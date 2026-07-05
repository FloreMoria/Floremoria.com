# WhatsApp post-consegna — VERA nativo (Meta Cloud API)

FloreMoria invia direttamente foto e notifica al cliente via **Meta WhatsApp Cloud API** al completamento consegna fiorista.

## Trigger backend

File: `lib/deliveryProof/submitFloristProof.ts` → `notifyCustomerDeliveryComplete` → `sendDeliveryProofWhatsApp`

1. Il fiorista carica foto prima/dopo nella mini-app consegna.
2. Le foto vengono salvate su `DeliveryProof` e iniettate su `Order.photos`.
3. `notifyCustomerDeliveryComplete(orderId)` invia:
   - **Immagine** posa (staging URL pubblico temporaneo da Blob privato)
   - **Testo empatico** (tono chat storiche CAPITOLO 1)
   - **Link Giardino della Memoria** (`/f/{code}`, 24h)

Percorsi:
- `app/api/partner/order/upload-proof/route.ts` (fiorista)
- `app/actions/delivery-proof.ts` (dashboard admin)

## Env richieste

- `WHATSAPP_CLOUD_API_KEY`
- `WHATSAPP_PHONE_NUMBER_ID`
- `BLOB_READ_WRITE_TOKEN` + `BLOB_STORE_ID` (staging foto per Meta)
- `MAGIC_LINK_SECRET` (firma token staging)

## Note

- **Futuria CRM non è più usato** per le notifiche post-consegna.
- Fuori finestra 24h WhatsApp: serve template Meta dedicato (fase 2); attualmente fallback testuale con log.
