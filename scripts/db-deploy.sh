#!/bin/bash
# Deploy a repaired database to production using a temporary pod.
#
# Usage: ./scripts/db-deploy.sh <database-file>
#
# This script will:
#   1. Verify local database integrity
#   2. Scale down the production StatefulSet
#   3. Create a temporary pod attached to the data volume
#   4. Copy the repaired database to the volume
#   5. Scale up the production StatefulSet
#   6. Delete the temporary pod

set -euo pipefail

STATEFULSET_NAME="mod-bot-set"
PVC_NAME="data-mod-bot-set-0"
REMOTE_DB_PATH="/data/mod-bot.sqlite3"
TEMP_POD_NAME="db-deploy-temp"
NAMESPACE="${NAMESPACE:-default}"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <database-file>" >&2
    echo "" >&2
    echo "Deploys a repaired database to production by:" >&2
    echo "  1. Scaling down the StatefulSet" >&2
    echo "  2. Mounting the volume in a temporary pod" >&2
    echo "  3. Copying the database" >&2
    echo "  4. Scaling up and cleaning up" >&2
    exit 1
fi

LOCAL_DB="$1"

if [[ ! -f "${LOCAL_DB}" ]]; then
    echo "Error: Database file not found: ${LOCAL_DB}" >&2
    exit 1
fi

cleanup() {
    echo ""
    echo "Cleaning up..."
    kubectl delete pod "${TEMP_POD_NAME}" --ignore-not-found=true 2>/dev/null || true
}

echo "Database Deployment"
echo "Source: ${LOCAL_DB}"
echo "Target: ${STATEFULSET_NAME} (${PVC_NAME})"
echo "Date: $(date)"
echo

# Step 1: Verify local database integrity
echo "1. Verifying local database integrity"
INTEGRITY=$(sqlite3 "${LOCAL_DB}" "PRAGMA quick_check;" 2>&1)
if [[ "${INTEGRITY}" != "ok" ]]; then
    echo "Error: Database failed integrity check" >&2
    echo "Details:" >&2
    echo "${INTEGRITY}" | head -10 >&2
    exit 1
fi
LOCAL_SIZE=$(ls -lh "${LOCAL_DB}" | awk '{print $5}')
echo "Status: PASSED (${LOCAL_SIZE})"
echo

# Confirm before proceeding
echo "This will:"
echo "  - Scale down ${STATEFULSET_NAME} (production will be offline)"
echo "  - Replace the database on ${PVC_NAME}"
echo "  - Scale back up"
echo ""
read -p "Proceed? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi
echo

# Step 2: Scale down the StatefulSet
echo "2. Scaling down ${STATEFULSET_NAME}"
CURRENT_REPLICAS=$(kubectl get statefulset "${STATEFULSET_NAME}" -o jsonpath='{.spec.replicas}')
echo "Current replicas: ${CURRENT_REPLICAS}"

kubectl scale statefulset "${STATEFULSET_NAME}" --replicas=0
echo "Waiting for pod to terminate..."
kubectl wait --for=delete pod/"${STATEFULSET_NAME}-0" --timeout=120s 2>/dev/null || true
echo "StatefulSet scaled down"
echo

# Set up cleanup trap after scaling down
trap cleanup EXIT

# Step 3: Create temporary pod
echo "3. Creating temporary pod"
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${TEMP_POD_NAME}
spec:
  containers:
  - name: alpine
    image: alpine:latest
    command: ["sleep", "3600"]
    volumeMounts:
    - name: data
      mountPath: /data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: ${PVC_NAME}
  restartPolicy: Never
EOF

echo "Waiting for pod to be ready..."
kubectl wait --for=condition=Ready pod/"${TEMP_POD_NAME}" --timeout=120s
echo "Temporary pod ready"
echo

# Step 4: Backup and copy database
echo "4. Copying database"

# Check if there's an existing database to backup info
if kubectl exec "${TEMP_POD_NAME}" -- test -f "${REMOTE_DB_PATH}" 2>/dev/null; then
    EXISTING_SIZE=$(kubectl exec "${TEMP_POD_NAME}" -- ls -lh "${REMOTE_DB_PATH}" | awk '{print $5}')
    echo "Existing database size: ${EXISTING_SIZE}"

    # Remove WAL/SHM files
    kubectl exec "${TEMP_POD_NAME}" -- rm -f "${REMOTE_DB_PATH}-wal" "${REMOTE_DB_PATH}-shm" 2>/dev/null || true
else
    echo "No existing database found"
fi

echo "Uploading ${LOCAL_SIZE}..."
kubectl cp "${LOCAL_DB}" "${TEMP_POD_NAME}:${REMOTE_DB_PATH}"

# Verify the copy
REMOTE_SIZE=$(kubectl exec "${TEMP_POD_NAME}" -- ls -lh "${REMOTE_DB_PATH}" | awk '{print $5}')
echo "Uploaded size: ${REMOTE_SIZE}"
echo

# Step 5: Scale up StatefulSet
echo "5. Scaling up ${STATEFULSET_NAME}"
kubectl scale statefulset "${STATEFULSET_NAME}" --replicas="${CURRENT_REPLICAS}"
echo "Waiting for pod to be ready..."
kubectl wait --for=condition=Ready pod/"${STATEFULSET_NAME}-0" --timeout=300s
echo "StatefulSet scaled up"
echo

# Step 6: Delete temporary pod (handled by trap, but do it explicitly)
echo "6. Cleaning up temporary pod"
trap - EXIT
kubectl delete pod "${TEMP_POD_NAME}" --wait=false
echo "Temporary pod deleted"
echo

# Verify
echo "7. Verifying deployment"
sleep 2  # Give the app a moment to start
REMOTE_CHECK=$(kubectl exec "${STATEFULSET_NAME}-0" -- sqlite3 "${REMOTE_DB_PATH}" "PRAGMA quick_check;" 2>&1 || echo "ERROR")
if [[ "${REMOTE_CHECK}" == "ok" ]]; then
    echo "Remote integrity: PASSED"
else
    echo "Warning: Could not verify remote database"
    echo "${REMOTE_CHECK}"
fi
echo

echo "Deployment complete!"