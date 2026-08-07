#include <WiFi.h>
#include <ThingSpeak.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <PulseSensorPlayground.h>

//====================== WiFi ======================
//const char* ssid = "CU_EVENT5G";
//const char* password = "think@2025#";

//====================== WiFi ======================
const char* ssid = "Mimansa21";
const char* password = "mimansa21";

WiFiClient client;

//================== ThingSpeak ====================
unsigned long channelID = 3446548;
const char *WriteAPIKey = "0P73YBEU545NR09U";

//====================== LCD =======================
LiquidCrystal_I2C lcd(0x27, 16, 2);

//================ Pulse Sensor ====================
const int PulseWire = 34;
const int Threshold = 550;

PulseSensorPlayground pulseSensor;

//===================== LEDs =======================
const int greenLED = 25;
const int yellowLED = 26;
const int redLED = 27;

//==================== Buzzer ======================
const int buzzer = 14;

//==================================================
unsigned long lastUploadTime = 0;
int BPM = 0;

//==================================================
void setup()
{
  Serial.begin(115200);

  pinMode(greenLED, OUTPUT);
  pinMode(yellowLED, OUTPUT);
  pinMode(redLED, OUTPUT);
  pinMode(buzzer, OUTPUT);

  digitalWrite(greenLED, LOW);
  digitalWrite(yellowLED, LOW);
  digitalWrite(redLED, LOW);

  lcd.init();
  lcd.backlight();

  lcd.setCursor(0,0);
  lcd.print("Heart Monitor");
  lcd.setCursor(0,1);
  lcd.print("Starting...");
  delay(2000);
  lcd.clear();

  // Pulse Sensor
  pulseSensor.analogInput(PulseWire);
  pulseSensor.setThreshold(Threshold);

  if (pulseSensor.begin())
  {
    Serial.println("Pulse Sensor Ready");
  }

  // WiFi
  lcd.clear();
  lcd.print("Connecting WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");

  lcd.clear();
  lcd.print("WiFi Connected");
  delay(1500);
  lcd.clear();

  ThingSpeak.begin(client);
}

//==================================================
void loop()
{
  if (pulseSensor.sawStartOfBeat())
  {
    BPM = pulseSensor.getBeatsPerMinute();
    Serial.print("Heart Rate: ");
    Serial.print(BPM);
    Serial.println(" BPM");

    lcd.clear();

    lcd.setCursor(0,0);
    lcd.print("BPM:");
    lcd.print(BPM);

    // Turn OFF all LEDs
    digitalWrite(greenLED, LOW);
    digitalWrite(yellowLED, LOW);
    digitalWrite(redLED, LOW);
    noTone(buzzer);

    // Bradycardia
    if (BPM < 60)
    {
      digitalWrite(yellowLED, HIGH);

      lcd.setCursor(0,1);
      lcd.print("Status: LOW");

      tone(buzzer,1000);
      delay(300);
      noTone(buzzer);
    }

    // Normal
    else if (BPM >= 60 && BPM <= 100)
    {
      digitalWrite(greenLED,HIGH);

      lcd.setCursor(0,1);
      lcd.print("Status: NORMAL");
    }

    // Tachycardia
    else
    {
      digitalWrite(redLED,HIGH);

      lcd.setCursor(0,1);
      lcd.print("Status: HIGH");

      tone(buzzer,2000);
      delay(500);
      noTone(buzzer);
    }
  }

  // Upload to ThingSpeak every 15 seconds
  if (millis() - lastUploadTime >= 15000 && BPM > 0)
  {
    if (WiFi.status() == WL_CONNECTED)
    {
      ThingSpeak.setField(1, BPM);

      int x = ThingSpeak.writeFields(channelID, WriteAPIKey);

      if (x == 200)
      {
        Serial.println("ThingSpeak Update Successful");
      }
      else
      {
        Serial.print("Upload Error: ");
        Serial.println(x);
      }
    }

    lastUploadTime = millis();
  }

  delay(20);
}
