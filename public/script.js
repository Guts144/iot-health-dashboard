// public/script.js

const socket = io(); // Connect to the Socket.IO server

// DOM Elements
const currentBodyTempEl = document.getElementById('currentBodyTemp');
const currentAmbientTempEl = document.getElementById('currentAmbientTemp');
const currentFallStatusEl = document.getElementById('currentFallStatus');
const healthStatusIndicator = document.getElementById('healthStatusIndicator');
const alertsList = document.getElementById('alertsList');
const noAlertsMessage = document.getElementById('noAlertsMessage');
const thresholdForm = document.getElementById('thresholdForm');
const thresholdMessage = document.getElementById('thresholdMessage');

// Chart.js instances - initialized to null
let bodyTempChart = null;
let ambientTempChart = null;

const MAX_CHART_DATA_POINTS = 60; // Display last 60 data points (e.g., 2 minutes if update every 2s)

// --- Chart Initialization ---
function initializeCharts() {
    const commonChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'minute',
                    tooltipFormat: 'HH:mm:ss',
                    displayFormats: {
                        minute: 'HH:mm'
                    }
                },
                title: {
                    display: true,
                    text: 'Time'
                }
            },
            y: {
                beginAtZero: false,
                title: {
                    display: true,
                    text: 'Temperature (°C)'
                }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        }
    };

    bodyTempChart = new Chart(document.getElementById('bodyTempChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Body Temperature',
                data: [],
                borderColor: 'rgb(59, 130, 246)', // Tailwind blue-500
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            ...commonChartOptions,
            scales: {
                ...commonChartOptions.scales,
                y: { ...commonChartOptions.scales.y, title: { display: true, text: 'Body Temperature (°C)' } }
            }
        }
    });

    ambientTempChart = new Chart(document.getElementById('ambientTempChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Ambient Temperature',
                data: [],
                borderColor: 'rgb(168, 85, 247)', // Tailwind purple-500
                backgroundColor: 'rgba(168, 85, 247, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            ...commonChartOptions,
            scales: {
                ...commonChartOptions.scales,
                y: { ...commonChartOptions.scales.y, title: { display: true, text: 'Ambient Temperature (°C)' } }
            }
        }
    });

    console.log('Charts initialized.'); // Add a log to confirm initialization
}

// --- Data Update Functions ---
function updateCurrentValues(data) {
    currentBodyTempEl.textContent = `${data.body_temp ? data.body_temp.toFixed(1) : '--.-'} °C`;
    currentAmbientTempEl.textContent = `${data.ambient_temp ? data.ambient_temp.toFixed(1) : '--.-'} °C`;
    currentFallStatusEl.textContent = data.fall_detected ? 'YES' : 'NO';
    currentFallStatusEl.classList.toggle('text-red-600', data.fall_detected);
    currentFallStatusEl.classList.toggle('text-yellow-600', !data.fall_detected); // Keep yellow for no fall

    // Update overall health indicator
    if (data.is_alert) {
        healthStatusIndicator.textContent = 'ALERT';
        healthStatusIndicator.classList.remove('bg-green-500');
        healthStatusIndicator.classList.add('bg-red-500');
    } else {
        healthStatusIndicator.textContent = 'NORMAL';
        healthStatusIndicator.classList.remove('bg-red-500');
        healthStatusIndicator.classList.add('bg-green-500');
    }
}

