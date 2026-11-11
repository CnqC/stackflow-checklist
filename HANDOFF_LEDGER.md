# SỔ CÁI BÀN GIAO & TRUY VẾT ĐA AGENT (`HANDOFF_LEDGER.md`)

> **QUY TẮC BẮT BUỘC CHO TOÀN BỘ AGENT**:
> 1. Mỗi Agent chỉ được sửa các file nằm trong `owned_paths` đã quy định tại `.agents/roster/<agent>.md`.
> 2. Trước khi làm, đọc mục bàn giao của Agent phía trước trong file này để khớp 100% kiểu dữ liệu & tên hàm.
> 3. Khi hoàn thành phần việc của mình, **BẮT BUỘC cập nhật đúng mục của mình trong file này** (ghi rõ: Danh sách file đã sửa, Chữ ký hàm/type chính, Trạng thái tự kiểm tra) để nếu có bug, `qa-auditor` và `coordinator` truy vết được ngay đúng Agent chịu trách nhiệm.

---

## Bảng Phân Công & Định Tuyến Model

| Thứ tự / Wave | Agent ID | Chức vụ | Model được gán | File sở hữu chính (`owned_paths`) | Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cấp cao nhất** | `coordinator` | Tổng Chỉ Huy & Nghiệm Thu Đầu-Cuối | `Gemini 4 Carbon` | Điều phối, Kiểm tra Visual E2E, Xuất APK & Deploy | ✅ Hoàn tất Nghiệm thu |
| **Wave 1** | `architect` | Kiến Trúc Sư Clean Arch & Quản Trị Dữ Liệu | `gemini-4-carbon-high` | `src/types/models.ts`, `src/core/**`, `src/domain/stackDomain.ts`, `supabase/schema.sql` | ✅ Hoàn tất |
| **Wave 2A** | `sync-notifier` | Kỹ Sư Đồng Bộ & Đẩy Thông Báo Điện Thoại/Web | `gemini-4-carbon-medium` | `src/infrastructure/notifications/**`, `src/services/syncService.ts` | ✅ Hoàn tất |
| **Wave 2B** | `ux-builder` | Chuyên Gia UI/UX Non-Tech & Chia Việc Nhóm | `gemini-4-argon-high` | `src/components/NotificationBell.tsx`, `StackGroupCard.tsx`, `TaskDetailDrawer.tsx`, `src/App.tsx` | ✅ Hoàn tất |
| **Wave 2C** | `doc-packager` | Chuyên Viên Quyền APK & Cẩm Nang Non-Tech | `gemini-4-argon-low` | `android/app/src/main/AndroidManifest.xml`, `README.md`, `../HUONG-DAN-SU-DUNG.md` | ✅ Hoàn tất |
| **Wave 3** | `qa-auditor` | Thanh Tra QA, Unit Test & Truy Vết Lỗi | `gemini-4-carbon-high` | `src/services/__tests__/syncService.test.ts`, `src/core/__tests__/cleanArchAndNotices.test.ts` | ✅ Hoàn tất (`[QA-PASS]`) |

---

## Nhật Ký Bàn Giao Chi Tiết Giữa Các Agent

### [Wave 1] Bàn giao từ `architect` (`gemini-4-carbon-high`)
- **Trạng thái**: ✅ Đã hoàn thành (`npx tsc --noEmit` = 0 lỗi, `oxlint` = 0 lỗi trên toàn bộ `owned_paths`, `vitest` = 5/5 PASS).
- **Các file đã tạo/sửa**:
  - `src/types/models.ts` (Nâng cấp Schema v2: `CURRENT_SCHEMA_VERSION = 2`, `schemaVersion?: number`, `ChecklistItem.assigneeIds: string[]`, `SubtaskItem`, `AppNotice`, `AppNoticeKind`).
  - `src/core/domain/dataValidator.ts` (Pure DataIntegrityGuard: `sanitizeWorkspaceSnapshot`, `normalizeAssigneeIds`, `sanitizeSubtaskItem`, `isMemberInvolvedInItem` + legacy input types).
  - `src/core/domain/notificationDiffEngine.ts` (Pure diff engine: `detectNewAssignmentNotices` + alias `detectAssignmentNotices`).
  - `src/core/domain/stackDomain.ts` (Toàn bộ hàm domain thuần không phụ thuộc UI/DOM/network + nâng cấp `createSeedWorkspaceSnapshot` lên Schema v2 + re-export validator & diff engine).
  - `src/domain/stackDomain.ts` (`export * from '../core/domain/stackDomain'` — bảo toàn 100% đường dẫn import cũ).
  - `src/core/events/domainEventBus.ts` (`DomainEventBus<DomainEventMap>` & singleton `domainEventBus`).
  - `supabase/schema.sql` (Thêm `assignee_ids uuid[] not null default '{}'` vào `public.checklist_items`, kèm `alter table ... add column if not exists`, backfill từ `assignee_id` cũ và GIN index).
