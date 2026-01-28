#!/bin/bash
# Dump and rebuild a SQLite database, attempting to recover corrupted data.
#
# Usage: ./scripts/db-rebuild.sh <source-db> [output-db]
#
# Features:
#   - First attempts sqlite3 .recover (better at salvaging corrupt data)
#   - Falls back to .dump if .recover fails or isn't available
#   - Compares row counts between source and rebuilt
#   - Runs integrity check on rebuilt database
#   - Reports any rows that couldn't be imported

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <source-db> [output-db]" >&2
    exit 1
fi

SOURCE_DB="$1"

if [[ ! -f "${SOURCE_DB}" ]]; then
    echo "Error: Source database not found: ${SOURCE_DB}" >&2
    exit 1
fi

# Determine output path
if [[ $# -ge 2 ]]; then
    OUTPUT_DB="$2"
else
    BASENAME=$(basename "${SOURCE_DB}" .sqlite3)
    BASENAME=$(basename "${BASENAME}" .db)
    TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
    OUTPUT_DB="${BASENAME}-rebuilt-${TIMESTAMP}.sqlite3"
fi

# Ensure output doesn't already exist
if [[ -f "${OUTPUT_DB}" ]]; then
    echo "Error: Output file already exists: ${OUTPUT_DB}" >&2
    exit 1
fi

echo "Database Rebuild"
echo "Source: ${SOURCE_DB}"
echo "Output: ${OUTPUT_DB}"
echo "Date: $(date)"
echo

# Create temp files for SQL dump and errors
DUMP_FILE=$(mktemp)
ERROR_FILE=$(mktemp)
trap "rm -f ${DUMP_FILE} ${ERROR_FILE}" EXIT

# Try .recover first (better at salvaging corrupt data)
echo "1. Exporting data from source database"

RECOVER_AVAILABLE=0
if sqlite3 "${SOURCE_DB}" ".recover" >/dev/null 2>&1; then
    RECOVER_AVAILABLE=1
fi

if [[ ${RECOVER_AVAILABLE} -eq 1 ]]; then
    echo "Using .recover (recommended for corrupt databases)..."
    if sqlite3 "${SOURCE_DB}" ".recover" > "${DUMP_FILE}" 2>"${ERROR_FILE}"; then
        echo "Export method: .recover (success)"
    else
        echo "Warning: .recover had issues, falling back to .dump"
        if [[ -s "${ERROR_FILE}" ]]; then
            echo "Recover errors:"
            cat "${ERROR_FILE}"
        fi
        echo
        echo "Trying .dump fallback..."
        if ! sqlite3 "${SOURCE_DB}" ".dump" > "${DUMP_FILE}" 2>"${ERROR_FILE}"; then
            echo "Error: Both .recover and .dump failed" >&2
            if [[ -s "${ERROR_FILE}" ]]; then
                cat "${ERROR_FILE}" >&2
            fi
            exit 1
        fi
        echo "Export method: .dump (fallback)"
    fi
else
    echo "Using .dump (sqlite3 version doesn't support .recover)..."
    if ! sqlite3 "${SOURCE_DB}" ".dump" > "${DUMP_FILE}" 2>"${ERROR_FILE}"; then
        echo "Error: .dump failed" >&2
        if [[ -s "${ERROR_FILE}" ]]; then
            cat "${ERROR_FILE}" >&2
        fi
        exit 1
    fi
    echo "Export method: .dump"
fi

DUMP_SIZE=$(ls -lh "${DUMP_FILE}" | awk '{print $5}')
echo "Dump size: ${DUMP_SIZE}"
echo

# Import into new database
echo "2. Importing into new database"

# Create new database and import
IMPORT_ERRORS=$(mktemp)
trap "rm -f ${DUMP_FILE} ${ERROR_FILE} ${IMPORT_ERRORS}" EXIT

if sqlite3 "${OUTPUT_DB}" < "${DUMP_FILE}" 2>"${IMPORT_ERRORS}"; then
    echo "Import: Success"
else
    echo "Import: Completed with errors"
fi

if [[ -s "${IMPORT_ERRORS}" ]]; then
    echo
    echo "Import warnings/errors:"
    cat "${IMPORT_ERRORS}"
fi
echo

# Compare row counts
echo "3. Row Count Comparison"

TABLES=$(sqlite3 "${SOURCE_DB}" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" 2>/dev/null || echo "")
TOTAL_SOURCE=0
TOTAL_REBUILT=0
ROWS_LOST=0
TABLE_DATA="Table,Source,Rebuilt,Diff"

for TABLE in ${TABLES}; do
    SOURCE_COUNT=$(sqlite3 "${SOURCE_DB}" "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "ERROR")
    REBUILT_COUNT=$(sqlite3 "${OUTPUT_DB}" "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "0")

    if [[ "${SOURCE_COUNT}" == "ERROR" ]]; then
        DIFF="N/A"
    elif [[ "${REBUILT_COUNT}" == "0" && "${SOURCE_COUNT}" != "0" ]]; then
        DIFF="-${SOURCE_COUNT}"
        ROWS_LOST=$((ROWS_LOST + SOURCE_COUNT))
    else
        DIFF=$((REBUILT_COUNT - SOURCE_COUNT))
        if [[ ${DIFF} -lt 0 ]]; then
            ROWS_LOST=$((ROWS_LOST + (-DIFF)))
        fi
        if [[ ${DIFF} -ge 0 ]]; then
            DIFF="+${DIFF}"
        fi
    fi

    TABLE_DATA="${TABLE_DATA}"$'\n'"${TABLE},${SOURCE_COUNT},${REBUILT_COUNT},${DIFF}"

    if [[ "${SOURCE_COUNT}" != "ERROR" ]]; then
        TOTAL_SOURCE=$((TOTAL_SOURCE + SOURCE_COUNT))
    fi
    if [[ "${REBUILT_COUNT}" != "ERROR" && "${REBUILT_COUNT}" != "0" ]] || [[ "${REBUILT_COUNT}" == "0" ]]; then
        TOTAL_REBUILT=$((TOTAL_REBUILT + REBUILT_COUNT))
    fi
done

TOTAL_DIFF=$((TOTAL_REBUILT - TOTAL_SOURCE))
if [[ ${TOTAL_DIFF} -ge 0 ]]; then
    TOTAL_DIFF="+${TOTAL_DIFF}"
fi
TABLE_DATA="${TABLE_DATA}"$'\n'"---,---,---,---"
TABLE_DATA="${TABLE_DATA}"$'\n'"TOTAL,${TOTAL_SOURCE},${TOTAL_REBUILT},${TOTAL_DIFF}"
echo "${TABLE_DATA}" | column -t -s ','
echo

# Run integrity check on rebuilt database
echo "4. Integrity Check (Rebuilt Database)"
INTEGRITY_RESULT=$(sqlite3 "${OUTPUT_DB}" "PRAGMA integrity_check;" 2>&1)
if [[ "${INTEGRITY_RESULT}" == "ok" ]]; then
    echo "Integrity: PASSED"
else
    echo "Integrity: FAILED"
    echo "Details:"
    echo "${INTEGRITY_RESULT}" | head -10
fi

FK_RESULT=$(sqlite3 "${OUTPUT_DB}" "PRAGMA foreign_key_check;" 2>&1)
if [[ -z "${FK_RESULT}" ]]; then
    echo "Foreign keys: PASSED"
else
    echo "Foreign keys: VIOLATIONS FOUND"
    echo "${FK_RESULT}" | head -10
fi
echo

# File size comparison
echo "5. File Size Comparison"
SOURCE_SIZE=$(ls -lh "${SOURCE_DB}" | awk '{print $5}')
OUTPUT_SIZE=$(ls -lh "${OUTPUT_DB}" | awk '{print $5}')
echo "Source: ${SOURCE_SIZE}"
echo "Rebuilt: ${OUTPUT_SIZE}"
echo

# Summary
echo "Summary"
echo "Rebuilt database: ${OUTPUT_DB}"

if [[ ${ROWS_LOST} -gt 0 ]]; then
    echo
    echo "WARNING: ${ROWS_LOST} rows could not be recovered."
    echo "Review the row count comparison above for details."
fi

if [[ "${INTEGRITY_RESULT}" == "ok" ]]; then
    echo
    echo "The rebuilt database passed integrity checks."
    echo "You can verify it further with:"
    echo "  ./scripts/db-integrity.sh ${OUTPUT_DB}"
else
    echo
    echo "The rebuilt database has integrity issues."
    echo "Manual intervention may be required."
fi
