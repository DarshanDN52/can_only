// TPMS Dashboard JavaScript
let tireCount = 6;
let axleConfig = [2, 4];
let tpmsData = {};
let chart = null;
let tireDetailChart = null;
let isCollecting = false;
let selectedTireNum = null;
let dataHistory = {
    pressure: {},
    temperature: {},
    battery: {},
};
let simulationInterval = null;
const maxHistoryPoints = 50;

// Socket connection (disabled in UI-only mode if io is unavailable)
const socket =
    typeof io !== "undefined"
        ? io.connect(
              location.protocol + "//" + document.domain + ":" + location.port,
          )
        : null;
const backendEnabled = !!socket;

// Get tire position name based on tire number and axle configuration
function getTirePositionName(tireNum) {
    let currentTire = 0;
    for (let axleIndex = 0; axleIndex < axleConfig.length; axleIndex++) {
        const tiresOnAxle = axleConfig[axleIndex];
        for (let i = 0; i < tiresOnAxle; i++) {
            currentTire++;
            if (currentTire === tireNum) {
                const axleName =
                    axleIndex === 0
                        ? "Front"
                        : axleIndex === axleConfig.length - 1
                          ? "Rear"
                          : `Axle ${axleIndex + 1}`;
                const side = i < tiresOnAxle / 2 ? "Left" : "Right";
                const position =
                    tiresOnAxle > 2
                        ? i % (tiresOnAxle / 2) === 0
                            ? " Outer"
                            : " Inner"
                        : "";
                return `${axleName} ${side}${position}`;
            }
        }
    }
    return `Tire ${tireNum}`;
}

function initializeTireData() {
    tpmsData = {};
    dataHistory = { pressure: {}, temperature: {}, battery: {} };

    for (let i = 1; i <= tireCount; i += 1) {
        tpmsData[i] = {
            position: getTirePositionName(i),
            pressure: 35 + Math.random() * 10,
            temperature: 20 + Math.random() * 15,
            battery: 3 + Math.random() * 2,
            status: "normal",
            lastUpdate: new Date(),
        };
        dataHistory.pressure[i] = [];
        dataHistory.temperature[i] = [];
        dataHistory.battery[i] = [];
    }
}

function startSimulationLoop() {
    stopSimulationLoop();
    simulateTPMSData();
    simulationInterval = setInterval(simulateTPMSData, 2000);
}

function stopSimulationLoop() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    // Check for config in sessionStorage from main console
    const configStr = sessionStorage.getItem('tpmsConfig');
    let autoStart = true;

    if (configStr) {
        try {
            const config = JSON.parse(configStr);
            axleConfig = config.axleConfig;
            tireCount = config.totalTires;
            sessionStorage.removeItem('tpmsConfig'); // Clear after reading
        } catch (e) {
            console.error('Failed to parse TPMS config:', e);
        }
    }

    initializeButtons();
    initializeChart();
    initializeTireDetailModal();
    initializeTireDetailChart();
    setupSocketListeners();
    initializeTireData();

    // Auto-start with dummy data
    if (autoStart) {
        setTimeout(() => {
            startTPMSCollection();
            generateInitialDummyData();
        }, 100);
    }
});

// Generate initial dummy historical data for charts
function generateInitialDummyData() {
    const now = new Date();

    // Generate 20 historical data points for each tire
    for (let point = 0; point < 20; point++) {
        const timeLabel = new Date(
            now.getTime() - (20 - point) * 2000,
        ).toLocaleTimeString();

        for (let i = 1; i <= tireCount; i++) {
            const basePressure = 35 + (i % 3) * 5;
            const baseTemp = 20 + (i % 2) * 5;
            const baseBattery = 3.5 + (i % 4) * 0.5;

            addToHistory(
                "pressure",
                i,
                basePressure + (Math.random() - 0.5) * 8,
                timeLabel,
            );
            addToHistory(
                "temperature",
                i,
                baseTemp + (Math.random() - 0.5) * 10,
                timeLabel,
            );
            addToHistory(
                "battery",
                i,
                Math.max(
                    2,
                    Math.min(5, baseBattery + (Math.random() - 0.5) * 1),
                ),
                timeLabel,
            );
        }
    }

    // Update the chart with the generated data
    const graphType = document.getElementById("graph-type").value;
    updateChart(graphType);
}

