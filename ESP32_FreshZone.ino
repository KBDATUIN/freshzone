// ============================================================
//  ESP32_FreshZone.ino
//  PMS7003 Air Quality Sensor → FreshZone Server
//  Sends PM1.0, PM2.5 readings via HTTP POST over WiFi
// ============================================================

#include <HardwareSerial.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── WiFi Credentials ─────────────────────────────────────────
// ⚠️ CHANGE THESE to your actual WiFi name and password
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ── FreshZone Server ─────────────────────────────────────────
// ⚠️ CHANGE THIS if your ngrok URL changes
const char* SERVER_URL = "https://unreceptive-pseudocharitable-jorge.ngrok-free.dev/api/readings";
const char* API_KEY    = "freshzone-esp32-key-2026";

// ── Zone Identity ─────────────────────────────────────────────
// Change to "ESP32-ZONE2" for the second unit
const char* NODE_CODE  = "ESP32-ZONE1";

// ── PMS7003 Serial (UART2) ───────────────────────────────────
HardwareSerial pmsSerial(2);
#define PMS_RX 16
#define PMS_TX 17

// ── RGB LED Pins (Red + Green only, no Blue per spec) ────────
#define RED_PIN   25
#define GREEN_PIN 32

// ── Timing ───────────────────────────────────────────────────
#define SEND_INTERVAL_MS  5000    // Send to server every 5 seconds
#define READ_INTERVAL_MS   1000   // Read sensor every 1 second

unsigned long lastSendTime = 0;

// ── PMS7003 Data Structure ───────────────────────────────────
struct PMS7003Data {
  uint16_t pm1_0;
  uint16_t pm2_5;
  uint16_t pm10;
};

// ── Read PMS7003 ─────────────────────────────────────────────
bool readPMS7003(PMS7003Data &data) {
  uint8_t buffer[32];

  while (pmsSerial.available() && pmsSerial.peek() != 0x42) {
    pmsSerial.read();
  }
  if (pmsSerial.available() < 32) return false;

  pmsSerial.readBytes(buffer, 32);

  if (buffer[0] != 0x42 || buffer[1] != 0x4D) return false;

  uint16_t checksum = 0;
  for (int i = 0; i < 30; i++) checksum += buffer[i];
  if (checksum != ((buffer[30] << 8) | buffer[31])) return false;

  data.pm1_0 = (buffer[10] << 8) | buffer[11];
  data.pm2_5 = (buffer[12] << 8) | buffer[13];
  data.pm10  = (buffer[14] << 8) | buffer[15];

  return true;
}

// ── LED Color via PWM ────────────────────────────────────────
void setColor(int r, int g) {
  ledcWrite(0, r);  // Red
  ledcWrite(1, g);  // Green
}

// Update LED based on PM2.5 level (matches server AQI thresholds)
void updateLED(uint16_t pm2_5) {
  if (pm2_5 <= 12) {
    setColor(0, 255);       // 🟢 Green  — Good
  } else if (pm2_5 <= 35) {
    setColor(255, 255);     // 🟡 Yellow — Moderate
  } else if (pm2_5 <= 55) {
    setColor(255, 100);     // 🟠 Orange — Unhealthy for Sensitive
  } else {
    setColor(255, 0);       // 🔴 Red    — Unhealthy / Detected
  }
}

// ── Connect to WiFi ──────────────────────────────────────────
void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    setColor(0, 255); // Green = connected
  } else {
    Serial.println("\n❌ WiFi Failed. Will retry...");
    setColor(255, 0); // Red = error
  }
}

// ── Send Readings to FreshZone Server ───────────────────────
void sendToServer(PMS7003Data &data) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi not connected. Reconnecting...");
    connectWiFi();
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  // Required by ngrok to skip browser warning
  http.addHeader("ngrok-skip-browser-warning", "true");

  // Build JSON payload
  StaticJsonDocument<200> doc;
  doc["node_code"] = NODE_CODE;
  doc["pm1_0"]     = data.pm1_0;
  doc["pm2_5"]     = data.pm2_5;
  doc["pm10"]      = data.pm10;

  String payload;
  serializeJson(doc, payload);

  Serial.print("📤 Sending: ");
  Serial.println(payload);

  int httpCode = http.POST(payload);

  if (httpCode == 200 || httpCode == 201) {
    String response = http.getString();
    Serial.print("✅ Server response: ");
    Serial.println(response);
  } else {
    Serial.print("❌ HTTP Error: ");
    Serial.println(httpCode);
    Serial.println(http.getString());
  }

  http.end();
}

// ── Setup ────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);

  // LED PWM setup (ESP32 Arduino core v3+)
  ledcAttach(RED_PIN,   0, 8);
  ledcAttach(GREEN_PIN, 1, 8);

  // Blink red/green to show boot
  setColor(255, 0); delay(300);
  setColor(0, 255); delay(300);
  setColor(0, 0);

  Serial.println("🚀 FreshZone ESP32 Air Quality Monitor Starting...");
  Serial.print("📍 Node: "); Serial.println(NODE_CODE);

  connectWiFi();
}

// ── Loop ─────────────────────────────────────────────────────
void loop() {
  PMS7003Data data;

  if (readPMS7003(data)) {
    Serial.printf("📊 PM1.0: %d | PM2.5: %d | PM10: %d µg/m³\n",
                  data.pm1_0, data.pm2_5, data.pm10);

    // Always update LED in real time
    updateLED(data.pm2_5);

    // Only POST to server every SEND_INTERVAL_MS
    unsigned long now = millis();
    if (now - lastSendTime >= SEND_INTERVAL_MS) {
      lastSendTime = now;
      sendToServer(data);
    }
  } else {
    Serial.println("⏳ Waiting for PMS7003 data...");
  }

  delay(READ_INTERVAL_MS);
}
