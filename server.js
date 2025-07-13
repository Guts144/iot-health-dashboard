// server.js
require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const mysql = require('mysql2/promise'); // Using promise-based version for async/await

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Initialize Socket.IO with the HTTP server

const PORT = process.env.PORT || 3000;

// --- MySQL Database Connection ---
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

let dbConnection = null; // Initialize as null

async function connectToDatabase() {
    try {
        dbConnection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database!');
    } catch (error) {
        console.error('Error connecting to MySQL:', error);
        // Implement robust error handling, e.g., retry logic
        // Only retry if dbConnection is null or disconnected
        if (!dbConnection || dbConnection.state === 'disconnected') {
            setTimeout(connectToDatabase, 5000); // Retry after 5 seconds
        }
    }
}

// --- MQTT Client Setup ---
const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: 'NodeJS_HealthDashboard_' + Math.random().toString(16).substr(2, 8),
    protocol: 'mqtts', // Ensure secure connection
    rejectUnauthorized: false // WARNING: Only for testing! In production, use proper certificates.
});

mqttClient.on('connect', () => {
    console.log('Connected to HiveMQ MQTT broker!');
    mqttClient.subscribe(process.env.MQTT_TOPIC, (err) => {
        if (!err) {
            console.log(`Subscribed to topic: ${process.env.MQTT_TOPIC}`);
        } else {
            console.error('MQTT subscription error:', err);
        }
    });
});

mqttClient.on('error', (error) => {
    console.error('MQTT connection error:', error);
});

mqttClient.on('message', async (topic, message) => {
    // --- IMPORTANT: Check if dbConnection is established before using it ---
    if (!dbConnection) {
        console.warn('Database connection not yet established. Skipping MQTT message processing.');
        return; // Exit early if DB is not ready
    }

    try {
        const payload = JSON.parse(message.toString());
        console.log(`Received MQTT message on topic ${topic}:`, payload);

        // Destructure ntc_temp correctly
        const { body_temp, ntc_temp, fall_detected } = payload;
        const userId = 1; // Assuming a single user for now (from your DB setup)

        // --- Store data in MySQL ---
        const [result] = await dbConnection.execute(
            'INSERT INTO sensor_data (user_id, body_temp, ambient_temp, fall_detected) VALUES (?, ?, ?, ?)',
            [userId, body_temp, ntc_temp, fall_detected] // Use ntc_temp here
        );
        console.log('Sensor data inserted into DB:', result.insertId);

        // --- Check for Alerts and Store ---
        const [thresholds] = await dbConnection.execute(
            'SELECT threshold_value FROM thresholds WHERE user_id = ? AND threshold_name = ?',
            [userId, 'Max Body Temp']
        );
        const maxBodyTempThreshold = thresholds.length > 0 ? thresholds[0].threshold_value : 38.0; // Default if not found

        let alertType = null;
        let alertMessage = null;
        let alertValue = null;

        if (body_temp > maxBodyTempThreshold) {
            alertType = 'High Body Temp';
            alertMessage = `Body temperature exceeded ${maxBodyTempThreshold}°C: ${body_temp}°C`;
            alertValue = body_temp;
        } else if (fall_detected) {
            alertType = 'Fall Detected';
            alertMessage = 'User fall detected!';
            alertValue = null; // No specific value for fall
        }

        if (alertType) {
            const [alertResult] = await dbConnection.execute(
                'INSERT INTO alerts (user_id, alert_type, alert_value, message) VALUES (?, ?, ?, ?)',
                [userId, alertType, alertValue, alertMessage]
            );
            console.log('Alert inserted into DB:', alertResult.insertId);
            // Emit alert to frontend via WebSocket
            io.emit('new_alert', {
                id: alertResult.insertId,
                timestamp: new Date(),
                type: alertType,
                value: alertValue,
                message: alertMessage,
                is_resolved: false
            });
        }

        // --- Emit real-time data to connected clients via Socket.IO ---
        io.emit('sensor_update', {
            timestamp: new Date(),
            body_temp,
            ambient_temp: ntc_temp, // <--- FIX: Use ntc_temp here
            fall_detected,
            is_alert: !!alertType // True if an alert was triggered
        });

    } catch (error) {
        console.error('Error processing MQTT message or saving to DB:', error);
    }
});

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log('A user connected via WebSocket:', socket.id);

    socket.on('disconnect', () => {
        console.log('User disconnected from WebSocket:', socket.id);
    });

    // You can add more socket.on listeners here for client-to-server communication
    // For example, if the client wants to request specific historical data
});