// Button handlers
function initializeButtons() {
    document.getElementById("back-to-main").addEventListener("click", () => {
        window.location.href = "/";
    });
    initializeViewButtons();
}

function initializeViewButtons() {
    const topViewBtn = document.getElementById("top-view-btn");
    const dataViewBtn = document.getElementById("data-view-btn");
    const truckContainer = document.getElementById("truck-container-wrapper");
    const dataViewContainer = document.getElementById("data-view-container");

    topViewBtn.addEventListener("click", () => {
        truckContainer.style.display = "flex";
        dataViewContainer.style.display = "none";
        topViewBtn.classList.add("active");
        dataViewBtn.classList.remove("active");
    });

    dataViewBtn.addEventListener("click", () => {
        truckContainer.style.display = "none";
        dataViewContainer.style.display = "grid";
        topViewBtn.classList.remove("active");
        dataViewBtn.classList.add("active");
        renderDataView();
    });
}

// Initialize tire detail modal
function initializeTireDetailModal() {
    const modal = document.getElementById("tire-detail-modal");
    const closeBtn = document.querySelector(".close-tire-detail");

    closeBtn.onclick = () => {
        modal.style.display = "none";
        selectedTireNum = null;
        // Reset zoom when closing
        if (tireDetailChart) {
            tireDetailChart.resetZoom();
        }
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
            selectedTireNum = null;
            // Reset zoom when closing
            if (tireDetailChart) {
                tireDetailChart.resetZoom();
            }
        }
    };
}

// Initialize tire detail chart
function initializeTireDetailChart() {
    const ctx = document.getElementById("tire-detail-chart").getContext("2d");

    tireDetailChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "Pressure (PSI)",
                    data: [],
                    borderColor: "#101024ff",
                    backgroundColor: "rgba(76, 175, 80, 0.1)",
                    tension: 0.4,
                    fill: true,
                    yAxisID: "y-pressure",
                    pointRadius: 3,
                    pointHoverRadius: 5,
                },
                {
                    label: "Temperature (°C)",
                    data: [],
                    borderColor: "#ff9800",
                    backgroundColor: "rgba(255, 152, 0, 0.1)",
                    tension: 0.4,
                    fill: true,
                    yAxisID: "y-temperature",
                    pointRadius: 3,
                    pointHoverRadius: 5,
                },
                {
                    label: "Battery (W)",
                    data: [],
                    borderColor: "#2196f3",
                    backgroundColor: "rgba(33, 150, 243, 0.1)",
                    tension: 0.4,
                    fill: true,
                    yAxisID: "y-temperature",
                    pointRadius: 3,
                    pointHoverRadius: 5,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: "Live Tire Data",
                    font: {
                        size: 18,
                        weight: "bold",
                    },
                    color: "#495057",
                },
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                        },
                    },
                    onClick: null,
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || "";
                            if (label) {
                                label += ": ";
                            }
                            if (context.parsed.y !== null) {
                                if (label.includes("Pressure")) {
                                    label +=
                                        context.parsed.y.toFixed(1) + " PSI";
                                } else if (label.includes("Temperature")) {
                                    label +=
                                        context.parsed.y.toFixed(1) + " °C";
                                } else if (label.includes("Battery")) {
                                    label += context.parsed.y.toFixed(0) + " %";
                                }
                            }
                            return label;
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Time",
                        font: {
                            size: 14,
                            weight: "bold",
                        },
                        color: "#495057",
                    },
                    grid: {
                        color: "rgba(0, 0, 0, 0.05)",
                    },
                },
                "y-pressure": {
                    type: "linear",
                    display: true,
                    position: "left",
                    title: {
                        display: true,
                        text: "Pressure (PSI)",
                        font: {
                            size: 12,
                            weight: "bold",
                        },
                        color: "#4caf50",
                    },
                    grid: {
                        color: "rgba(76, 175, 80, 0.1)",
                    },
                    beginAtZero: false,
                },
                "y-temperature": {
                    type: "linear",
                    display: true,
                    position: "right",
                    title: {
                        display: true,
                        text: "Temperature (°C) / Battery (%)",
                        font: {
                            size: 12,
                            weight: "bold",
                        },
                        color: "#ff9800",
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    beginAtZero: false,
                },
            },
            interaction: {
                mode: "nearest",
                axis: "x",
                intersect: false,
            },
            plugins: {
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.1,
                        },
                        pinch: {
                            enabled: true,
                        },
                        mode: "x",
                    },
                    pan: {
                        enabled: true,
                        mode: "x",
                        modifierKey: "ctrl",
                    },
                    limits: {
                        x: { min: "original", max: "original" },
                        y: { min: "original", max: "original" },
                    },
                },
            },
        },
    });

    // Initialize view selector and zoom controls
    initializeTireDetailControls();
}

