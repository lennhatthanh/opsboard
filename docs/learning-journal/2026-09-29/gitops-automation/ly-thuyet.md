# GitOps automation — Tổng hợp lý thuyết

Ngày học: 2026-09-29

## 1. Vì sao cần cập nhật repository GitOps?

CI push image mới lên GHCR không làm Kubernetes tự đổi image. Registry chỉ lưu artifact; nó không thay đổi manifest và không triển khai workload.

```text
Source commit A
    ↓ CI
Image tag A được push lên GHCR
    ↓
GitOps vẫn khai báo tag cũ B
    ↓
Argo CD tiếp tục giữ cluster ở B
```

Muốn triển khai A, source of truth trong `opsboard-gitops` phải đổi từ tag B sang A.

## 2. Vì sao dùng hai repository?

```text
opsboard
├── source code
├── Dockerfile
└── CI workflow

opsboard-gitops
├── Argo CD Applications
└── Kubernetes/Kustomize manifests
```

Tách repo giúp:

- Lịch sử code và lịch sử deployment độc lập.
- Quyền ghi deployment được kiểm soát riêng.
- Có PR review và audit trail cho release.
- Rollback bằng revert commit GitOps.
- Argo CD chỉ cần quyền đọc repo cấu hình.

Hai repo không tự “biết” nhau. Chúng được nối bởi CI bot, GitHub App hoặc image updater.

## 3. Luồng automation đang thiết kế

```text
Merge PR vào opsboard/main
        ↓
CI test và build
        ↓
Push API/Web image lên GHCR với tag github.sha
        ↓
Job update-gitops checkout opsboard-gitops/main
        ↓
Đổi hai newTag trong kustomization.yaml
        ↓
Tạo branch và Pull Request ở opsboard-gitops
        ↓
Review + merge GitOps PR
        ↓
Argo CD phát hiện main thay đổi
        ↓
Sync xuống Minikube
```

Đây là Continuous Delivery có bước phê duyệt. Nếu bot ghi thẳng vào GitOps `main`, quá trình gần với Continuous Deployment nhưng giảm lớp kiểm soát.

## 4. `update-gitops` job

```yaml
update-gitops:
  needs:
    - publish-images
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Job chỉ chạy khi:

1. `publish-images` thành công.
2. Event là push.
3. Branch là `main`.

Điều này tránh tạo GitOps PR trỏ đến image chưa được publish.

## 5. Cross-repository authentication

`GITHUB_TOKEN` của repository source thường chỉ có quyền trong chính repository đó. Nó không mặc nhiên được ghi sang `opsboard-gitops`.

Workflow đang dùng:

```yaml
token: ${{ secrets.GITOPS_TOKEN }}
```

`GITOPS_TOKEN` nên là fine-grained personal access token hoặc token từ GitHub App, chỉ cấp cho repo `opsboard-gitops` với quyền tối thiểu:

- Contents: Read and write.
- Pull requests: Read and write.

Token được lưu tại:

```text
opsboard repository
→ Settings
→ Secrets and variables
→ Actions
→ Repository secrets
→ GITOPS_TOKEN
```

Không ghi token trực tiếp vào YAML, shell command, commit hoặc tài liệu.

Trong production, GitHub App thường tốt hơn PAT vì token sống ngắn, phạm vi rõ và không phụ thuộc tài khoản cá nhân.

## 6. Checkout repository khác

```yaml
- uses: actions/checkout@v6
  with:
    repository: lennhatthanh/opsboard-gitops
    ref: main
    token: ${{ secrets.GITOPS_TOKEN }}
    path: opsboard-gitops
    fetch-depth: 0
```

- `repository`: repo cần tải thay vì repo đang chạy workflow.
- `ref`: branch gốc cần cập nhật.
- `token`: credential có quyền repo đích.
- `path`: thư mục chứa repo trên runner.
- `fetch-depth: 0`: lấy đầy đủ history; hữu ích cho thao tác branch/history.

## 7. Cập nhật Kustomize image tag

GitOps repo khai báo:

```yaml
images:
  - name: opsboard-api
    newName: ghcr.io/lennhatthanh/opsboard-api
    newTag: <commit-sha>
  - name: opsboard-web
    newName: ghcr.io/lennhatthanh/opsboard-web
    newTag: <commit-sha>
