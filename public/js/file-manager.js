// Zakuta Bot File Manager JavaScript

const socket = io();
let editor = null;
let currentPath = '.';
let currentFile = null;

// Initialize Monaco Editor
let monacoLoaded = false;
let monacoLoadAttempts = 0;
const maxMonacoLoadAttempts = 10;

function loadMonacoEditor() {
    if (monacoLoaded) return;

    monacoLoadAttempts++;
    console.log(`Loading Monaco Editor (attempt ${monacoLoadAttempts})...`);

    require.config({
        paths: {
            vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs'
        }
    });

    require(['vs/editor/editor.main'], function() {
        monacoLoaded = true;
        console.log('Monaco Editor loaded successfully');
        updateEditorStatus('success', 'Editor Ready');
    }, function(err) {
        console.error('Failed to load Monaco Editor:', err);
        if (monacoLoadAttempts < maxMonacoLoadAttempts) {
            setTimeout(loadMonacoEditor, 1000);
        } else {
            console.error('Max Monaco load attempts reached - falling back to basic editor');
            monacoLoaded = 'fallback'; // Use fallback mode
            updateEditorStatus('warning', 'Basic Editor');
            showAlert('Advanced code editor failed to load. Using basic editor instead.', 'warning');
        }
    });
}

// Start loading Monaco
loadMonacoEditor();

// DOM Elements
const filesTableBody = document.getElementById('files-table-body');
const loadingIndicator = document.getElementById('loading-indicator');
const emptyState = document.getElementById('empty-state');
const currentPathElement = document.getElementById('current-path');
const homeLink = document.getElementById('home-link');
const refreshBtn = document.getElementById('refresh-files');
const newFileBtn = document.getElementById('new-file');
const newFolderBtn = document.getElementById('new-folder');
const uploadFileBtn = document.getElementById('upload-file');
const fileInput = document.getElementById('file-input');
const searchInput = document.getElementById('search-files');
const contextMenu = document.getElementById('context-menu');
const editorModal = new bootstrap.Modal(document.getElementById('editorModal'));
const renameModal = new bootstrap.Modal(document.getElementById('renameModal'));

let selectedFile = null;

// Socket.IO event handlers
socket.on('file-changed', (filePath) => {
    console.log('File changed:', filePath);
    loadFiles();
});

socket.on('file-added', (filePath) => {
    console.log('File added:', filePath);
    loadFiles();
});

socket.on('file-removed', (filePath) => {
    console.log('File removed:', filePath);
    loadFiles();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    setupEventListeners();

    // Show loading status initially
    updateEditorStatus('secondary', 'Editor Loading...');
});

// Event listeners
function setupEventListeners() {
    homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        currentPath = '.';
        loadFiles();
    });

    refreshBtn.addEventListener('click', loadFiles);
    newFileBtn.addEventListener('click', () => showNewItemModal('file'));
    newFolderBtn.addEventListener('click', () => showNewItemModal('directory'));
    uploadFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', uploadFiles);
    searchInput.addEventListener('input', filterFiles);

    // Context menu events
    document.getElementById('context-edit').addEventListener('click', () => {
        if (selectedFile) editFile(selectedFile.path);
        hideContextMenu();
    });

    document.getElementById('context-download').addEventListener('click', () => {
        if (selectedFile) downloadFile(selectedFile.path);
        hideContextMenu();
    });

    document.getElementById('context-rename').addEventListener('click', () => {
        if (selectedFile) showRenameModal(selectedFile);
        hideContextMenu();
    });

    document.getElementById('context-delete').addEventListener('click', () => {
        if (selectedFile) deleteFile(selectedFile.path);
        hideContextMenu();
    });

    // Modal events
    document.getElementById('create-item').addEventListener('click', createItem);
    document.getElementById('rename-item').addEventListener('click', renameItem);
    document.getElementById('save-editor-file').addEventListener('click', saveEditorFile);

    // Hide context menu on click outside
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
}