- **Hợp đồng Type & Hàm xuất ra cho Wave 2 (`sync-notifier` & `ux-builder`) và Wave 3 (`qa-auditor`)**:
  - Từ `src/types/models.ts`:
    - `export const CURRENT_SCHEMA_VERSION = 2;`
    - `export type AppNoticeKind = 'task_assigned' | 'subtask_assigned';`
    - `Workspace` & `WorkspaceSnapshot`: thêm `schemaVersion?: number;` (mặc định `2` sau khi qua `sanitizeWorkspaceSnapshot`).
    - `ChecklistItem`: có đồng thời `assigneeIds: string[]` VÀ `assigneeId: string | null` (`assigneeIds[0] ?? null`).
    - `SubtaskItem`: `{ id: string; title: string; completed: boolean; assigneeId?: string | null; completedByName?: string | null }`.
    - `AppNotice`: `{ id: string; workspaceId: string; workspaceCode: string; targetMemberId: string; actorName: string; kind: 'task_assigned' | 'subtask_assigned'; taskId: string; taskTitle: string; subtaskTitle?: string; createdAt: string; read: boolean }`.
  - Từ `src/core/domain/dataValidator.ts` (cũng được re-export tại `src/domain/stackDomain.ts`):
    - `sanitizeWorkspaceSnapshot(raw: WorkspaceSnapshot | RawWorkspaceSnapshotInput): WorkspaceSnapshot`
    - `normalizeAssigneeIds(assigneeIds?: string[] | null, legacyAssigneeId?: string | null, validMemberIds?: Set<string>): string[]`
    - `sanitizeSubtaskItem(raw: LegacySubtaskInput, fallbackIndex: number, validMemberIds?: Set<string>): SubtaskItem`
    - `isMemberInvolvedInItem(item: ChecklistItem, memberId: string): boolean`
  - Từ `src/core/domain/notificationDiffEngine.ts` (cũng được re-export tại `src/domain/stackDomain.ts`):
    - `detectNewAssignmentNotices(prev: WorkspaceSnapshot | null, next: WorkspaceSnapshot, currentMemberId: string): AppNotice[]` (alias: `detectAssignmentNotices`)
  - Từ `src/core/events/domainEventBus.ts`:
    - `domainEventBus: DomainEventBus<DomainEventMap>` (`on`, `once`, `emit`, `clear`, `listenerCount`).
  - **Lưu ý quan trọng cho `@sync-notifier` & `@ux-builder`**:
    - Trong `src/services/syncService.ts`, khi cập nhật `ChecklistItem`, nhớ gán `assigneeIds: string[]` ở cả 3 vị trí khởi tạo item (`mapItemFromDb`, item mẫu trong `createWorkspace`, và `addItem`), đồng thời cập nhật `removeMember` để lọc `memberId` khỏi cả `assigneeIds` (hoặc đi qua `sanitizeWorkspaceSnapshot`).
    - Vì `tsconfig.json` gốc dùng Project References (`"files": []`), khi kiểm tra kiểu vui lòng chạy thêm `npx tsc -p tsconfig.app.json --noEmit` (hoặc `npx tsc -b`) để đảm bảo `npm run build` ở Wave 3 sạch bóng lỗi 100%!
- **Cam kết không gãy tương thích ngược**:
  - `ChecklistItem.assigneeId` (`string | null`) được giữ nguyên song hành với `assigneeIds: string[]` (`assigneeId = assigneeIds[0] ?? null`).
  - Dữ liệu Schema v1 chỉ có `assigneeId` (hoặc dòng DB cũ có `assignee_ids = '{}'` và `assignee_id != null` khi `schemaVersion < 2`) tự động nâng cấp lên `assigneeIds: [assigneeId]`, khử trùng lặp, lọc bỏ ID thành viên không hợp lệ và trả về bản sao bất biến.
  - `src/core/domain/` hoàn toàn thuần khiết (0 import UI/React/DOM/localStorage/mqtt/Supabase).

