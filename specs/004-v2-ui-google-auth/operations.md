# Ghi nhận vận hành bản tài khoản

Ngày 13/11/2026:

- Chỉ đọc database PIN cũ: còn 2 workspace, 5 member, 2 Stack, 3 task và 14 activity; policy của các bảng chính vẫn `using (true)`. Không sửa database này.
- Chủ dự án xác nhận dữ liệu khi chuyển sang Google được bắt đầu trống và cho phép xóa dự án thử CAPYDINO trên database tài khoản.
- Trên database tài khoản, xóa CAPYDINO trong một giao dịch sau khi kiểm tra đúng tên/mã, đúng một owner đã xác minh và đúng một task. Cùng giao dịch cấp quyền admin toàn cục cho tài khoản đã xác minh mà chủ dự án cung cấp. Không ghi địa chỉ email vào repo.
- Kiểm tra sau giao dịch: 0 project, 1 admin grant, 0 project membership của tài khoản admin. Database PIN cũ không bị chạm tới.
- Migration `202611130011` áp dụng cho database tài khoản, cho phép thành viên đang hoạt động sửa chi tiết task theo cách V2; quyền tick theo người được giao vẫn được kiểm thử.

Bản phát hành công khai vẫn là PIN V2. Nhánh `v2-google-auth` chưa được đẩy lên GitHub.
