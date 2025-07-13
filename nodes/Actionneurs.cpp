#include <WiFi.h>
#include <WiFiClientSecure.h> // Include for secure client
#include <PubSubClient.h>
#include <TM1637Display.h>

// WiFi credentials
const char* ssid = "Wokwi-GUEST"; // Use your WiFi SSID
const char* password = ""; // Use your WiFi password

// HiveMQ WebCluster MQTT
const char* mqtt_server = "20f70a4b696c43f7b466dc7eaa997739.s1.eu.hivemq.cloud"; // Your HiveMQ host
const int mqtt_port = 8883; // Secure MQTT port
const char* mqtt_user = "mohamed"; // Your HiveMQ username
const char* mqtt_pass = "Azerfy123."; // Your HiveMQ password

// TLS Secure client
WiFiClientSecure espClient; // Use WiFiClientSecure
PubSubClient client(espClient);

// RGB LED pins
#define RED_PIN 13
#define GREEN_PIN 12
#define BLUE_PIN 14

// 7 Segment (TM1637)
#define CLK 27
#define DIO 26
TM1637Display display(CLK, DIO);

// Joystick pins
#define JOY_X 34 // Analog X-axis
#define JOY_Y 35 // Analog Y-axis
#define JOY_SW 32 // Joystick button (active low)

// Variables
float bodyTemp = 0.0;
bool fallDetected = false; // Initialize to false
bool alert = false;

// Adjustable thresholds
float tempUpperThreshold = 38.0; // Default upper temperature threshold
float tempLowerThreshold = 36.0; // Default lower temperature threshold (can be used for hypothermia alerts)

// Joystick control variables
enum DisplayMode { CURRENT_DATA, ADJUST_UPPER_TEMP, ADJUST_LOWER_TEMP, REPORT_STATUS };
DisplayMode currentDisplayMode = CURRENT_DATA;
unsigned long lastJoystickActivity = 0;
const unsigned long JOYSTICK_TIMEOUT = 5000; // 5 seconds to return to CURRENT_DATA mode
const int JOYSTICK_DEADZONE = 500; // Analog read values near center (0-4095 range)

// Custom segment patterns for letters (renamed to avoid conflicts with TM1637Display library)
// These are common segment patterns for letters not directly supported by encodeDigit for 10-15.
// You might need to adjust these based on your specific TM1637 module and desired appearance.
const uint8_t MY_SEG_U = 0b00111110; // U
const uint8_t MY_SEG_L = 0b00111000; // L
const uint8_t MY_SEG_A = 0b01110111; // A
const uint8_t MY_SEG_E = 0b01111001; // E
const uint8_t MY_SEG_R = 0b01010000; // R (looks like a small r)
const uint8_t MY_SEG_F = 0b01110001; // F
const uint8_t MY_SEG_G = 0b01111100; // G
const uint8_t MY_SEG_O = 0b00111111; // O (same as 0)
const uint8_t MY_SEG_D = 0b00111101; // D (looks like a d)
const uint8_t MY_SEG_T = 0b01111000; // T (looks like a t)
const uint8_t MY_SEG_S = 0b01011011; // S

// Function to get segment pattern for a character
uint8_t getSegmentPatternForChar(char c) {
    c = toupper(c); // Convert to uppercase for consistent mapping
    switch (c) {
        case 'U': return MY_SEG_U;
        case 'L': return MY_SEG_L;
        case 'A': return MY_SEG_A;
        case 'E': return MY_SEG_E;
        case 'R': return MY_SEG_R;
        case 'F': return MY_SEG_F;
        case 'G': return MY_SEG_G;
        case 'O': return MY_SEG_O;
        case 'D': return MY_SEG_D;
        case 'T': return MY_SEG_T;
        case 'S': return MY_SEG_S;
        case 'P': return display.encodeDigit(14); // P (using hex E)
        case 'H': return display.encodeDigit(11); // H (using hex B)
        case 'C': return display.encodeDigit(12); // C (using hex C)
        default: return 0; // Blank or unknown character
    }
}


void setup_wifi() {
    Serial.print("Connecting to WiFi...");
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected!");
}