// Initialize tire detail controls (view selector and zoom)
function initializeTireDetailControls() {
    const viewSelector = document.getElementById("tire-detail-view-selector");
    const prevBtn = document.getElementById("prev-view");
    const nextBtn = document.getElementById("next-view");
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const zoomResetBtn = document.getElementById("zoom-reset");

    // View selector change
    viewSelector.addEventListener("change", (e) => {
        updateTireDetailView(e.target.value);
    });

    // Arrow buttons for view navigation
    prevBtn.addEventListener("click", () => {
        const options = viewSelector.options;
        const currentIndex = viewSelector.selectedIndex;
        const prevIndex =
            currentIndex > 0 ? currentIndex - 1 : options.length - 1;
        viewSelector.selectedIndex = prevIndex;
        updateTireDetailView(viewSelector.value);
    });

    nextBtn.addEventListener("click", () => {
        const options = viewSelector.options;
        const currentIndex = viewSelector.selectedIndex;
        const nextIndex =
            currentIndex < options.length - 1 ? currentIndex + 1 : 0;
        viewSelector.selectedIndex = nextIndex;
        updateTireDetailView(viewSelector.value);
    });

    // Zoom controls
    zoomInBtn.addEventListener("click", () => {
        if (tireDetailChart) {
            const xScale = tireDetailChart.scales.x;
            if (xScale) {
                const min = xScale.min;
                const max = xScale.max;
                const center = (min + max) / 2;
                const range = max - min;
                xScale.options.min = center - range * 0.45;
                xScale.options.max = center + range * 0.45;
                tireDetailChart.update("none");
            }
        }
    });

    zoomOutBtn.addEventListener("click", () => {
        if (tireDetailChart) {
            const xScale = tireDetailChart.scales.x;
            if (xScale) {
                const min = xScale.min;
                const max = xScale.max;
                const center = (min + max) / 2;
                const range = max - min;
                xScale.options.min = center - range * 0.55;
                xScale.options.max = center + range * 0.55;
                tireDetailChart.update("none");
            }
        }
    });

    zoomResetBtn.addEventListener("click", () => {
        if (tireDetailChart) {
            const xScale = tireDetailChart.scales.x;
            if (xScale) {
                xScale.options.min = undefined;
                xScale.options.max = undefined;
                tireDetailChart.update();
            }
            // Also try the plugin's resetZoom if available
            if (typeof tireDetailChart.resetZoom === "function") {
                tireDetailChart.resetZoom();
            }
        }
    });
}

// Update tire detail view based on selection
function updateTireDetailView(viewType) {
    if (!tireDetailChart || !selectedTireNum) return;

    const datasets = tireDetailChart.data.datasets;

    // Show/hide datasets based on view
    datasets.forEach((dataset, index) => {
        if (viewType === "pressure" && index === 0) {
            dataset.hidden = false;
        } else if (viewType === "temperature" && index === 1) {
            dataset.hidden = false;
        } else if (viewType === "battery" && index === 2) {
            dataset.hidden = false;
        } else {
            dataset.hidden = true;
        }
    });

    // Update axis visibility
    const scales = tireDetailChart.options.scales;
    if (viewType === "pressure") {
        scales["y-pressure"].display = true;
        scales["y-temperature"].display = false;
        scales["y-pressure"].title.text = "Pressure (PSI)";
    } else if (viewType === "temperature") {
        scales["y-pressure"].display = false;
        scales["y-temperature"].display = true;
        scales["y-temperature"].title.text = "Temperature (°C)";
    } else if (viewType === "battery") {
        scales["y-pressure"].display = false;
        scales["y-temperature"].display = true;
        scales["y-temperature"].title.text = "Battery (W)";
    }

    tireDetailChart.update();
}

