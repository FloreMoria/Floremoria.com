#!/bin/bash

# Esegue lo script NodeJS per ogni foto generata oggi nella nostra sessione
# Esegue lo script usando le keyword GEO/SEO richieste.
# Modifica fondamentale: spostiamo il terminale forzatamente alla root del progetto per evitare MODULE_NOT_FOUND e per far leggere il .env e Prisma
cd /Users/floremoria/Downloads/Floremoria_dot_com/floremoria || exit

NODE_CMD="node scripts/ingest-ai-images.mjs"
ANT_BRAIN="/Users/floremoria/.gemini/antigravity/brain/603c2a2b-b46b-4a63-8206-5f621b347c52"

echo "🚀 Inizio ingestione massiva di 10 immagini AI verticali..."

# Ricordo Affettuoso
$NODE_CMD "$ANT_BRAIN/ricordo_primavera_verticale_1776274125679.png" "bouquet-ricordo-affettuoso" "Consegna composizione floreale cimitero Napoli bouquet affettuoso primavera"
$NODE_CMD "$ANT_BRAIN/ricordo_invernale_verticale_1776274141235.png" "bouquet-ricordo-affettuoso" "Bouquet fiori cimitero Bologna consegna lapide inverno"
$NODE_CMD "$ANT_BRAIN/ricordo_autunnale_verticale_1776274296136.png" "bouquet-ricordo-affettuoso" "Fiori autunnali tomba Firenze consegna bouquet ricordo crisantemi"
$NODE_CMD "$ANT_BRAIN/ricordo_estivo_verticale_1776274426568.png" "bouquet-ricordo-affettuoso" "Consegna girasoli tomba Palermo bouquet ricordo lapide estivo"
$NODE_CMD "$ANT_BRAIN/ricordo_affettuoso_proporzionato_1776273915997.png" "bouquet-ricordo-affettuoso" "Consegna fiori tomba Milano bouquet affettuoso"

# Omaggio Speciale
$NODE_CMD "$ANT_BRAIN/omaggio_speciale_vibrante_1776275000054.png" "bouquet-omaggio-speciale" "Mazzo di fiori cimitero Roma bouquet omaggio speciale"
$NODE_CMD "$ANT_BRAIN/omaggio_speciale_tomba_curata_1776275086711.png" "bouquet-omaggio-speciale" "Consegna gigli bianchi lapide cimitero Verona omaggio speciale"
$NODE_CMD "$ANT_BRAIN/omaggio_speciale_vaso_1776275199482.png" "bouquet-omaggio-speciale" "Portafiori bronzo cimitero Venezia consegna fiori tomba omaggio speciale"
$NODE_CMD "$ANT_BRAIN/omaggio_speciale_inverno_vaso_1776275292922.png" "bouquet-omaggio-speciale" "Composizione floreale invernale vaso tomba Torino omaggio speciale"
$NODE_CMD "$ANT_BRAIN/omaggio_speciale_estate_vaso_1776275406198.png" "bouquet-omaggio-speciale" "Fiori estivi girasoli tomba Bari omaggio speciale"

echo "✅ Fatto! Tutte le immagini sono state ritagliate (3:4), compresse in WebP, nominate in ottica SEO e inserite nel DB Prisma!"
