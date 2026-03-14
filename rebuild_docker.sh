#!/bin/bash
# Forza l'arresto e rimuove le immagini vecchie e layer incastrati
docker-compose down
docker rmi floremoria-web:latest -f || true
docker builder prune -f
docker-compose --pull always --build -d
