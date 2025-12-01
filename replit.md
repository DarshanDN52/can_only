# PCAN Web Application

## Overview
A web interface for PCAN-Basic CAN bus communication. This application provides a web-based console for configuring and interacting with PCAN hardware devices.

**Current State**: Successfully configured for Replit environment. The web frontend is running on port 5000. Note: The Python backend cannot initialize actual PCAN hardware in a cloud environment, as it requires physical CAN bus hardware (`libpcanbasic.so` library).

## Project Architecture

### Technology Stack
- **Frontend**: Node.js/Express server serving static HTML/CSS/JavaScript
- **Backend**: Python Flask API server
- **Hardware Interface**: PCAN-Basic library (requires physical hardware)

### Architecture
```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│  Web Browser    │────────▶│  Node.js Server  │────────▶│ Python API  │
│  (Port 5000)    │         │  (Port 5000)     │         │ (Port 5001) │
└─────────────────┘         └──────────────────┘         └─────────────┘
                                                                  │
                                                                  ▼
                                                          ┌─────────────┐
                                                          │ PCAN Device │
                                                          │ (Hardware)  │
                                                          └─────────────┘
```

### Component Details
1. **Node.js Express Server** (`server.js`)
   - Serves static files from `/public` directory
   - Acts as a proxy to the Python API server
   - Runs on port 5000, bound to 0.0.0.0 for Replit compatibility
   - Proxies all `/api/*` requests to Python backend on localhost:5001

2. **Python Flask API** (`pcan_api_server.py`)
   - Provides REST API endpoints for PCAN operations
   - Manages PCAN hardware initialization, read/write operations
   - Includes TPMS (Tire Pressure Monitoring System) data collection features
   - Runs on localhost:5001 (internal backend port)

3. **Static Frontend** (`/public`)
   - `index.html` - Main CAN configuration console
   - `tpms.html` - TPMS data dashboard
   - JavaScript and CSS for interactive UI

## File Structure
```
.
├── server.js                    # Node.js Express proxy server
├── pcan_api_server.py          # Python Flask API server
├── PCANBasic.py                # PCAN-Basic Python wrapper
├── PCANBasic.dll               # PCAN library (Windows)
├── public/                     # Static frontend assets
│   ├── index.html              # Main CAN console
│   ├── scripts.js              # Main console JavaScript
│   ├── styles.css              # Main console styles
│   ├── tpms.html               # TPMS dashboard
│   ├── tpms_script.js          # TPMS JavaScript
│   └── tpms_style.css          # TPMS styles
├── package.json                # Node.js dependencies
├── requirements.txt            # Python dependencies
└── replit.md                   # This file
```

## Recent Changes
- **2024-12-01**: Read Message improvements and data export
  - Added scrollable Read Message table with 300px max height
  - Added "Load Data" button to export CAN messages to data.json
  - Buffer automatically resets after saving to prevent duplicate data
  - Disabled TPMS graph legend click interactions to keep all data visible

- **2024-12-01**: Theme and TPMS Dashboard improvements
  - Unified dark theme across main console and TPMS dashboard
  - Added matching blue accent colors and styling
  - TPMS dashboard now auto-loads with dummy data for testing
  - Added getTirePositionName function for proper tire position labels
  - Added cache control headers to prevent stale assets

- **2024-12-01**: Initial Replit environment setup
  - Updated Node.js server to use port 5000 and bind to 0.0.0.0
  - Installed Python 3.11 and Flask dependencies
  - Installed Node.js dependencies (Express, Axios)
  - Created .gitignore for Node.js and Python
  - Configured workflow to start both servers
  - Configured deployment settings (VM target)

## Dependencies

### Node.js
- express: ^4.17.1
- axios: ^1.13.2

### Python
- Flask

## Running the Application

The application starts automatically via the configured workflow, which runs:
```bash
python pcan_api_server.py & node server.js
```

This starts both:
1. Python Flask API server on localhost:5001 (backend)
2. Node.js Express server on 0.0.0.0:5000 (frontend)

## API Endpoints

All endpoints are proxied through the Node.js server at `/api/*`:

### CAN Operations
- `POST /api/pcan/initialize` - Initialize PCAN channel
- `POST /api/pcan/release` - Release PCAN channel
- `GET /api/pcan/read` - Read CAN message
- `POST /api/pcan/write` - Write CAN message
- `GET /api/pcan/status` - Get PCAN channel status

### TPMS Operations
- `POST /api/tpms/start` - Start TPMS data collection
- `POST /api/tpms/stop` - Stop TPMS data collection

## Hardware Requirements

**Important**: This application requires physical PCAN hardware to function properly. In the Replit cloud environment:
- The web interface will load and function
- The Python backend will fail to initialize due to missing `libpcanbasic.so` library
- To use with actual hardware, deploy to a system with PCAN hardware installed

## Limitations in Cloud Environment
- PCAN hardware library (`libpcanbasic.so`) is not available
- Python backend will throw an error on startup: `OSError: libpcanbasic.so: cannot open shared object file`
- The web UI will still be accessible but CAN operations will not work without hardware

## Deployment
Configured for VM deployment to maintain persistent connections. The deployment runs the same command as the development workflow.