// File management functions
async function loadFiles() {
    try {
        loadingIndicator.style.display = 'block';
        emptyState.style.display = 'none';

        const response = await fetch(`/files?path=${encodeURIComponent(currentPath)}`);
        const result = await response.json();

        updateBreadcrumb(result.path);
        renderFiles(result.items);
    } catch (error) {
        console.error('Failed to load files:', error);
        showAlert('Failed to load files: ' + error.message, 'danger');
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function updateBreadcrumb(path) {
    const parts = path === '.' ? [] : path.split('/');
    currentPathElement.textContent = parts.length > 0 ? parts[parts.length - 1] : '/';

    // Update home link
    homeLink.href = '#';
    homeLink.onclick = (e) => {
        e.preventDefault();
        currentPath = '.';
        loadFiles();
    };
}

function renderFiles(items) {
    filesTableBody.innerHTML = '';

    if (items.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    items.forEach(item => {
        const row = createFileRow(item);
        filesTableBody.appendChild(row);
    });
}

function createFileRow(item) {
    const row = document.createElement('tr');
    row.className = 'file-row';

    const icon = item.isDirectory ? 'fas fa-folder text-warning' : getFileIcon(item.name);
    const type = item.isDirectory ? 'Directory' : 'File';
    const size = item.isDirectory ? '-' : formatFileSize(item.size);
    const modified = new Date(item.modified).toLocaleString();

    row.innerHTML = `
        <td>
            <i class="${icon}"></i>
        </td>
        <td>
            <div class="d-flex align-items-center">
                <span class="file-name ${item.isDirectory ? 'fw-bold' : ''}" style="cursor: pointer;">
                    ${item.name}
                </span>
            </div>
        </td>
        <td>${type}</td>
        <td>${size}</td>
        <td>${modified}</td>
        <td>
            <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary" type="button" onclick="showContextMenu(event, '${item.path}', ${item.isDirectory})">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        </td>
    `;

    // Add click handlers
    const fileNameElement = row.querySelector('.file-name');
    if (item.isDirectory) {
        fileNameElement.addEventListener('click', () => {
            currentPath = item.path;
            loadFiles();
        });
    } else {
        fileNameElement.addEventListener('click', () => editFile(item.path));
    }

    return row;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'js': 'fab fa-js text-warning',
        'json': 'fas fa-code text-warning',
        'html': 'fab fa-html5 text-orange',
        'css': 'fab fa-css3-alt text-blue',
        'py': 'fab fa-python text-green',
        'md': 'fab fa-markdown text-blue',
        'txt': 'fas fa-file-alt text-muted',
        'jpg': 'fas fa-image text-success',
        'png': 'fas fa-image text-success',
        'gif': 'fas fa-image text-success',
        'zip': 'fas fa-archive text-muted',
        'pdf': 'fas fa-file-pdf text-danger'
    };
    return iconMap[ext] || 'fas fa-file text-muted';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Context menu functions
function showContextMenu(event, filePath, isDirectory) {
    event.stopPropagation();
    selectedFile = { path: filePath, isDirectory };

    const rect = event.target.getBoundingClientRect();
    contextMenu.style.display = 'block';
    contextMenu.style.left = rect.left + 'px';
    contextMenu.style.top = rect.bottom + 'px';

    // Hide download option for directories
    document.getElementById('context-download').style.display = isDirectory ? 'none' : 'block';
    document.querySelector('.dropdown-divider').style.display = isDirectory ? 'none' : 'block';
}

function hideContextMenu() {
    contextMenu.style.display = 'none';
    selectedFile = null;
}

// File operations
async function editFile(filePath) {
    console.log('editFile called, monacoLoaded:', monacoLoaded);
    if (!monacoLoaded) {
        showAlert('Code editor is still loading. Please wait a moment and try again.', 'warning');
        return;
    }

    try {
        // Show loading state
        showAlert('Loading file...', 'info');

        const response = await fetch(`/file?path=${encodeURIComponent(filePath)}`);
        const result = await response.json();

        currentFile = filePath;
        document.getElementById('editor-modal-title').textContent = `Editing: ${filePath}`;

        // Clear any existing content
        const editorContainer = document.getElementById('editor-container');
        while (editorContainer.firstChild) {
            editorContainer.removeChild(editorContainer.firstChild);
        }

        if (monacoLoaded === 'fallback') {
            // Use basic textarea fallback
            console.log('Using fallback textarea editor');
            editorContainer.innerHTML = `
                <textarea id="basic-editor" class="form-control bg-dark text-light" style="height: 100%; width: 100%; font-family: 'Courier New', monospace; font-size: 14px; resize: none; border: none; border-radius: 0;">${result.content}</textarea>
            `;
        } else {
            // Use Monaco editor
            console.log('Using Monaco editor, editor exists:', !!editor);
            if (!editor) {
                console.log('Creating new Monaco editor');
                // Ensure container has proper dimensions
                editorContainer.style.width = '100%';
                editorContainer.style.height = '100%';

                editor = monaco.editor.create(editorContainer, {
                    value: result.content,
                    language: getLanguageFromPath(filePath),
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 14,
                    scrollBeyondLastLine: false,
                    wordWrap: 'on'
                });
                console.log('Monaco editor created');
            } else {
                console.log('Updating existing Monaco editor');
                editor.setValue(result.content);
                const model = editor.getModel();
                monaco.editor.setModelLanguage(model, getLanguageFromPath(filePath));
            }

            // Force layout update
            setTimeout(() => {
                if (editor) {
                    console.log('Forcing Monaco editor layout');
                    editor.layout();
                }
            }, 100);
        }

        // Show modal after content is loaded
        editorModal.show();

    } catch (error) {
        showAlert('Failed to open file: ' + error.message, 'danger');
    }
}

function getLanguageFromPath(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const languageMap = {
        'js': 'javascript',
        'json': 'json',
        'html': 'html',
        'css': 'css',
        'py': 'python',
        'md': 'markdown',
        'txt': 'plaintext',
        'sh': 'shell',
        'yml': 'yaml',
        'yaml': 'yaml'
    };
    return languageMap[ext] || 'plaintext';
}

async function saveEditorFile() {
    if (!currentFile) {
        showAlert('No file is currently open.', 'warning');
        return;
    }

    try {
        let content;
        if (monacoLoaded === 'fallback') {
            // Get content from textarea
            const textarea = document.getElementById('basic-editor');
            if (!textarea) {
                showAlert('Editor not found.', 'warning');
                return;
            }
            content = textarea.value;
        } else if (monacoLoaded && editor) {
            // Get content from Monaco editor
            content = editor.getValue();
        } else {
            showAlert('Code editor is not ready.', 'warning');
            return;
        }

        const response = await fetch('/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentFile, content })
        });
        const result = await response.json();

        if (result.success) {
            showAlert('File saved successfully!', 'success');
            editorModal.hide();
            loadFiles();
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        showAlert('Failed to save file: ' + error.message, 'danger');
    }
}

async function downloadFile(filePath) {
    try {
        const response = await fetch(`/file?path=${encodeURIComponent(filePath)}`);
        const result = await response.json();

        const blob = new Blob([result.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filePath.split('/').pop();
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        showAlert('Failed to download file: ' + error.message, 'danger');
    }
}

function showRenameModal(file) {
    document.getElementById('rename-name').value = file.path.split('/').pop();
    renameModal.show();
}

async function renameItem() {
    const newName = document.getElementById('rename-name').value;
    if (!newName || !selectedFile) return;

    const oldPath = selectedFile.path;
    const newPath = oldPath.replace(/[^/]+$/, newName);

    try {
        // For now, we'll implement this as copy + delete
        // In a real implementation, you'd want a proper rename endpoint
        const response = await fetch(`/file?path=${encodeURIComponent(oldPath)}`);
        const result = await response.json();

        if (result.content !== undefined) {
            // It's a file, create new file with content
            const createResponse = await fetch('/create-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: newPath, type: 'file' })
            });

            if (createResponse.ok) {
                // Save content to new file
                await fetch('/file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: newPath, content: result.content })
                });

                // Delete old file
                await fetch(`/file?path=${encodeURIComponent(oldPath)}`, {
                    method: 'DELETE'
                });
            }
        }

        renameModal.hide();
        loadFiles();
        showAlert('File renamed successfully!', 'success');
    } catch (error) {
        showAlert('Failed to rename file: ' + error.message, 'danger');
    }
}

async function deleteFile(filePath) {
    if (!confirm(`Are you sure you want to delete "${filePath.split('/').pop()}"?`)) return;

    try {
        const response = await fetch(`/file?path=${encodeURIComponent(filePath)}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            loadFiles();
            showAlert('File deleted successfully!', 'success');
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        showAlert('Failed to delete file: ' + error.message, 'danger');
    }
}

function showNewItemModal(type) {
    document.getElementById('item-type').value = type;
    document.getElementById('item-name').value = '';
    new bootstrap.Modal(document.getElementById('newFileModal')).show();
}

async function createItem() {
    const name = document.getElementById('item-name').value;
    const type = document.getElementById('item-type').value;

    if (!name) {
        showAlert('Please enter a name', 'warning');
        return;
    }

    const itemPath = `${currentPath}/${name}`;

    try {
        const response = await fetch('/create-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: itemPath, type })
        });
        const result = await response.json();

        if (result.success) {
            bootstrap.Modal.getInstance(document.getElementById('newFileModal')).hide();
            loadFiles();
            showAlert(`${type === 'directory' ? 'Folder' : 'File'} created successfully!`, 'success');
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        showAlert('Failed to create item: ' + error.message, 'danger');
    }
}

async function uploadFiles() {
    const files = fileInput.files;
    if (files.length === 0) return;

    for (let file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentPath);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.success) {
                showAlert(`File "${result.filename}" uploaded successfully!`, 'success');
            } else {
                showAlert(result.error, 'danger');
            }
        } catch (error) {
            showAlert('Failed to upload file: ' + error.message, 'danger');
        }
    }

    loadFiles();
    fileInput.value = '';
}

function filterFiles() {
    const searchTerm = searchInput.value.toLowerCase();
    const rows = filesTableBody.querySelectorAll('.file-row');

    rows.forEach(row => {
        const fileName = row.querySelector('.file-name').textContent.toLowerCase();
        if (fileName.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Utility functions
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Utility functions
function updateEditorStatus(type, text) {
    const statusElement = document.getElementById('editor-status');
    if (statusElement) {
        let badgeClass = 'bg-secondary';
        let iconClass = 'fas fa-code';

        switch (type) {
            case 'success':
                badgeClass = 'bg-success';
                iconClass = 'fas fa-check-circle';
                break;
            case 'warning':
                badgeClass = 'bg-warning';
                iconClass = 'fas fa-exclamation-triangle';
                break;
            case 'danger':
                badgeClass = 'bg-danger';
                iconClass = 'fas fa-times-circle';
                break;
        }

        statusElement.innerHTML = `<span class="badge ${badgeClass}"><i class="${iconClass}"></i> ${text}</span>`;
    }
}

// Make functions global for onclick handlers
window.showContextMenu = showContextMenu;