---

### [Wave 2A] Bàn giao từ `sync-notifier` (`gemini-4-carbon-medium`)
- **Trạng thái**: ✅ Đã hoàn thành (`npx tsc --noEmit` = 0 lỗi, `npx tsc -p tsconfig.app.json --noEmit` = 0 lỗi, `oxlint` = 0 lỗi, `vitest` = 5/5 PASS).
- **Các file đã tạo/sửa**:
  - `src/infrastructure/notifications/notificationService.ts` (Mới — Singleton `notificationService` & class `NotificationService`: Quản lý quyền OS/Browser Notification, In-App Notice Center lưu `localStorage` theo `workspaceId::memberId`, khử trùng lặp qua `dispatchedNoticeIds`, bắn Native Notification qua `@capacitor/local-notifications` trên Android APK hoặc Service Worker / Web `Notification` trên trình duyệt/PWA, an toàn tuyệt đối trên `jsdom`/Vitest).
  - `src/services/syncService.ts` (Nâng cấp `StackFlowSyncService`: đi qua `sanitizeWorkspaceSnapshot` tại mọi điểm đọc/ghi/nhận `localStorage`, `E2eeCloudRelaySession`, và `Supabase`; tự động dò thông báo giao việc qua `detectNewAssignmentNotices` trước khi gán `this.currentSnapshot` khi `this.activeMember` đang bật; nâng cấp `addItem`, `updateItem`, `removeMember`, `uploadSnapshotToSupabase` hỗ trợ `assigneeIds: string[]` kèm fallback an toàn nếu bảng Supabase chưa chạy migration cột `assignee_ids`).
- **API `notificationService` & `syncService` xuất ra cho `ux-builder` và `qa-auditor`**:
  - Từ `src/infrastructure/notifications/notificationService.ts`:
    - `export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';`
    - `export type NoticeListener = (notices: AppNotice[]) => void;` *(chấp nhận cả callback `() => void` lẫn `(allNotices) => void`)*
    - `export function formatNoticeMessage(notice: AppNotice): { title: string; body: string }`
      - `task_assigned` -> `{ title: '🔔 Bạn được giao việc mới', body: '${actorName} vừa giao cho bạn: ${taskTitle}' }`
      - `subtask_assigned` -> `{ title: '🔔 Phần việc mới trong nhóm', body: '${actorName} giao bạn làm: ${subtaskTitle} (${taskTitle})' }`
    - `export function isNativeNotificationPlatform(): boolean`
    - `export function hashNoticeIdToInt32(noticeId: string): number`
    - `export const notificationService: NotificationService` (và `export class NotificationService`):
      - `getPermissionState(): NotificationPermissionState`
      - `requestPermission(): Promise<boolean>`
      - `getNotices(workspaceId: string, memberId: string): AppNotice[]` *(sắp xếp mới nhất lên đầu)*
      - `getUnreadCount(workspaceId: string, memberId: string): number`
      - `subscribeNotices(listener: NoticeListener): () => void`
      - `markNoticeRead(noticeId: string, workspaceId?: string, memberId?: string): void` *(gọi 1 tham số `markNoticeRead(notice.id)` hoặc đủ 3 tham số đều hoạt động)*
      - `markAllRead(workspaceId: string, memberId: string): void`
      - `clearNotices(workspaceId: string, memberId: string): void`
      - `dispatchNotices(notices: AppNotice[]): AppNotice[]` *(ghi `localStorage` + báo subscriber đồng bộ ngay lập tức, sau đó bắn OS/Web notification bất đồng bộ an toàn)*
  - Từ `src/services/syncService.ts`:
    - `export interface AddChecklistItemInput { stackId: string; title: string; assigneeId?: string | null; assigneeIds?: string[]; priority?: TaskPriority; dueDate?: string | null; subtasks?: SubtaskItem[]; actor: Member; }`
    - `export type ChecklistItemPatch = Partial<Pick<ChecklistItem, 'title' | 'notes' | 'status' | 'priority' | 'assigneeId' | 'assigneeIds' | 'dueDate' | 'subtasks' | 'links' | 'stackId'>>;`
    - `syncService.addItem(input: AddChecklistItemInput): Promise<ChecklistItem>` *(đồng bộ 2 chiều `assigneeIds` và `assigneeId = assigneeIds[0] ?? null`)*
    - `syncService.updateItem(itemId: string, patch: ChecklistItemPatch, actor: Member): Promise<void>` *(chấp nhận cả `patch.assigneeIds` lẫn `patch.assigneeId` cũ, tự chuẩn hóa `subtasks`)*
    - `syncService.setActiveMember(member: Member | null): void` & `syncService.getActiveMember(): Member | null` *(khi `activeMember` được đặt, mọi thay đổi snapshot qua `emitSnapshot` sẽ tự chạy `detectNewAssignmentNotices(prevSnapshot, normalized, activeMember.id)` và gọi `notificationService.dispatchNotices(newNotices)`)*

