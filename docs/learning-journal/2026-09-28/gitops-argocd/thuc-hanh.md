# GitOps và Argo CD — Nhật ký thực hành

Ngày học: 2026-09-28

## 1. Kết quả đạt được

- Tạo repository source `opsboard`.
- Tạo repository deployment `opsboard-gitops`.
- Cấu hình App of Apps.
- Cài Argo CD trên Minikube.
- Bootstrap `platform-root`.
- Root Application tạo child Application `opsboard`.
- OpsBoard được Argo CD đồng bộ thành công.
- `platform-root` và `opsboard` hiển thị Synced/Healthy.

## 2. Cấu trúc GitOps repository

```text
opsboard-gitops/
├── bootstrap/
│   └── root-app.yaml
├── applications/
│   └── opsboard.yaml
└── environments/
    └── local/
        └── opsboard/
            ├── kustomization.yaml
            ├── namespace.yaml
            ├── frontend-deployment.yaml
            ├── frontend-service.yaml
            ├── backend-configmap.yaml
            ├── backend-deployment.yaml
            ├── backend-service.yaml
            ├── postgres-service.yaml
            ├── postgres-statefulset.yaml
            ├── database-migration-job.yaml
            └── ingress.yaml
```

## 3. Bảo vệ Secret

GitOps `.gitignore`:

```gitignore
**/*secret*.yaml
.env
.env.*
```

Kiểm tra file Secret được ignore:

```bash
git check-ignore environments/local/opsboard/postgres-secret.yaml
```

Kiểm tra file chưa bị Git theo dõi:

```bash
git ls-files environments/local/opsboard/postgres-secret.yaml
```

Secret không được đưa vào `kustomization.yaml`. Secret PostgreSQL hiện được tạo thủ công trong cluster.

## 4. Kiểm tra GitOps manifest

```bash
kubectl kustomize environments/local/opsboard
```

```bash
kubectl apply \
  --dry-run=client \
  -k environments/local/opsboard
```

Kết quả:

```text
KUSTOMIZE_OK
CLIENT_DRY_RUN_OK
```

Một lỗi từng được phát hiện trong Migration Job là `metadata` lồng sai:

```yaml
metadata:
  name: opsboard-database-migration
  namespace: opsboard
  metadata:
```

Cấu trúc được sửa thành:

```yaml
metadata:
  name: opsboard-database-migration
  namespace: opsboard
  annotations:
    argocd.argoproj.io/hook: Sync
    argocd.argoproj.io/sync-wave: "-1"
```

## 5. Cài Argo CD

Xác nhận cluster:

```bash
kubectl config current-context
```

Kết quả:

```text
minikube
```

Tạo namespace:

```bash
kubectl create namespace argocd
```

Cài Argo CD:

```bash
kubectl apply \
  -n argocd \
  --server-side \
  --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Kiểm tra:

```bash
kubectl get pods -n argocd -o wide
```

## 6. Truy cập Argo CD

Port `8080` đã dùng cho OpsBoard Ingress nên Argo CD sử dụng local port `8081`:

```bash
kubectl port-forward \
  service/argocd-server \
  8081:443 \
  -n argocd
```

Giao diện:

```text
https://localhost:8081
```

Lấy mật khẩu admin ban đầu:

```bash
kubectl -n argocd \
  get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

Không ghi mật khẩu vào tài liệu hoặc Git.

## 7. Bootstrap App of Apps

Từ root của GitOps repository:

```bash
kubectl apply -f bootstrap/root-app.yaml
```

Kiểm tra Application:

```bash
kubectl get applications -n argocd
```

Luồng đã xác nhận:

```text
platform-root
    -> đọc applications/opsboard.yaml
    -> tạo opsboard Application
    -> đọc environments/local/opsboard
    -> render Kustomize
    -> sync workload
```

## 8. Lỗi Argo CD: Redis Secret chưa tồn tại

### Triệu chứng

```text
argocd-application-controller   CreateContainerConfigError
argocd-server                   CreateContainerConfigError
argocd-dex-server               PodInitializing
argocd-redis                    PodInitializing
argocd-repo-server              PodInitializing
```

### Kiểm tra

```bash
kubectl get pods -n argocd -o wide
```

```bash
kubectl describe pod <pod-name> -n argocd
```

```bash
kubectl get events \
  -n argocd \
  --sort-by=.metadata.creationTimestamp
```

Thông báo quan trọng:

```text
Error: secret "argocd-redis" not found
```

Kiểm tra Secret:

```bash
kubectl get secret argocd-redis -n argocd
```

Kiểm tra Redis init container:

```bash
kubectl describe pod \
  -n argocd \
  -l app.kubernetes.io/name=argocd-redis
```

Init container `secret-init` đã hoàn thành và tạo Secret. Cluster cũng còn đủ CPU/RAM, nên đây không phải lỗi thiếu tài nguyên.

### Nguyên nhân

Server và application controller kiểm tra Redis Secret trước khi init container tạo xong. Hai Pod giữ trạng thái cấu hình lỗi dù Secret sau đó đã xuất hiện.

Các Pod `PodInitializing` khác đang tải image và chưa có lỗi pull image.

### Cách xử lý

Sau khi xác nhận Secret tồn tại, restart đúng hai workload:

```bash
kubectl rollout restart \
  deployment/argocd-server \
  -n argocd
```

```bash
kubectl rollout restart \
  statefulset/argocd-application-controller \
  -n argocd
```

Theo dõi:

```bash
kubectl get pods -n argocd -w
```

Không cần xóa namespace hoặc cài lại toàn bộ Argo CD.

## 9. Các lệnh kiểm tra Argo CD

```bash
kubectl get pods -n argocd
kubectl get applications -n argocd
kubectl get events -n argocd --sort-by=.metadata.creationTimestamp
```

Kiểm tra chi tiết một Application:

```bash
kubectl describe application platform-root -n argocd
kubectl describe application opsboard -n argocd
```

## 10. Trạng thái cuối

```text
Argo CD Pods              Running
platform-root             Synced / Healthy
opsboard Application      Synced / Healthy
OpsBoard workloads        Running
GitOps repository         Source of truth
```

## 11. Nội dung có thể trình bày khi phỏng vấn

> Tôi triển khai OpsBoard trên Minikube bằng mô hình Argo CD App of Apps. GitOps repository là source of truth, bật auto-sync, prune và self-heal. Tôi dùng sync wave để PostgreSQL sẵn sàng trước Migration Job và workload. Khi Argo CD gặp CreateContainerConfigError, tôi kiểm tra Pod status và Events, xác định Redis Secret được tạo trễ, rồi restart đúng workload thay vì cài lại cluster.
