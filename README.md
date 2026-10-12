# 📱 Ứng Dụng PWA Điều Tra Hiện Trường (Field Survey PWA)

Ứng dụng web tiến bộ (Progressive Web App - PWA) chuyên dụng dành cho điều tra viên thực địa, hỗ trợ hoạt động hoàn toàn **Offline-First**, tự động đồng bộ dữ liệu lên **Google Sheets** và lưu trữ ảnh chụp hiện trường trên **Google Drive** khi có kết nối mạng internet.

---

## ✨ Tính Năng Nổi Bật

- 🚀 **Offline-First 100%**: Service Worker theo chiến lược Cache-First và IndexedDB lưu an toàn toàn bộ dữ liệu, ảnh và hàng đợi đồng bộ khi mất mạng.
- 📍 **Tự động định vị GPS (Geolocation API)**: Lấy tọa độ Kinh độ, Vĩ độ, độ chính xác (±m) và tạo link xem trực tiếp trên Google Maps.
- 📸 **Chụp ảnh & Nén ảnh tự động**: Tích hợp camera điện thoại, nén ảnh trực tiếp trên trình duyệt bằng Canvas giúp tối ưu dung lượng, tự động đóng dấu ngày giờ xác thực (Watermark) trên ảnh.
- 🔄 **Đồng bộ nền thông minh**: Background Sync tự gửi hàng đợi IndexedDB khi có mạng trở lại; `window.ononline` là phương án dự phòng cho trình duyệt chưa hỗ trợ.
- ☁️ **Lưu trữ ảnh trên Google Drive**: Google Apps Script tự động tải ảnh lên thư mục Drive riêng và chèn link xem ảnh trực tiếp vào cột tương ứng trên Google Sheet.
- 🔔 **Thông báo & Phản hồi thực địa**: Tích hợp Web Notifications API (thông báo push hệ thống), In-app Toast Banner cùng chuông phản hồi Web Audio và rung xúc giác.
- 📊 **Quản lý lịch sử phỏng vấn**: Xem danh sách các phiên điều tra, phân loại trạng thái (🟡 Chờ đồng bộ / 🟢 Đã lên Sheet), xem ảnh phóng to.
- 🌓 **Giao diện Mobile-First cao cấp**: Thiết kế tối ưu cho màn hình cảm ứng, hỗ trợ chế độ Sáng / Tối (Dark/Light mode) chống lóa khi làm việc ngoài trời.

---

## 🛠️ Công Nghệ Sử Dụng

- **Core**: Vite, Vanilla JavaScript (ES Modules), HTML5 Semantic.
- **Styling**: Vanilla CSS (Modern Design System, CSS Variables, Glassmorphism, Micro-animations).
- **Storage**: IndexedDB (Native Promise Wrapper) & Cache API.
- **PWA**: Service Worker (`sw.js`) & Web App Manifest (`manifest.json`).
- **Native Android**: Capacitor 7, Camera plugin và Geolocation plugin.
- **Backend / Cloud Integration**: Google Apps Script (Web App Endpoint) & Google Sheets + Google Drive API.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Cục Bộ

### 1. Yêu cầu môi trường
- [Node.js](https://nodejs.org/) (phiên bản 18+ trở lên)

### 2. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 3. Chạy môi trường phát triển (Dev Server)
```bash
npm run dev
```
Mở trình duyệt truy cập: `http://localhost:5173/`

### 4. Đóng gói bản phát hành (Production Build)
```bash
npm run build
```
Thư mục xuất bản: `dist/`

---

## 📋 Hướng Dẫn Kết Nối Google Sheet & Google Drive

1. Mở một trang tính **Google Sheet mới** trên Google Drive của bạn.
2. Trên thanh menu, chọn: **Tiện ích mở rộng (Extensions)** ➔ **Apps Script**.
3. Xóa toàn bộ code cũ, sao chép toàn bộ nội dung trong file [`google-apps-script/Code.gs`](./google-apps-script/Code.gs) và dán vào. Nhấn **Lưu (Ctrl + S)**.
4. Nhấn nút **Triển khai (Deploy)** ➔ **Triển khai mới (New deployment)**:
   - Chọn loại: **Ứng dụng web (Web app)**.
   - **Thực thi dưới dạng**: Chọn `Tôi (tài khoản email của bạn)`.
   - **Ai có quyền truy cập**: Chọn **Bất kỳ ai (Anyone)** *(Bắt buộc)*.
5. Nhấn **Triển khai**, cấp quyền truy cập tài khoản Google khi được hỏi.
6. Sao chép đường link **URL ứng dụng web** (kết thúc bằng `/exec`).
7. Mở ứng dụng, vào tab **Cài Đặt**, dán link vào ô URL và nhấn **Lưu Cấu Hình** ➔ **Kiểm Tra Kết Nối**.

---

## 🌐 Demo và GitHub Pages

- **Live demo:** [https://quyen-jr.github.io/Field-Survey-pwa/](https://quyen-jr.github.io/Field-Survey-pwa/)
- **Repository:** [https://github.com/quyen-jr/Field-Survey-pwa](https://github.com/quyen-jr/Field-Survey-pwa)

Workflow `.github/workflows/deploy.yml` tự chạy `npm ci` và `npm run build`, sau đó phát hành thư mục `dist` lên GitHub Pages khi nhánh `main` có commit mới.

---

## 🤖 Chạy bằng Capacitor và tạo APK Android

Yêu cầu thêm: Android Studio/Android SDK và JDK 21.

```bash
npm install
npm run cap:sync
npm run android:open
```

Trong Android Studio, chọn **Run** để thử trên máy thật/emulator hoặc **Build > Build APK(s)**. Có thể build debug APK bằng terminal:

```bash
npm run android:build
```

APK nằm tại `android/app/build/outputs/apk/debug/app-debug.apk`. Workflow `.github/workflows/android.yml` cũng tự build và tải APK lên mục **Actions > Artifacts** sau mỗi lần push lên `main`.

Camera và GPS tự dùng Capacitor plugin khi chạy trong Android; bản web vẫn dùng File Input và Geolocation API. Sau khi sửa mã web, luôn chạy `npm run cap:sync` trước khi build native.
