# Atoryn Forge — Định hướng sản phẩm

> **Nguồn sự thật** về định hướng sản phẩm. Thắng mọi tài liệu khác trong repo, kể cả những gì
> thừa kế từ CycleWarden/`cw`.
>
> Cập nhật: 2026-08-06. Người quyết định sản phẩm: chủ repo. Người viết: Claude (theo yêu cầu
> "tra cứu và viết định hướng tốt nhất, thực tế nhất").

---

## 1. Một câu

**Forge là lớp điều phối chạy trên web, biến "AI viết xong code" thành "website chạy thật, an
toàn, deploy được" — không khoá vào một nhà cung cấp AI nào, dùng được từ điện thoại đến máy tính.**

Người dùng cầm lái. Forge trang bị và canh cổng. Forge **không** làm thay từ A đến Z.

---

## 2. Bối cảnh thị trường thật — đọc trước khi làm bất cứ thứ gì

Phần này tồn tại để tránh xây một thứ đã có sẵn và miễn phí.

### 2.1 Điều khiển agent từ điện thoại: **đã có rồi**

Claude Code hiện đã chạy trên terminal, VS Code, JetBrains, desktop app, **web và mobile**. Và
cách nó làm mobile đúng y hệt thứ ta định làm:

> *"Claude gửi cảnh báo khi cần bạn cho phép... trên mobile, thông báo đó chính là sản phẩm: thay
> vì ngồi nhìn spinner, bạn nhận ping, duyệt hoặc chỉnh hướng trong mười giây, rồi bỏ điện thoại
> vào túi."*

OpenAI đẩy Codex thành agent luôn sẵn sàng; Google có Jules chạy async trong sandbox rồi trả PR.
Tổng kết tháng 7/2026 của giới quan sát: *"các coding agent đang cạnh tranh nhau ở approval mode,
resumable work, MCP auth, artifact và review surface nhiều ngang với chất lượng model."*

**Hệ quả bắt buộc:** "web + mobile + duyệt từ điện thoại" **không phải** điểm khác biệt của Forge.
Ba công ty lớn nhất đã có, miễn phí kèm thuê bao. Nếu định hướng Forge dựa vào đó, Forge chết.

### 2.2 Các hạng sản phẩm đang có

| Hạng | Ai | Họ làm gì | Họ **không** làm gì |
|---|---|---|---|
| App builder | Lovable, Bolt, v0 | prompt → website, deploy sẵn | Người dùng không cầm lái; sửa một chỗ vỡ chỗ khác; khoá vào hệ của họ |
| Coding agent | Claude Code, Codex, Jules | viết code, mở PR, có web+mobile | Dừng ở PR. Không dựng Supabase, không deploy, không lo bảo mật, khoá vào 1 nhà cung cấp |
| Agentic IDE/ADE | Cursor, BridgeMind | môi trường điều phối nhiều agent | Desktop-first, khoá vào một máy; user tự lo tích hợp + bảo mật |
| Spec tooling | GitHub Spec Kit | quy trình spec→plan→tasks (MIT) | Python CLI cho dev ngồi terminal; không hosted, không có cổng cưỡng chế |

### 2.3 Khoảng trống thật sự còn lại

Cái không ai làm, và là chỗ Forge đứng:

1. **Trung lập nhà cung cấp.** Claude Code khoá Anthropic. Codex khoá OpenAI. Lovable khoá hạ tầng
   của Lovable. Chưa ai cho người dùng mang AI của mình + GitHub của mình + Vercel/Supabase của
   mình, và đổi được từng mảnh.
2. **Từ PR đến website sống.** Agent trả về một PR rồi hết. Việc dựng database, RLS, auth, biến
   môi trường, deploy, tên miền — người dùng vẫn tự làm. Đây là **khoảng cách lớn nhất** giữa
   "AI viết được code" và "tôi có một website".
3. **Bảo mật mặc định cho người không phải chuyên gia bảo mật.** Không ai bán "deny-all RLS, quét
   secret, chặn deploy khi hở" như một tính năng.
