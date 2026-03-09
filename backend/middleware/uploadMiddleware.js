const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PROVIDER_WORKS_DIR = path.join(__dirname, '..', 'uploads', 'provider-works');
const CHAT_ATTACHMENTS_DIR = path.join(__dirname, '..', 'uploads', 'chat-attachments');

if (!fs.existsSync(PROVIDER_WORKS_DIR)) {
  fs.mkdirSync(PROVIDER_WORKS_DIR, { recursive: true });
}
if (!fs.existsSync(CHAT_ATTACHMENTS_DIR)) {
  fs.mkdirSync(CHAT_ATTACHMENTS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, PROVIDER_WORKS_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '');
    const safeExt = ext && ext.length <= 10 ? ext : '';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${safeExt}`);
  }
});

function fileFilter(req, file, cb) {
  const type = String(file.mimetype || '').toLowerCase();
  if (type.startsWith('image/') || type.startsWith('video/')) {
    cb(null, true);
    return;
  }
  cb(new Error('Only image and video files are allowed.'), false);
}

const uploadProviderWorkMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const chatStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, CHAT_ATTACHMENTS_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '');
    const safeExt = ext && ext.length <= 10 ? ext : '';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${safeExt}`);
  }
});

function chatFileFilter(req, file, cb) {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed'
  ];
  const type = String(file.mimetype || '').toLowerCase();
  if (type.startsWith('image/') || allowed.includes(type)) {
    cb(null, true);
    return;
  }
  cb(new Error('Only images and document files are allowed.'), false);
}

const uploadChatAttachment = multer({
  storage: chatStorage,
  fileFilter: chatFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

module.exports = {
  uploadProviderWorkMedia,
  uploadChatAttachment
};