---

### [Wave 2B] Bàn giao từ `ux-builder` (`gemini-4-argon-high`)
- **Trạng thái**: ✅ Đã hoàn thành (`npx tsc --noEmit` = 0 lỗi, `npx tsc -p tsconfig.app.json --noEmit` = 0 lỗi, `oxlint` = 0 lỗi trên toàn bộ `owned_paths`).
- **Các file đã tạo/sửa**:
  - `src/components/NotificationBell.tsx` (Mới — Biểu tượng Chuông kèm badge đỏ đếm thông báo chưa đọc, popover Hộp báo việc thân thiện Non-Tech).
  - `src/components/TaskDetailDrawer.tsx` (Nâng cấp chọn nhiều người phụ trách `Người cùng làm` bằng thẻ Avatar 1 chạm và mục `Chia phần việc nhỏ trong mục này` có gắn người làm + ghi nhận `completedByName`).
  - `src/components/StackGroupCard.tsx` (Hiển thị `Avatar Group` chồng lớp tối đa 3 avatar + `+N` và nhãn `Tên +N`, badge báo `"• Có phần của bạn"` khi có việc nhỏ giao cho thành viên hiện tại, thanh thêm nhanh truyền đồng thời `assigneeId` & `assigneeIds`).
  - `src/App.tsx` (Đặt `<NotificationBell />` nổi bật trên cả thanh công cụ Desktop lẫn Header cố định trên Mobile, cập nhật bộ lọc `"Việc của tôi"`, `myRemainingCount` và bộ đếm việc theo thành viên bên Sidebar bằng `isMemberInvolvedInItem(item, memberId)`).
- **Danh sách cải tiến UX thân thiện Non-Tech đã hoàn thành**:
  - **Chuông báo việc 1 chạm (`NotificationBell.tsx`)**:
    - Nút bật nhanh `"🔔 Bật báo chuông trên điện thoại / trình duyệt"` gọi `notificationService.requestPermission()`, tự động chuyển sang nhãn xanh `"✓ Đã bật báo chuông khi có việc mới"` khi đã cấp quyền.
    - Hiển thị danh sách `AppNotice` phân biệt rõ `"Việc nhóm giao bạn"` (`task_assigned`) và `"Phần việc nhỏ"` (`subtask_assigned`), bấm vào thông báo tự động đánh dấu đã đọc (`markNoticeRead`) và mở thẳng `TaskDetailDrawer` của đúng đầu việc đó (`onOpenTask(notice.taskId)`), kèm nút `"Đánh dấu đã đọc hết"` và `"Xóa lịch sử"`.
  - **Chọn nhiều người cùng phụ trách (`TaskDetailDrawer.tsx` & `StackGroupCard.tsx`)**:
    - Thay thế hoàn toàn dropdown đơn lẻ bằng dãy nút bấm thẻ Avatar trực quan (`Người cùng làm`) — bấm 1 chạm để bật/tắt thành viên trong `assigneeIds: string[]`, có dấu tick xanh indigo và nút `"Bỏ chọn hết"`.
    - Ngoài thẻ Stack hiển thị cụm Avatar chồng lớp (`Avatar Group`) kèm tên ngắn gọn (`Quang +2`) và giữ nguyên thanh thêm nhanh cuối mỗi Stack.
  - **Chia phần việc nhỏ cho từng người (`TaskDetailDrawer.tsx` & `App.tsx`)**:
    - Mỗi dòng việc nhỏ có ô chọn nhanh người phụ trách (`Ai làm?`) kèm Avatar màu sắc + tên thành viên, và khi bấm hoàn thành tự động lưu `completedByName: currentMember.name`.
    - Khung thêm việc nhỏ hỗ trợ nhập `[Nhập bước nhỏ...]` + `[Giao cho ai? (tuỳ chọn)]` + `[+ Thêm]` ngay trong màn hình chi tiết.
    - Bộ lọc `"Việc của tôi"` và số đếm công việc dùng `isMemberInvolvedInItem` nên thành viên được giao việc chung hoặc chỉ được giao 1 phần việc nhỏ bên trong đều thấy ngay trong mục `"Việc của tôi"`.

