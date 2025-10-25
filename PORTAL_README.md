# Zakuta Bot Web Portal

A beautiful web-based control panel for managing your WhatsApp bot remotely.

## Features

- **Real-time Terminal**: View bot logs in real-time
- **Bot Control**: Start/stop/restart the bot with one click
- **File Manager**: Dedicated page with advanced file operations
- **Code Editor**: Syntax-highlighted file editing with Monaco Editor
- **Context Menus**: Three-dot menus for file operations (edit, delete, rename, download)
- **File Operations**: Upload, create, delete, rename files and folders
- **Responsive UI**: Modern dark theme that works on all devices
- **Authentication**: Basic auth protection
- **Navigation**: Clean navbar with Dashboard and File Manager tabs

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the portal:
```bash
npm run portal
```

Or run directly:
```bash
node portal.js
```

## Usage

1. Open your browser and go to `http://localhost:3000` (or your configured port)
2. Login with:
   - Username: `admin`
   - Password: `zakuta2024`

## Configuration

### Port Configuration
Set the port using environment variable:
```bash
PORT=8080 npm run portal
```

### Authentication
Change credentials in `portal.js`:
```javascript
if (!credentials || credentials.name !== 'your_username' || credentials.pass !== 'your_password') {
```

## Features Overview

### Dashboard
- **Terminal**: Real-time streaming of bot logs with fullscreen mode
- **Bot Control**: Start/Stop/Restart buttons with status indicators
- **Log Management**: Clear and download logs functionality

### File Manager (Separate Page)
- **Table View**: Clean table layout with file details (name, type, size, modified date)
- **Breadcrumb Navigation**: Easy navigation through directory structure
- **Three-Dot Menus**: Context menus for each file/folder with options:
  - Edit (opens in Monaco editor)
  - Download
  - Rename
  - Delete
- **Toolbar**: Quick actions for refresh, new file/folder, upload
- **Search**: Filter files by name
- **File Icons**: Visual indicators for different file types

### Code Editor
- **Monaco Editor**: Professional code editing experience
- **Syntax Highlighting**: Support for JS, JSON, HTML, CSS, Python, Markdown, etc.
- **Modal Interface**: Clean modal popup for editing files
- **Save Functionality**: Direct save to server

## Security Notes

- Change default credentials before production use
- The portal provides full file system access - use carefully
- Consider adding HTTPS in production
- Limit access to trusted networks

## Port Forwarding

To make the portal accessible remotely:

1. **Local Tunnel** (recommended for testing):
```bash
npm install -g localtunnel
lt --port 3000
```

2. **Ngrok**:
```bash
npm install -g ngrok
ngrok http 3000
```

3. **SSH Tunneling**:
```bash
ssh -R 3000:localhost:3000 your-server.com
```

4. **Cloud Deployment**: Deploy to services like Heroku, Railway, or Vercel

## Troubleshooting

### Port Already in Use
Change the port:
```bash
PORT=3001 npm run portal
```

### Authentication Issues
Check that you're using the correct credentials and that the browser is prompting for authentication.

### File Operations Fail
Ensure the bot has proper file permissions in the directory.

### Bot Won't Start
Check that `index.js` exists and is executable. Check terminal logs for error messages.

## Development

The portal consists of:
- `portal.js` - Main server file
- `views/index.ejs` - Dashboard template
- `views/file-manager.ejs` - File manager template
- `public/css/style.css` - Styles
- `public/js/app.js` - Dashboard JavaScript
- `public/js/file-manager.js` - File manager JavaScript

## API Endpoints

- `GET /` - Main dashboard
- `GET /files` - List directory contents
- `GET /file` - Get file contents
- `POST /file` - Save file contents
- `DELETE /file` - Delete file
- `POST /upload` - Upload files
- `POST /create-file` - Create new file/folder
- `POST /bot/start` - Start bot
- `POST /bot/stop` - Stop bot
- `GET /bot/status` - Get bot status

## License

Same as the main bot project.