# GitHub Actions và GHCR — Nhật ký thực hành

Ngày học: 2026-09-29

## 1. Workflow OpsBoard hiện tại

File:

```text
.github/workflows/ci.yaml
```

Luồng hiện tại:

```text
backend-check ──┐
                ├──> docker-build ──> publish-images ──> update-gitops
frontend-build ─┘
```

Trên PR vào `main`:

```text
backend-check
frontend-build
docker-build
publish-images: skipped
update-gitops: skipped
```

Sau khi merge/push vào `main`:

```text
backend-check
frontend-build
docker-build
publish-images: build + push API/Web lên GHCR
update-gitops: cập nhật tag và tạo PR ở repo GitOps
```

## 2. Kiểm tra YAML workflow trước khi push

Xem file:

```bash
sed -n '1,260p' .github/workflows/ci.yaml
```

Kiểm tra trạng thái Git:

```bash
git status
git diff -- .github/workflows/ci.yaml
```

Xem commit gần nhất:

```bash
git log --oneline --decorate -5
```

Các lệnh này dùng trước commit để chắc chắn chỉ đưa đúng thay đổi mong muốn lên Git.

## 3. Chạy kiểm tra tương đương CI ở local

### Backend syntax

Từ root repo:

```bash
find backend/src -name "*.js" -print0 \
  | xargs -0 -n1 node --check
```

Dùng khi muốn phát hiện lỗi cú pháp JavaScript trước khi push. Lệnh này chưa phải unit test và không kiểm tra logic nghiệp vụ.

### Frontend build

```bash
cd frontend
npm ci
npm run build
```

- `npm ci`: cài đúng phiên bản từ `package-lock.json`; phù hợp CI và kiểm tra reproducible build.
- `npm run build`: chạy Vite production build và tạo `dist/`.

### Build Docker image

Từ root repo:

```bash
docker build -t opsboard-api:ci ./backend
docker build -t opsboard-web:ci ./frontend
```

- `-t`: gắn tên và tag cho image.
- `opsboard-api:ci`: tên `opsboard-api`, tag `ci`.
- `./backend`: build context; Docker chỉ đọc file nằm trong context này.

Kiểm tra image local:

```bash
docker image ls opsboard-api
docker image ls opsboard-web
```

## 4. Commit và tạo Pull Request

```bash
git switch -c feat/github-actions-ci
git add .github/workflows/ci.yaml
git commit -m "ci: add GitHub Actions pipeline"
git push -u origin feat/github-actions-ci
```

- `git switch -c`: tạo và chuyển sang branch mới.
- `git add`: đưa file vào staging area.
- `git commit`: tạo snapshot local.
- `git push -u`: push branch và thiết lập upstream để lần sau chỉ cần `git push`.

Sau khi mở PR, vào tab **Checks** hoặc **Actions** để xem từng job.

## 5. Đọc trạng thái workflow

| Trạng thái | Ý nghĩa |
|---|---|
| Queued | Chờ runner hoặc chờ concurrency |
| In progress | Job đang chạy |
| Success | Job hoàn thành với exit code 0 |
| Failure | Có step trả exit code khác 0 |
| Skipped | Điều kiện `if` không đúng hoặc dependency bị skip |
| Cancelled | Bị hủy thủ công hoặc bởi `cancel-in-progress` |

Workflow có:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Nếu cùng branch có run mới, run cũ đang chạy có thể bị hủy để không tốn runner cho kết quả đã lỗi thời.

## 6. Kiểm tra package trên GHCR

Sau khi workflow trên `main` thành công, vào GitHub profile hoặc repository package để tìm:

```text
opsboard-api
opsboard-web
```

Pull thủ công để xác nhận image truy cập được:

```bash
docker pull ghcr.io/lennhatthanh/opsboard-api:<commit-sha>
docker pull ghcr.io/lennhatthanh/opsboard-web:<commit-sha>
```

Kiểm tra metadata:

```bash
docker image inspect \
  ghcr.io/lennhatthanh/opsboard-api:<commit-sha>
```

Nếu package private, cần `docker login ghcr.io` với token có quyền đọc package. Cluster cũng cần credential pull image; package public đơn giản hơn cho local lab.

## 7. Các lỗi GHCR thường gặp

### `permission_denied` hoặc `denied: permission_denied`

Kiểm tra job publish có:

```yaml
permissions:
  contents: read
  packages: write
```

Và login dùng:

```yaml
username: ${{ github.actor }}
password: ${{ secrets.GITHUB_TOKEN }}
```

### Workflow xanh nhưng không thấy package

Kiểm tra:

1. Run đó là `pull_request` hay `push` vào `main`.
2. Job `publish-images` là success hay skipped.
3. `push: true` đã được khai báo chưa.
4. Tên owner/image có đúng chữ thường và đúng namespace không.

### Pull image trong Kubernetes bị lỗi

```bash
kubectl describe pod <pod-name> -n opsboard
```

Tìm Events có `ImagePullBackOff`, `ErrImagePull`, `manifest unknown` hoặc `unauthorized`.

```bash
kubectl get deployment opsboard-backend \
  -n opsboard \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Lệnh này dùng để biết Deployment thật sự đang tham chiếu image nào.

## 8. Kiểm tra GitHub Actions bằng GitHub CLI

Nếu đã cài và login `gh`:

```bash
gh run list --workflow ci.yaml --limit 10
```

Xem chi tiết một run:

```bash
gh run view <run-id>
```

Xem log các job lỗi:

```bash
gh run view <run-id> --log-failed
```

Theo dõi run đang chạy:

```bash
gh run watch <run-id>
```

Xem checks của PR:

```bash
gh pr checks <pr-number> --watch
```

## 9. Trạng thái đã xác nhận

- Source repo đang ở branch `main` và theo dõi `origin/main`.
- Workflow đã có backend check, frontend build, Docker build, GHCR publish và GitOps update.
- GHCR đã từng publish thành công image API và Web với tag commit SHA.
- Minikube hiện chạy image:

```text
ghcr.io/lennhatthanh/opsboard-api:92f55fbada77363b2b1c698197f1d5d09fb16225
ghcr.io/lennhatthanh/opsboard-web:92f55fbada77363b2b1c698197f1d5d09fb16225
```

## 10. Giới hạn kiểm thử hiện tại

Pipeline mới kiểm tra cú pháp backend và build frontend/Docker. Repo chưa có:

- Unit test và integration test.
- ESLint/format check đầy đủ.
- Database integration test trong CI.
- Image vulnerability scan.
- SBOM và image signing.

Vì vậy workflow xanh có nghĩa là code build được và image tạo được, chưa chứng minh toàn bộ nghiệp vụ đúng.