4. **Spec có cổng cưỡng chế.** Spec Kit có phương pháp nhưng là CLI local; không ai cưỡng chế
   "spec còn câu hỏi treo thì không được sang plan".
5. **Danh mục nhiều dự án.** Coding agent xoay quanh phiên và repo, không xoay quanh dự án.

**Forge = lớp phủ quanh agent, không phải một agent nữa.** Đây là câu định vị phải nhớ.

---

## 3. Người dùng mục tiêu

**Builder dùng AI** — cùng nhóm BridgeMind nhắm tới.

- Có ý tưởng, biết chỉ đạo AI, muốn ra sản phẩm thật.
- Không nhất thiết là dev chuyên nghiệp; nhưng **không** phải người muốn gõ một câu rồi ngồi chờ.
- Không muốn tự đi nối GitHub + Supabase + Vercel + lo RLS + lo secret.

Hệ quả UX: **phơi spec/plan/tasks ra** vì đó là công cụ họ dùng. **Không bắt mở terminal.**

---

## 4. Vòng lặp sản phẩm

```text
người dùng nêu mục tiêu cho một dự án
  → Forge chạy spec pipeline bằng AI của họ  → SPEC
  → người dùng duyệt (cổng 1: còn câu hỏi treo thì không đi tiếp)
  → PLAN kỹ thuật
  → TASKS có thứ tự phụ thuộc, mỗi task có phạm vi file riêng
  → dispatch từng task cho coding agent (AI của user)
  → verify từng task: đúng phạm vi? test pass? (cổng 2)
  → quét bảo mật (cổng 3: hở thì không deploy)
  → deploy → URL sống
  → lặp
```

Ba cổng đó là sản phẩm. Bỏ đi thì Forge chỉ còn là wrapper quanh AI.

---

## 5. Kiến trúc đã chốt

### 5.0 Nguyên tắc số một: không khoá người dùng vào bất cứ ai — kể cả Forge

Người dùng lưu code ở đâu là quyền của họ. Điều này áp dụng cho **mọi** vai trò, không riêng
source control.

**Hệ quả kỹ thuật quan trọng nhất: lõi Forge chỉ phụ thuộc `git`, không phụ thuộc GitHub.**

```text
Bắt buộc          →  git (clone, branch, commit, push)
                     Chạy với remote bất kỳ: GitHub, GitLab, Bitbucket,
                     Gitea tự dựng, git qua SSH, hoặc KHÔNG remote nào cả

Tuỳ chọn, thêm    →  Pull/Merge Request   (GitHub, GitLab, Bitbucket)
giá trị              CI hosted            (GitHub Actions, GitLab CI)
                     Webhook              (nếu nhà cung cấp có)
```

Vòng lặp cốt lõi — spec → task → agent sửa code → verify → commit — **chỉ cần git**. Mọi thứ khác
là lớp tăng cường. Ai dùng Gitea tự dựng trong mạng nội bộ vẫn chạy được Forge ở chế độ A.

**Bốn cam kết chống khoá:**

1. **Code không bao giờ nằm ở Forge.** Forge không lưu trữ repo của ai. Code ở nơi người dùng chọn.
2. **Artifact là file thường trong repo của họ.** Spec/plan/tasks là markdown tương thích Spec Kit,
   nằm trong repo — không nằm trong database của Forge.
3. **Rời đi bất cứ lúc nào không mất gì.** Ngưng dùng Forge thì repo vẫn đầy đủ và làm việc tiếp
   được bằng agent local. Đây là điểm Lovable/Bolt không có — rời họ là mất hết.
4. **Không có định dạng độc quyền.** Mọi bản ghi Forge sinh ra đều là JSON/markdown đọc được.

**Cái giá phải trả, và cách xử lý cho trung thực:** không phải nhà cung cấp nào cũng làm được mọi
thứ. Forge **phải hiện bảng năng lực** theo lựa chọn của người dùng, thay vì im lặng rồi hỏng:

