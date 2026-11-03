# GitOps automation — Nhật ký thực hành

Ngày học: 2026-09-29

## 1. Trạng thái hai repository

```text
opsboard
└── main
    └── source code + .github/workflows/ci.yaml

opsboard-gitops
└── main
    └── Argo CD Applications + Kustomize manifests
```

Kiểm tra từng repo:

```bash
git -C opsboard status --short --branch
git -C opsboard log --oneline --decorate -5
```

```bash
git -C opsboard-gitops status --short --branch
git -C opsboard-gitops log --oneline --decorate --graph --all -10
```

- `status --short --branch`: xem branch, upstream và file thay đổi theo dạng ngắn.
- `log --graph --all`: so sánh lịch sử của tất cả branch.

## 2. Sự cố tạo nhầm branch trong GitOps repo

Đã kiểm tra thấy:

```text
main                         e1d7ab7
feat/automate-gitops-update  e1d7ab7
origin/main                  e1d7ab7
origin/feat/...              e1d7ab7
```

Hai branch trỏ cùng commit nên không có chênh lệch và không mất dữ liệu.

Chuyển lại `main`:

```bash
cd "/mnt/c/Users/PC/OneDrive/Máy tính/Devops/ProjectA/opsboard-gitops"
git switch main
git pull origin main
```

- `git switch main`: đổi local working branch sang `main`.
- `git pull origin main`: lấy và tích hợp trạng thái mới nhất của remote `main`.

Xóa branch local tạo nhầm sau khi xác nhận không có commit riêng:

```bash
git branch -d feat/automate-gitops-update
```

Xóa branch remote:

```bash
git push origin --delete feat/automate-gitops-update
```

Trước khi xóa branch trong trường hợp khác, luôn kiểm tra:

```bash
git log main..feat/automate-gitops-update --oneline
git diff main...feat/automate-gitops-update
```

- Không có output từ `git log main..feature`: feature không có commit riêng.
- Không có output từ `git diff main...feature`: nội dung không khác nhau.

## 3. Chuẩn bị `GITOPS_TOKEN`

Tạo fine-grained PAT giới hạn cho repository `opsboard-gitops`:

```text
Repository access: Only select repositories → opsboard-gitops
Contents: Read and write
Pull requests: Read and write
```

Sau đó thêm vào source repo `opsboard`:

```text
Settings
→ Secrets and variables
→ Actions
→ New repository secret
→ Name: GITOPS_TOKEN
```

Không chạy `echo $GITOPS_TOKEN` và không chụp/log giá trị token.

## 4. Job tự động cập nhật GitOps

Job `update-gitops` thực hiện:

1. Checkout `opsboard-gitops/main`.
2. Lấy `${{ github.sha }}` làm `IMAGE_TAG`.
3. Thay `newTag` của API và Web.
4. Bỏ qua nếu Git không có diff.
5. Tạo branch `deploy/opsboard-<sha-ngắn>-<attempt>`.
6. Commit và push branch.
7. Dùng `gh pr create` tạo PR vào GitOps `main`.

Đoạn branch:

```bash
BRANCH="deploy/opsboard-${GITHUB_SHA::7}-${GITHUB_RUN_ATTEMPT}"
```

- `${GITHUB_SHA::7}`: lấy bảy ký tự đầu SHA trong Bash.
- `GITHUB_RUN_ATTEMPT`: phân biệt lần rerun để tránh trùng tên branch.

## 5. Kiểm tra diff Kustomize sau khi bot cập nhật

Trong GitOps PR, kiểm tra:

```bash
git diff origin/main...HEAD -- \
  environments/local/opsboard/kustomization.yaml
```

Mong đợi chỉ hai `newTag` đổi sang cùng source commit SHA.

Render manifest:

```bash
kubectl kustomize environments/local/opsboard
```

Dry-run phía client:

```bash
kubectl apply \
  --dry-run=client \
  -k environments/local/opsboard
```

Tìm image sau khi render:

```bash
kubectl kustomize environments/local/opsboard \
  | grep 'image:'
```

Các lệnh này dùng trước merge để tránh đưa YAML sai hoặc tag sai vào source of truth.

## 6. Merge GitOps PR và theo dõi Argo CD

Sau khi review, merge PR trên GitHub. Argo CD theo dõi `main` nên sẽ tự refresh/sync.

Kiểm tra Applications:

```bash
kubectl get applications -n argocd
```

Theo dõi trạng thái child app:

```bash
kubectl get application opsboard \
  -n argocd \
  -w
```

Xem chi tiết khi `OutOfSync` hoặc `Degraded`:

```bash
kubectl describe application opsboard -n argocd
```

## 7. Theo dõi rollout Kubernetes

```bash
kubectl rollout status \
  deployment/opsboard-backend \
  -n opsboard
```

```bash
kubectl rollout status \
  deployment/opsboard-frontend \
  -n opsboard
```