// --- Express.js API Routes ---

// Serve static files from the 'public' directory
app.use(express.static('public'));
app.use(express.json()); // Enable JSON body parsing for API requests

// API to get latest sensor data
app.get('/api/v1/sensor_data/latest', async (req, res) => {
    if (!dbConnection) return res.status(503).json({ error: 'Database not connected' });
    try {
        const userId = 1; // Assuming a single user
        const [rows] = await dbConnection.execute(
            'SELECT body_temp, ambient_temp, fall_detected, timestamp FROM sensor_data WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1',
            [userId]
        );
        res.json(rows[0] || {});
    } catch (error) {
        console.error('Error fetching latest sensor data:', error);
        res.status(500).json({ error: 'Failed to fetch latest sensor data' });
    }
});

// API to get historical sensor data
app.get('/api/v1/sensor_data/history', async (req, res) => {
    if (!dbConnection) return res.status(503).json({ error: 'Database not connected' });
    try {
        const userId = 1; // Assuming a single user
        const { limit = 100, start_date, end_date } = req.query; // Default to last 100 entries

        let query = 'SELECT body_temp, ambient_temp, fall_detected, timestamp FROM sensor_data WHERE user_id = ?';
        const params = [userId];

        if (start_date) {
            query += ' AND timestamp >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND timestamp <= ?';
            params.push(end_date);
        }

        query += ' ORDER BY timestamp ASC LIMIT ?';
        params.push(parseInt(limit));

        const [rows] = await dbConnection.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching historical sensor data:', error);
        res.status(500).json({ error: 'Failed to fetch historical sensor data' });
    }
});

// API to get active alerts
app.get('/api/v1/alerts/active', async (req, res) => {
    if (!dbConnection) return res.status(503).json({ error: 'Database not connected' });
    try {
        const userId = 1; // Assuming a single user
        const [rows] = await dbConnection.execute(
            'SELECT alert_id, alert_type, alert_value, message, timestamp, is_resolved FROM alerts WHERE user_id = ? AND is_resolved = FALSE ORDER BY timestamp DESC',
            [userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching active alerts:', error);
        res.status(500).json({ error: 'Failed to fetch active alerts' });
    }
});

// API to resolve an alert
app.put('/api/v1/alerts/:id/resolve', async (req, res) => {
    if (!dbConnection) return res.status(503).json({ error: 'Database not connected' });
    try {
        const { id } = req.params;
        const userId = 1; // Assuming a single user
        const [result] = await dbConnection.execute(
            'UPDATE alerts SET is_resolved = TRUE WHERE alert_id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Alert not found or not authorized' });
        }
        res.json({ message: 'Alert resolved successfully' });
    } catch (error) {
        console.error('Error resolving alert:', error);
        res.status(500).json({ error: 'Failed to resolve alert' });
    }
});

// API to get thresholds
app.get('/api/v1/thresholds', async (req, res) => {
    if (!dbConnection) return res.status(503).json({ error: 'Database not connected' });
    try {
        const userId = 1; // Assuming a single user
        const [rows] = await dbConnection.execute(
            'SELECT threshold_name, threshold_value, unit FROM thresholds WHERE user_id = ?',
            [userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching thresholds:', error);
        res.status(500).json({ error: 'Failed to fetch thresholds' });
    }
});

// API to update a threshold
app.put('/api/v1/thresholds/:name', async (req, res) => {
    if (!dbConnection) return res.status(503).json({ error: 'Database not connected' });
    try {
        const { name } = req.params;
        const { value } = req.body;
        const userId = 1; // Assuming a single user

        if (typeof value === 'undefined' || isNaN(parseFloat(value))) {
            return res.status(400).json({ message: 'Invalid threshold value provided' });
        }

        const [result] = await dbConnection.execute(
            'UPDATE thresholds SET threshold_value = ? WHERE user_id = ? AND threshold_name = ?',
            [parseFloat(value), userId, name]
        );

        if (result.affectedRows === 0) {
            // If no rows updated, it might be a new threshold or an invalid name.
            // For this project, we assume thresholds are pre-seeded.
            return res.status(404).json({ message: 'Threshold not found or not authorized' });
        }
        res.json({ message: `Threshold '${name}' updated successfully` });
    } catch (error) {
        console.error('Error updating threshold:', error);
        res.status(500).json({ error: 'Failed to update threshold' });
    }
});


// --- Start Server ---
async function startServer() {
    await connectToDatabase(); // Ensure DB connection before starting server
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Open your browser to view the dashboard.');
    });
}

startServer();