| Người dùng chọn | Được gì | Mất gì | Bù bằng |
|---|---|---|---|
| GitHub | Đủ: PR, Actions, webhook | — | — |
| GitLab | MR, GitLab CI | Một số webhook | — |
| Gitea / git SSH tự dựng | Lõi git đầy đủ | Không PR, không CI hosted | Chế độ A (runner) hoặc C (sandbox) |
| Không remote, chỉ local | Lõi git đầy đủ | Không đồng bộ đa thiết bị | Chỉ chế độ A |

Nguyên tắc: **suy giảm có thông báo, không im lặng hỏng.** Người dùng phải biết trước họ mất gì
khi chọn nhà cung cấp nào.

### 5.1 Web, phone → desktop

Giao diện là web, chạy từ điện thoại đến máy tính. Ràng buộc kéo theo:

- **Điện thoại không tự chạy được code** — không có terminal/filesystem/git. Nên việc thực thi luôn
  xảy ra ở nơi khác: máy của user, CI của user, hoặc cloud sandbox (xem §5.2c).
- **Trình duyệt là bề mặt điều khiển, không phải nơi thực thi.** Mobile làm việc nhẹ: xem tiến độ,
  đọc spec, duyệt cổng, chỉnh hướng. Việc nặng để máy tính hoặc cloud.
- **Git là nền đồng bộ trạng thái giữa các thiết bị**, không phải một máy cụ thể — và **git**,
  không phải GitHub. Xem §5.0.

### 5.2 Thuê bao AI vs API key — ràng buộc quyết định toàn bộ kiến trúc

Đây là phần quan trọng nhất của tài liệu. Hiểu sai chỗ này là xây sai nền móng.

**Luật thật (Anthropic, cập nhật 2026-02-19):** OAuth của gói Free/Pro/Max *"chỉ dành riêng"* cho
Claude Code và claude.ai. Anthropic **không cho phép** bên thứ ba đăng nhập Claude.ai hộ hoặc
**định tuyến request qua credential gói Free/Pro/Max thay mặt người dùng**. Họ **cưỡng chế từ
phía server**: token thuê bao dùng ngoài Claude Code bị từ chối với thông báo *"credential này chỉ
được phép dùng với Claude Code"*, kèm nguy cơ khoá tài khoản.

**Nhưng ranh giới không nằm ở "web hay desktop" — nó nằm ở AI GIỮ CREDENTIAL:**

| Tình huống | Hợp lệ? | Vì sao |
|---|---|---|
| Máy cá nhân chạy binary `claude` của chính Anthropic, user tự đăng nhập | **Có** | Đây là *ordinary individual use* — user tự dùng thuê bao của mình |
| User đưa token cho hạ tầng bên thứ ba, server đó gọi hộ | **Không** | Vi phạm, bất kể triển khai kỹ thuật thế nào |

→ Kết luận kiến trúc: **credential không được rời máy người dùng.**

### 5.2b BridgeMind và các dự án khác làm thế nào

**BridgeMind là desktop app — đó không phải lựa chọn thẩm mỹ, đó là lý do duy nhất họ dùng được
thuê bao.** BridgeSpace chạy lưới terminal trên máy user; user tự đăng nhập `claude` trong đó.
BridgeMind **không hề chạm vào credential** — nó chỉ là một terminal workspace bọc ngoài binary
chính chủ. Với Anthropic, đó vẫn là user tự dùng Claude Code.

**Omnara (YC S25)** giải đúng bài toán của Forge — điều khiển Claude Code/Codex từ điện thoại:

- **Daemon headless chạy trên máy user**, nối ra ngoài bằng **WebSocket**, không mở port, không SSH.
- Code ở lại máy user. Omnara chỉ là **relay + dashboard + lớp thông báo**.
- Từ điện thoại/browser/Apple Watch: xem từng bước agent làm, trả lời câu hỏi, đổi hướng giữa chừng.
- **Máy tắt thì bàn giao lên cloud qua git commit**, phiên chạy tiếp trong sandbox hosted.

**OpenClaw** thì thẳng thừng từ chối hỗ trợ thuê bao, hướng user sang API key (~$7/tháng cho mức
dùng thường với Sonnet) hoặc thuê bao ChatGPT.

