import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get music directory path
const getMusicDir = () => {
  // Use MUSIC_PATH from environment or default to backend/music/
  return process.env.MUSIC_PATH || path.join(__dirname, '..', '..', 'music');
};

// Ensure path is within music directory (security check)
const isPathSafe = (requestedPath) => {
  const musicDir = getMusicDir();
  const resolvedPath = path.resolve(musicDir, requestedPath);
  return resolvedPath.startsWith(musicDir);
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = req.body.uploadPath || '';
    const musicDir = getMusicDir();
    const fullPath = path.join(musicDir, uploadPath);
    
    if (!isPathSafe(uploadPath)) {
      return cb(new Error('Invalid path'));
    }
    
    // Ensure directory exists
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    // Use original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// List files and folders in a directory
router.get('/list', (req, res) => {
  try {
    const requestedPath = req.query.path || '';
    
    if (!isPathSafe(requestedPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const musicDir = getMusicDir();
    const fullPath = path.join(musicDir, requestedPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    
    const fileList = items.map(item => {
      const itemPath = path.join(fullPath, item.name);
      const stats = fs.statSync(itemPath);
      
      return {
        name: item.name,
        type: item.isDirectory() ? 'folder' : 'file',
        size: stats.size,
        modified: stats.mtime,
        path: path.join(requestedPath, item.name)
      };
    });
    
    // Sort: folders first, then files, alphabetically
    fileList.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    res.json({
      currentPath: requestedPath,
      items: fileList
    });
    
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Create a new folder
router.post('/create-folder', (req, res) => {
  try {
    const { path: requestedPath, name } = req.body;
    
    if (!name || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid folder name' });
    }
    
    if (!isPathSafe(requestedPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const musicDir = getMusicDir();
    const fullPath = path.join(musicDir, requestedPath, name);
    
    if (fs.existsSync(fullPath)) {
      return res.status(400).json({ error: 'Folder already exists' });
    }
    
    fs.mkdirSync(fullPath, { recursive: true });
    
    res.json({ 
      success: true, 
      message: 'Folder created successfully',
      path: path.join(requestedPath, name)
    });
    
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Upload file
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({ 
      success: true, 
      message: 'File uploaded successfully',
      filename: req.file.filename,
      size: req.file.size
    });
    
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Rename file or folder
router.post('/rename', (req, res) => {
  try {
    const { path: itemPath, newName } = req.body;
    
    if (!newName || newName.includes('/') || newName.includes('\\')) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    
    if (!isPathSafe(itemPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const musicDir = getMusicDir();
    const oldPath = path.join(musicDir, itemPath);
    const newPath = path.join(path.dirname(oldPath), newName);
    
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (fs.existsSync(newPath)) {
      return res.status(400).json({ error: 'Name already exists' });
    }
    
    fs.renameSync(oldPath, newPath);
    
    res.json({ 
      success: true, 
      message: 'Renamed successfully',
      newPath: path.join(path.dirname(itemPath), newName)
    });
    
  } catch (error) {
    console.error('Error renaming:', error);
    res.status(500).json({ error: 'Failed to rename' });
  }
});

// Delete file or folder
router.post('/delete', (req, res) => {
  try {
    const { path: itemPath } = req.body;
    
    if (!isPathSafe(itemPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const musicDir = getMusicDir();
    const fullPath = path.join(musicDir, itemPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    
    res.json({ 
      success: true, 
      message: 'Deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;

