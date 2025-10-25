// Zakuta Bot Dashboard JavaScript
console.log('🚀 Dashboard JavaScript loaded successfully!');
document.title = 'Zakuta Dashboard - JS Loaded';

const socket = io({
    transports: ['websocket', 'polling']
});
console.log('🔌 Socket.IO initialized with transports:', socket.io.engine.transport.name);

// DOM Elements
const terminal = document.getElementById('terminal-content');
const startBotBtn = document.getElementById('start-bot');
const stopBotBtn = document.getElementById('stop-bot');
const restartBotBtn = document.getElementById('restart-bot');
const clearLogsBtn = document.getElementById('clear-logs');
const downloadLogsBtn = document.getElementById('download-logs');
const terminalFullscreenBtn = document.getElementById('terminal-fullscreen');

// Socket.IO event handlers
socket.on('bot-log', (data) => {
    console.log('📝 Received bot log:', data);
    if (data.startsWith('[QR_IMAGE]')) {
        const url = data.replace('[QR_IMAGE]', '');
        appendToTerminal(`<div style="text-align: center; margin: 10px 0;"><img src="${url}" alt="QR Code" style="max-width: 100%; height: auto; border: 2px solid #00ff00; border-radius: 8px;"></div>`);
    } else {
        appendToTerminal(data);
    }
});

socket.on('bot-status', (status) => {
    console.log('📊 Received bot status:', status);
    updateBotStatus(status);
});

socket.on('connect', () => {
    console.log('🔗 Connected to server via', socket.io.engine.transport.name);
    // The server will send initial status, but let's also check manually after a delay
    setTimeout(() => {
        console.log('🔄 Fallback: checking status manually');
        checkBotStatus();
    }, 2000);
});

socket.on('connect_error', (error) => {
    console.error('❌ Socket.IO connection error:', error);
    updateBotStatus('connection-error');
});

socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected from server:', reason);
    updateBotStatus('disconnected');
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded, initializing dashboard...');

    // Add visible indicator that JS loaded
    const indicator = document.createElement('div');
    indicator.id = 'js-indicator';
    indicator.style.cssText = 'position: fixed; top: 10px; right: 10px; background: green; color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px; z-index: 9999;';
    indicator.textContent = 'JS ✓';
    document.body.appendChild(indicator);

    // Check if required elements exist
    const requiredElements = ['terminal-content', 'start-bot', 'stop-bot', 'bot-status'];
    const missingElements = requiredElements.filter(id => !document.getElementById(id));

    if (missingElements.length > 0) {
        console.error('❌ Missing DOM elements:', missingElements);
        showAlert('Page elements not found. Please refresh the page.', 'danger');
        indicator.style.background = 'red';
        indicator.textContent = 'JS Error';
        return;
    }

    console.log('✅ All required DOM elements found');
    // Set initial status
    updateBotStatus('connecting');
    checkBotStatus();
    setupEventListeners();

    // Update indicator
    indicator.textContent = 'JS Ready';
    setTimeout(() => indicator.remove(), 3000);
});

// Event listeners
function setupEventListeners() {
    startBotBtn.addEventListener('click', startBot);
    stopBotBtn.addEventListener('click', stopBot);
    restartBotBtn.addEventListener('click', restartBot);
    clearLogsBtn.addEventListener('click', clearLogs);
    downloadLogsBtn.addEventListener('click', downloadLogs);
    terminalFullscreenBtn.addEventListener('click', toggleTerminalFullscreen);
}

