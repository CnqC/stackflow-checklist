# StackFlow — Checklist Dự Án Nhóm (<10 Người) trên Web & Mobile App

Ứng dụng theo dõi và chỉnh sửa **Checklist theo từng Stack (Giai đoạn)** đồng bộ thời gian thực (**Realtime**) giữa **Web**, **PWA (iOS/Android/Desktop)** và **Android APK (Capacitor)**, được thiết kế gọn nhẹ cho nhóm dự án dưới 10 thành viên.

---

## Tính năng cốt lõi

- **Vào cực nhanh bằng Mã Dự Án + Mã PIN + Chọn tên thành viên**:
  - Không bắt bạn bè tạo tài khoản/mật khẩu phức tạp.
  - Giới hạn chuẩn nhóm nhỏ **tối đa 10 thành viên** (kiểm soát ở cả tầng Giao diện & Trigger PostgreSQL).
  - Hiển thị trạng thái **Online trực tiếp** (`Web` / `App`) của từng bạn trong nhóm.
- **Tổ chức công việc theo Stack (`Stack Follow`)**:
  - Chia dự án thành các tầng `Stack 1 -> Stack 2 -> Stack 3...` kèm thanh phần trăm tiến độ trực quan.
  - Hỗ trợ bật **Chế độ Tuần tự (`Tuần tự`)** cho từng Stack: khóa các bước phía sau cho tới khi hoàn thành xong bước nền phía trước.
- **Đầu việc chi tiết & Chia việc nhóm cực dễ (Thân thiện Non-Tech)**:
  - Tick hoàn thành 1 chạm với Optimistic UI (0ms độ trễ), tự động ghi nhận `✓ [Tên thành viên] đã hoàn thành`.
  - **Nhiều người cùng làm 1 đầu việc (`Người cùng làm`)**: Bấm chạm trực tiếp vào các thẻ tên thành viên để chọn nhiều bạn cùng phụ trách chung 1 đầu việc lớn.
  - **Chia phần việc nhỏ ngay trong mục (`Chia phần việc nhỏ trong mục này`)**: Tách một việc lớn thành nhiều bước nhỏ và gắn tên từng bạn phụ trách riêng cho từng bước ngay bên trong đầu việc đó.
  - **Chuông báo việc mới trên Điện thoại & Trình duyệt (`🔔 Bật báo chuông khi có việc mới`)**: Chỉ cần bấm biểu tượng **Quả chuông (`🔔`)** trên thanh công cụ và bật chuông 1 lần — mỗi khi có bạn trong nhóm giao việc mới hoặc giao phần việc nhỏ cho bạn, điện thoại/máy tính sẽ báo tinh tinh ngay lập tức. Bấm vào thông báo sẽ mở thẳng đúng đầu việc đó.
  - Đổi trạng thái (`Cần làm`, `Đang làm`, `Đang kẹt`, `Hoàn thành`), mức ưu tiên, hạn chót (`Deadline`), ghi chú và **Link đính kèm** (GitHub, Figma, Notion, Drive...).
  - Bộ lọc nhanh **`Việc của tôi`** (tự động gom cả việc chính lẫn phần việc nhỏ bạn được giao), tìm kiếm tức thì và **Nhật ký hoạt động trực tiếp**.
- **Kiến trúc Đồng bộ Kép (`Dual-Engine Realtime Sync`)**:
  - **Supabase Cloud Mode**: Đồng bộ qua Internet dưới 100ms bằng PostgreSQL + Supabase Realtime (`postgres_changes` & `presence`).
  - **Local Instant Mode**: Chạy ngay lập tức không cần cấu hình, đồng bộ thời gian thực giữa nhiều tab/cửa sổ trình duyệt qua `BroadcastChannel` và cho phép **1-click đẩy toàn bộ dự án lên Supabase Cloud** bất cứ lúc nào.

---

## 1. Chạy trên máy (Web Development)

```bash
npm install
npm run dev
```

Chạy kiểm thử tự động (Unit Tests):

```bash
npm test
```

---

## 2. Kết nối Supabase Cloud miễn phí (để cả nhóm dùng chung qua Internet)

1. Tạo một project miễn phí tại [https://supabase.com](https://supabase.com).
2. Vào mục **SQL Editor** trên Supabase Dashboard, dán toàn bộ nội dung file [`supabase/schema.sql`](./supabase/schema.sql) (hoặc bấm nút **"Sao chép mã khởi tạo bảng"** ngay trong ứng dụng) và nhấn **Run**.
3. Lấy `Project URL` và `Anon / Publishable Key` trong mục **Project Settings → API**:
   - **Cách 1 (Ngay trên giao diện App/Web)**: Bấm nút **`Đồng bộ Local / Cloud`** → dán URL & Key → bấm **Kiểm tra & Lưu kết nối Cloud**.
   - **Cách 2 (Cấu hình cố định khi Deploy Web / Build APK)**: Tạo file `.env` từ `.env.example`:
     ```env
     VITE_SUPABASE_URL=https://your-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```

---

## 3. Triển khai Web & Đóng gói Mobile App

- **Triển khai Web + PWA (iOS / Android / Máy tính)**:
  - Đẩy repo lên Vercel / Cloudflare Pages / Netlify (`npm run build`, thư mục xuất: `dist`).
  - Trên **iPhone (Safari)**: Mở link Web → bấm **Chia sẻ** → **Thêm vào Màn hình chính**.
  - Trên **Android / Chrome / Edge**: Bấm nút **Cài đặt ứng dụng StackFlow** ngay trong mục `Cài đặt App`.
- **Đồng bộ & Xuất bản Android APK gốc (Capacitor)**:
  ```bash
  npm run cap:sync
  ```
  Thư mục Android gốc nằm tại `android/` để build trực tiếp ra file `.apk`.
