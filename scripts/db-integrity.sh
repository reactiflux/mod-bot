#!/bin/bash
# Run integrity checks on a local SQLite database and display a summary.
#
# Usage: ./scripts/db-integrity.sh <database-file>
#
# Performs:
#   - PRAGMA integrity_check
#   - PRAGMA foreign_key_check
#   - REINDEX with constraint violation detection
#   - Table row counts
#   - Overall health status report

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <database-file>" >&2
    exit 1
fi

DB_FILE="$1"

if [[ ! -f "${DB_FILE}" ]]; then
    echo "Error: Database file not found: ${DB_FILE}" >&2
    exit 1
fi

echo "Database Integrity Report"
echo "File: ${DB_FILE}"
echo "Size: $(ls -lh "${DB_FILE}" | awk '{print $5}')"
echo "Date: $(date)"
echo

ISSUES_FOUND=0

# Integrity check (use quick_check first, it's faster and less likely to crash on corrupt DBs)
echo "1. PRAGMA quick_check"
INTEGRITY_RESULT=$(sqlite3 "${DB_FILE}" "PRAGMA quick_check;" 2>&1)
if [[ "${INTEGRITY_RESULT}" == "ok" ]]; then
    echo "Status: PASSED"
else
    echo "Status: FAILED"
    echo "Details:"
    echo "${INTEGRITY_RESULT}" | head -10
    if [[ $(echo "${INTEGRITY_RESULT}" | wc -l) -gt 10 ]]; then
        echo "... (truncated, $(echo "${INTEGRITY_RESULT}" | wc -l) total issues)"
    fi
    ISSUES_FOUND=1
fi
echo

# Foreign key check
echo "2. PRAGMA foreign_key_check"
FK_RESULT=$(sqlite3 "${DB_FILE}" "PRAGMA foreign_key_check;" 2>&1)
if [[ -z "${FK_RESULT}" ]]; then
    echo "Status: PASSED (no violations)"
else
    echo "Status: FAILED"
    echo "Violations found:"
    echo "${FK_RESULT}" | head -10
    if [[ $(echo "${FK_RESULT}" | wc -l) -gt 10 ]]; then
        echo "... (truncated)"
    fi
    ISSUES_FOUND=1
fi
echo

# REINDEX attempt (may fail on corrupt databases)
echo "3. REINDEX check"
if REINDEX_RESULT=$(sqlite3 "${DB_FILE}" "REINDEX;" 2>&1); then
    if [[ -z "${REINDEX_RESULT}" ]]; then
        echo "Status: PASSED"
    else
        echo "Status: ISSUES DETECTED"
        echo "Details:"
        echo "${REINDEX_RESULT}" | head -10
        if [[ $(echo "${REINDEX_RESULT}" | wc -l) -gt 10 ]]; then
            echo "... (truncated)"
        fi
        ISSUES_FOUND=1
    fi
else
    echo "Status: FAILED (sqlite3 crashed or errored)"
    echo "This usually indicates severe corruption."
    if [[ -n "${REINDEX_RESULT}" ]]; then
        echo "Details:"
        echo "${REINDEX_RESULT}" | head -10
        if [[ $(echo "${REINDEX_RESULT}" | wc -l) -gt 10 ]]; then
            echo "... (truncated)"
        fi
    fi
    ISSUES_FOUND=1
fi
echo

# Table row counts
echo "4. Table Statistics"

TABLES=$(sqlite3 "${DB_FILE}" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
TOTAL_ROWS=0
TABLE_DATA="Table,Rows"

for TABLE in ${TABLES}; do
    ROW_COUNT=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "ERROR")
    TABLE_DATA="${TABLE_DATA}"$'\n'"${TABLE},${ROW_COUNT}"
    if [[ "${ROW_COUNT}" != "ERROR" ]]; then
        TOTAL_ROWS=$((TOTAL_ROWS + ROW_COUNT))
    fi
done

TABLE_DATA="${TABLE_DATA}"$'\n'"---,---"
TABLE_DATA="${TABLE_DATA}"$'\n'"TOTAL,${TOTAL_ROWS}"
echo "${TABLE_DATA}" | column -t -s ','
echo

# SQLite version and settings
echo "5. Database Configuration"
echo "SQLite version: $(sqlite3 "${DB_FILE}" "SELECT sqlite_version();")"
echo "Journal mode: $(sqlite3 "${DB_FILE}" "PRAGMA journal_mode;")"
echo "Page size: $(sqlite3 "${DB_FILE}" "PRAGMA page_size;")"
echo "Page count: $(sqlite3 "${DB_FILE}" "PRAGMA page_count;")"
echo "Freelist count: $(sqlite3 "${DB_FILE}" "PRAGMA freelist_count;")"
echo "Auto vacuum: $(sqlite3 "${DB_FILE}" "PRAGMA auto_vacuum;")"
echo

# Overall health status
echo "Overall Health Status"
if [[ ${ISSUES_FOUND} -eq 0 ]]; then
    echo "Status: HEALTHY"
    echo "The database appears to be in good condition."
else
    echo "Status: ISSUES DETECTED"
    echo "Review the findings above. Consider running:"
    echo "  ./scripts/db-rebuild.sh ${DB_FILE}"
fi
echo

exit ${ISSUES_FOUND}