// Initialize Chart.js
function initializeChart() {
    const ctx = document.getElementById("tpms-chart").getContext("2d");
    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: "TPMS Data Over Time",
                    font: {
                        size: 18,
                        weight: "bold",
                    },
                    color: "#495057",
                },
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                        },
                    },
                    onClick: null,
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: "bold",
                    },
                    bodyFont: {
                        size: 12,
                    },
                },
                zoom: {
                    zoom: {
                        wheel: { enabled: true, speed: 0.1 },
                        pinch: { enabled: true },
                        mode: "x",
                    },
                    pan: {
                        enabled: true,
                        mode: "x",
                        modifierKey: "ctrl",
                    },
                    limits: {
                        x: { min: "original", max: "original" },
                        y: { min: "original", max: "original" },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: "Value",
                        font: {
                            size: 14,
                            weight: "bold",
                        },
                        color: "#495057",
                    },
                    grid: {
                        color: "rgba(0, 0, 0, 0.05)",
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: "Time",
                        font: {
                            size: 14,
                            weight: "bold",
                        },
                        color: "#495057",
                    },
                    grid: {
                        color: "rgba(0, 0, 0, 0.05)",
                    },
                },
            },
            interaction: {
                mode: "nearest",
                axis: "x",
                intersect: false,
            },
        },
    });

    // Graph type selector
    document.getElementById("graph-type").addEventListener("change", (e) => {
        updateChart(e.target.value);
    });

    // Zoom controls for the main chart
    const zoomInBtn = document.getElementById("main-chart-zoom-in");
    const zoomOutBtn = document.getElementById("main-chart-zoom-out");
    const zoomResetBtn = document.getElementById("main-chart-zoom-reset");

    zoomInBtn.addEventListener("click", () => {
        if (chart) chart.zoom(1.1);
    });

    zoomOutBtn.addEventListener("click", () => {
        if (chart) chart.zoom(0.9);
    });

    zoomResetBtn.addEventListener("click", () => {
        if (chart) chart.resetZoom();
    });
}

// Setup Socket.IO listeners
function setupSocketListeners() {
    if (!backendEnabled || !socket) {
        console.info("TPMS UI-only mode: socket listeners disabled.");
        return;
    }

    socket.on("tpms_data", (data) => {
        updateTPMSData(data);
    });

    socket.on("can_messages", (messages) => {
        if (isCollecting) {
            processCANMessages(messages);
        }
    });
}

// Start TPMS data collection
function startTPMSCollection() {
    isCollecting = true;
    renderTruckView();
    renderTable();
    renderDataView();
    startSimulationLoop();
}

// Stop TPMS data collection
function stopTPMSCollection() {
    isCollecting = false;
    stopSimulationLoop();
}

function addToHistory(type, tireNum, value, timeLabel) {
    if (!dataHistory[type][tireNum]) {
        dataHistory[type][tireNum] = [];
    }

    dataHistory[type][tireNum].push({ x: timeLabel, y: value });

    // Keep only last N points
    if (dataHistory[type][tireNum].length > maxHistoryPoints) {
        dataHistory[type][tireNum].shift();
    }
}

// Calculate tire status
function calculateStatus(tire) {
    if (
        tire.pressure < 20 ||
        tire.pressure > 120 ||
        tire.temperature > 80 ||
        tire.battery < 2.5
    ) {
        return "critical";
    } else if (
        tire.pressure < 30 ||
        tire.pressure > 100 ||
        tire.temperature > 60 ||
        tire.battery < 3
    ) {
        return "warning";
    }
    return "normal";
}

function updateTireData(tireNum, data) {
    if (!tpmsData[tireNum]) return;

    const now = new Date();
    const timeLabel = now.toLocaleTimeString();

    if (data.pressure !== undefined) {
        tpmsData[tireNum].pressure = data.pressure;
        addToHistory("pressure", tireNum, data.pressure, timeLabel);
    }
    if (data.temperature !== undefined) {
        tpmsData[tireNum].temperature = data.temperature;
        addToHistory("temperature", tireNum, data.temperature, timeLabel);
    }
    if (data.battery !== undefined) {
        tpmsData[tireNum].battery = data.battery;
        addToHistory("battery", tireNum, data.battery, timeLabel);
    }

    tpmsData[tireNum].lastUpdate = now;
    tpmsData[tireNum].status = calculateStatus(tpmsData[tireNum]);

    updateTireVisual(tireNum);
    updateTableRow(tireNum);
    updateDataBox(tireNum);
    updateChart(document.getElementById("graph-type").value);

    if (selectedTireNum === tireNum) {
        updateTireDetailCards(tireNum);
        updateTireDetailChart(tireNum);
    }
}

