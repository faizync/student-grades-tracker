# Student Grades Tracker — EKS + EBS PersistentVolumeClaim

Node.js / Express app that stores data in a JSON file on a mounted volume,
deployed to Amazon EKS with an EBS-backed PVC.

## What changed from v1

| v1 | v2 |
| --- | --- |
| Students held in an in-memory array | Written to `students.json` on disk |
| Data lost on every restart | Survives pod deletion and node replacement |
| No container | Multi-stage Dockerfile, non-root |
| No manifests | Namespace, StorageClass, PVC, Deployment, Service |

## Layout

```
.
├── server.js            file-backed API
├── package.json
├── Dockerfile           multi-stage, runs as uid 1000
├── .dockerignore
├── public/              frontend (unchanged)
└── k8s/
    ├── namespace.yaml
    ├── storageclass.yaml
    ├── pvc.yaml
    ├── deployment.yaml
    └── service.yaml
```

## Run locally

```bash
npm install
npm run dev        # writes to ./data/students.json
```

Open http://localhost:8080

## Build and push to ECR

```bash
export ECR=424683028908.dkr.ecr.us-east-1.amazonaws.com/student-grades-tracker
export TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    424683028908.dkr.ecr.us-east-1.amazonaws.com

docker build -t $ECR:$TAG .
docker push $ECR:$TAG
```

Update the `image:` line in `k8s/deployment.yaml` to match the tag.

## Deploy

Prerequisite: the **Amazon EBS CSI Driver** add-on must be installed on the
cluster with EKS Pod Identity, or every PVC will fail with
`UnauthorizedOperation`.

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/storageclass.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

## Verify persistence

```bash
# Confirm the volume is mounted
kubectl exec -n grades -it deploy/grades-app -- df -h /data

# Add a student in the browser, then destroy the pod
kubectl delete pod -n grades -l app=grades-app

# Should log "Loaded N students", NOT "Seeded fresh volume"
kubectl logs -n grades -l app=grades-app
```

## Three lines that exist only because the storage is EBS

| Line | Reason |
| --- | --- |
| `replicas: 1` | ReadWriteOnce — one node can attach the volume at a time |
| `strategy: Recreate` | RollingUpdate would deadlock: new pod waits on a volume the old pod still holds |
| `securityContext.fsGroup: 1000` | Fresh ext4 mounts as root:root; the container runs as uid 1000 |

## Cleanup

```bash
kubectl delete -f k8s/service.yaml
kubectl delete -f k8s/deployment.yaml
kubectl delete -f k8s/pvc.yaml
```

`reclaimPolicy: Retain` means the EBS volume survives and keeps billing.
Delete it manually under **EC2 → Volumes**.
