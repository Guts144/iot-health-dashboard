# 💡 IoT Health Monitoring System

A real-time IoT solution for monitoring a user's health. The system collects biometric and environmental data via ESP32-based sensor nodes, transmits it securely using MQTT, stores it in a MySQL database, and visualizes health status on both a **web dashboard** and **local devices** (LCD, RGB LED).

---

## 🔧 Features

- **Real-Time Data Collection**  
  - **Body Temperature** (DS18B20)  
  - **Ambient Temperature** (NTC sensor)  
  - **Motion & Fall Detection** (MPU6050)

- **Fall Detection System** using motion pattern recognition.

- **MQTT Communication** via **HiveMQ WebCluster**.

- **Data Storage** with **MySQL** for historical and analytical purposes.

- **Web Dashboard** (HTML/CSS/JS):
  - Live sensor readings
  - Status indicator (🟢 Normal / 🔴 Alert)
  - Trend charts
  - Recent alerts log

- **Remote Threshold Management** from dashboard UI.

- **Local Device Feedback**:
  - **LCD**: Body temperature & fall status (Node 1)
  - **7-Segment Display**: Modes: Body Temp, Threshold Adjust, Health Status (Node 2)
  - **RGB LED**: Green = Normal, Red = Alert (Node 2)
  - **Joystick**: Navigate & adjust thresholds locally

---

## 🧩 Components

### 🔌 Hardware

#### **Node 1 - Capteurs**
- ESP32
- DS18B20 (Body Temp)
- MPU6050 (Motion/Fall)
- NTC Sensor (Ambient Temp)
- 16x2 LCD (I2C)

#### **Node 2 - Actionneurs**
- ESP32
- RGB LED
- TM1637 7-Segment Display
- Analog Joystick

#### Other
- Ubuntu Server (MySQL + Node.js)
- HiveMQ WebCluster (MQTT Broker)

### 💻 Software / Technologies
- Arduino IDE
- **Node.js**, **Express.js**, **Socket.IO**, **MQTT.js**
- **MySQL**, `mysql2/promise`
- **HTML5**, **Tailwind CSS**, **JavaScript**
- **Chart.js**, `chartjs-adapter-date-fns`
- **dotenv** (env variable management)

---

## 🧠 System Architecture

### 1️⃣ ESP32 Node 1 – *Capteurs*
- Reads sensors and detects falls.
- Displays info locally.
- Publishes MQTT message:
  ```json
  {
    "body_temp": ...,
    "ntc_temp": ...,
    "fall_detected": ...
  }
## ESP32 Node 2 – Actionneurs

- Subscribes to MQTT topic  
- Evaluates thresholds  
- **Controls:**
  - RGB LED (status)
  - 7-Segment Display (data & status)
  - Joystick (navigation & threshold tuning)

---

## Node.js Server (Ubuntu)

- Subscribes to MQTT messages  
- Parses & stores data in MySQL  
- Detects alerts and pushes them to the dashboard via **WebSockets**  
- Provides **REST API** for:
  - Historical data
  - Active alerts
  - Threshold management

---

## Web Dashboard

- Accessible via browser: [http://localhost:3000](http://localhost:3000)
- **Displays:**
  - Live data and trends
  - Alerts log
  - Threshold controls
- Real-time updates via **Socket.IO**
## 🚀 Setup Instructions

---

### 🛠 MySQL Setup (Ubuntu)

 ```bash
 sudo apt update
 sudo apt install mysql-server
 sudo mysql_secure_installation
 ```
```sql
CREATE DATABASE health_monitor_db;
CREATE USER 'health_user'@'localhost' IDENTIFIED BY 'YOUR_STRONG_MYSQL_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON health_monitor_db.* TO 'health_user'@'localhost';
FLUSH PRIVILEGES;
```

Follow the instructions to install and configure MySQL (see earlier section).

Then create the following tables:
- `users`
- `sensor_data`
- `alerts`
- `thresholds`

> ⚠️ **Important:** Replace passwords and user credentials with secure values and never share `.env` files publicly.

---

### 🧰 Node.js Backend Setup

# Using NVM (recommended)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
source ~/.bashrc
nvm install node
```
```bash
cd iot-health-dashboard
npm init -y
npm install express mysql2 mqtt socket.io dotenv
```

- Create a `.env` file containing database and MQTT credentials (see example in earlier setup).

DB_HOST=localhost
DB_USER=health_user
DB_PASSWORD=YOUR_STRONG_MYSQL_PASSWORD_HERE
DB_NAME=health_monitor_db

MQTT_BROKER_URL=mqtts://your-hivemq-url:8883
MQTT_USERNAME=your_hivemq_username
MQTT_PASSWORD=your_hivemq_password
MQTT_TOPIC=esp32/health

PORT=3000

- 🔒 Add `.env` to your `.gitignore` to keep it private.
- Create `server.js` and place frontend files (`index.html`, `style.css`, `script.js`) in a `public/` directory.

---

### 🧪 ESP32 Setup

#### 1. Arduino IDE & Board Manager

- Open **Arduino IDE**
- Add ESP32 board URL in Preferences:
https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
- Install **ESP32** boards via Board Manager

#### 2. Required Libraries

Install the following libraries via Library Manager:
- **PubSubClient**
- **OneWire**
- **DallasTemperature**
- **LiquidCrystal I2C**
- **MPU6050_tockn**
- **TM1637Display**

#### 3. Update Code

- Replace Wi-Fi and MQTT credentials
- Validate JSON payload structure
- Check and match correct **pin mappings**

#### 4. Flash Each Node

- Select board: **ESP32 Dev Module**
- Upload the code
- Monitor serial output for verification

---

## ▶️ Running the System

1. **Start MySQL:**

 ```bash
 sudo systemctl start mysql
```
2. **Power on ESP32 nodes:**
(ensure Wi-Fi & MQTT connection)

3. **Run Node.js server:**


```bash
node server.js
```

4. **Open browser:**
http://localhost:3000

## 📊 Usage Overview

- Live Monitoring: Temperature, Fall Status, Overall Indicator
- Trend Charts: Historical temperature data
- Alerts: Log & resolve notifications
- Threshold Tuning: Via dashboard or joystick on Node 2

## 🧯 Troubleshooting

- ❌ "Access denied for user..."
→ Check DB credentials in .env
- ❌ ambient_temp undefined
→ Ensure correct MQTT payload keys
- ❌ Chart adapter missing
→ Include chartjs-adapter-date-fns in HTML
- 📉 Growing chart heights
→ Add height (e.g., h-96) to canvas containers
- 🚫 No dashboard data
→ Confirm ESP32 connection, MQTT topic, server logs, and browser console

## 🌱 Future Enhancements

- Sync thresholds via MQTT (Node ⇌ Dashboard)
- User login & password hashing
- Support for multiple users
- Notifications (Email, SMS, Push)
- Advanced analytics / ML-based anomaly detection
- Remote actuator controls from UI
- Raw MPU data visualization
- More robust fall detection algorithm

# 👤 Author
Mohamed Gharsalli
