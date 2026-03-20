# DEVELOPER LOG

## Dati del 19/03/2026
- **Verbale (Fornito da Barbara)**: Controllata esistenza e scritto fisicamente nel database.
- **Aggiornamento Database**: Eseguito script `ts-node` per l'inserimento forzato dei log (floremoria_logs).
- **Controllo UI Tables**: Verificato componente `ReportsTable.tsx` (riferito come `ClientLogsTable.tsx`) all'interno di `/dashboard/logs`. Nessun filtro anomalo di date, che precludesse la visualizzazione. Le entry sono caricate correttamente in modalità `DESC` per data di sessione.
