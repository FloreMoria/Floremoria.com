#!/bin/bash
cd "$(dirname "$0")/.." || exit
# Forza l'arresto e rimuove le immagini vecchie e layer incastrati
docker-compose down
docker rmi floremoria-web:latest -f || true
docker builder prune -f
docker-compose up --build -d