// Render truck 2D view with tires arranged around rectangle
function renderTruckView() {
    const truckView = document.getElementById("truck-view");
    // Clear existing tires
    const existingTires = truckView.querySelectorAll(".tire");
    existingTires.forEach((tire) => tire.remove());

    // Calculate positions based on tire count - arranged around truck rectangle
    const positions = calculateTirePositions(axleConfig);

    positions.forEach((pos, index) => {
        const tireNum = index + 1;
        const tire = document.createElement("div");
        tire.className = "tire";
        tire.id = `tire-${tireNum}`;
        tire.style.left = `${pos.x}%`;
        tire.style.top = `${pos.y}%`;

        const label = document.createElement("div");
        label.className = "tire-label";
        label.textContent = `T${tireNum}`;

        tire.appendChild(label);
        truckView.appendChild(tire);

        // Add click event listener to tire
        tire.addEventListener("click", () => {
            showTireDetail(tireNum);
        });

        // Initialize with current data
        updateTireVisual(tireNum);
    });
    renderDataView();
}

// Show tire detail modal
function showTireDetail(tireNum) {
    selectedTireNum = tireNum;
    const modal = document.getElementById("tire-detail-modal");
    const tire = tpmsData[tireNum];

    if (!tire) return;

    // Show modal first to ensure canvas is visible for Chart.js rendering
    modal.style.display = "block";

    // Update modal title
    document.getElementById("tire-detail-title").textContent =
        `🚛 Tire ${tireNum} - ${tire.position}`;

    // Set default view to "pressure" and update the chart
    document.getElementById("tire-detail-view-selector").value = "pressure";
    updateTireDetailView("pressure");

    // Update live data cards
    updateTireDetailCards(tireNum);

    // Update chart (this will call tireDetailChart.update() internally)
    updateTireDetailChart(tireNum);

    // Reset zoom
    setTimeout(() => {
        if (tireDetailChart) {
            const xScale = tireDetailChart.scales.x;
            if (xScale) {
                xScale.options.min = undefined;
                xScale.options.max = undefined;
                tireDetailChart.update();
            }
            if (typeof tireDetailChart.resetZoom === "function") {
                tireDetailChart.resetZoom();
            }
        }
    }, 100);
}

// Update tire detail cards with live data
function updateTireDetailCards(tireNum) {
    const tire = tpmsData[tireNum];
    if (!tire) return;

    document.getElementById("detail-pressure").textContent =
        tire.pressure.toFixed(1);
    document.getElementById("detail-temperature").textContent =
        tire.temperature.toFixed(1);
    document.getElementById("detail-battery").textContent =
        tire.battery.toFixed(0);
}

// Update tire detail chart
function updateTireDetailChart(tireNum) {
    if (!tireDetailChart || !selectedTireNum || selectedTireNum !== tireNum)
        return;

    const pressureHistory = dataHistory.pressure[tireNum] || [];
    const tempHistory = dataHistory.temperature[tireNum] || [];
    const batteryHistory = dataHistory.battery[tireNum] || [];

    // Get all unique time labels
    const allLabels = new Set();
    pressureHistory.forEach((h) => allLabels.add(h.x));
    tempHistory.forEach((h) => allLabels.add(h.x));
    batteryHistory.forEach((h) => allLabels.add(h.x));

    const sortedLabels = Array.from(allLabels).sort();

    // Create data maps
    const pressureMap = new Map(pressureHistory.map((h) => [h.x, h.y]));
    const tempMap = new Map(tempHistory.map((h) => [h.x, h.y]));
    const batteryMap = new Map(batteryHistory.map((h) => [h.x, h.y]));

    // Map data to labels
    const pressureData = sortedLabels.map(
        (label) => pressureMap.get(label) || null,
    );
    const tempData = sortedLabels.map((label) => tempMap.get(label) || null);
    const batteryData = sortedLabels.map(
        (label) => batteryMap.get(label) || null,
    );

    // Update chart
    tireDetailChart.data.labels = sortedLabels;
    tireDetailChart.data.datasets[0].data = pressureData;
    tireDetailChart.data.datasets[1].data = tempData;
    tireDetailChart.data.datasets[2].data = batteryData;

    tireDetailChart.update();
}

