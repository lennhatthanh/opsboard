# Kubernetes — Tổng hợp lý thuyết

Ngày học: 2026-09-28

## 1. Mô hình khai báo

Kubernetes sử dụng manifest YAML để mô tả trạng thái mong muốn. Controller liên tục so sánh trạng thái thực tế với trạng thái mong muốn và tìm cách đưa chúng về giống nhau.

```text
Manifest khai báo replicas: 2
        ↓
Deployment controller quan sát cluster
        ↓
Thiếu Pod → tạo thêm
Dư Pod → xóa bớt
```

YAML không phải tập lệnh chạy tuần tự. Thứ tự resource xuất hiện trong file không bảo đảm thứ tự ứng dụng sẵn sàng.

## 2. Namespace

Namespace chia cluster thành các không gian logic. OpsBoard sử dụng namespace riêng:

```text
opsboard
```

Resource names chỉ cần duy nhất trong cùng namespace. Một số resource như Node, Namespace, StorageClass và ClusterRole có phạm vi toàn cluster.

## 3. Deployment, ReplicaSet và Pod

```text
Deployment
    ↓ quản lý
ReplicaSet
    ↓ duy trì
Pod
```

- Pod là đơn vị chạy container nhỏ nhất.
- ReplicaSet giữ đúng số lượng Pod.
- Deployment quản lý ReplicaSet và cung cấp rolling update, rollback, revision history.

Không cần tạo Pod thuần cho frontend/backend vì Deployment đã tạo và quản lý Pod.

Rolling update hiện tại:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

- `maxUnavailable: 0`: không làm giảm số Pod sẵn sàng trong quá trình update.
- `maxSurge: 1`: được phép tạo thêm tối đa một Pod mới.

## 4. Service

Pod có IP tạm thời và có thể bị thay thế. Service cung cấp một địa chỉ ổn định và cân bằng lưu lượng đến các Pod phù hợp với selector.

```text
Client
   ↓
Service
   ↓ selector
Pod 1, Pod 2, ...
```

OpsBoard sử dụng ClusterIP Service cho frontend và backend. Các Service này chỉ truy cập được trong cluster; Ingress là điểm vào từ bên ngoài.

Headless Service có:

```yaml
clusterIP: None
```

Nó được dùng cùng PostgreSQL StatefulSet để cung cấp DNS ổn định thay vì một virtual IP cân bằng tải thông thường.

## 5. StatefulSet và persistent storage

StatefulSet phù hợp với workload cần danh tính và storage ổn định như PostgreSQL.

```text
StatefulSet opsboard-postgres
    ↓
Pod opsboard-postgres-0
    ↓
PVC postgres-data-opsboard-postgres-0
    ↓
PersistentVolume
```

`volumeClaimTemplates` tạo PVC riêng cho từng Pod. `volumeMounts` gắn volume vào filesystem bên trong container:

```yaml
volumeMounts:
  - name: postgres-data
    mountPath: /var/lib/postgresql/data
```

PVC tồn tại độc lập với vòng đời Pod, nên dữ liệu không mất khi Pod được tạo lại.

## 6. ConfigMap và Secret

ConfigMap lưu cấu hình không nhạy cảm:

```text
NODE_ENV
PORT
FRONTEND_URL
```

Secret lưu dữ liệu nhạy cảm như mật khẩu và connection string.

Gắn toàn bộ key thành environment variables:

```yaml
envFrom:
  - secretRef:
      name: opsboard-postgres-secret
```

Gắn một key cụ thể:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: opsboard-postgres-secret
        key: DATABASE_URL
```

Kubernetes Secret mặc định chỉ mã hóa base64, không phải encryption hoàn chỉnh. Không commit Secret plaintext vào Git.

## 7. Job và database migration

Job phù hợp với tác vụ cần chạy đến khi hoàn thành, ví dụ migrate và seed database.

```text
Job
  → tạo Pod
  → chạy migration
  → exit code 0
  → Job Completed