### 5.2c Ba chế độ thực thi của Forge — chốt

Forge **không chọn một**, mà hỗ trợ cả ba, người dùng chọn:

| Chế độ | AI dùng được | Code chạy ở đâu | Điện thoại một mình dùng được | Ai trả compute |
|---|---|---|---|---|
| **A. Local runner** | **Thuê bao (Pro/Max/Plus)** + API key | Máy user | Có — nhưng máy phải bật | User (đã có sẵn) |
| **B. CI của user** | API key | GitHub Actions | Có | User (GitHub) |
| **C. Cloud sandbox** | API key | Daytona / E2B | Có | Trả theo dùng |

**Ranh giới tuân thủ, tuyệt đối không vượt:** ở chế độ A, server Forge **không nhận, không lưu,
không chuyển tiếp** OAuth token của thuê bao. Runner chạy binary chính chủ trên máy user; Forge
chỉ chuyển **mô tả công việc và kết quả**, không chuyển credential. Vi phạm dòng này là đẩy người
dùng vào nguy cơ bị khoá tài khoản.

Bàn giao khi máy tắt: theo cách của Omnara — commit lên git rồi chuyển sang chế độ B hoặc C (lúc
đó dùng API key, không dùng thuê bao).

Sandbox đã khảo sát cho chế độ C: E2B (Firecracker microVM, ~150ms), Daytona (cold start ~90ms,
workspace bền như Codespace), Modal (gVisor, có GPU), Vercel Sandbox, Cloudflare. **Không tự dựng
hạ tầng sandbox** — một mình không kham nổi phần bảo mật chạy code AI sinh ra.

### 5.3 Hệ quả cho lộ trình và truyền thông

- **Local runner không phải tính năng phụ.** Nó là con đường duy nhất để người dùng xài thuê bao
  họ đã trả tiền — tức là con đường **rẻ nhất cho người dùng**, và là lợi thế so với các nền tảng
  bắt buộc API key.
- **Truyền thông phải nói đúng:** *"Dùng gói Claude/ChatGPT bạn đang có — qua Forge Runner cài trên
  máy bạn. Hoặc kết nối API key để chạy hoàn toàn trên cloud."* Không được viết lập lờ.
- **Bảo mật API key** (chế độ B, C): mã hoá khi lưu, không hiện lại sau khi lưu, scope tối thiểu,
  **không bao giờ** vào log/evidence/prompt.

### 5.4 Kết nối tài khoản — đã tra cứu, chốt

Bảng dưới là **các implementation đầu tiên**, không phải danh sách bắt buộc. Mỗi ô là một
implementation của một capability ở §5.5; người dùng thay được.

| Dịch vụ | Cách nối | Lý do |
|---|---|---|
| **GitHub** | **GitHub App** (không phải OAuth App) | Quyền fine-grained; user chọn **từng repo**; token sống **1 giờ** tự refresh; webhook tập trung; người cài rời tổ chức app vẫn chạy. OAuth App cho token **không hết hạn** thấy **toàn bộ** repo — rủi ro không chấp nhận được |
| **Vercel** | OAuth2 authorization-code + PKCE | Quản lý deployment thay mặt user |
| **Supabase** | OAuth2 + Management API | Quản lý organization/project thay mặt user |
| **Lưu token** | **Vercel Connect** | Sinh ra đúng cho bài này: không lưu credential dài hạn trong env var, mà **xin token ngắn hạn lúc runtime, scope theo project/environment**. Forge **không phải tự xây kho credential** — phần rủi ro nhất của hệ thống |

### 5.5 Danh mục tích hợp — người dùng chọn nhà cung cấp nào cũng được

Mục tiêu: **mọi sản phẩm bên thứ ba đều cắm được, user muốn dùng cái nào thì dùng.**

Cách duy nhất khả thi cho một đội nhỏ là **không hard-code từng tích hợp**, mà định nghĩa
**capability** rồi để nhà cung cấp cắm vào:

