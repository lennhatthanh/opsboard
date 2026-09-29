# Kubernetes — Nhật ký thực hành

Ngày học: 2026-09-28

## 1. Kết quả triển khai OpsBoard

```text
Minikube
└── namespace opsboard
    ├── Frontend Deployment: 2 replicas
    ├── Frontend Service: ClusterIP :80
    ├── Backend Deployment: 2 replicas
    ├── Backend Service: ClusterIP :4000
    ├── PostgreSQL StatefulSet: 1 replica
    ├── PostgreSQL headless Service: :5432
    ├── PostgreSQL PVC: 1Gi
    ├── Database migration Job
    ├── ConfigMap và Secret
    └── Ingress: opsboard.local
```

Frontend, backend và PostgreSQL đều chạy thành công. Migration Job đã migrate schema và seed dữ liệu.

## 2. Các manifest đã sử dụng

```text
namespace.yaml
frontend-deployment.yaml
frontend-service.yaml
backend-configmap.yaml
backend-deployment.yaml
backend-service.yaml
postgres-service.yaml
postgres-statefulset.yaml
database-migration-job.yaml
ingress.yaml
```

## 3. Kiểm tra trạng thái workload

```bash
kubectl get pods -n opsboard -o wide
```

```bash
kubectl get \
  deployment,statefulset,job,service,ingress \
  -n opsboard
```

```bash
kubectl get pvc -n opsboard
```

## 4. Kiểm tra Service và endpoints

```bash
kubectl get service -n opsboard
kubectl get endpoints -n opsboard
```

Service có selector đúng phải tạo endpoints trỏ đến Pod IP. Service không có endpoint thường do selector không khớp Pod labels hoặc Pod chưa ready.

## 5. Kiểm tra logs và Events

```bash
kubectl describe pod <pod-name> -n opsboard
```

```bash
kubectl get events \
  -n opsboard \
  --sort-by=.metadata.creationTimestamp
```

```bash
kubectl logs <pod-name> -n opsboard
kubectl logs <pod-name> -n opsboard --previous
```

Với Job:

```bash
kubectl logs \
  job/opsboard-database-migration \
  -n opsboard
```

## 6. Kiểm tra probes

```bash
kubectl describe pod <backend-pod> -n opsboard
```

Các endpoint được dùng:

```text
GET /health
GET /ready
GET /metrics
```

`/health` không phụ thuộc database. `/ready` kiểm tra cả PostgreSQL để Pod chỉ nhận traffic khi dependency sẵn sàng.

## 7. Kiểm tra Ingress

```bash
kubectl get ingress -n opsboard
kubectl describe ingress opsboard -n opsboard
```

Do Minikube dùng Docker Desktop trong WSL, bridge IP của Minikube không truy cập trực tiếp ổn định. Ingress được mở bằng port-forward:

```bash
kubectl port-forward \
  service/ingress-nginx-controller \
  8080:80 \
  -n ingress-nginx
```

Test frontend:

```bash
curl \
  -H "Host: opsboard.local" \
  http://127.0.0.1:8080/
```

Test backend:

```bash
curl \
  -H "Host: opsboard.local" \
  http://127.0.0.1:8080/api/incidents
```

## 8. Lỗi Migration Job: CreateContainerConfigError

### Triệu chứng

```text
container "migration" is waiting to start: CreateContainerConfigError
```

### Cách kiểm tra

```bash
kubectl describe pod <migration-pod> -n opsboard
kubectl get secret -n opsboard
kubectl get configmap -n opsboard
```

Container chưa chạy nên `kubectl logs` chưa có thông tin hữu ích. Cần đọc Events trong `describe` trước.

### Nguyên nhân từng gặp

- Container image chạy bằng user tên `node` nhưng kubelet không xác minh được `runAsNonRoot`.
- PostgreSQL Service selector từng không khớp Pod labels nên Service không có endpoint.

### Cách xử lý

Khai báo UID/GID số cho migration container:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
```

Đồng bộ selector PostgreSQL Service với labels của StatefulSet:

```yaml
selector:
  app: opsboard
  component: postgres
```

## 9. Lỗi truy cập Minikube IP

### Triệu chứng

```bash
curl -H "Host: opsboard.local" http://$(minikube ip)/
```

Request bị timeout dù Ingress, Service và endpoints đều đúng.

### Nguyên nhân

Minikube chạy bằng Docker Desktop driver trong WSL. Bridge IP `192.168.49.2` không được route trực tiếp từ môi trường đang gọi request.

### Cách xử lý

Port-forward Ingress controller sang localhost và giữ terminal đó chạy:

```bash
kubectl port-forward \
  service/ingress-nginx-controller \
  8080:80 \
  -n ingress-nginx
```

## 10. Lỗi Gatekeeper trên profile Minikube cũ

Profile Minikube cũ có ValidatingAdmissionPolicy tham chiếu đến Gatekeeper constraint không còn tồn tại. Policy chặn cả việc cấu hình default StorageClass.

Vì cluster chỉ dùng cho local lab và policy cũ bị hỏng, profile được xóa và tạo lại sạch:

```bash
minikube delete -p minikube
```

```bash
minikube start -p minikube \
  --driver=docker \
  --cpus=4 \
  --memory=6144 \
  --disk-size=30g
```

## 11. Trạng thái cuối

```text
Frontend Deployment      2/2 Ready
Backend Deployment       2/2 Ready
PostgreSQL StatefulSet   1/1 Ready
Migration Job            Complete
Services                 Có endpoints
Ingress                  Định tuyến đúng
Persistent storage       Bound
```
