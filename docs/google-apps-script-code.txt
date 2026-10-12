/**
 * =========================================================================
 * GOOGLE APPS SCRIPT CHO ỨNG DỤNG ĐIỀU TRA HIỆN TRƯỜNG (FIELD SURVEY PWA)
 * =========================================================================
 * Hướng dẫn cài đặt 4 bước:
 * 1. Mở Google Sheet của bạn.
 * 2. Vào thanh menu: [Tiện ích mở rộng] (Extensions) -> [Apps Script].
 * 3. Xóa toàn bộ nội dung cũ trong cửa sổ soạn thảo, dán toàn bộ đoạn mã này vào.
 * 4. Nhấn nút [Triển khai] (Deploy) góc trên bên phải:
 *    - Chọn [Triển khai mới] (New deployment)
 *    - Chọn loại: [Ứng dụng web] (Web app)
 *    - Cấu hình:
 *      + Thực thi dưới dạng: "Tôi" (Execute as: Me)
 *      + Ai có quyền truy cập: "Bất kỳ ai" (Who has access: Anyone)
 *    - Nhấn [Triển khai], cấp quyền truy cập tài khoản Google khi được hỏi.
 *    - Sao chép đường link "URL ứng dụng web" (Web App URL) và dán vào tab "Cài đặt" của PWA!
 * =========================================================================
 */

// Tên thư mục lưu ảnh hiện trường trên Google Drive của bạn
const FOLDER_NAME = "Ảnh Điều Tra Hiện Trường";

// Tiêu đề các cột trong Google Sheet
const HEADERS = [
  "Mã Phiên (ID)",
  "Thời Gian Ghi Nhận",
  "Người Phỏng Vấn",
  "Nội Dung Phỏng Vấn",
  "Vĩ Độ (Latitude)",
  "Kinh Độ (Longitude)",
  "Độ Chính Xác (m)",
  "Link Bản Đồ Google Maps",
  "Link Ảnh Hiện Trường (Google Drive)",
  "Thời Gian Đồng Bộ"
];

/**
 * Xử lý GET request (dùng để test xem Web App có hoạt động không)
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "Google Apps Script Web App cho Field Survey PWA đang hoạt động tốt!"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Xử lý POST request nhận dữ liệu phỏng vấn và ảnh từ PWA
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const rawData = e.postData.contents;
    const data = JSON.parse(rawData);

    // Lấy bảng tính hiện tại
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Kiểm tra nếu sheet còn trống thì tự động thêm dòng Tiêu Đề
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      // Định dạng dòng tiêu đề: in đậm, nền xanh, chữ trắng
      const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#0284c7");
      headerRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }

    // Idempotency: a retry from the offline queue must not create duplicate rows/photos.
    if (data.id && sheet.getLastRow() > 1) {
      const existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
        .createTextFinder(String(data.id))
        .matchEntireCell(true)
        .findNext();
      if (existing) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          message: "Bản ghi đã tồn tại, không tạo bản sao.",
          driveUrl: sheet.getRange(existing.getRow(), 9).getValue(),
          rowNumber: existing.getRow(),
          duplicate: true
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    let driveFileUrl = "";

    // Xử lý lưu ảnh vào Google Drive (nếu có ảnh đính kèm)
    if (data.photoBase64) {
      try {
        const folder = getOrCreateFolder(FOLDER_NAME);
        
        // Tách header base64 (ví dụ: data:image/jpeg;base64,...)
        let base64String = data.photoBase64;
        let mimeType = "image/jpeg";

        if (base64String.indexOf("data:") === 0) {
          const parts = base64String.split(",");
          const mimeMatch = parts[0].match(/:(.*?);/);
          if (mimeMatch) mimeType = mimeMatch[1];
          base64String = parts[1];
        }

        const decodedBytes = Utilities.base64Decode(base64String);
        const fileName = data.photoName || `FieldPhoto_${data.id || Date.now()}.jpg`;
        const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

        // Lưu file vào thư mục Google Drive
        const file = folder.createFile(blob);
        file.setDescription(`Ảnh điều tra hiện trường - Người phỏng vấn: ${data.interviewer || 'N/A'} - Thời gian: ${data.timeFormatted || new Date().toLocaleString()}`);
        
        // Cấp quyền xem công khai qua link để người xem dễ mở
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        driveFileUrl = file.getUrl();
      } catch (imgErr) {
        driveFileUrl = "Lỗi lưu ảnh: " + imgErr.toString();
      }
    }

    // Ghi dữ liệu vào dòng mới của Google Sheet
    const syncTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    
    const row = [
      data.id || Utilities.getUuid(),
      data.timeFormatted || syncTime,
      data.interviewer || "",
      data.content || "",
      data.latitude || "",
      data.longitude || "",
      data.accuracy || "",
      data.mapUrl || "",
      driveFileUrl,
      syncTime
    ];

    sheet.appendRow(row);

    // Trả về kết quả JSON thành công
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Ghi nhận dữ liệu thành công!",
      driveUrl: driveFileUrl,
      rowNumber: sheet.getLastRow()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Trả về lỗi nếu có
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Hàm phụ trợ: Tìm hoặc tạo mới thư mục trên Google Drive
 */
function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}
