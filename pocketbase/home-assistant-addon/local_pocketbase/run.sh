#!/bin/sh
set -eu

HOOK_DIR="/share/pocketbase/pb_hooks"
MIGRATIONS_DIR="/data/pb_migrations"
DATA_DIR_MARKER="/data/overweel3d-active-data-dir"

mkdir -p "${HOOK_DIR}" "${MIGRATIONS_DIR}"

# Installeer zowel de route-registratie als de CommonJS-kernmodule. Een
# nieuwere appversie werkt beide bestanden als één set bij.
for HOOK_FILE in overweel3d.pb.js overweel3d-core.js; do
  SOURCE_FILE="/opt/overweel3d-default-hooks/${HOOK_FILE}"
  TARGET_FILE="${HOOK_DIR}/${HOOK_FILE}"
  if [ ! -f "${TARGET_FILE}" ]; then
    cp "${SOURCE_FILE}" "${TARGET_FILE}"
  elif ! cmp -s "${SOURCE_FILE}" "${TARGET_FILE}"; then
    cp "${TARGET_FILE}" "${TARGET_FILE}.backup"
    cp "${SOURCE_FILE}" "${TARGET_FILE}"
  fi
done

# Gebruik na de eerste succesvolle keuze altijd dezelfde datamap. Bij een
# upgrade zonder marker zoeken we ook in oude /share-locaties en kiezen we de
# grootste bestaande database; een lege nieuw aangemaakte database wint dan
# niet van de bestaande productiegegevens.
DATA_DIR=""
if [ -f "${DATA_DIR_MARKER}" ]; then
  MARKED_DIR="$(cat "${DATA_DIR_MARKER}")"
  if [ -f "${MARKED_DIR}/data.db" ]; then
    DATA_DIR="${MARKED_DIR}"
  fi
fi

if [ -z "${DATA_DIR}" ]; then
  BEST_SIZE=0
  for DB_FILE in $(find /data /share/pocketbase -maxdepth 5 -type f -name data.db 2>/dev/null); do
    DB_SIZE="$(wc -c < "${DB_FILE}" | tr -d ' ')"
    if [ "${DB_SIZE}" -gt "${BEST_SIZE}" ]; then
      BEST_SIZE="${DB_SIZE}"
      DATA_DIR="$(dirname "${DB_FILE}")"
    fi
  done
fi

if [ -z "${DATA_DIR}" ]; then
  DATA_DIR="/data/pb_data"
  mkdir -p "${DATA_DIR}"
fi

printf '%s' "${DATA_DIR}" > "${DATA_DIR_MARKER}"

echo "PocketBase-data: ${DATA_DIR}"
echo "PocketBase-hooks: ${HOOK_DIR}"

exec /opt/pocketbase/pocketbase serve \
  --http="0.0.0.0:8090" \
  --dir="${DATA_DIR}" \
  --hooksDir="${HOOK_DIR}" \
  --migrationsDir="${MIGRATIONS_DIR}"