```text
Capability (hợp đồng theo năng lực)      Implementation (ai cũng được)
────────────────────────────────────     ─────────────────────────────
SourceControlProvider                    GitHub · GitLab · Bitbucket
DeploymentProvider                       Vercel · Netlify · Cloudflare · Railway · Fly
DatabaseProvider                         Supabase · Neon · PlanetScale · Turso
AuthProvider                             Supabase Auth · Clerk · Auth0 · WorkOS
ModelProvider                            Anthropic · OpenAI · Google · OpenRouter · local
DesignProvider                           Design system của Forge · Figma MCP
NotificationProvider                     Slack · Discord · email
ObservabilityProvider                    Sentry · PostHog
```

Hợp đồng viết theo **năng lực**, không theo tên hãng: *"deploy được một app và trả về URL"* là hợp
đồng; *"Vercel"* chỉ là một implementation. Domain logic không bao giờ phụ thuộc SDK của provider.

**MCP là thứ làm cho "tất cả sản phẩm" khả thi.** Ba tầng:

| Tầng | Là gì | Ai làm |
|---|---|---|
| **Native** | Tích hợp Forge tự viết, tối ưu nhất | Forge — chỉ vài cái: GitHub, Vercel, Supabase |
| **MCP curated** | MCP server đã kiểm định, cắm là chạy | Forge kiểm định, hãng viết |
| **MCP mở** | User tự khai báo MCP server bất kỳ | User |

Tầng 3 là lời hứa "tất cả sản phẩm" — không phải bằng cách viết 50 tích hợp bằng tay, mà bằng
cách để mở một chuẩn. Không có tầng này thì đây là công việc vô hạn.

**Mặc định khi user chưa chọn gì:** GitHub + Vercel + Supabase + design system của Forge. Mặc
định, không bắt buộc.

### 5.6 Lớp workspace — board, ghi chú, dòng hoạt động

Người dùng cần thấy **đang làm gì, tới đâu, ghi chú gì** — kiểu Kanban/Trello, và một dòng trao
đổi kiểu Slack.

**Quyết định thiết kế quan trọng: board không phải một Trello riêng.** Nó là **một cách nhìn**
lên đúng những task và trạng thái đã có sẵn trong lõi. Không sinh ra kho dữ liệu thứ hai, không
có chuyện board nói một đằng hệ thống làm một nẻo.

Cột board = trạng thái trong task state machine đã có:

```text
Backlog      Ready        In progress    Verifying     Blocked        Done
(tasks.md)   prepared     implementing   verifying     rejected /     accepted
                                                       chờ duyệt
```

| Thành phần | Là gì | Dựa trên |
|---|---|---|
| **Board** | Kanban, kéo thả, mỗi card là một task | Task state machine + journal đã có |
| **Note** | Ghi chú gắn vào dự án hoặc từng task | Bản ghi mới, có phiên bản |
| **Activity** | Dòng thời gian: ai/agent nào làm gì, lúc nào, kết quả gì | **Task journal hash-chain đã có** — không cần xây mới |
| **Approval** | Duyệt cổng ngay trên card | Cổng spec/verify/bảo mật đã có |

Hai điểm khác Trello, và là lý do nó đáng làm:

1. **Card tự di chuyển.** Agent nhận task thì card sang In progress; verify fail thì card sang
   Blocked kèm lý do máy đọc được. Người dùng không phải cập nhật trạng thái bằng tay — đó là
   việc nhàm chán nhất của Trello/Jira.
2. **Note là ngữ cảnh cho AI.** Ghi chú không nằm chết một chỗ: nó được đưa vào ngữ cảnh khi agent
   làm task liên quan. Đây là vai trò BridgeMemory của BridgeMind, và là chỗ nối với Atoryn Memory
   nếu sau này dùng.

Dòng hoạt động **không** phải chat với AI. Nó là nhật ký có bằng chứng: mỗi mục trỏ tới một
evidence record thật.

### 5.7 Bảo mật — tính năng bán được

Người dùng không tự biết mình hở chỗ nào. Forge lo hộ:

