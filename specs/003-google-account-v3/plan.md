# Kế hoạch kiến trúc v3

- **Domain**: `src/core/domain/accountProject.ts` chỉ chứa kiểu dữ liệu và quy tắc quyền thuần. Không gọi Supabase hay đọc bộ nhớ trình duyệt.
- **Infrastructure**: `accountAuthService` xử lý Google OAuth/phiên; `accountProjectRepository` gọi PostgREST/RPC và Realtime. Server là nơi quyết định quyền cuối cùng.
- **Database**: migration mới trên Supabase project trống. PostgreSQL RLS giới hạn phạm vi đọc/ghi; trigger áp quy tắc tick và dấu vết hoàn thành; RPC nguyên tử cho tạo dự án, lời mời và phân công.
- **UI**: `AccountApp` quản lý phiên và điều hướng; Dashboard quản lý dự án; Workspace hiển thị công việc. Các thao tác thất bại giữ dữ liệu nhập và tải lại trạng thái server.
- **Vận hành**: CI chạy unit, kiểm thử PostgreSQL, build. Cutover sau khi Google OAuth, callback Android, admin bootstrap, sao lưu mã hóa và thử khôi phục được cấu hình thật.
