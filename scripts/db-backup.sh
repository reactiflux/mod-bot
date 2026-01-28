#!/bin/bash
# Backup the production database from Kubernetes pod to local destination.
# Usage: ./scripts/db-backup.sh [destination]
#
# Arguments:
#   destination - Optional path for backup file. Defaults to timestamped file in current directory.

set -euo pipefail

POD_NAME="mod-bot-set-0"
REMOTE_DB_PATH="/data/mod-bot.sqlite3"

# Determine destination path
if [[ $# -ge 1 ]]; then
    DESTINATION="$1"
else
    TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
    DESTINATION="./mod-bot-backup-${TIMESTAMP}.sqlite3"
fi

echo "Backing up database from ${POD_NAME}..."
echo "  Source: ${POD_NAME}:${REMOTE_DB_PATH}"
echo "  Destination: ${DESTINATION}"
echo

# Copy the database file from the pod
if ! kubectl cp "${POD_NAME}:${REMOTE_DB_PATH}" "${DESTINATION}"; then
    echo "Error: Failed to copy database from pod" >&2
    exit 1
fi

# Also copy WAL and SHM files if they exist (for complete backup)
echo "Checking for WAL files..."
if kubectl exec "${POD_NAME}" -- test -f "${REMOTE_DB_PATH}-wal" 2>/dev/null; then
    echo "  Copying WAL file..."
    kubectl cp "${POD_NAME}:${REMOTE_DB_PATH}-wal" "${DESTINATION}-wal" 2>/dev/null || true
fi

if kubectl exec "${POD_NAME}" -- test -f "${REMOTE_DB_PATH}-shm" 2>/dev/null; then
    echo "  Copying SHM file..."
    kubectl cp "${POD_NAME}:${REMOTE_DB_PATH}-shm" "${DESTINATION}-shm" 2>/dev/null || true
fi

# Show file size
FILE_SIZE=$(ls -lh "${DESTINATION}" | awk '{print $5}')
echo
echo "Backup complete!"
echo "  File: ${DESTINATION}"
echo "  Size: ${FILE_SIZE}"

# Quick integrity check
echo
echo "Running quick integrity check..."
INTEGRITY=$(sqlite3 "${DESTINATION}" "PRAGMA quick_check;" 2>&1)
if [[ "${INTEGRITY}" == "ok" ]]; then
    echo "  Integrity: OK"
else
    echo "  Integrity: ISSUES DETECTED"
    echo "  Run ./scripts/db-integrity.sh ${DESTINATION} for details"
fi