```

Kustomize thay thế image `opsboard-api:*` và `opsboard-web:*` trong manifest khi render. Deployment không cần sửa trực tiếp ở nhiều file.

Workflow dùng `sed` để chỉ thay `newTag` trong block tương ứng. Sau khi sửa nên kiểm tra diff và render Kustomize trước khi tạo PR.

## 8. Step output qua `$GITHUB_OUTPUT`

```bash
echo "branch=$BRANCH" >> "$GITHUB_OUTPUT"
echo "changed=true" >> "$GITHUB_OUTPUT"
```

Step có `id: update` xuất các giá trị cho step sau:

```yaml
${{ steps.update.outputs.branch }}
${{ steps.update.outputs.changed }}
```

Nếu tag đã đúng và `git diff --quiet` trả thành công, workflow ghi `changed=false` và bỏ qua việc tạo PR.

## 9. Argo CD là pull-based deployment

CI không cần giữ kubeconfig hoặc chạy `kubectl apply` vào cluster.

```text
CI ghi GitOps repository
          ↑
Argo CD định kỳ pull/refresh repository
          ↓
Kubernetes cluster
```

Lợi ích:

- Credential cluster không phải đưa vào CI.
- Cluster tự reconcile khi có drift.
- Trạng thái mong muốn được lưu trong Git.
- Deployment tiếp tục hoạt động theo cơ chế pull dù CI không kết nối trực tiếp đến mạng cluster.

## 10. Branch, commit và Argo CD

Application hiện theo dõi:

```yaml
targetRevision: main
```

Vì vậy:

- Thay đổi chỉ nằm ở feature branch chưa ảnh hưởng cluster.
- Merge vào `opsboard-gitops/main` mới làm Argo CD nhận cấu hình mới.
- Việc local đang checkout branch nào không thay đổi remote branch Argo CD theo dõi.

Branch chỉ là con trỏ đến commit. Nếu `main` và feature branch cùng trỏ một commit thì nội dung hoàn toàn giống nhau; chuyển về `main` không mất dữ liệu.

## 11. Các mô hình production phổ biến

### CI tạo GitOps Pull Request

Phù hợp khi cần review, audit và approval:

```text
CI → branch GitOps → PR → merge → Argo CD
```

### CI commit thẳng GitOps branch

Nhanh hơn nhưng ít kiểm soát:

```text
CI → GitOps main → Argo CD
```

Phù hợp dev/local hơn production.

### Argo CD Image Updater

Controller theo dõi registry, chọn tag theo policy và ghi thay đổi về Git. Giảm logic cross-repo trong CI nhưng thêm một controller cần vận hành và policy tag cần thiết kế cẩn thận.

## 12. Khi chuyển từ GHCR/Minikube sang ECR/EKS

Luồng GitOps không đổi về bản chất:

```text
Merge code
→ GitHub Actions
→ build/scan/sign image
→ push Amazon ECR
→ cập nhật GitOps PR
→ Argo CD
→ Amazon EKS
```

Điểm khác:

- GHCR được thay bằng ECR.
- GitHub Actions nên dùng OIDC để assume IAM role, không lưu AWS access key dài hạn.
- EKS node role hoặc Fargate pod execution role cần quyền pull ECR.
- Thường không cần Kubernetes `imagePullSecret` cho ECR nếu IAM được cấu hình đúng.
- GitOps repo vẫn phải cập nhật tag hoặc digest; ECR không tự triển khai image.

## 13. Nguyên tắc an toàn

1. Chỉ update GitOps sau khi publish image thành công.
2. Dùng tag SHA hoặc digest, không dùng tag mơ hồ.
3. Cấp token theo least privilege.
4. Không để secret trong repository.
5. Production nên dùng PR/approval cho môi trường quan trọng.
6. Render/validate manifest trước khi tạo PR.
7. Build một lần, promote cùng artifact qua các môi trường.