void callback(char* topic, byte* message, unsigned int length) {
    String data;
    for (int i = 0; i < length; i++) data += (char)message[i];
    Serial.print("Message arrived on topic: ");
    Serial.print(topic);
    Serial.print(". Message: ");
    Serial.println(data);

    // Parse JSON
    // Example payload: {"body_temp":36.5, "ntc_temp":25.1, "fall_detected":true}
    // This is a basic parsing. For robust JSON parsing, consider using ArduinoJson library.
    int bodyTempStartIndex = data.indexOf("\"body_temp\":") + strlen("\"body_temp\":");
    int bodyTempEndIndex = data.indexOf(",", bodyTempStartIndex);
    if (bodyTempStartIndex != -1 && bodyTempEndIndex != -1) {
        bodyTemp = data.substring(bodyTempStartIndex, bodyTempEndIndex).toFloat();
    }

    int fallDetectedStartIndex = data.indexOf("\"fall_detected\":") + strlen("\"fall_detected\":");
    int fallDetectedEndIndex = data.indexOf("}", fallDetectedStartIndex);
    if (fallDetectedStartIndex != -1 && fallDetectedEndIndex != -1) {
        String fallDetectedStr = data.substring(fallDetectedStartIndex, fallDetectedEndIndex);
        fallDetected = (fallDetectedStr == "true");
    }

    // Set alert based on bodyTemp and fallDetected, using adjustable thresholds
    alert = (bodyTemp > tempUpperThreshold || bodyTemp < tempLowerThreshold || fallDetected);
}

void reconnect() {
    // Loop until we're reconnected
    while (!client.connected()) {
        Serial.print("Attempting MQTT connection...");
        // Attempt to connect with a client ID, username, and password
        // Using a different client ID for the subscriber to avoid conflicts
        if (client.connect("ESP32_SubscriberClient", mqtt_user, mqtt_pass)) {
            Serial.println("connected");
            // Subscribe to the topic your publisher is sending data to
            client.subscribe("esp32/health");
            Serial.println("Subscribed to esp32/health");
        } else {
            Serial.print("failed, rc=");
            Serial.print(client.state());
            Serial.println(" retrying in 5 seconds");
            // Wait 5 seconds before retrying
            delay(5000);
        }
    }
}

void setRGB(bool state) {
    if (state) { // Alert state (e.g., red for high temp or fall)
        digitalWrite(RED_PIN, HIGH);
        digitalWrite(GREEN_PIN, LOW);
        digitalWrite(BLUE_PIN, LOW);
    } else { // Normal state (e.g., green)
        digitalWrite(RED_PIN, LOW);
        digitalWrite(GREEN_PIN, HIGH);
        digitalWrite(BLUE_PIN, LOW);
    }
}

void handleJoystickInput() {
    int xValue = analogRead(JOY_X);
    int yValue = analogRead(JOY_Y);
    bool buttonPressed = (digitalRead(JOY_SW) == LOW); // Joystick button is active low

    // Check for joystick button press to change mode
    if (buttonPressed) {
        if (millis() - lastJoystickActivity > 200) { // Debounce
            currentDisplayMode = static_cast<DisplayMode>((currentDisplayMode + 1) % 4); // Cycle through modes
            lastJoystickActivity = millis();
            Serial.print("Mode changed to: ");
            switch (currentDisplayMode) {
                case CURRENT_DATA: Serial.println("CURRENT_DATA"); break;
                case ADJUST_UPPER_TEMP: Serial.println("ADJUST_UPPER_TEMP"); break;
                case ADJUST_LOWER_TEMP: Serial.println("ADJUST_LOWER_TEMP"); break;
                case REPORT_STATUS: Serial.println("REPORT_STATUS"); break;
            }
        }
    }

    // Adjust thresholds based on joystick Y-axis when in adjustment modes
    if (currentDisplayMode == ADJUST_UPPER_TEMP || currentDisplayMode == ADJUST_LOWER_TEMP) {
        if (yValue > (4095 / 2) + JOYSTICK_DEADZONE) { // Joystick moved up
            if (millis() - lastJoystickActivity > 200) { // Delay for smoother adjustment
                if (currentDisplayMode == ADJUST_UPPER_TEMP) {
                    tempUpperThreshold += 0.1;
                    if (tempUpperThreshold > 42.0) tempUpperThreshold = 42.0; // Cap max temp
                } else {
                    tempLowerThreshold += 0.1;
                    if (tempLowerThreshold > tempUpperThreshold - 0.5) tempLowerThreshold = tempUpperThreshold - 0.5; // Prevent lower > upper
                }
                lastJoystickActivity = millis();
            }
        } else if (yValue < (4095 / 2) - JOYSTICK_DEADZONE) { // Joystick moved down
            if (millis() - lastJoystickActivity > 200) { // Delay for smoother adjustment
                if (currentDisplayMode == ADJUST_UPPER_TEMP) {
                    tempUpperThreshold -= 0.1;
                    if (tempUpperThreshold < tempLowerThreshold + 0.5) tempUpperThreshold = tempLowerThreshold + 0.5; // Prevent upper < lower
                } else {
                    tempLowerThreshold -= 0.1;
                    if (tempLowerThreshold < 30.0) tempLowerThreshold = 30.0; // Cap min temp
                }
                lastJoystickActivity = millis();
            }
        }
    }

    // Automatically return to CURRENT_DATA mode after inactivity
    if (currentDisplayMode != CURRENT_DATA && millis() - lastJoystickActivity > JOYSTICK_TIMEOUT) {
        currentDisplayMode = CURRENT_DATA;
        Serial.println("Timeout: Returning to CURRENT_DATA mode.");
    }
}