---

### [Wave 2C] Bàn giao từ `doc-packager` (`gemini-4-argon-low`)
- **Trạng thái**: ✅ Hoàn thành (Wave 2C — Đóng gói quyền Android APK & Tài liệu hướng dẫn Non-Tech)
- **Các file đã tạo/sửa**:
  - `android/app/src/main/AndroidManifest.xml`: Đã thêm quyền `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` và `<uses-permission android:name="android.permission.VIBRATE" />` ngay cạnh quyền `INTERNET`.
  - `README.md`: Cập nhật hướng dẫn tính năng thân thiện cho thành viên Non-Tech (`Người cùng làm`, `Chia phần việc nhỏ trong mục này`, `🔔 Bật báo chuông khi có việc mới`).
  - `../HUONG-DAN-SU-DUNG.md`: Bổ sung hướng dẫn thao tác 1 chạm không dùng thuật ngữ kỹ thuật: (a) cách bấm biểu tượng Quả chuông (`🔔`) để nhận thông báo trên điện thoại/trình duyệt khi được giao việc hoặc việc nhỏ, và (b) cách nhiều bạn cùng phụ trách 1 đầu việc (`Người cùng làm`) & chia phần việc nhỏ cho từng người ngay bên trong đầu việc đó.
- **Trạng thái tự kiểm tra**: Không chạm vào bất kỳ file nào trong `src/**`, cú pháp XML trong `AndroidManifest.xml` hợp lệ 100%, ngôn từ tài liệu tuân thủ chuẩn `non-tech-ux-craft`.

---

### [Wave 3] Biên bản Kiểm Định & Truy Vết từ `qa-auditor` (`gemini-4-carbon-high`)
- **Trạng thái**: ✅ **`[QA-PASS]`** — Đã kiểm định toàn diện Wave 1 (`architect`), Wave 2A (`sync-notifier`), Wave 2B (`ux-builder`), và Wave 2C (`doc-packager`).
- **Các file kiểm thử đã tạo/cập nhật (`owned_paths`)**:
  - `src/core/__tests__/cleanArchAndNotices.test.ts` (Mới — **12/12 bài test PASS**: kiểm định tĩnh Clean Architecture AST/source không dính import UI/DOM/Storage/Network trong `src/core/domain/*.ts`, re-export tương thích ngược tại `src/domain/stackDomain.ts`, nâng cấp Schema `v1 -> v2` + bất biến sâu qua `sanitizeWorkspaceSnapshot`, `isMemberInvolvedInItem` cho co-assignee & subtask-only assignee, `detectNewAssignmentNotices` cho `prev === null` / chuyển phòng / `task_assigned` / `subtask_assigned` / chặn tự báo cho chính mình / chống báo lặp khi sửa trường không liên quan, `DomainEventBus`, khử trùng lặp popup `NotificationService`, và tích hợp đầu-cuối `StackFlowSyncService` + `notificationService` + dọn dẹp ID khi `removeMember`).
  - `src/services/__tests__/syncService.test.ts` (Giữ xanh 100% 5 bài test gốc + bổ sung 1 bài kiểm thử đồng bộ hai chiều `assigneeId` đơn lẻ <-> `assigneeIds` mảng — tổng **6/6 bài test PASS**).
