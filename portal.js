import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import basicAuth from 'basic-auth';
import multer from 'multer';
import chokidar from 'chokidar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Configuration
const PORT = process.env.PORT || 3000;
const BOT_PROCESS = null;
let botLogs = [];

// Basic Authentication
const auth = (req, res, next) => {
  const credentials = basicAuth(req);
  if (!credentials || credentials.name !== 'admin' || credentials.pass !== 'zakuta2024') {
    res.set('WWW-Authenticate', 'Basic realm="Zakuta Bot Portal"');
    return res.status(401).send('Authentication required');
  }
  next();
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = req.body.path || '.';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// Routes
app.get('/', auth, (req, res) => {
  res.render('index', {
    title: 'Zakuta Bot Control Panel',
    port: PORT
  });
});

app.get('/file-manager', auth, (req, res) => {
  res.render('file-manager', {
    title: 'File Manager - Zakuta Bot',
    port: PORT
  });
});

app.get('/files', auth, (req, res) => {
  const dirPath = req.query.path || '.';
  try {
    const items = fs.readdirSync(dirPath).map(item => {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      return {
        name: item,
        path: fullPath,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modified: stats.mtime
      };
    });
    res.json({ path: dirPath, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/file', auth, (req, res) => {
  const filePath = req.query.path;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/file', auth, (req, res) => {
  const { path: filePath, content } = req.body;
  try {
    fs.writeFileSync(filePath, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/file', auth, (req, res) => {
  const filePath = req.query.path;
  try {
    if (fs.statSync(filePath).isDirectory()) {
      fs.rmdirSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/upload', auth, upload.single('file'), (req, res) => {
  res.json({ success: true, filename: req.file.filename });
});

app.post('/create-file', auth, (req, res) => {
  const { path: filePath, type } = req.body;
  try {
    if (type === 'directory') {
      fs.mkdirSync(filePath);
    } else {
      fs.writeFileSync(filePath, '');
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bot process management
let botProcess = null;

app.post('/bot/start', auth, (req, res) => {
  if (botProcess) {
    return res.status(400).json({ error: 'Bot is already running' });
  }

  botProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  botProcess.stdout.on('data', (data) => {
    const log = data.toString();
    botLogs.push(log);
    if (botLogs.length > 1000) botLogs.shift(); // Keep last 1000 logs
    io.emit('bot-log', log);
  });

  botProcess.stderr.on('data', (data) => {
    const log = data.toString();
    botLogs.push(`[ERROR] ${log}`);
    if (botLogs.length > 1000) botLogs.shift();
    io.emit('bot-log', log);
  });

  botProcess.on('close', (code) => {
    const log = `Bot process exited with code ${code}`;
    botLogs.push(log);
    io.emit('bot-log', log);
    botProcess = null;
    io.emit('bot-status', 'stopped');
  });

  io.emit('bot-status', 'running');
  res.json({ success: true });
});

app.post('/bot/stop', auth, (req, res) => {
  if (!botProcess) {
    return res.status(400).json({ error: 'Bot is not running' });
  }

  botProcess.kill('SIGTERM');
  botProcess = null; // Clear reference immediately
  io.emit('bot-status', 'stopped');

  setTimeout(() => {
    // Force kill if still running
    if (botProcess) {
      botProcess.kill('SIGKILL');
    }
  }, 5000);

  res.json({ success: true });
});

app.get('/bot/status', auth, (req, res) => {
  res.json({
    running: !!botProcess,
    logs: botLogs.slice(-100) // Last 100 logs
  });
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected to portal');

  // Send current bot status to new client
  const currentStatus = botProcess ? 'running' : 'stopped';
  console.log('Sending initial bot status:', currentStatus);
  socket.emit('bot-status', currentStatus);

  // Send recent logs to new client
  const recentLogs = botLogs.slice(-50); // Last 50 logs
  console.log('Sending', recentLogs.length, 'recent logs');
  recentLogs.forEach(log => {
    socket.emit('bot-log', log);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected from portal');
  });
});

// File watcher for real-time updates
const watcher = chokidar.watch('.', {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true
});

watcher.on('change', (filePath) => {
  io.emit('file-changed', filePath);
});

watcher.on('add', (filePath) => {
  io.emit('file-added', filePath);
});

watcher.on('unlink', (filePath) => {
  io.emit('file-removed', filePath);
});

// Start server
server.listen(PORT, () => {
  console.log(`Zakuta Bot Portal running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
  console.log('Username: admin');
  console.log('Password: zakuta2024');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down portal...');
  if (botProcess) {
    botProcess.kill('SIGTERM');
  }
  watcher.close();
  server.close();
  process.exit(0);
});
