# GitHub Actions và GHCR — Tổng hợp lý thuyết

Ngày học: 2026-09-29

## 1. CI, CD và GitOps khác nhau thế nào?

```text
Developer push/merge code
        ↓
CI: kiểm tra, build, scan và tạo image
        ↓
Container Registry: lưu image bất biến
        ↓
GitOps repo: khai báo image cần triển khai
        ↓
Argo CD: đồng bộ trạng thái Git xuống Kubernetes
```

- **CI (Continuous Integration)** kiểm tra chất lượng code và tạo artifact.
- **Continuous Delivery** chuẩn bị bản phát hành có thể triển khai; production thường vẫn có bước duyệt.
- **Continuous Deployment** tự triển khai đến môi trường đích không cần duyệt thủ công.
- **GitOps** dùng Git làm source of truth cho cấu hình triển khai.

GitHub Actions không tự đồng nghĩa với GitOps. Nó là công cụ automation; Argo CD mới là controller pull cấu hình từ Git xuống cluster.

## 2. Cấu trúc workflow

```yaml
name: Continuous Integration

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
```

- `name`: tên workflow hiển thị trên GitHub.
- `on`: sự kiện kích hoạt workflow.
- `pull_request`: chạy khi PR hướng vào `main`; dùng để chặn code lỗi trước khi merge.
- `push`: chạy khi commit thật sự được đưa vào `main`, kể cả merge PR.
- `workflow_dispatch`: cho phép bấm **Run workflow** để chạy thủ công.

Vì có cả `pull_request` và `push`, một thay đổi có thể chạy hai lần:

1. Chạy trên PR để kiểm tra trước merge.
2. Chạy lại sau merge vì `main` nhận commit mới.

Đây là hành vi đúng. Hai lần chạy phục vụ hai revision khác nhau và có mục đích khác nhau.

## 3. Workflow, job và step

```yaml
jobs:
  backend-check:                 # job
    runs-on: ubuntu-latest
    steps:
      - name: Checkout           # step
        uses: actions/checkout@v6
      - name: Check syntax       # step
        run: node --check src/app.js
```

- Một file trong `.github/workflows/` mô tả một **workflow**.
- Mỗi khóa trực tiếp dưới `jobs:` là một **job**.
- Mỗi phần tử dưới `steps:` là một **step**.
- Mỗi job nhận một runner mới, filesystem mới và không tự chia sẻ file với job khác.
- Các step trong cùng job chạy tuần tự và dùng chung filesystem của job đó.
- Các job không có quan hệ `needs` có thể chạy song song.

## 4. `uses`, `run` và `with`

### `uses`

`uses` gọi một action đóng gói sẵn:

```yaml
- uses: actions/checkout@v6
```

`actions/checkout` tải repository vào runner. Nếu bỏ nó, runner không có source code để chạy `npm ci`, build Docker hoặc đọc Dockerfile.

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: "22"
    cache: npm
```

`actions/setup-node` cài/chọn Node.js và có thể cấu hình cache dependency.

```yaml
- uses: docker/setup-buildx-action@v4
```

Action này tạo Docker Buildx builder dựa trên BuildKit, hỗ trợ cache, multi-platform và các tính năng mà `docker/build-push-action` sử dụng.

### `run`

`run` thực thi lệnh shell trên runner:

```yaml
- run: npm ci
- run: npm run build
- run: docker build -t opsboard-api:ci ./backend
```

### `with`

`with` truyền input cho action. Tên input không tự đặt tùy ý; phải đọc README hoặc `action.yml` của action.

```yaml
- uses: docker/login-action@v4
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

- `registry`: registry cần đăng nhập.
- `username`: tài khoản chạy workflow.
- `password`: token dùng để xác thực.

## 5. GitHub Actions contexts và biến

Biểu thức `${{ ... }}` được GitHub Actions xử lý trước hoặc trong lúc workflow chạy.

| Context | Ví dụ | Ý nghĩa |
|---|---|---|
| `github` | `${{ github.sha }}` | SHA của commit đang chạy |
| `github` | `${{ github.actor }}` | người/bot kích hoạt workflow |
| `github` | `${{ github.repository }}` | `owner/repository` |
| `secrets` | `${{ secrets.GITHUB_TOKEN }}` | secret do GitHub hoặc người dùng cung cấp |
| `matrix` | `${{ matrix.image }}` | giá trị của phần tử matrix hiện tại |
| `steps` | `${{ steps.update.outputs.branch }}` | output của một step có `id` |
| `env` | `${{ env.IMAGE_TAG }}` | biến môi trường khai báo trong workflow |

