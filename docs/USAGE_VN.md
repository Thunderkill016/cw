# Hướng Dẫn Sử Dụng Forge — Chi Tiết Từ A-Z

Forge (Atoryn Forge) là công cụ giám sát và xác thực code do AI tạo ra.  
Repo: **https://github.com/Thunderkill016/atoryn-forge**

---

## Mục Lục

1. [Cài đặt](#1-cài-đặt)
2. [Quy trình làm việc](#2-quy-trình-làm-việc)
3. [Bước 1: Khởi tạo dự án](#3-bước-1-khởi-tạo-dự-án)
4. [Bước 2: Viết Task Spec](#4-bước-2-viết-task-spec)
5. [Bước 3: Khóa Contract](#5-bước-3-khóa-contract)
6. [Bước 4: AI implement](#6-bước-4-ai-implement)
7. [Bước 5: Verify](#7-bước-5-verify)
8. [Bước 6: Xem bằng chứng](#8-bước-6-xem-bằng-chứng)
9. [Tất cả lệnh CLI](#9-tất-cả-lệnh-cli)
10. [Tích hợp CI/CD](#10-tích-hợp-cicd)
11. [API lập trình](#11-api-lập-trình)
12. [Ví dụ thực tế](#12-ví-dụ-thực-tế)

---

## 1. Cài Đặt

### Dùng trực tiếp (không cần cài)
```bash
npx atoryn-forge version
npx atoryn-forge help
```

### Cài toàn cục
```bash
npm install -g atoryn-forge
forge version    # → atoryn-forge 0.3.0
```

### Yêu cầu
- **Node.js ≥ 20**
- **Git ≥ 2.40**
- Dự án phải đã `git init` và có ít nhất 1 commit

### Kiểm tra môi trường
```bash
npx atoryn-forge doctor
```
Output:
```
✓ Git 2.45.2
✓ Git repository found
✓ Node.js v22.5.0 (>= 20 required)
✓ Forge initialized (.forge/ found)
✓ Package manager: npm
✓ Test runner: vitest
```

---

## 2. Quy Trình Làm Việc

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  1. INIT │ ──▶ │ 2. SPEC  │ ──▶ │3. PREPARE│ ──▶ │ 4. AI DO │ ──▶ │5. VERIFY │
│  forge init │     │task.json │     │forge prepare│     │ (commit) │     │forge verify │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                                         │
                                                                    ┌────┴────┐
                                                                    │ACCEPTED │
                                                                    │   or    │
                                                                    │REJECTED │
                                                                    └─────────┘
```

---

## 3. Bước 1: Khởi Tạo Dự Án

```bash
cd my-project
forge init            # Khởi tạo cơ bản
forge init --auto     # Tự động detect project type + test runner
```

`--auto` sẽ tự nhận diện:
- **Node.js** → `package.json` → tìm vitest/jest/mocha
- **Python** → `pyproject.toml` → tìm pytest
- **Rust** → `Cargo.toml` → `cargo test`
- **Go** → `go.mod` → `go test ./...`

Sau khi init, thư mục `.forge/` được tạo:
```
.forge/
├── tasks/        # Chứa contracts và evidence
└── evidence/     # Chứa hash evidence
```

> **Tip:** Thêm `.forge/` vào `.gitignore` nếu không muốn track state.

---

## 4. Bước 2: Viết Task Spec

Tạo file `task.json` mô tả **chính xác** AI được phép làm gì:

```json
{
  "schemaVersion": 1,
  "taskId": "add-search-feature",
  "objective": "Thêm tính năng tìm kiếm sản phẩm theo tên",

  "acceptanceCriteria": [
    { "id": "ac1", "description": "Có ô input tìm kiếm ở trang chủ" },
    { "id": "ac2", "description": "Kết quả lọc real-time khi gõ" },
    { "id": "ac3", "description": "Không ảnh hưởng tính năng giỏ hàng" }
  ],

  "allowedPaths": [
    { "kind": "file", "path": "src/components/Search.tsx" },
    { "kind": "file", "path": "src/pages/Home.tsx" },
    { "kind": "file", "path": "src/styles/search.css" },
    { "kind": "directory", "path": "tests" }
  ],

  "forbiddenPaths": [
    { "kind": "directory", "path": ".env" },
    { "kind": "directory", "path": "src/config" },
    { "kind": "file", "path": "src/services/payment.ts" }
  ],

  "constraints": [
    { "id": "c1", "description": "Không thêm npm dependency mới" }
  ],

  "verificationCommands": [
    {
      "id": "typecheck",
      "executable": "npx",
      "arguments": ["tsc", "--noEmit"],
      "timeoutMs": 30000,
      "maxOutputBytes": 65536
    },
    {
      "id": "test",
      "executable": "npm",
      "arguments": ["test"],
      "timeoutMs": 60000,
      "maxOutputBytes": 65536
    }
  ]
}
```

### Giải thích các trường

| Trường | Ý nghĩa |
|:---|:---|
| `taskId` | ID duy nhất cho task này |
| `objective` | Mục tiêu AI cần đạt |
| `acceptanceCriteria` | Các tiêu chí nghiệm thu |
| `allowedPaths` | Files/thư mục AI **được phép** sửa |
| `forbiddenPaths` | Files/thư mục AI **bị cấm** chạm vào |
| `constraints` | Ràng buộc bổ sung |
| `verificationCommands` | Lệnh kiểm tra (test, lint, typecheck) |

> **Quan trọng:** `allowedPaths` là whitelist. Nếu AI sửa file nào không nằm trong danh sách này → bị **REJECTED**.

---

## 5. Bước 3: Khóa Contract

```bash
forge prepare --spec task.json
```

Output:
```
✓ Contract prepared: add-search-feature
  Objective: Thêm tính năng tìm kiếm sản phẩm theo tên
  Base: a1b2c3d4e5f6
  Digest: f63844a8005ae14c…
  Saved: .forge/tasks/add-search-feature/contract.json
```

**Điều gì xảy ra:** Forge snapshot Git state hiện tại (SHA commit), tạo hash cho toàn bộ contract → không ai có thể sửa contract sau khi đã khóa.

---

## 6. Bước 4: AI Implement

Dùng bất kỳ AI agent nào (Cursor, Claude Code, Aider, Copilot...):

```
"Hãy implement task theo spec trong task.json. 
Chỉ sửa các file trong allowedPaths. 
Commit khi xong."
```

AI viết code → commit → sẵn sàng verify.

---

## 7. Bước 5: Verify

```bash
forge verify \
  --contract .forge/tasks/add-search-feature/contract.json \
  --implementer-provider cursor \
  --implementer-run session-123 \
  --trusted-repository
```

### Forge kiểm tra gì?

1. **Scope Check:** AI có sửa file nào ngoài `allowedPaths` không?
2. **Forbidden Check:** AI có chạm vào file cấm không?
3. **Verification Commands:** Chạy test/typecheck trong sandbox cách ly
4. **Mutation Detection:** Lệnh test có gây side-effect (sửa file) không?
5. **Evidence Chain:** Tạo bằng chứng mã hóa SHA-256

### Kết quả có thể:

| Exit Code | Verdict | Ý nghĩa |
|:---:|:---|:---|
| `0` | **ACCEPTED** ✅ | AI làm đúng, test pass, không vi phạm |
| `2` | **REJECTED** ❌ | AI vi phạm scope, test fail, hoặc có side-effect |
| `3` | **INCONCLUSIVE** ⚠️ | Thiếu thông tin để kết luận |

---

## 8. Bước 6: Xem Bằng Chứng

```bash
forge show --file .forge/tasks/add-search-feature/verification-*.json
```

Output khi **ACCEPTED**:
```
● ACCEPTED
  Task: add-search-feature
  Changes: 3 files
  Scope: passed
  Checks: 2 passed (typecheck, test)
  Evidence digest: a36cdfab6863...
```

Output khi **REJECTED**:
```
● REJECTED
  Task: add-search-feature
  Changes: 5 files
  Scope: failed
  Violations:
    - src/services/payment.ts: inside-forbidden-scope
    - package.json: outside-allowed-scope
```

---

## 9. Tất Cả Lệnh CLI

### Lệnh chính
```bash
forge init [--auto]                    # Khởi tạo Forge
forge doctor [--json]                  # Kiểm tra môi trường
forge prepare --spec <file>            # Tạo contract từ spec
forge verify --contract <file>         # Verify AI changes
forge show --file <file>               # Xem contract/evidence
```

### Quản lý & Báo cáo
```bash
forge status                           # Dashboard tất cả tasks
forge list                             # Liệt kê contracts & evidence
forge diff --contract <file>           # Xem file nào bị thay đổi
forge report [--json] [--out file]     # Báo cáo compliance
forge export [--out file]              # Xuất bundle evidence
forge clean [--dry-run] [--all]        # Dọn dẹp files tạm
```

### Nâng cao
```bash
forge map                              # Bản đồ symbols trong repo
forge hook install [--force]           # Cài git hooks (pre-commit)
forge hook remove                     # Gỡ git hooks
forge provenance record               # Ghi metadata AI provenance
forge audit show                       # Xem audit log
forge audit verify                     # Kiểm tra tính toàn vẹn log
```

---

## 10. Tích Hợp CI/CD

### GitHub Actions
```yaml
# .github/workflows/verify.yml
name: Forge Verify
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx atoryn-forge verify \
          --contract .forge/tasks/${{ github.event.pull_request.title }}/contract.json \
          --implementer-provider github-actions \
          --implementer-run ${{ github.run_id }} \
          --trusted-repository
```

### GitLab CI
```yaml
forge-verify:
  image: node:20
  script:
    - npx atoryn-forge verify --contract $CONTRACT_PATH --trusted-repository
  rules:
    - if: $CI_MERGE_REQUEST_ID
```

### Pre-commit Hook
```bash
forge hook install    # Tự động chạy forge diff trước mỗi commit
```

---

## 11. API Lập Trình

Dùng Forge như thư viện TypeScript trong code:

```typescript
import {
  prepareTaskContract,
  verifyChange,
  classifyFile,
  evaluateWeightedConsensus,
  computeMerkleRoot,
} from 'atoryn-forge';

// 1. Tạo contract
const contract = await prepareTaskContract({
  repositoryRoot: process.cwd(),
  stateRoot: '.forge',
  draft: myTaskSpec,
  baseRef: 'HEAD',
  preparedBy: 'ci-bot',
});

// 2. Verify
const evidence = await verifyChange({
  repositoryRoot: process.cwd(),
  contract,
  implementer: { provider: 'cursor', runId: 'session-abc' },
});

console.log(evidence.verdict);
// → 'accepted' | 'rejected' | 'inconclusive'

// 3. Phân loại rủi ro file
const risk = classifyFile('src/auth/login.ts');
// → { riskLevel: 'critical', reasons: ['matches auth pattern'] }
```

---

## 12. Ví Dụ Thực Tế

### Kịch bản: Web Quản Lý Chi Tiêu + AI Agent

```bash
# 1. Init
cd expense-tracker
forge init

# 2. Viết spec: yêu cầu AI thêm tính năng recurring transactions
cat > task.json << 'EOF'
{
  "schemaVersion": 1,
  "taskId": "add-recurring",
  "objective": "Thêm giao dịch định kỳ hàng tháng",
  "allowedPaths": [
    { "kind": "file", "path": "app.js" },
    { "kind": "file", "path": "index.html" },
    { "kind": "file", "path": "index.css" }
  ],
  "forbiddenPaths": [
    { "kind": "directory", "path": ".git" }
  ],
  "verificationCommands": [
    { "id": "syntax", "executable": "node", "arguments": ["--check", "app.js"] }
  ]
}
EOF

# 3. Khóa contract
forge prepare --spec task.json

# 4. AI viết code... rồi commit

# 5. Verify
forge verify --contract .forge/tasks/add-recurring/contract.json \
  --implementer-provider claude-code \
  --implementer-run session-001 \
  --trusted-repository

# Nếu ACCEPTED → merge code
# Nếu REJECTED → xem lý do, sửa, verify lại
```

### Kết quả thực tế đã demo:
- Forge phát hiện AI commit file `.forge/contract.json` (thuộc forbidden scope) → **REJECTED** ❌
- Sau khi sửa (gitignore `.forge/`) → chỉ còn `app.js`, `index.html`, `index.css` thay đổi → đúng scope

---

## Tóm Tắt

| Bạn muốn... | Lệnh |
|:---|:---|
| Bắt đầu nhanh | `forge init --auto` |
| Kiểm tra môi trường | `forge doctor` |
| Tạo hợp đồng cho AI | `forge prepare --spec task.json` |
| Xác thực code AI | `forge verify --contract <file> --trusted-repository` |
| Xem bằng chứng | `forge show --file <evidence.json>` |
| Dashboard tổng quan | `forge status` |
| Cài git hook tự động | `forge hook install` |
| Xem audit log | `forge audit show` |
| Xuất báo cáo | `forge report --out report.md` |
