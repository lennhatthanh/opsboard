# GitOps và Argo CD — Tổng hợp lý thuyết

Ngày học: 2026-09-28

## 1. GitOps là gì?

GitOps sử dụng Git làm source of truth cho trạng thái hệ thống.

Các nguyên tắc chính:

- Cấu hình được khai báo bằng file.
- Mọi thay đổi có lịch sử commit và review.
- Controller trong cluster liên tục so sánh Git với trạng thái thực tế.
- Sai lệch có thể được tự động khôi phục.
- Rollback thực hiện bằng cách revert commit.

GitOps không đồng nghĩa với CI/CD. GitOps là mô hình quản lý deployment; CI chịu trách nhiệm kiểm tra và tạo artifact.

| Thành phần | Trách nhiệm |
|---|---|
| Repository `opsboard` | Source code ứng dụng |
| CI | Test, build, scan và publish image |
| Repository `opsboard-gitops` | Version và cấu hình cần triển khai |
| Argo CD | Đồng bộ Git xuống Kubernetes |
| Kubernetes | Chạy workload |

## 2. Vì sao tách hai repository?

Repository source code và deployment có vòng đời, quyền truy cập và lịch sử thay đổi khác nhau.

Tách repository giúp:

- Argo CD không cần đọc toàn bộ source code.
- Tách lịch sử thay đổi code và lịch sử release.
- Review deployment riêng.
- Rollback bằng commit GitOps.
- Giới hạn quyền ghi vào cấu hình cluster.

## 3. Argo CD Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
```

`Application` là Custom Resource do Argo CD cung cấp. Nó mô tả repository, revision, thư mục manifest, cluster đích, namespace đích và chính sách sync.

## 4. App of Apps

OpsBoard sử dụng cây Application:

```text
platform-root
└── opsboard
```

Root Application đọc thư mục `applications/` và tạo các Application con. Application `opsboard` đọc `environments/local/opsboard` và quản lý workload.

```text
bootstrap/root-app.yaml
    ↓ apply thủ công một lần
platform-root
    ↓ đọc applications/
opsboard Application
    ↓ đọc environments/local/opsboard
Kubernetes resources
```

Sau này root app có thể quản lý thêm monitoring, logging, tracing và security Application.

## 5. Các thuộc tính Application

```yaml
metadata:
  name: opsboard
  namespace: argocd
```

Application object nằm trong namespace `argocd`.

```yaml
source:
  repoURL: https://github.com/lennhatthanh/opsboard-gitops.git
  targetRevision: main
  path: environments/local/opsboard
```

- `repoURL`: repository cần theo dõi.
- `targetRevision`: branch, tag hoặc commit.
- `path`: vị trí manifest trong repository.

```yaml
destination:
  server: https://kubernetes.default.svc
  namespace: opsboard
```

- `server`: cluster đích. Giá trị trên là cluster nơi Argo CD đang chạy.
- `namespace`: namespace nhận workload.

`metadata.namespace` và `destination.namespace` có hai ý nghĩa khác nhau: một bên chứa Application object, một bên chứa resource do Application triển khai.

## 6. Finalizer

```yaml
finalizers:
  - resources-finalizer.argocd.argoproj.io
```

Finalizer yêu cầu Argo CD xử lý resource con trước khi xóa Application. Khi kết hợp với prune, xóa root Application có thể tạo hiệu ứng xóa dây chuyền.

## 7. Auto-sync, prune và self-heal

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

- `automated`: tự sync khi Git thay đổi.
- `prune`: xóa resource khỏi cluster khi resource bị xóa khỏi Git.
- `selfHeal`: sửa thay đổi trực tiếp trong cluster để quay về cấu hình Git.

```yaml
syncOptions:
  - CreateNamespace=true
```

Cho phép Argo CD tạo namespace đích nếu chưa tồn tại.

## 8. Kustomize trong Argo CD

Application `opsboard` trỏ đến thư mục có `kustomization.yaml`. Argo CD tự động render các resource được liệt kê trong file này.

Việc render tương đương:

```bash
kubectl kustomize environments/local/opsboard
```

Argo CD còn thực hiện apply, theo dõi health và sửa drift, nên không cần tiếp tục apply workload thủ công.

## 9. Sync wave

Argo CD xử lý wave từ số nhỏ đến số lớn:

```text
Wave -2: PostgreSQL Service và StatefulSet
    ↓
Wave -1: Migration Job
    ↓
Wave 0: Backend, frontend, Services và Ingress
```

Annotations được dùng:

```yaml
argocd.argoproj.io/sync-wave: "-2"
```

và:

```yaml
argocd.argoproj.io/sync-wave: "-1"
```

Tên file hoặc thứ tự trong `kustomization.yaml` không nên được dùng để giả định thứ tự workload sẵn sàng.

## 10. Hook

Migration Job sử dụng:

```yaml
argocd.argoproj.io/hook: Sync
argocd.argoproj.io/hook-delete-policy: BeforeHookCreation,HookSucceeded
```

- `Sync`: chạy Job trong quá trình đồng bộ.
- `BeforeHookCreation`: xóa Job cũ trước lần chạy mới.
- `HookSucceeded`: xóa Job sau khi thành công.

Không dùng `PreSync` vì PostgreSQL nằm trong cùng Application và cần được tạo trước migration.

## 11. Synced và Healthy

| Sync | Health | Ý nghĩa |
|---|---|---|
| Synced | Healthy | Đúng Git và workload chạy tốt |
| Synced | Degraded | Đúng Git nhưng workload lỗi |
| OutOfSync | Healthy | Workload chạy nhưng cấu hình lệch Git |
| OutOfSync | Degraded | Lệch Git và workload lỗi |

Argo CD có thể apply chính xác một image tag không tồn tại. Khi đó Application có thể Synced nhưng Degraded do Pod `ImagePullBackOff`.

## 12. Câu hỏi tự kiểm tra

1. GitOps khác CI/CD như thế nào?
2. Vì sao tách source repository và GitOps repository?
3. Root Application và child Application khác nhau thế nào?
4. `metadata.namespace` khác `destination.namespace` ra sao?
5. `prune` và `selfHeal` giải quyết vấn đề gì?
6. Kustomize được Argo CD phát hiện như thế nào?
7. Sync wave kiểm soát thứ tự ra sao?
8. Vì sao Migration Job dùng Sync hook thay vì PreSync?
9. Synced và Healthy mô tả hai khía cạnh gì?
10. Vì sao GitOps giúp rollback và audit dễ hơn?
