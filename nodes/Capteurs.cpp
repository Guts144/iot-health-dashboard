#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <MPU6050_tockn.h>

// WiFi Credentials
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// HiveMQ WebCluster MQTT
const char* mqtt_server = "20f70a4b696c43f7b466dc7eaa997739.s1.eu.hivemq.cloud";   // e.g., abc123456789.s1.eu.hivemq.cloud
const int mqtt_port = 8883;
const char* mqtt_user = "mohamed";
const char* mqtt_pass = "Azerfy123.";

// TLS Secure client
WiFiClientSecure espClient;
PubSubClient client(espClient);

// DS18B20
#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature bodyTempSensor(&oneWire);

// Analog NTC temp sensor
#define NTC_PIN 34

// LCD
LiquidCrystal_I2C lcd(0x27, 16, 2);

// MPU6050
MPU6050 mpu6050(Wire);

// State
bool fallDetected = false;

// NTC
const float BETA = 3950;

void connectToWiFi() {
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
}

void connectToMQTT() {
  client.setServer(mqtt_server, mqtt_port);
  espClient.setInsecure(); // For testing only (no certificate validation)

  while (!client.connected()) {
    Serial.print("Connecting to MQTT...");
    if (client.connect("ESP32Client", mqtt_user, mqtt_pass)) {
      Serial.println("connected.");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5s");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  lcd.begin(16, 2);
  lcd.backlight();

  connectToWiFi();
  connectToMQTT();

  bodyTempSensor.begin();
  Serial.print("Found ");
  Serial.print(bodyTempSensor.getDeviceCount(), DEC);
  Serial.println(" devices.");
  if (bodyTempSensor.getDeviceCount() == 0) {
    Serial.println("No DS18B20 sensor found! Check wiring and pull-up resistor.");
  }
  mpu6050.begin();
  mpu6050.calcGyroOffsets(true);

  lcd.setCursor(0, 0);
  lcd.print("System Ready");
  Serial.println("Setup complete");
}

void loop() {
  if (!client.connected()) {
    connectToMQTT();
  }
  client.loop();

  bodyTempSensor.requestTemperatures();
  float bodyTemp = bodyTempSensor.getTempCByIndex(0);
  int analogValue = analogRead(NTC_PIN);
  float ntcTemp ;
  if (analogValue == 0 || analogValue == 4095) {
    ntcTemp = NAN;
  } else {
    float voltage = analogValue * 3.3 / 4095.0;
    float resistance = 10000.0 * voltage / (3.3 - voltage);  // NTC is on top, resistor on bottom
    ntcTemp = 1 / (log(resistance / 10000.0) / BETA + 1.0 / 298.15) - 273.15;
  }

  mpu6050.update();
  float accZ = mpu6050.getAccZ();
  fallDetected = abs(accZ) < 0.2;

  // LCD Display
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Body:");
  lcd.print(bodyTemp, 1);
  lcd.print("C");

  lcd.setCursor(0, 1);
  lcd.print("Fall:");
  lcd.print(fallDetected ? "YES" : "NO");

  // Serial logs
  Serial.print("Body Temp: ");
  Serial.print(bodyTemp);
  Serial.print("C | Fall: ");
  Serial.println(fallDetected ? "YES" : "NO");

  // MQTT Publish
  String payload = String("{\"body_temp\":") + bodyTemp + 
                   ", \"ntc_temp\":" + ntcTemp + 
                   ", \"fall_detected\":" + (fallDetected ? "true" : "false") + "}";

  client.publish("esp32/health", payload.c_str());

  delay(2000);
}