`GITHUB_TOKEN` được GitHub tự tạo cho mỗi workflow run. Quyền thực tế bị giới hạn bởi khối `permissions`.

```yaml
permissions:
  contents: read
```

Job publish cần thêm quyền ghi package:

```yaml
permissions:
  contents: read
  packages: write
```

## 6. `needs`, điều kiện và thứ tự chạy

```yaml
publish-images:
  needs:
    - backend-check
    - frontend-build
    - docker-build
```

`publish-images` chỉ bắt đầu sau khi các job trong `needs` thành công.

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Điều kiện này bảo đảm:

- PR chỉ chạy kiểm tra và build thử.
- Chỉ commit đã vào `main` mới được publish image.

## 7. Matrix strategy

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - image: opsboard-api
        context: ./backend
      - image: opsboard-web
        context: ./frontend
```

GitHub tạo hai lượt chạy của cùng một job:

```text
Publish opsboard-api
Publish opsboard-web
```

`fail-fast: false` cho phép job còn lại tiếp tục nếu một phần tử matrix thất bại, giúp thấy đầy đủ lỗi của cả hai image.

## 8. Image, tag và digest

Tên đầy đủ của image:

```text
ghcr.io/lennhatthanh/opsboard-api:<tag>
```

Workflow đang dùng commit SHA làm tag:

```yaml
tags: ghcr.io/lennhatthanh/${{ matrix.image }}:${{ github.sha }}
```

Ví dụ:

```text
ghcr.io/lennhatthanh/opsboard-api:92f55fbada77363b2b1c698197f1d5d09fb16225
```

Mỗi commit mới tạo một tag mới. Tag cũ không bị ghi đè nên có thể rollback và truy vết image về đúng source commit.

- **Tag** là tên tham chiếu thuận tiện.
- **Digest** là định danh theo nội dung, dạng `sha256:...`, bất biến mạnh hơn tag.
- Production tốt thường build một lần và promote cùng digest qua dev, staging và production.

Không nên chỉ dùng `latest` vì khó xác định cluster đang chạy chính xác phiên bản nào.

## 9. GHCR giữ image ở đâu?

`docker build` thông thường chỉ tạo image trong Docker daemon của runner. Runner GitHub-hosted là tạm thời nên image biến mất khi job kết thúc.

Chỉ khi có:

```yaml
push: true
```

và đã login registry thì image mới được upload lên GitHub Container Registry.

```text
Dockerfile + source
        ↓ build
image trong runner
        ↓ push
GHCR package
```

## 10. Vì sao workflow có thể lâu?

- Mỗi job dùng runner mới nên phải checkout và chuẩn bị môi trường lại.
- `npm ci` tải dependency khi cache chưa có.
- Docker phải pull base image.
- `docker-build` đợi các job kiểm tra qua `needs`.
- Workflow hiện tại build image một lần trong `docker-build`, sau đó `publish-images` build lại để push.
- Hai image có thể chạy song song bằng matrix nhưng mỗi image vẫn cần thời gian build/push.

Build lặp không sai về kết quả, nhưng tốn thời gian. Có thể tối ưu bằng cách dùng một matrix job duy nhất với `push` có điều kiện và cache BuildKit/GitHub Actions.

## 11. PR checks và branch protection

Các dòng như:

```text
Continuous Integration / Backend check (pull_request)
Continuous Integration / Frontend build (pull_request)
Continuous Integration / Docker build (pull_request)
```

là các job của workflow đang chạy cho PR. Nếu repository bật branch protection, có thể yêu cầu những check này thành công trước khi cho merge.

`publish-images` bị skip trên PR là đúng vì image chưa nên phát hành trước khi code vào `main`.

## 12. Những điểm cần nhớ

1. `checkout` phải có trong mỗi job cần source code.
2. `uses` gọi action; `run` chạy shell command.
3. Input trong `with` phải theo tài liệu của action.
4. PR dùng để kiểm tra; push vào `main` dùng để phát hành.
5. `GITHUB_TOKEN` được tạo tự động nhưng chỉ có quyền được khai báo.
6. SHA tag giúp truy vết và rollback tốt hơn `latest`.
7. Image chỉ tồn tại lâu dài sau khi push lên registry.
8. Mỗi job chạy trên runner độc lập; dùng artifact/cache nếu cần chia sẻ dữ liệu hoặc tăng tốc.