void displayData() {
    uint8_t segments[4]; // Array to hold segment patterns for the 4 digits
    int displayValue;

    switch (currentDisplayMode) {
        case CURRENT_DATA:
            displayValue = (int)(bodyTemp * 10);
            display.showNumberDecEx(displayValue, 0b01000000, true); // Show X.Y
            Serial.print("Display: Current Temp: "); Serial.println(bodyTemp);
            break;
        case ADJUST_UPPER_TEMP:
            displayValue = (int)(tempUpperThreshold * 10);
            display.showNumberDecEx(displayValue, 0b01000000, false); // No decimal point for 'set' mode
            segments[0] = getSegmentPatternForChar('U'); // 'U'
            display.setSegments(segments, 1, 0); // Set first digit to 'U'
            Serial.print("Display: Set Upper Temp: "); Serial.println(tempUpperThreshold);
            break;
        case ADJUST_LOWER_TEMP:
            displayValue = (int)(tempLowerThreshold * 10);
            display.showNumberDecEx(displayValue, 0b01000000, false);
            segments[0] = getSegmentPatternForChar('L'); // 'L'
            display.setSegments(segments, 1, 0); // Set first digit to 'L'
            Serial.print("Display: Set Lower Temp: "); Serial.println(tempLowerThreshold);
            break;
        case REPORT_STATUS:
            // Clear display first
            display.clear();
            if (alert) {
                segments[0] = getSegmentPatternForChar('A');
                segments[1] = getSegmentPatternForChar('L');
                segments[2] = getSegmentPatternForChar('E');
                segments[3] = getSegmentPatternForChar('R');
                display.setSegments(segments, 4, 0);
            } else if (fallDetected) {
                segments[0] = getSegmentPatternForChar('F');
                segments[1] = getSegmentPatternForChar('A');
                segments[2] = getSegmentPatternForChar('L');
                segments[3] = getSegmentPatternForChar('L');
                display.setSegments(segments, 4, 0);
            } else {
                segments[0] = getSegmentPatternForChar('G');
                segments[1] = getSegmentPatternForChar('O');
                segments[2] = getSegmentPatternForChar('O');
                segments[3] = getSegmentPatternForChar('D');
                display.setSegments(segments, 4, 0);
            }
            Serial.print("Display: Report Status: "); Serial.println(alert ? "ALERT" : (fallDetected ? "FALL" : "GOOD"));
            break;
    }
}

void setup() {
    Serial.begin(115200);
    setup_wifi();

    // Configure the secure client to skip certificate validation (for testing only)
    espClient.setInsecure();
    client.setServer(mqtt_server, mqtt_port); // Set server with secure port
    client.setCallback(callback);

    pinMode(RED_PIN, OUTPUT);
    pinMode(GREEN_PIN, OUTPUT);
    pinMode(BLUE_PIN, OUTPUT);
    pinMode(JOY_SW, INPUT_PULLUP); // Enable internal pull-up resistor for the joystick button

    display.setBrightness(0x0f); // Max brightness for TM1637
    Serial.println("Setup complete for Subscriber");
    lastJoystickActivity = millis(); // Initialize timeout
}

void loop() {
    if (!client.connected()) {
        reconnect();
    }
    client.loop(); // Keep the MQTT connection alive and process incoming messages

    handleJoystickInput(); // Check and process joystick input

    // RGB LED based on alert (using the new adjustable thresholds)
    setRGB(alert);

    // Display data based on current mode
    displayData();

    // Print current state to Serial for debugging
    Serial.print("Body Temp: ");
    Serial.print(bodyTemp);
    Serial.print("C | Fall Detected: ");
    Serial.print(fallDetected ? "YES" : "NO");
    Serial.print(" | Alert: ");
    Serial.println(alert ? "YES (Red LED)" : "NO (Green LED)");
    Serial.print("Upper Threshold: "); Serial.print(tempUpperThreshold);
    Serial.print(" | Lower Threshold: "); Serial.println(tempLowerThreshold);
    Serial.print("Current Mode: ");
    switch (currentDisplayMode) {
        case CURRENT_DATA: Serial.println("CURRENT_DATA"); break;
        case ADJUST_UPPER_TEMP: Serial.println("ADJUST_UPPER_TEMP"); break;
        case ADJUST_LOWER_TEMP: Serial.println("ADJUST_LOWER_TEMP"); break;
        case REPORT_STATUS: Serial.println("REPORT_STATUS"); break;
    }


    delay(100); // Shorter delay to make joystick adjustments more responsive
}