function renderDataView() {
    const dataViewContainer = document.getElementById("data-view-container");
    dataViewContainer.innerHTML = "";

    for (let i = 1; i <= tireCount; i++) {
        const tire = tpmsData[i];
        if (!tire) continue;

        const dataBox = document.createElement("div");
        dataBox.className = `data-box ${tire.status}`;
        dataBox.id = `data-box-${i}`;

        dataBox.innerHTML = `
            <h3>Tire ${i} - ${tire.position}</h3>
            <div class="details">
                <div class="detail-item">
                    <span>Pressure:</span>
                    <span id="data-box-pressure-${i}">${tire.pressure.toFixed(1)} PSI</span>
                </div>
                <div class="detail-item">
                    <span>Temperature:</span>
                    <span id="data-box-temperature-${i}">${tire.temperature.toFixed(1)} °C</span>
                </div>
                <div class="detail-item">
                    <span>Battery:</span>
                    <span id="data-box-battery-${i}">${tire.battery.toFixed(2)} W</span>
                </div>
            </div>
        `;
        dataViewContainer.appendChild(dataBox);
    }
}

function updateDataBox(tireNum) {
    const tire = tpmsData[tireNum];
    if (!tire) return;

    const dataBox = document.getElementById(`data-box-${tireNum}`);
    if (!dataBox) return;

    dataBox.className = `data-box ${tire.status}`;
    document.getElementById(`data-box-pressure-${tireNum}`).textContent =
        `${tire.pressure.toFixed(1)} PSI`;
    document.getElementById(`data-box-temperature-${tireNum}`).textContent =
        `${tire.temperature.toFixed(1)} °C`;
    document.getElementById(`data-box-battery-${tireNum}`).textContent =
        `${tire.battery.toFixed(2)} W`;
}

// Calculate tire positions for 2D top view - arranged around truck rectangle
function calculateTirePositions(axleConfig) {
    const positions = [];
    const truckLength = 52; // x-axis for axle placement
    const truckFrontX = 19; // Starting X for front axle

    const numAxles = axleConfig.length;
    // Distribute axles evenly along the truck length
    const axleSpacing = numAxles > 1 ? truckLength / (numAxles - 1) : 0;

    for (let i = 0; i < numAxles; i++) {
        const axleX = truckFrontX + i * axleSpacing;
        const numTiresOnAxle = axleConfig[i];
        const tiresPerSide = numTiresOnAxle / 2;

        const sideHeight = 16; // Vertical gap between tires on the same side
        const xOffset = 0; // Horizontal offset for "inner" tires to give perspective

        for (let j = 0; j < tiresPerSide; j++) {
            // Add a top and a bottom tire for each 'ring'
            const currentX = axleX + (j % 2) * xOffset;

            // Top side tire (truck body is 32.5-67.5, tire is ~18% high)
            // Gap of ~1%: tire bottom at 31.5. Tire top at 31.5 - 18 = 13.5
            positions.push({ x: currentX, y: 16.5 - j * sideHeight });

            // Bottom side tire
            // Gap of ~1%: tire top at 68.5.
            positions.push({ x: currentX, y: 68.5 + j * sideHeight });
        }
    }
    return positions;
}

// Update tire visual appearance
function updateTireVisual(tireNum) {
    const tireElement = document.getElementById(`tire-${tireNum}`);
    if (!tireElement || !tpmsData[tireNum]) return;

    const tire = tpmsData[tireNum];
    tireElement.className = "tire";

    if (tire.status === "critical") {
        tireElement.classList.add("critical");
    } else if (tire.status === "warning") {
        tireElement.classList.add("warning");
    } else {
        tireElement.classList.add("normal");
    }

    // Update tire display with all three metrics
}

// Update tire display with pressure, temperature, and battery
function updateTireDisplay(tireNum) {
    const tire = tpmsData[tireNum];
    if (!tire) return;

    const pressureEl = document.getElementById(`tire-pressure-${tireNum}`);
    const tempEl = document.getElementById(`tire-temp-${tireNum}`);
    const batteryEl = document.getElementById(`tire-battery-${tireNum}`);

    if (pressureEl) {
        pressureEl.innerHTML = `<span class="metric-label">P:</span>${tire.pressure.toFixed(1)} PSI`;
    }
    if (tempEl) {
        tempEl.innerHTML = `<span class="metric-label">T:</span>${tire.temperature.toFixed(1)}°C`;
    }
    if (batteryEl) {
        batteryEl.innerHTML = `<span class="metric-label">B:</span>${tire.battery.toFixed(2)} W`;
    }
}

