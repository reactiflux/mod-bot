# Database Maintenance Scripts Restructure

## What changed
Restructured 4 db maintenance scripts into 3 scripts (plus a shared common file) that minimize downtime during recovery.

### Before (4 scripts)
- `db-integrity.sh` — local-only, required sqlite3 CLI and a local DB file
- `db-backup.sh` — raw `kubectl cp`, copied WAL/SHM separately (inconsistent state risk)
- `db-rebuild.sh` — local-only .recover/.dump
- `db-deploy.sh` — uploaded rebuilt DB to volume via temp pod (slow network transfer of full DB)

### After (3 scripts + shared)
- `db-common.sh` — shared constants and utilities (sourced by all scripts)
- `db-integrity.sh` — remote integrity check via `kubectl exec` + `node -e` with `better-sqlite3` (readonly, no downtime)
- `db-backup.sh` — consistent backup via `better-sqlite3`'s `.backup()` API (single consistent file, no WAL/SHM needed)
- `db-recover.sh` — full pipeline: recovery pod → rebuild on volume → deploy (no large network transfers)

## Key design decisions

### `node -e` with `better-sqlite3` instead of sqlite3 CLI
The production image doesn't have sqlite3 CLI but does have better-sqlite3 (it's a dependency). Using `node -e` for remote operations avoids needing to install anything on the production pod.

### Recovery pod approach
- Uses `alpine` + `apk add sqlite` for the recovery pod (needs sqlite3 CLI for .recover/.dump)
- RWO PVC constraint means: create recovery pod first (stays Pending) → scale down production (frees PVC) → recovery pod becomes Ready
- All I/O stays on the volume — no downloading/uploading the full DB over the network

### PVC name
Confirmed PVC name is `mod-bot-pvc-mod-bot-set-0` (was wrong in old db-deploy.sh as `data-mod-bot-set-0`).

### Cleanup trap ordering
Recovery pod must be deleted BEFORE scaling StatefulSet back up, because the recovery pod holds the RWO PVC. If StatefulSet tries to schedule while recovery pod has the PVC, the new pod will be stuck Pending.

## Constants (in db-common.sh)
```
STATEFULSET_NAME="mod-bot-set"
POD_NAME="mod-bot-set-0"
PVC_NAME="mod-bot-pvc-mod-bot-set-0"
REMOTE_DB_PATH="/data/mod-bot.sqlite3"
RECOVERY_POD_NAME="db-recovery-temp"
```