function updateCharts(data) {
    // Check if charts are initialized before attempting to update
    if (!bodyTempChart || !ambientTempChart) {
        console.warn('Charts not yet initialized. Skipping chart update.');
        return;
    }

    // Ensure timestamp is a valid Date object
    const timestamp = new Date(data.timestamp);
    if (isNaN(timestamp.getTime())) {
        console.error('Invalid timestamp received for chart:', data.timestamp);
        return; // Skip update if timestamp is invalid
    }

    // Body Temp Chart
    bodyTempChart.data.labels.push(timestamp);
    bodyTempChart.data.datasets[0].data.push(data.body_temp);
    if (bodyTempChart.data.labels.length > MAX_CHART_DATA_POINTS) {
        bodyTempChart.data.labels.shift();
        bodyTempChart.data.datasets[0].data.shift();
    }
    bodyTempChart.update();

    // Ambient Temp Chart
    ambientTempChart.data.labels.push(timestamp);
    ambientTempChart.data.datasets[0].data.push(data.ambient_temp);
    if (ambientTempChart.data.labels.length > MAX_CHART_DATA_POINTS) {
        ambientTempChart.data.labels.shift();
        ambientTempChart.data.datasets[0].data.shift();
    }
    ambientTempChart.update();

    console.log('Chart data updated:', {
        timestamp: timestamp.toISOString(),
        bodyTemp: data.body_temp,
        ambientTemp: data.ambient_temp
    });
}

function addAlertToLog(alert) {
    noAlertsMessage.classList.add('hidden'); // Hide "No alerts" message

    const alertDiv = document.createElement('div');
    alertDiv.id = `alert-${alert.id}`;
    alertDiv.classList.add('alert-item', 'bg-red-100'); // Default to red for new alerts

    const timestamp = new Date(alert.timestamp).toLocaleString();
    const alertValueDisplay = alert.value ? ` (${alert.value.toFixed(1)}°C)` : '';

    alertDiv.innerHTML = `
        <div class="alert-details">
            <p class="alert-type text-red-700">${alert.type} ${alertValueDisplay}</p>
            <p class="alert-message">${alert.message}</p>
            <p class="text-xs text-gray-500 mt-1">${timestamp}</p>
        </div>
        <div class="alert-actions">
            <button class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md resolve-btn" data-alert-id="${alert.id}">
                Resolve
            </button>
        </div>
    `;
    alertsList.prepend(alertDiv); // Add new alerts at the top

    // Attach event listener for the resolve button
    alertDiv.querySelector('.resolve-btn').addEventListener('click', () => resolveAlert(alert.id));
}

function updateAlertStatusInLog(alertId) {
    const alertDiv = document.getElementById(`alert-${alertId}`);
    if (alertDiv) {
        alertDiv.classList.remove('bg-red-100');
        alertDiv.classList.add('bg-green-100'); // Change background to green for resolved
        alertDiv.querySelector('.alert-type').classList.remove('text-red-700');
        alertDiv.querySelector('.alert-type').classList.add('text-green-700'); // Change text color
        alertDiv.querySelector('.resolve-btn').remove(); // Remove the resolve button
        alertDiv.querySelector('.alert-details').innerHTML += '<p class="text-xs text-gray-500 mt-1">Resolved</p>';
    }
    checkAndShowNoAlertsMessage();
}

function checkAndShowNoAlertsMessage() {
    const activeAlerts = alertsList.querySelectorAll('.alert-item:not(.bg-green-100)').length;
    if (activeAlerts === 0) {
        noAlertsMessage.classList.remove('hidden');
    } else {
        noAlertsMessage.classList.add('hidden');
    }
}