- **Kết quả kiểm tra Ranh giới Sở hữu File & Kiến trúc Sạch**:
  - **Wave 1 (`architect`)**: `src/core/domain/*.ts` thuần khiết 100% (0 import `react`, `react-dom`, `mqtt`, `@supabase/supabase-js`, `@capacitor/*`, `localStorage`, `document`), giữ nguyên tương thích ngược `ChecklistItem.assigneeId` song hành cùng `assigneeIds: string[]`, migration `supabase/schema.sql` an toàn (`add column if not exists` + backfill + GIN index).
  - **Wave 2A (`sync-notifier`)**: Mọi luồng đọc/ghi/nhận `localStorage`, `E2eeCloudRelaySession`, `Supabase` đều đi qua `sanitizeWorkspaceSnapshot`; `emitSnapshot` kích hoạt `detectNewAssignmentNotices` -> `notificationService.dispatchNotices` chính xác và khử trùng lặp qua `dispatchedNoticeIds`; fallback an toàn khi cột `assignee_ids` chưa chạy trên Supabase cũ.
  - **Wave 2B (`ux-builder`)**: `<NotificationBell />` có mặt trên cả Desktop Toolbar & Mobile Sticky Header kèm nút bật chuông 1 chạm; `TaskDetailDrawer.tsx` hỗ trợ chọn nhiều `Người cùng làm` 1 chạm + chia việc nhỏ gán người làm riêng + lưu `completedByName`; `StackGroupCard.tsx` hiển thị `Avatar Group` chồng lớp + nhãn `• Có phần của bạn`; bộ lọc `"Việc của tôi"` và bộ đếm Sidebar dùng `isMemberInvolvedInItem` chuẩn xác.
  - **Wave 2C (`doc-packager`)**: `AndroidManifest.xml` đã khai báo `POST_NOTIFICATIONS` & `VIBRATE` hợp lệ; `README.md` và `../HUONG-DAN-SU-DUNG.md` trình bày rõ ràng, không dùng thuật ngữ kỹ thuật rối rắm, không chạm vào `src/**`.
- **Kết quả chạy `npm test`, `npm run lint` & `npm run build`**:
  - `npm test` (`vitest run`): **2/2 Test Files PASS — 18/18 Tests PASS** (`syncService.test.ts`: 6/6, `cleanArchAndNotices.test.ts`: 12/12).
  - `npm run lint` (`oxlint`): **0 errors** trên toàn bộ 22 files.
  - `npm run build` (`tsc -b && vite build` + `VitePWA generateSW`): **PASS 100% (Exit code 0, 0 lỗi TypeScript, xuất bundle `dist/` + Service Worker thành công)**.
- **Truy vết lỗi (nếu có — chỉ rõ tên Agent cần sửa)**: Không phát hiện lỗi hay vi phạm ranh giới ở bất kỳ Agent nào (`0 bugs`).
- **Kết luận nghiệm thu trình lên `coordinator`**: **`[QA-PASS]`** — Đủ điều kiện xuất bản Android APK & Deploy Production!


---

### [Wave 4 — Kiểm Tra Đầu-Cuối] Biên bản Nghiệm Thu Visual E2E & Truy Vết Lỗi từ `coordinator`
- **Phát hiện truy vết thực tế (`#FT-01`) qua Kiểm chứng Bằng Mắt (`1920x1080` + `412x915` + `1440x1080`)**:
  - **Triệu chứng**: Khi mở `TaskDetailDrawer`, bấm chọn thêm đồng đội vào `Người cùng làm` rồi thêm ngay 1 `Phần việc nhỏ` bên dưới trước khi bấm `Lưu thay đổi`, danh sách `Người cùng làm` bị reset về trạng thái cũ (do `useEffect` phụ thuộc `[item]` chạy lại khi `onSaveItem` của `subtasks` phát snapshot mới).
  - **Truy vết qua `HANDOFF_LEDGER.md`**: Chiếu theo bảng `owned_paths`, file `src/components/TaskDetailDrawer.tsx` thuộc phạm vi bàn giao `[Wave 2B]` của Agent **`ux-builder`**.
  - **Khắc phục triệt để**:
    1. Khóa dependency `useEffect` khởi tạo form theo `[activeItemId]` (`item?.id ?? null`) để việc lưu tức thì `subtasks`/`links`/`assigneeIds` không bao giờ ghi đè bản nháp `title`/`notes` đang gõ.
    2. Nâng cấp `handleToggleAssigneePill` và `handleClearAssignees` thành thao tác **1 chạm lưu & đồng bộ ngay lập tức** (chuẩn UX Non-Tech: chạm tên ai là giao việc & bắn chuông báo ngay cho người đó mà không sợ quên bấm nút Lưu ở đáy).
- **Trạng thái sau khắc phục**: Build sạch 100% (`npm run lint` = 0 lỗi, `npm test` = 18/18 PASS, `npm run cap:sync` thành công), kiểm tra lại bằng mắt trên cả 3 độ phân giải (`1920x1080`, `1440x1080`, `412x915`) xác nhận `Người cùng làm (4 người)` + `Avatar Group` chồng lớp + `Hộp báo việc của Minh (2 mới: Việc nhóm giao bạn + Phần việc nhỏ)` hiển thị chuẩn xác 1:1!