// Bot control functions
async function startBot() {
    // Check current status first
    try {
        const statusResponse = await fetch('/bot/status');
        const statusResult = await statusResponse.json();

        if (statusResult.running) {
            showAlert('Bot is already running!', 'warning');
            return;
        }
    } catch (error) {
        console.error('Failed to check bot status:', error);
    }

    try {
        startBotBtn.disabled = true;
        startBotBtn.innerHTML = '<span class="loading"></span> Starting...';

        const response = await fetch('/bot/start', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showAlert('Bot started successfully!', 'success');
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        showAlert('Failed to start bot: ' + error.message, 'danger');
    } finally {
        startBotBtn.disabled = false;
        startBotBtn.innerHTML = '<i class="fas fa-play"></i> Start Bot';
    }
}

async function stopBot() {
    // Check current status first
    try {
        const statusResponse = await fetch('/bot/status');
        const statusResult = await statusResponse.json();

        if (!statusResult.running) {
            showAlert('Bot is already stopped!', 'warning');
            return;
        }
    } catch (error) {
        console.error('Failed to check bot status:', error);
    }

    try {
        stopBotBtn.disabled = true;
        stopBotBtn.innerHTML = '<span class="loading"></span> Stopping...';

        const response = await fetch('/bot/stop', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showAlert('Bot stopped successfully!', 'success');
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        showAlert('Failed to stop bot: ' + error.message, 'danger');
    } finally {
        stopBotBtn.disabled = false;
        stopBotBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Bot';
    }
}

async function restartBot() {
    try {
        restartBotBtn.disabled = true;
        restartBotBtn.innerHTML = '<span class="loading"></span> Restarting...';

        // First stop the bot
        await fetch('/bot/stop', { method: 'POST' });

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Then start it again
        const response = await fetch('/bot/start', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showAlert('Bot restarted successfully!', 'success');
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        showAlert('Failed to restart bot: ' + error.message, 'danger');
    } finally {
        restartBotBtn.disabled = false;
        restartBotBtn.innerHTML = '<i class="fas fa-redo"></i> Restart Bot';
    }
}

async function checkBotStatus() {
    try {
        console.log('Checking bot status via fetch...');
        const response = await fetch('/bot/status', {
            credentials: 'same-origin'
        });
        console.log('Fetch response status:', response.status);

        if (response.status === 401) {
            console.log('Authentication required, redirecting to login');
            updateBotStatus('auth-required');
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Bot status result:', result);
        updateBotStatus(result.running ? 'running' : 'stopped');

        // Load recent logs
        if (result.logs && result.logs.length > 0) {
            console.log('Loading', result.logs.length, 'logs');
            result.logs.forEach(log => appendToTerminal(log));
        } else {
            console.log('No logs to load');
        }
    } catch (error) {
        console.error('Failed to check bot status:', error);
        updateBotStatus('error');
        showAlert('Failed to check bot status: ' + error.message, 'danger');
    }
}

function updateBotStatus(status) {
    console.log('Updating bot status to:', status);
    const statusElement = document.getElementById('bot-status');
    if (!statusElement) {
        console.error('Bot status element not found!');
        return;
    }

    if (status === 'running') {
        statusElement.innerHTML = '<span class="badge bg-success"><i class="fas fa-circle"></i> Running</span>';
        startBotBtn.disabled = true;
        stopBotBtn.disabled = false;
        restartBotBtn.disabled = false;
    } else if (status === 'stopped') {
        statusElement.innerHTML = '<span class="badge bg-danger"><i class="fas fa-circle"></i> Stopped</span>';
        startBotBtn.disabled = false;
        stopBotBtn.disabled = true;
        restartBotBtn.disabled = true;
    } else if (status === 'connecting') {
        statusElement.innerHTML = '<span class="badge bg-warning"><i class="fas fa-spinner fa-spin"></i> Connecting...</span>';
        startBotBtn.disabled = true;
        stopBotBtn.disabled = true;
        restartBotBtn.disabled = true;
    } else if (status === 'auth-required') {
        statusElement.innerHTML = '<span class="badge bg-warning"><i class="fas fa-lock"></i> Auth Required</span>';
        startBotBtn.disabled = true;
        stopBotBtn.disabled = true;
        restartBotBtn.disabled = true;
    } else if (status === 'error') {
        statusElement.innerHTML = '<span class="badge bg-danger"><i class="fas fa-exclamation-triangle"></i> Error</span>';
        startBotBtn.disabled = true;
        stopBotBtn.disabled = true;
        restartBotBtn.disabled = true;
    } else if (status === 'unknown') {
        statusElement.innerHTML = '<span class="badge bg-secondary"><i class="fas fa-question-circle"></i> Unknown</span>';
        startBotBtn.disabled = true;
        stopBotBtn.disabled = true;
        restartBotBtn.disabled = true;
    } else {
        statusElement.innerHTML = '<span class="badge bg-secondary"><i class="fas fa-circle"></i> ' + status + '</span>';
    }
}

// Terminal functions
function appendToTerminal(text) {
    const line = document.createElement('div');
    line.innerHTML = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function clearLogs() {
    terminal.innerHTML = '';
}

function downloadLogs() {
    const logs = Array.from(terminal.children).map(line => line.textContent).join('\n');
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bot-logs.txt';
    a.click();
    URL.revokeObjectURL(url);
}

function toggleTerminalFullscreen() {
    const terminalElement = document.getElementById('terminal');
    terminalElement.classList.toggle('terminal-fullscreen');
    const icon = terminalFullscreenBtn.querySelector('i');
    if (terminalElement.classList.contains('terminal-fullscreen')) {
        icon.className = 'fas fa-compress';
    } else {
        icon.className = 'fas fa-expand';
    }
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