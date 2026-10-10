// Stillbench pebble: a pocket buzzer for the sit, so the phone can stay home.
// Board: Arduino UNO R4 WiFi. Piezo on pin 8 and GND.
// Copy arduino_secrets.h.example to arduino_secrets.h and fill it in.

#include <WiFiS3.h>
#include "arduino_secrets.h"

const int BUZZER_PIN = 8;
const unsigned long POLL_MS = 3000;

#if STILLBENCH_PORT == 443
WiFiSSLClient client;
#else
WiFiClient client;
#endif
String lastState = "idle";
unsigned long sitEndsAt = 0;
bool chimed = false;
unsigned long lastPoll = 0;

void chime() {
  tone(BUZZER_PIN, 1046, 180);
  delay(260);
  tone(BUZZER_PIN, 784, 420);
  delay(500);
  noTone(BUZZER_PIN);
}

void tick() {
  tone(BUZZER_PIN, 1568, 40);
}

void connectWifi() {
  while (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(SECRET_SSID, SECRET_PASS);
    delay(4000);
  }
}

// The server answers one line: "<state> <seconds>", e.g. "sitting 412".
bool poll(String &state, long &seconds) {
  if (!client.connect(STILLBENCH_HOST, STILLBENCH_PORT)) return false;
  client.print("GET /api/device HTTP/1.1\r\nHost: ");
  client.print(STILLBENCH_HOST);
  client.print("\r\nAuthorization: Bearer ");
  client.print(STILLBENCH_DEVICE_TOKEN);
  client.print("\r\nConnection: close\r\n\r\n");

  unsigned long started = millis();
  String response;
  while (client.connected() && millis() - started < 4000) {
    while (client.available()) response += (char)client.read();
  }
  client.stop();

  int body = response.indexOf("\r\n\r\n");
  if (!response.startsWith("HTTP/1.1 200") || body < 0) return false;
  String line = response.substring(body + 4);
  line.trim();
  int space = line.indexOf(' ');
  if (space < 0) return false;
  state = line.substring(0, space);
  seconds = line.substring(space + 1).toInt();
  return true;
}

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  connectWifi();
  tick();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();

  if (millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    String state;
    long seconds = 0;
    if (poll(state, seconds)) {
      if (state == "sitting") {
        sitEndsAt = millis() + (unsigned long)seconds * 1000UL;
        if (lastState != "sitting") {
          chimed = false;
          tick();
        }
      }
      if (state == "done" && !chimed) {
        chime();
        chimed = true;
      }
      lastState = state;
    }
  }

  if (lastState == "sitting" && !chimed && sitEndsAt && millis() >= sitEndsAt) {
    chime();
    chimed = true;
  }

  // A slow heartbeat while you sit, dark otherwise.
  bool sitting = lastState == "sitting" && !chimed;
  digitalWrite(LED_BUILTIN, sitting && (millis() / 1000) % 4 == 0 ? HIGH : LOW);
  delay(50);
}
