const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tạo thư mục uploads nếu chưa có
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

// Cấu hình multer để lưu file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    // Tạo tên file duy nhất với timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Loại bỏ các ký tự không hợp lệ từ tên file gốc
    const safeOriginalname = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${safeOriginalname}`)
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // Giới hạn 100MB
  }
});

// Lưu trữ thông tin file và mã
const fileDatabase = new Map();

// Route upload file
app.post('/api/files/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được upload' });
    }

    // Tạo mã ngẫu nhiên 6 số và đảm bảo không trùng
    let code;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (fileDatabase.has(code));
    
    // Lưu thông tin file
    fileDatabase.set(code, {
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploadDate: new Date(),
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    console.log(`File uploaded: ${req.file.filename} with code: ${code}`);

    res.json({ 
      code: code,
      message: 'Upload thành công'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Lỗi khi upload file' });
  }
});

// Route kiểm tra mã
app.get('/api/files/check/:code', (req, res) => {
  try {
    const code = req.params.code;
    const fileInfo = fileDatabase.get(code);
    
    if (!fileInfo) {
      return res.status(404).json({ message: 'Mã không hợp lệ hoặc đã hết hạn' });
    }

    res.json({ 
      valid: true,
      filename: fileInfo.originalName,
      size: fileInfo.size
    });
  } catch (error) {
    console.error('Check code error:', error);
    res.status(500).json({ message: 'Lỗi khi kiểm tra mã' });
  }
});

// Route download file
app.get('/api/files/download/:code', async (req, res) => {
  try {
    const code = req.params.code;
    
    // Kiểm tra mã có tồn tại
    const fileInfo = fileDatabase.get(code);
    if (!fileInfo) {
      return res.status(404).json({ message: 'Mã không hợp lệ hoặc đã hết hạn' });
    }

    const filePath = path.join(uploadsDir, fileInfo.filename);

    // Kiểm tra file có tồn tại
    if (!fs.existsSync(filePath)) {
      fileDatabase.delete(code);
      return res.status(404).json({ message: 'File không tồn tại hoặc đã bị xóa' });
    }

    console.log(`Downloading file: ${fileInfo.originalName} with code: ${code}`);

    // Set headers cho download với tên file gốc
    // Encode tên file để hỗ trợ Unicode và ký tự đặc biệt
    const encodedFilename = encodeURIComponent(fileInfo.originalName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', fileInfo.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', fileInfo.size);

    // Stream file về client
    const fileStream = fs.createReadStream(filePath);
    
    // Xử lý khi stream hoàn thành
    fileStream.on('end', async () => {
      try {
        // Xóa file và mã sau khi tải xong
        await fs.promises.unlink(filePath);
        fileDatabase.delete(code);
        console.log(`File and code deleted after successful download: ${code}`);
      } catch (err) {
        console.error('Error cleaning up after download:', err);
      }
    });

    fileStream.pipe(res);

    // Xử lý lỗi stream
    fileStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Lỗi khi đọc file' });
      }
    });

    // Xử lý khi client hủy kết nối
    req.on('close', () => {
      fileStream.destroy();
    });
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Lỗi khi tải file' });
    }
  }
});

// Dọn dẹp file cũ (chạy mỗi giờ)
setInterval(() => {
  const now = new Date();
  for (const [code, fileInfo] of fileDatabase.entries()) {
    // Xóa các file cũ hơn 24 giờ
    if (now.getTime() - fileInfo.uploadDate.getTime() > 24 * 60 * 60 * 1000) {
      const filePath = path.join(uploadsDir, fileInfo.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old file: ${fileInfo.filename}`);
      }
      fileDatabase.delete(code);
    }
  }
}, 60 * 60 * 1000);

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