// --- API Calls ---
async function fetchInitialData() {
    try {
        // Fetch latest sensor data
        const latestResponse = await fetch('/api/v1/sensor_data/latest');
        const latestData = await latestResponse.json();
        if (Object.keys(latestData).length > 0) {
            updateCurrentValues(latestData);
        }

        // Fetch historical sensor data for charts (e.g., last hour)
        const historyResponse = await fetch(`/api/v1/sensor_data/history?limit=${MAX_CHART_DATA_POINTS}`);
        const historyData = await historyResponse.json();
        console.log('Fetched historical data:', historyData); // Debugging: Check historical data

        // Ensure charts are initialized before populating with historical data
        if (!bodyTempChart || !ambientTempChart) {
            console.warn('Charts not yet initialized when fetching historical data. Initializing now.');
            initializeCharts(); // Re-initialize if for some reason they weren't
        }

        historyData.forEach(d => {
            const timestamp = new Date(d.timestamp);
            if (!isNaN(timestamp.getTime())) { // Ensure timestamp is valid
                bodyTempChart.data.labels.push(timestamp);
                bodyTempChart.data.datasets[0].data.push(d.body_temp);
                ambientTempChart.data.labels.push(timestamp);
                ambientTempChart.data.datasets[0].data.push(d.ambient_temp);
            } else {
                console.warn('Skipping invalid historical timestamp:', d.timestamp);
            }
        });
        bodyTempChart.update();
        ambientTempChart.update();

        // Fetch active alerts
        const alertsResponse = await fetch('/api/v1/alerts/active');
        const activeAlerts = await alertsResponse.json();
        alertsList.innerHTML = ''; // Clear existing alerts
        if (activeAlerts.length > 0) {
            activeAlerts.forEach(alert => addAlertToLog(alert));
        } else {
            noAlertsMessage.classList.remove('hidden');
        }

        // Fetch thresholds
        const thresholdsResponse = await fetch('/api/v1/thresholds');
        const thresholds = await thresholdsResponse.json();
        thresholds.forEach(t => {
            // Ensure the ID matches the HTML element's ID (e.g., "Max Body Temp" -> "maxBodyTemp")
            const inputId = t.threshold_name.replace(/\s/g, '');
            const inputEl = document.getElementById(inputId);
            if (inputEl) {
                inputEl.value = t.threshold_value;
            } else {
                console.warn(`Input element with ID '${inputId}' not found for threshold '${t.threshold_name}'`);
            }
        });

    } catch (error) {
        console.error('Error fetching initial data:', error);
        // Display a user-friendly error message on the dashboard
    }
}

async function resolveAlert(alertId) {
    try {
        const response = await fetch(`/api/v1/alerts/${alertId}/resolve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            updateAlertStatusInLog(alertId); // Update UI immediately
            // Consider re-fetching active alerts to ensure consistency if needed
        } else {
            const errorData = await response.json();
            console.error('Failed to resolve alert:', errorData.message);
            // Show error message to user
        }
    } catch (error) {
        console.error('Error resolving alert:', error);
        // Show error message to user
    }
}

async function updateThreshold(name, value) {
    try {
        const response = await fetch(`/api/v1/thresholds/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: parseFloat(value) })
        });
        const data = await response.json();
        if (response.ok) {
            thresholdMessage.textContent = data.message;
            thresholdMessage.classList.remove('text-red-500');
            thresholdMessage.classList.add('text-green-500');
        } else {
            thresholdMessage.textContent = data.message || 'Failed to update threshold.';
            thresholdMessage.classList.remove('text-green-500');
            thresholdMessage.classList.add('text-red-500');
        }
    } catch (error) {
        console.error('Error updating threshold:', error);
        thresholdMessage.textContent = 'Network error or server unavailable.';
        thresholdMessage.classList.remove('text-green-500');
        thresholdMessage.classList.add('text-red-500');
    } finally {
        setTimeout(() => thresholdMessage.textContent = '', 3000); // Clear message after 3 seconds
    }
}

// --- Event Listeners ---
thresholdForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(thresholdForm);
    for (const [name, value] of formData.entries()) {
        updateThreshold(name, value);
    }
});

// --- Socket.IO Event Handlers ---
socket.on('connect', () => {
    console.log('Connected to server via Socket.IO');
});

socket.on('sensor_update', (data) => {
    console.log('Real-time sensor update:', data);
    updateCurrentValues(data);
    updateCharts(data); // This will now check if charts are initialized
});

socket.on('new_alert', (alert) => {
    console.log('New alert received:', alert);
    addAlertToLog(alert);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server via Socket.IO');
});

socket.on('connect_error', (err) => {
    console.error('Socket.IO connection error:', err.message);
});

// --- Initialize on DOM Load ---
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts(); // Ensure charts are initialized first
    fetchInitialData(); // Then fetch initial data
});