Xem Pod và image:

```bash
kubectl get pods -n opsboard -o wide
```

```bash
kubectl get deployments -n opsboard \
  -o custom-columns='NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image,READY:.status.readyReplicas'
```

Xem ReplicaSet cũ/mới khi RollingUpdate:

```bash
kubectl get replicasets -n opsboard \
  --sort-by=.metadata.creationTimestamp
```

## 8. Kiểm tra toàn hệ thống sau deployment

### Workload và storage

```bash
kubectl get \
  pods,deployments,statefulsets,services,ingresses,pvc \
  -n opsboard \
  -o wide
```

### Health và readiness

```bash
kubectl port-forward \
  service/opsboard-backend \
  4000:4000 \
  -n opsboard
```

Ở terminal khác:

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
curl http://127.0.0.1:4000/api/incidents
```

### Ingress

```bash
kubectl port-forward \
  service/ingress-nginx-controller \
  8080:80 \
  -n ingress-nginx
```

Ở terminal khác:

```bash
curl -H "Host: opsboard.local" \
  http://127.0.0.1:8080/
```

```bash
curl -H "Host: opsboard.local" \
  http://127.0.0.1:8080/api/incidents
```

### Logs và Events

```bash
kubectl logs \
  deployment/opsboard-backend \
  -n opsboard \
  --tail=100
```

```bash
kubectl get events \
  -n opsboard \
  --sort-by=.metadata.creationTimestamp
```

Khi container chưa khởi động vì lỗi cấu hình, ưu tiên `describe` và Events; khi container đã chạy rồi crash, ưu tiên logs.

## 9. Phân biệt lỗi CI, registry, GitOps và runtime

| Vị trí lỗi | Dấu hiệu | Lệnh/nơi kiểm tra |
|---|---|---|
| CI | GitHub job đỏ | `gh run view --log-failed` |
| Registry | push/pull unauthorized, tag không tồn tại | GHCR package, `docker pull` |
| GitOps update | Không có PR hoặc job `update-gitops` đỏ | Actions log, `GITOPS_TOKEN` |
| Argo CD | `OutOfSync`, `Degraded` | `kubectl describe application` |
| Kubernetes | `ImagePullBackOff`, probe fail | `kubectl describe pod` |
| Ứng dụng | HTTP 5xx, DB error | `kubectl logs` |

Debug theo thứ tự chuỗi cung ứng giúp tránh sửa nhầm tầng:

```text
Source SHA
→ CI run
→ registry tag
→ GitOps newTag
→ Argo CD revision
→ Deployment image
→ Pod health
→ HTTP/API
```

## 10. Trạng thái cluster đã kiểm tra ngày 2026-09-29

```text
kubectl context             minikube
platform-root               Synced / Healthy
opsboard                    Synced / Healthy
backend Deployment          2/2 Ready
frontend Deployment         3/3 Ready
PostgreSQL StatefulSet      1/1 Ready
PostgreSQL PVC              Bound, 1Gi
Ingress                     opsboard.local
```

Cluster đang chạy image SHA `92f55fbada77363b2b1c698197f1d5d09fb16225`. Điều này cho biết trạng thái runtime hiện tại, không tự chứng minh workflow commit mới nhất đã tạo và merge GitOps PR; cần đối chiếu thêm GitHub Actions và lịch sử GitOps khi test automation end-to-end.

## 11. Checklist test end-to-end an toàn

Tạo một thay đổi nhỏ, ví dụ sửa text giao diện, rồi:

```text
[ ] Tạo source branch
[ ] Commit và push source branch
[ ] Mở PR vào opsboard/main
[ ] Backend/frontend/Docker checks thành công
[ ] Merge source PR
[ ] publish-images thành công
[ ] Hai GHCR tag mới có cùng source SHA
[ ] update-gitops tạo PR ở opsboard-gitops
[ ] GitOps PR chỉ đổi hai newTag
[ ] Render/dry-run Kustomize thành công
[ ] Merge GitOps PR
[ ] Argo CD chuyển OutOfSync → Synced
[ ] Backend/frontend rollout thành công
[ ] Deployment chạy đúng SHA mới
[ ] /health, /ready và API trả kết quả đúng
```

## 12. Câu trình bày ngắn khi phỏng vấn

> Tôi tách source repository và GitOps repository. Pull request chạy kiểm tra backend, frontend và Docker build. Sau khi merge vào main, GitHub Actions publish hai image lên GHCR với immutable commit-SHA tag. Một job dùng credential giới hạn quyền để tạo Pull Request cập nhật Kustomize image tags trong GitOps repository. Sau khi review và merge, Argo CD pull thay đổi, tự sync xuống Kubernetes và Deployment thực hiện rolling update. Tôi kiểm tra toàn chuỗi bằng CI status, registry tag, GitOps diff, Argo CD health, rollout status, probes, logs và HTTP smoke test.

