const CHANNEL_OPTIONS = [
    { value: 'PCAN_USBBUS1', label: 'PCAN_USB Channel 1 (51h)' },
    { value: 'PCAN_USBBUS2', label: 'PCAN_USB Channel 2 (52h)' },
    { value: 'PCAN_USBBUS3', label: 'PCAN_USB Channel 3 (53h)' },
    { value: 'PCAN_USBBUS4', label: 'PCAN_USB Channel 4 (54h)' },
    { value: 'PCAN_USBBUS5', label: 'PCAN_USB Channel 5 (55h)' }
];

const BAUDRATE_OPTIONS = [
    { value: 'PCAN_BAUD_1M', label: '1 MBit/s' },
    { value: 'PCAN_BAUD_800K', label: '800 kBit/s' },
    { value: 'PCAN_BAUD_500K', label: '500 kBit/s' },
    { value: 'PCAN_BAUD_250K', label: '250 kBit/s' },
    { value: 'PCAN_BAUD_125K', label: '125 kBit/s' },
    { value: 'PCAN_BAUD_100K', label: '100 kBit/s' },
    { value: 'PCAN_BAUD_50K', label: '50 kBit/s' },
    { value: 'PCAN_BAUD_20K', label: '20 kBit/s' },
    { value: 'PCAN_BAUD_10K', label: '10 kBit/s' }
];

const MESSAGE_FLAGS = {
    RTR: 0x01,
    EXTENDED: 0x02,
    FD: 0x04,
    BRS: 0x08,
    ESI: 0x10,
    ERRFRAME: 0x40,
    STATUS: 0x80
};

const MAX_BUFFER_SIZE = 1000;