// Render data table
function renderTable() {
    const tbody = document.getElementById("tpms-table-body");
    tbody.innerHTML = "";

    for (let i = 1; i <= tireCount; i++) {
        const tire = tpmsData[i] || {
            position: getTirePositionName(i),
            pressure: 0,
            temperature: 0,
            battery: 0,
            status: "normal",
            lastUpdate: new Date(),
        };

        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${i}</strong></td>
            <td><strong>${tire.position}</strong></td>
            <td>${tire.pressure.toFixed(1)}</td>
            <td>${tire.temperature.toFixed(1)}</td>
            <td>${tire.battery.toFixed(2)} W</td>
            <td>${tire.lastUpdate.toLocaleTimeString()}</td>
        `;
        tbody.appendChild(row);
    }
}

// Update table row
function updateTableRow(tireNum) {
    const tire = tpmsData[tireNum];
    if (!tire) return;

    const rows = document.querySelectorAll("#tpms-table-body tr");
    if (rows[tireNum - 1]) {
        rows[tireNum - 1].innerHTML = `
            <td><strong>${tireNum}</strong></td>
            <td><strong>${tire.position}</strong></td>
            <td>${tire.pressure.toFixed(1)}</td>
            <td>${tire.temperature.toFixed(1)}</td>
            <td>${tire.battery.toFixed(2)} W</td>
            <td>${tire.lastUpdate.toLocaleTimeString()}</td>
        `;
    }
}

// Update chart based on selected metric
function updateChart(metricType) {
    if (!chart) return;

    const datasets = [];
    const colors = generateColors(tireCount);
    let allLabels = new Set();

    // Collect all time labels
    for (let i = 1; i <= tireCount; i++) {
        const history = dataHistory[metricType][i] || [];
        history.forEach((h) => allLabels.add(h.x));
    }

    const sortedLabels = Array.from(allLabels).sort();

    // Create datasets for each tire
    for (let i = 1; i <= tireCount; i++) {
        const history = dataHistory[metricType][i] || [];
        const dataMap = new Map(history.map((h) => [h.x, h.y]));

        // Map data to sorted labels
        const data = sortedLabels.map((label) => dataMap.get(label) || null);

        datasets.push({
            label: `Tire ${i} (${getTirePositionName(i)})`,
            data: data,
            borderColor: colors[i - 1],
            backgroundColor: colors[i - 1] + "40",
            tension: 0.4,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
        });
    }

    chart.data.labels = sortedLabels;
    chart.data.datasets = datasets;

    // Update chart title and Y-axis label
    const titles = {
        pressure: "Pressure (PSI)",
        temperature: "Temperature (°C)",
        battery: "Battery Level (W)",
    };

    chart.options.plugins.title.text = `TPMS ${titles[metricType]} Over Time`;
    chart.options.scales.y.title.text = titles[metricType];

    chart.update();
}

// Generate distinct colors for tires
function generateColors(count) {
    const colors = [];
    const hueStep = 360 / Math.max(count, 1);

    for (let i = 0; i < count; i++) {
        const hue = (i * hueStep) % 360;
        const saturation = 70 + (i % 3) * 10;
        const lightness = 45 + (i % 2) * 10;
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }

    return colors;
}

// Simulate data for testing
function simulateTPMSData() {
    if (!isCollecting) return;

    for (let i = 1; i <= tireCount; i++) {
        // Simulate realistic variations
        const basePressure = 35 + (i % 3) * 5;
        const baseTemp = 20 + (i % 2) * 5;
        const baseBattery = 3.5 + (i % 4) * 0.5;

        const data = {
            pressure: basePressure + (Math.random() - 0.5) * 8,
            temperature: baseTemp + (Math.random() - 0.5) * 10,
            battery: Math.max(
                2,
                Math.min(5, baseBattery + (Math.random() - 0.5) * 1),
            ),
        };
        updateTireData(i, data);
    }
}