```

`restartPolicy: OnFailure` cho phép kubelet chạy lại container khi tác vụ thất bại. `backoffLimit` giới hạn số lần retry của Job.

## 8. Probes

### Startup probe

Cho phép ứng dụng có thời gian khởi động. Khi startup probe chưa thành công, liveness và readiness chưa được dùng để đánh giá container.

### Readiness probe

Quyết định Pod đã sẵn sàng nhận traffic hay chưa. Pod không ready sẽ bị loại khỏi Service endpoints.

### Liveness probe

Kiểm tra ứng dụng còn sống hay bị treo. Nếu probe thất bại quá ngưỡng, kubelet restart container.

OpsBoard sử dụng:

```text
/health → liveness
/ready  → readiness và kiểm tra PostgreSQL
```

## 9. Requests và limits

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

- `requests`: lượng tài nguyên scheduler dùng để chọn Node.
- `limits`: giới hạn tối đa container được sử dụng.
- Vượt memory limit có thể dẫn đến `OOMKilled`.
- Vượt CPU limit thường dẫn đến throttling.

## 10. Security context

OpsBoard áp dụng một số biện pháp hardening:

```yaml
runAsNonRoot: true
allowPrivilegeEscalation: false
seccompProfile:
  type: RuntimeDefault
capabilities:
  drop:
    - ALL
```

Backend dùng UID/GID `1000`; PostgreSQL image dùng UID/GID `999`. Khi `runAsNonRoot` được bật, nên khai báo UID số để kubelet xác minh container không chạy bằng root.

## 11. Ingress và hai lớp Nginx

Frontend Nginx chạy bên trong frontend Pod:

- Phục vụ React static files từ thư mục build.
- Hỗ trợ SPA fallback về `index.html`.
- Cung cấp endpoint `/health`.

Ingress Nginx chạy ở cấp cluster:

- Nhận request từ bên ngoài.
- Đọc hostname và path.
- Chuyển request đến Kubernetes Service phù hợp.

```text
Browser
   ↓
Ingress Nginx
   ├── /api → backend Service
   └── /    → frontend Service
                     ↓
               frontend Nginx
                     ↓
               React static files
```

## 12. Trạng thái Pod thường gặp

| Trạng thái | Nguyên nhân thường gặp |
|---|---|
| `Pending` | Scheduler, thiếu tài nguyên hoặc PVC |
| `ContainerCreating` | Đang tạo network, volume hoặc container |
| `PodInitializing` | Init container hoặc image pull chưa xong |
| `CreateContainerConfigError` | Thiếu Secret, ConfigMap hoặc cấu hình sai |
| `ImagePullBackOff` | Sai image/tag hoặc thiếu quyền registry |
| `CrashLoopBackOff` | Ứng dụng chạy rồi liên tục bị crash |
| `Running 0/1` | Readiness probe chưa thành công |
| `Completed` | Job đã chạy xong |

Quy tắc ghi nhớ:

> Dùng `describe` và Events để tìm lỗi Kubernetes; dùng `logs` để tìm lỗi ứng dụng.

## 13. Câu hỏi tự kiểm tra

1. Deployment, ReplicaSet và Pod liên hệ với nhau như thế nào?
2. Tại sao backend không nên gọi trực tiếp Pod IP của PostgreSQL?
3. ClusterIP Service và headless Service khác nhau ở đâu?
4. Vì sao PostgreSQL dùng StatefulSet thay vì Deployment?
5. PVC giúp dữ liệu tồn tại qua vòng đời Pod như thế nào?
6. Readiness probe khác liveness probe như thế nào?
7. ConfigMap và Secret dùng trong trường hợp nào?
8. Requests và limits ảnh hưởng đến scheduling và runtime ra sao?
9. Frontend Nginx khác Ingress Nginx như thế nào?
10. Khi Pod báo `CreateContainerConfigError`, nên kiểm tra gì trước?