- **Supabase RLS**: sinh policy **deny-all trước**, mở dần theo spec. Không bao giờ để bảng mở toang.
- **Secret**: không vào code, không vào Git, không vào prompt, không vào log.
- **Auth**: Forge dựng theo chuẩn, không để AI tự bịa.
- **Cổng trước deploy**: chặn khi có secret bị commit, endpoint không auth, bảng thiếu RLS,
  dependency có lỗ hổng đã biết.
- **Báo cáo cho người không rành kỹ thuật**: bạn đang chịu rủi ro gì, Forge đã xử lý ra sao.

Fail closed. Hở nghiêm trọng thì không deploy.

### 5.8 Lớp Spec — lấy format Spec Kit, engine tự viết

Tương thích `specs/<feature>/{constitution,spec,plan,tasks}.md` của
[github/spec-kit](https://github.com/github/spec-kit) (MIT) → người dùng **eject** ra repo rồi làm
tiếp bằng agent local được. Đó là tính năng bán được.

Không bọc CLI của họ: đó là Python CLI điều khiển bằng slash command cho dev ngồi terminal.

**Ranh giới:** AI sinh *nội dung*; **code** giữ schema, validate và **chặn cổng**. Cổng cứng đầu
tiên: spec còn câu hỏi chưa trả lời thì không được sang plan.

### 5.9 Design system riêng

Forge có design system + component library riêng, **miễn phí**, AI sinh code dựa trên đó. Lý do
ngoài chi phí: output nhất quán hơn hẳn so với để AI tự bịa Tailwind mỗi lần. Figma MCP là tuỳ chọn.

### 5.10 Verification — tài sản thừa kế

Mỗi task trong `tasks.md` map thành một TaskContract: allowed/forbidden paths, verification
commands, digest ràng buộc `baseSha`, evidence, journal hash-chain. Đây là chỗ engine `cw` cũ có
giá trị thật trong sản phẩm mới.

---

## 6. Mô hình doanh thu — chốt

Thuê bao. Forge không ăn phần token (mâu thuẫn BYOK), không ôm hạ tầng của user.

| Gói | Giá tham chiếu | Gồm |
|---|---|---|
| Free | 0 | 1 dự án hoạt động, chạy trên CI của user |
| Pro | ~$20/tháng | Nhiều dự án, cổng bảo mật, lịch sử evidence |
| Team | ~$60/tháng | Nhiều người, phân quyền, audit |

Tham chiếu: BridgeMind $16/$40/$80. Vì Forge gần như không tốn chi phí biến đổi cho mỗi user
(compute và AI đều của user), biên lợi nhuận cao — nhưng cũng nghĩa là **giá trị phải nằm ở công
cụ**, không nằm ở tài nguyên.

---

## 7. Lộ trình thực tế

Xếp theo **rủi ro giảm dần**, không theo độ hoành tráng. Mỗi mốc phải chạy thật mới sang mốc sau.

| # | Mốc | Chứng minh được điều gì | Xong khi |
|---|---|---|---|
| 0 | Nối repo qua **git** (GitHub App là adapter đầu tiên) | Nền tảng chạm được repo user **mà không khoá vào GitHub** | Thấy repo thật; clone/commit chạy với remote git bất kỳ |
| 1 | Spec pipeline có cổng, dùng API key của user | Lõi khác biệt hoạt động | Ra spec/plan/tasks thật, cổng chặn được |
| 2 | **Forge Runner** + dispatch 1 task → PR thật | **Khâu rủi ro nhất.** Chứng minh dùng được thuê bao của user mà không chạm credential | PR mở được trên GitHub, chạy bằng gói Claude/ChatGPT của user |
| 3 | Verify task đó trong CI của user | Lớp kiểm soát có tác dụng | Task sai phạm vi bị chặn |
| 4 | Deploy Vercel → **URL sống** | Đóng được vòng "PR → website" | Bấm vào URL xem được |
| 5 | Supabase + RLS deny-all + cổng bảo mật | Giá trị bảo mật | Deploy bị chặn khi hở |
| 6 | **Board + note + activity** | Sản phẩm dùng được hằng ngày | Card tự chuyển cột khi agent chạy |
| 7 | Nhiều dự án + mobile duyệt cổng | Danh mục dự án | Duyệt được từ điện thoại |
| 8 | **MCP mở** — user tự cắm server bất kỳ | Lời hứa "tất cả sản phẩm" | Cắm được một MCP Forge chưa từng biết |
| 9 | Design system | Chất lượng giao diện | Sinh UI nhất quán |
| 10 | Thuê bao | Doanh thu | Thu được tiền |

Board xếp ở mốc 6 chứ không sớm hơn: nó là **cách nhìn** lên trạng thái task. Chưa có task thật
chạy qua agent thật (mốc 2–3) thì board chỉ là Trello rỗng — thứ đã có đầy ngoài kia và miễn phí.

**Mốc 2 là chỗ dự án sống hay chết.** Nếu không dispatch được agent server-side bằng credential
của user, toàn bộ định hướng phải xét lại. Làm nó sớm, đừng để cuối.

---

## 8. Rủi ro lớn nhất

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Incumbent nuốt mất khoảng trống (Anthropic/OpenAI thêm deploy + DB) | **Cao** | Trung lập nhà cung cấp là thứ họ khó làm — họ không có động cơ cho user dùng model đối thủ |
| Dispatch agent server-side bằng key user không khả thi như mong đợi | **Cao** | Làm mốc 2 sớm nhất có thể |
| Anthropic siết thêm, cấm cả runner cục bộ | Trung bình | Chế độ B và C (API key) vẫn chạy được; runner là đường thêm chứ không phải đường duy nhất |
| Truyền thông lập lờ về thuê bao khiến user bị khoá tài khoản | **Cao** | Ranh giới tuân thủ ở §5.2c là tuyệt đối: server không bao giờ chạm OAuth token của thuê bao |
| Phạm vi quá rộng cho một người | **Cao** | Lộ trình trên đã xếp để mỗi mốc tự đứng được; không mốc nào cần mốc sau |
| Hứa "không khoá nhà cung cấp" nhưng thực tế chỉ chạy tốt với GitHub | **Cao** | Lõi chỉ phụ thuộc `git`. Mọi tính năng riêng của nhà cung cấp phải nằm sau capability và có đường suy giảm rõ ràng |
| "Tích hợp tất cả sản phẩm" thành công việc vô hạn | **Cao** | Chỉ tự viết 3 tích hợp native (GitHub, Vercel, Supabase). Còn lại đẩy sang MCP — Forge kiểm định một số, user tự cắm phần còn lại |
| Board/note biến thành một Trello nữa, tốn công mà không ai cần | Trung bình | Board là **view** lên task state machine sẵn có, không phải kho dữ liệu thứ hai. Card tự chuyển cột — đó là điểm Trello không có |
| Lặp lại lịch sử: viết lại lần thứ 5 mà không mốc nào chạy thật | **Cao** | Không viết thêm tầng trừu tượng nào trước khi mốc 2 chạy thật |

---

## 9. Các quyết định đã chốt

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Đối tượng | Builder dùng AI. Phơi spec/plan/tasks, không bắt mở terminal |
| 2 | Repo | **Repo mới** cho web app; repo này thành package lõi (verification + spec) |
| 3 | Kết nối tài khoản | **GitHub App** + OAuth2 (Vercel, Supabase) + **Vercel Connect** giữ token ngắn hạn |
| 4 | Doanh thu | Thuê bao; free 1 dự án; Pro ~$20 |
| 5 | 52 file chưa commit | **Phương án C** — không đụng repo cũ, không mang sang repo mới. Giữ lại làm nguồn cho package verification sau này |

---

## 10. Điều quan trọng nhất

Định hướng này chỉ có giá trị nếu **mốc 2 chạy thật**. Repo này đã bốn lần được viết lại từ một
tầm nhìn lớn mà chưa lần nào đi qua được cổng kiểm chứng đầu tiên.

Không xây thêm tầng trừu tượng nào trước khi một task thật được agent thật thực thi và mở ra một
PR thật.
