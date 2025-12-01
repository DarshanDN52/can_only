
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
async function proxyRequest(req, res, method, endpoint, data = null) {
    try {
        const response = await axios({
            method: method,
            url: `${pythonApiUrl}${endpoint}`,
            data: data
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            res.status(error.response.status).json(error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            res.status(503).json({ success: false, error: 'The Python API server is not running or not reachable.' });
        } else {
            // Something happened in setting up the request that triggered an Error
            res.status(500).json({ success: false, error: 'Internal server error while proxying the request.' });
        }
    }
}

// Initialize PCAN
app.post('/api/pcan/initialize', async (req, res) => {
    await proxyRequest(req, res, 'post', '/init', req.body);
});

// Release PCAN
app.post('/api/pcan/release', async (req, res) => {
    await proxyRequest(req, res, 'post', '/release');
});

// Read messages
app.get('/api/pcan/read', async (req, res) => {
    await proxyRequest(req, res, 'get', '/read');
});

// Write message
app.post('/api/pcan/write', async (req, res) => {
    await proxyRequest(req, res, 'post', '/write', req.body);
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
        const newMessages = req.body.messages || [];
        
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
        
        res.json({ success: true, message: `Saved ${newMessages.length} messages to data.json` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
