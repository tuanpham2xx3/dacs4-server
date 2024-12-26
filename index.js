const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Tạo thư mục uploads nếu chưa tồn tại
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Cấu hình multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// Lưu trữ mã chia sẻ và thông tin file
const shareCodeMap = new Map();

// API endpoints
app.post('/api/files/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy file' });
    }

    const code = nanoid(6);
    shareCodeMap.set(code, {
      filename: req.file.filename,
      originalName: req.file.originalname
    });

    res.json({ code });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Lỗi khi tải file lên' });
  }
});

app.get('/api/files/check/:code', (req, res) => {
  const { code } = req.params;
  const fileInfo = shareCodeMap.get(code);

  if (!fileInfo) {
    return res.status(404).json({ error: 'Không tìm thấy file' });
  }

  res.json({ filename: fileInfo.originalName });
});

app.get('/api/files/download/:code', (req, res) => {
  const { code } = req.params;
  const fileInfo = shareCodeMap.get(code);

  if (!fileInfo) {
    return res.status(404).json({ error: 'Không tìm thấy file' });
  }

  const filePath = path.join(uploadsDir, fileInfo.filename);

  // Gửi file
  res.download(filePath, fileInfo.originalName, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Lỗi khi tải file xuống' });
      }
      return;
    }

    // Xóa file và mã chia sẻ sau khi tải xuống thành công
    shareCodeMap.delete(code);
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
      }
    });
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server đang chạy tại port ${port}`);
});