document.addEventListener('DOMContentLoaded', () => {
    const state = {
        connected: false,
        readTimer: null,
        messageCounters: new Map(),
        lastTimestamps: new Map(),
        messageBuffer: []
    };

    const channelSelect = document.getElementById('channel');
    const baudrateSelect = document.getElementById('baudrate');
    const initializeBtn = document.getElementById('initialize-pcan');
    const releaseBtn = document.getElementById('release-pcan');
    const pollNowBtn = document.getElementById('poll-now');
    const loadDataBtn = document.getElementById('load-data');
    const connectionPill = document.getElementById('connection-pill');
    const writeForm = document.getElementById('write-form');
    const writeId = document.getElementById('write-id');
    const writeDlc = document.getElementById('write-dlc');
    const writeBtn = document.getElementById('write-message');
    const byteGrid = document.getElementById('byte-grid');
    const messagesBody = document.getElementById('messages-body');
    const clearMessagesBtn = document.getElementById('clear-messages');
    const logList = document.getElementById('log-list');
    const clearLogBtn = document.getElementById('clear-log');
    const tpmsButton = document.getElementById('tpms-button');
    const tpmsConfigModal = document.getElementById('tpms-config-modal');
    const tpmsConfigForm = document.getElementById('tpms-config-form');
    const cancelTpmsConfig = document.getElementById('cancel-tpms-config');
    const tpmsConfigError = document.getElementById('tpms-config-error');
    const tireCountInput = document.getElementById('tire-total-count');
    const tireConfigInput = document.getElementById('tire-config-input');

    let byteInputs = [];

    function populateSelect(select, options) {
        select.innerHTML = '';
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            select.appendChild(opt);
                });
    }

    function rebuildByteInputs(count) {
        byteGrid.innerHTML = '';
        byteInputs = [];
        for (let i = 0; i < count; i += 1) {
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 2;
            input.dataset.index = i.toString();
            input.addEventListener('input', onByteInput);
            input.addEventListener('keydown', onByteKeyDown);
            input.value = '00';
            byteGrid.appendChild(input);
            byteInputs.push(input);
        }
        if (byteInputs.length) {
            byteInputs[0].focus();
            }
    }

    function onByteInput(event) {
        const input = event.target;
        const sanitized = input.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
        input.value = sanitized;
        if (sanitized.length === 2) {
            const nextIndex = Number(input.dataset.index) + 1;
            const next = byteInputs[nextIndex];
            if (next) {
                next.focus();
                next.select();
        }
    }
    }

    function onByteKeyDown(event) {
        if (event.key !== 'Backspace') return;
        const input = event.target;
        if (input.value !== '') return;
        const prevIndex = Number(input.dataset.index) - 1;
        const prev = byteInputs[prevIndex];
        if (prev) {
            prev.focus();
            prev.value = '';
            event.preventDefault();
        }
    }

    // TPMS Button Handler
    tpmsButton.addEventListener('click', () => {
        tpmsConfigModal.classList.add('active');
        tpmsConfigError.style.display = 'none';
        tireCountInput.focus();
    });

    cancelTpmsConfig.addEventListener('click', (e) => {
        e.preventDefault();
        tpmsConfigModal.classList.remove('active');
    });

    tpmsConfigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        validateAndLoadTPMS();
    });

    function validateAndLoadTPMS() {
        const totalCount = parseInt(tireCountInput.value, 10);
        const configStr = tireConfigInput.value.trim();
        
        if (isNaN(totalCount) || totalCount < 1) {
            showTPMSError('Please enter a valid total tire count');
            return;
        }

        const axleConfig = configStr.split(',').map(s => {
            const num = parseInt(s.trim(), 10);
            return isNaN(num) ? 0 : num;
        });

        if (axleConfig.length === 0 || axleConfig.some(n => n <= 0)) {
            showTPMSError('Please enter valid axle configuration (e.g., 2,4)');
            return;
        }

        const configTotal = axleConfig.reduce((sum, n) => sum + n, 0);
        if (configTotal !== totalCount) {
            showTPMSError(`Total tires (${configTotal}) must match the total count (${totalCount})`);
            return;
        }

        // Save config to sessionStorage and navigate
        sessionStorage.setItem('tpmsConfig', JSON.stringify({
            totalTires: totalCount,
            axleConfig: axleConfig,
            configStr: configStr
        }));
        
        window.location.href = 'tpms.html';
    }

    function showTPMSError(message) {
        tpmsConfigError.textContent = message;
        tpmsConfigError.style.display = 'block';
    }

    // Close modal when clicking outside
    tpmsConfigModal.addEventListener('click', (e) => {
        if (e.target === tpmsConfigModal) {
            tpmsConfigModal.classList.remove('active');
        }
    });

    populateSelect(channelSelect, CHANNEL_OPTIONS);
    populateSelect(baudrateSelect, BAUDRATE_OPTIONS);
    channelSelect.value = 'PCAN_USBBUS1';
    baudrateSelect.value = 'PCAN_BAUD_500K';
    rebuildByteInputs(Number(writeDlc.value));

    writeDlc.addEventListener('change', () => {
        const dlc = Number(writeDlc.value);
        rebuildByteInputs(Math.min(Math.max(dlc, 0), 64));
    });

    initializeBtn.addEventListener('click', initializeConnection);
    releaseBtn.addEventListener('click', releaseConnection);
    pollNowBtn.addEventListener('click', () => fetchMessage(true));
    loadDataBtn.addEventListener('click', saveDataToFile);
    clearMessagesBtn.addEventListener('click', () => {
        messagesBody.innerHTML = '';
        state.messageCounters.clear();
        state.lastTimestamps.clear();
        state.messageBuffer = [];
    });
    clearLogBtn.addEventListener('click', () => {
        logList.innerHTML = '';
    });

    writeForm.addEventListener('submit', event => {
        event.preventDefault();
        sendMessage();
    });

    window.addEventListener('beforeunload', () => {
        if (!state.connected) return;
        const blob = new Blob([JSON.stringify({ reason: 'page-exit' })], {
            type: 'application/json'
        });
        navigator.sendBeacon('/api/pcan/release', blob);
    });

    function toggleConnected(connected) {
        state.connected = connected;
        initializeBtn.disabled = connected;
        releaseBtn.disabled = !connected;
        pollNowBtn.disabled = !connected;
        loadDataBtn.disabled = !connected;
        clearMessagesBtn.disabled = !connected;
        writeBtn.disabled = !connected;

        connectionPill.textContent = connected ? 'Connected' : 'Disconnected';
        connectionPill.classList.toggle('pill--success', connected);
        connectionPill.classList.toggle('pill--danger', !connected);

        if (connected) {
            startPolling();
        } else {
            stopPolling();
            state.messageCounters.clear();
            messagesBody.innerHTML = '';
            state.lastTimestamps.clear();
            state.messageBuffer = [];
        }
    }

    function startPolling() {
        stopPolling();
        fetchMessage();
        state.readTimer = setInterval(fetchMessage, 1000);
    }

    function stopPolling() {
        if (state.readTimer) {
            clearInterval(state.readTimer);
            state.readTimer = null;
        }
    }

    async function initializeConnection() {
        const jsonPayload = {
            command: 'INIT_PCAN',
            payload: {
                id: channelSelect.value,
                bit_rate: baudrateSelect.value,
                data: ''
            }
        };

        try {
            const response = await fetch('/api/pcan/initialize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jsonPayload)
            });
            const data = await response.json();
            if (data.payload.packet_status === 'success') {
                pushLog('success', data.payload.data || 'PCAN initialized.');
                state.messageCounters.clear();
                state.lastTimestamps.clear();
                messagesBody.innerHTML = '';
                toggleConnected(true);
            } else {
                pushLog('error', data.payload.data || 'Failed to initialize PCAN.');
            }
        } catch (error) {
            pushLog('error', `Network error initializing PCAN: ${error.message}`);
            }
    }

    async function releaseConnection() {
        const jsonPayload = {
            command: 'UNINIT_PCAN',
            payload: {
                id: '',
                bit_rate: '',
                data: ''
            }
        };

        try {
            const response = await fetch('/api/pcan/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonPayload)
            });
            const data = await response.json();
            if (data.payload.packet_status === 'success') {
                pushLog('success', data.payload.data || 'PCAN released.');
                toggleConnected(false);
            } else {
                pushLog('error', data.payload.data || 'Failed to release PCAN.');
            }
        } catch (error) {
            pushLog('error', `Network error releasing PCAN: ${error.message}`);
        }
    }

    async function fetchMessage(manual = false) {
        if (!state.connected && !manual) return;
        try {
            const response = await fetch('/api/pcan/read');
            const responseData = await response.json();
            if (!response.ok) {
                throw new Error(responseData.error || 'Read call failed');
            }

            // Handle new format with payload
            let message = null;
            if (responseData.message) {
                message = responseData.message;
            } else if (responseData.payload && responseData.payload.data && responseData.payload.data.message) {
                message = responseData.payload.data.message;
            }

            if (!message || typeof message === 'string') {
                return;
            }

            const key = `${message.msg_type}-${message.id}`;
            const nextCount = (state.messageCounters.get(key) ?? 0) + 1;
            state.messageCounters.set(key, nextCount);
            renderMessageRow(message, nextCount);
        } catch (error) {
            if (manual) {
                pushLog('error', `Unable to read frame: ${error.message}`);
            }
        }
    }

    async function sendMessage() {
        if (!state.connected) {
            pushLog('error', 'Initialize PCAN before sending.');
            return;
        }

        const id = writeId.value.trim();
        if (!id || !/^[0-9a-fA-F]+$/.test(id)) {
            pushLog('error', 'Provide a valid hexadecimal ID.');
            return;
        }

        const dlc = Number(writeDlc.value);
        const bytes = byteInputs.slice(0, dlc).map(input => input.value.trim());

        if (bytes.some(byte => byte.length !== 2 || /[^0-9A-F]/i.test(byte))) {
            pushLog('error', 'Fill every data byte with two hex symbols.');
            return;
        }

        const jsonPayload = {
            command: 'SEND_DATA',
            payload: {
                id: id.toUpperCase(),
                bit_rate: baudrateSelect.value,
                data: bytes.map(byte => parseInt(byte, 16))
            }
        };

        try {
            const response = await fetch('/api/pcan/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jsonPayload)
            });
            const data = await response.json();
            if (data.payload.packet_status !== 'success') {
                throw new Error(data.payload.data || 'Send failed');
            }
            pushLog('success', data.payload.data || 'Frame sent successfully.');
        } catch (error) {
            pushLog('error', `Unable to send frame: ${error.message}`);
        }
    }

    function renderMessageRow(message, count) {
        const prevTimestamp = state.lastTimestamps.get(message.id) ?? null;
        const currentTimestamp = Date.now();
        const cycleTime = prevTimestamp ? (currentTimestamp - prevTimestamp).toFixed(0) : '—';
        state.lastTimestamps.set(message.id, currentTimestamp);

        // Build data display with SI units if parsed data exists
        let dataDisplay = '';
        let parsedInfo = '';
        
        if (message.parsed) {
            const p = message.parsed;
            dataDisplay = `Sensor ${p.sensor_id} | Pressure: ${p.pressure} | Temp: ${p.temperature}°C | Battery: ${p.battery_watts} W`;
            parsedInfo = {
                sensor_id: p.sensor_id,
                temperature: p.temperature,
                battery_watts: p.battery_watts,
                pressure: p.pressure
            };
        } else {
            dataDisplay = Array.isArray(message.data) ? message.data.map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ') : '';
        }

        const messageEntry = {
            id: message.id,
            count: count,
            len: message.len,
            cycleTime: cycleTime,
            data: dataDisplay,
            parsed: parsedInfo,
            timestamp: new Date().toISOString()
        };
        
        // Circular buffer: if at max size, remove oldest message first
        if (state.messageBuffer.length >= MAX_BUFFER_SIZE) {
            state.messageBuffer.shift();
        }
        state.messageBuffer.push(messageEntry);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${message.id}</td>
            <td>${count}</td>
            <td>${message.len}</td>
            <td>${cycleTime}</td>
            <td style="font-size: 12px; word-wrap: break-word;">${dataDisplay}</td>
        `;
        messagesBody.prepend(row);

        const maxRows = 200;
        while (messagesBody.children.length > maxRows) {
            messagesBody.removeChild(messagesBody.lastChild);
        }
    }

    async function saveDataToFile() {
        if (state.messageBuffer.length === 0) {
            pushLog('error', 'No data to save. Buffer is empty.');
            return;
        }

        const jsonPayload = {
            command: 'LOAD_DATA',
            payload: {
                id: '',
                bit_rate: '',
                data: state.messageBuffer
            }
        };

        try {
            const response = await fetch('/api/save-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jsonPayload)
            });
            const data = await response.json();
            if (data.command === 'LOAD_DATA' && data.payload.packet_status === 'success') {
                pushLog('success', data.payload.data || 'Data saved successfully');
                state.messageBuffer = [];
                messagesBody.innerHTML = '';
                state.messageCounters.clear();
                state.lastTimestamps.clear();
            } else {
                pushLog('error', data.payload.data || 'Failed to save data.');
            }
        } catch (error) {
            pushLog('error', `Error saving data: ${error.message}`);
        }
    }

    function describeMessageType(msgType = 0) {
        if ((msgType & MESSAGE_FLAGS.STATUS) === MESSAGE_FLAGS.STATUS) {
            return 'STATUS';
        }
        if ((msgType & MESSAGE_FLAGS.ERRFRAME) === MESSAGE_FLAGS.ERRFRAME) {
            return 'ERROR';
        }
        return (msgType & MESSAGE_FLAGS.EXTENDED) ? 'EXT' : 'STD';
    }

    function pushLog(level, message) {
        const entry = document.createElement('li');
        entry.className = `log-entry log-entry--${level}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logList.prepend(entry);
        while (logList.children.length > 100) {
            logList.removeChild(logList.lastChild);
        }
    }
});

