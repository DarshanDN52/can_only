
const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const app = express();
const port = 5000;
const pythonApiUrl = 'http://localhost:5001/api';
const dataFilePath = path.join(__dirname, 'data.json');

// Disable caching for development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- API Endpoints (Proxy to Python Server) ---

// Helper function to proxy requests and handle errors
async function proxyRequest(req, res, method, endpoint, data = null, commandType = null) {
    try {
        const response = await axios({
            method: method,
            url: `${pythonApiUrl}${endpoint}`,
            data: data
        });
        
        if (commandType) {
            const payload = response.data;
            res.status(response.status).json({
                command: commandType,
                payload: {
                    status: payload.success ? 'ok' : 'error',
                    data: payload.message || payload.error || '',
                    packet_status: payload.success ? 'success' : 'failed'
                }
            });
        } else {
            res.status(response.status).json(response.data);
        }
    } catch (error) {
        const errorCommand = commandType || 'ERROR';
        if (error.response) {
            res.status(error.response.status).json({
                command: errorCommand,
                payload: {
                    status: 'error',
                    data: error.response.data.error || 'Request failed',
                    packet_status: 'failed'
                }
            });
        } else if (error.request) {
            res.status(503).json({
                command: errorCommand,
                payload: {
                    status: 'error',
                    data: 'The Python API server is not running or not reachable.',
                    packet_status: 'failed'
                }
            });
        } else {
            res.status(500).json({
                command: errorCommand,
                payload: {
                    status: 'error',
                    data: 'Internal server error while proxying the request.',
                    packet_status: 'failed'
                }
            });
        }
    }
}

// Helper to extract payload from new JSON format
function extractPayload(body) {
    if (body && body.command && body.payload) {
        return body.payload;
    }
    return body;
}

// Initialize PCAN
app.post('/api/pcan/initialize', async (req, res) => {
    const payload = extractPayload(req.body);
    const backendPayload = {
        channel: payload.id,
        baudrate: payload.bit_rate
    };
    await proxyRequest(req, res, 'post', '/init', backendPayload, 'PCAN_INIT_RESULT');
});

// Release PCAN
app.post('/api/pcan/release', async (req, res) => {
    await proxyRequest(req, res, 'post', '/release', {}, 'PCAN_UNINIT_RESULT');
});

// Read messages
app.get('/api/pcan/read', async (req, res) => {
    await proxyRequest(req, res, 'get', '/read', null, 'DATA');
});

// Write message
app.post('/api/pcan/write', async (req, res) => {
    const payload = extractPayload(req.body);
    const backendPayload = {
        id: payload.id,
        data: payload.data,
        extended: false,
        rtr: false
    };
    await proxyRequest(req, res, 'post', '/write', backendPayload, 'DATA');
});

// Get status
app.get('/api/pcan/status', async (req, res) => {
    await proxyRequest(req, res, 'get', '/status');
});

// --- TPMS API Endpoints (Proxy to Python Server) ---
app.post('/api/tpms/start', async (req, res) => {
    await proxyRequest(req, res, 'post', '/tpms/start', req.body);
});

app.post('/api/tpms/stop', async (req, res) => {
    await proxyRequest(req, res, 'post', '/tpms/stop', req.body);
});

// --- Data Save Endpoint ---
app.post('/api/save-data', async (req, res) => {
    try {
        const payload = extractPayload(req.body);
        const newMessages = payload.data || [];
        
        let existingData = { messages: [], savedAt: [] };
        if (fs.existsSync(dataFilePath)) {
            try {
                const fileContent = fs.readFileSync(dataFilePath, 'utf8');
                existingData = JSON.parse(fileContent);
            } catch (e) {
                existingData = { messages: [], savedAt: [] };
            }
        }
        
        existingData.messages = existingData.messages.concat(newMessages);
        existingData.savedAt.push(new Date().toISOString());
        
        fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2));
        
        res.json({
            command: 'LOAD_DATA',
            payload: {
                status: 'ok',
                data: `Saved ${newMessages.length} messages to data.json`,
                packet_status: 'success'
            }
        });
    } catch (error) {
        res.status(500).json({
            command: 'LOAD_DATA',
            payload: {
                status: 'error',
                data: error.message,
                packet_status: 'failed'
            }
        });
    }
});

// --- Fallback for other GET requests ---

// Redirect root to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all for other routes to handle client-side routing if necessary
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Node.js server listening at http://0.0.0.0:${port}`);
    console.log('This server acts as a proxy to the Python PCAN API server.');
    console.log('Make sure the Python server is running: python pcan_api_server.py');
});
