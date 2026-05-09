#!/usr/bin/env bash
set -euo pipefail

MATRIX_HOMESERVER="https://matrix.org"
CLIENT_ID="mosaicstacked-backend"
SCOPE="urn:matrix:org.matrix.msc2967.client:api:* openid"
ENV_FILE=".env"

echo "🔑 Schritt 1: Device Code anfordern..."
RESPONSE=$(curl -s -X POST "${MATRIX_HOMESERVER}/oauth2/device_authorization" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "scope=${SCOPE}")

DEVICE_CODE=$(echo "$RESPONSE" | jq -r '.device_code')
USER_CODE=$(echo "$RESPONSE" | jq -r '.user_code')
VERIFICATION_URI=$(echo "$RESPONSE" | jq -r '.verification_uri')
VERIFICATION_URI_COMPLETE=$(echo "$RESPONSE" | jq -r '.verification_uri_complete // empty')
EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.expires_in')
INTERVAL=$(echo "$RESPONSE" | jq -r '.interval // 5')

echo "✅ Device Code erhalten."
echo "🌐 Browser öffnen: ${VERIFICATION_URI_COMPLETE:-$VERIFICATION_URI}"
echo "🔢 Alternativ manuell eingeben: ${USER_CODE}"
echo "⏳ Zeitlimit: ${EXPIRES_IN}s"

# Optional: Browser automatisch öffnen
if command -v xdg-open &>/dev/null; then
  xdg-open "${VERIFICATION_URI_COMPLETE:-$VERIFICATION_URI}" 2>/dev/null || true
fi

echo "⏳ Polling nach Autorisierung (Strg+C zum Abbrechen)..."
END_TIME=$(( $(date +%s) + EXPIRES_IN ))

while [ $(date +%s) -lt $END_TIME ]; do
  sleep "$INTERVAL"
  TOKEN_RESPONSE=$(curl -s -X POST "${MATRIX_HOMESERVER}/oauth2/token" \
    --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
    --data-urlencode "device_code=${DEVICE_CODE}" \
    --data-urlencode "client_id=${CLIENT_ID}")

  ERROR=$(echo "$TOKEN_RESPONSE" | jq -r '.error // empty')

  if [ -z "$ERROR" ]; then
    echo "✅ Autorisierung erfolgreich!"
    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
    REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.refresh_token // empty')
    EXPIRES_AT=$(( $(date +%s) + $(echo "$TOKEN_RESPONSE" | jq -r '.expires_in // 3600') ))

    echo "📝 Tokens (kopiere sie in .env):"
    echo "MATRIX_ACCESS_TOKEN=\"${ACCESS_TOKEN}\""
    echo "MATRIX_REFRESH_TOKEN=\"${REFRESH_TOKEN}\""
    echo "MATRIX_TOKEN_EXPIRES_AT=${EXPIRES_AT}"

    echo "🔧 Möchtest du die Werte direkt in ${ENV_FILE} schreiben? (j/n)"
    read -r ANSWER
    if [[ "${ANSWER,,}" == j* ]]; then
      for VAR in MATRIX_ACCESS_TOKEN MATRIX_REFRESH_TOKEN MATRIX_TOKEN_EXPIRES_AT; do
        VAL="${!VAR}"
        if grep -q "^${VAR}=" "$ENV_FILE" 2>/dev/null; then
          sed -i "s|^${VAR}=.*|${VAR}=\"${VAL}\"|" "$ENV_FILE"
        else
          echo "${VAR}=\"${VAL}\"" >> "$ENV_FILE"
        fi
      done
      echo "✅ ${ENV_FILE} aktualisiert."
    fi
    exit 0
  elif [ "$ERROR" = "authorization_pending" ]; then
    continue
  elif [ "$ERROR" = "slow_down" ]; then
    INTERVAL=$((INTERVAL + 5))
    continue
  else
    echo "❌ Fehler: ${ERROR}"
    echo "$TOKEN_RESPONSE" | jq .
    exit 1
  fi
done

echo "⏰ Timeout. Bitte starte das Script erneut."
exit 1