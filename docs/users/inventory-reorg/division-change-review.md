# Division Change Review — Inventory-Division-Confirmation.xlsx

**Date:** 2026-08-24 · **Source:** operator-corrected `docs/inventory-reorg/Inventory-Division-Confirmation.xlsx` vs live new-prod

## Summary — what will change

- **83 category → division assignments** — all to categories that **already exist** in prod (they're empty, no items yet). **Nothing is created or deleted.**
  - MEP: **68** · Maintenance: **12** · Pest Control & Cleaning: **3**
- **0 changes** to the 950 existing items' divisions — you left every existing item's Yes/No exactly as it was.
- **1 row removed** from the sheet: `[Products] Test 1 > TEst sub 1 > Test sub 2 :: item 1` (a leftover test item). **Your call** — delete it from prod, or leave it. I won't delete without your say-so.

## How it applies

Each assignment writes one row to `inventory_category_divisions` (via the `rpc_set_category_divisions` we shipped today). Because inheritance is **live**, once a category is assigned a division, **every item you add under it later automatically inherits that division** — and so do its sub-categories. These 83 categories are empty today, so this is forward-looking: it wires up the divisions so the new MEP / Maintenance / Pest lines are ready for stock.

> Note: many of these are parent/child of each other in the same division (e.g. all of CCTV is MEP). Assigning the top alone would cascade down, but I'll apply **exactly the 83 you marked** so the sheet and the DB match 1:1.

## → MEP (68)

**Products:**
- CCTV
- CCTV > Accessories
- CCTV > Cameras
- CCTV > Cameras > Indoor
- CCTV > Cameras > Indoor > Cube
- CCTV > Cameras > Indoor > Dome
- CCTV > Cameras > Indoor > Turret
- CCTV > Cameras > Outdoor
- CCTV > Cameras > Outdoor > Bullet
- CCTV > Cameras > Outdoor > Dome
- CCTV > Cameras > Outdoor > PTZ
- CCTV > Recorders
- CCTV > Recorders > NVR
- CCTV > Storage
- Door Intercom
- Door Intercom > Accessories
- Door Intercom > Door Locks
- Door Intercom > Door Locks > Electric Strike
- Door Intercom > Door Locks > Magnetic Lock
- Door Intercom > Indoor Monitor
- Door Intercom > Outdoor Station
- Home Automation > Buspro > Curtain Control > Curtain Motor
- Home Automation > Buspro > HVAC Control > Fan Coil Controller
- Home Automation > Buspro > Lighting Control > DALI Gateway
- Home Automation > Buspro > Lighting Control > LED Driver
- Home Automation > Buspro > Panels & Keypads
- Home Automation > Buspro > Panels & Keypads > Button Panel / Keypad
- Home Automation > Buspro > Panels & Keypads > Touch Screen
- Home Automation > Buspro > Power > Energy Meter
- Home Automation > Buspro > Sensors
- Home Automation > KNX > Actuators
- Home Automation > KNX > Actuators > Switch Actuator
- Home Automation > KNX > Audio & Media
- Home Automation > KNX > Cabling & Enclosures
- Home Automation > KNX > Curtain Control
- Home Automation > KNX > Curtain Control > Curtain Actuator
- Home Automation > KNX > Curtain Control > Curtain Motor
- Home Automation > KNX > HVAC Control
- Home Automation > KNX > HVAC Control > AC Gateway (VRV/VRF)
- Home Automation > KNX > HVAC Control > Fan Coil Controller
- Home Automation > KNX > HVAC Control > IR Control
- Home Automation > KNX > Lighting Control
- Home Automation > KNX > Lighting Control > DALI Gateway
- Home Automation > KNX > Lighting Control > Dimming Actuator
- Home Automation > KNX > Lighting Control > LED Driver
- Home Automation > KNX > Panels & Keypads
- Home Automation > KNX > Panels & Keypads > Button Panel / Keypad
- Home Automation > KNX > Panels & Keypads > Touch Screen
- Home Automation > KNX > Power
- Home Automation > KNX > Power > Energy Meter
- Home Automation > KNX > Power > Power Supply
- Home Automation > KNX > Sensors
- Network
- Network > Access Points
- Network > Racks & Accessories
- Network > Routers
- Network > Structured Cabling
- Network > Structured Cabling > Cat6 Cable
- Network > Structured Cabling > Faceplates
- Network > Structured Cabling > Patch Cords
- Network > Structured Cabling > Patch Panels
- Network > Switches
- Phone Intercom
- Phone Intercom > Accessories
- Phone Intercom > Exchange & Switch Boxes
- Phone Intercom > Handsets
- Phone Intercom > Handsets > With Screen
- Phone Intercom > Handsets > Without Screen

## → Maintenance (12)

**Products:**
- Electrical > Lighting > LED Light > Strip
- Water Filter > Central > Remove Impurities > Media
- Water Heater
- Water Heater > Instant Heater
- Water Heater > Local Unit
- Water Pump > Accessories > Floating Device
- Water Tank Cooler > Coil Cooling > Rotary Compressor
- Water Tank Cooler > Converted AC Unit > Piston Compressor
- Water Tank Cooler > Pump circulation

**Spare Parts:**
- Electrical > Lighting > LED Light
- Water Pump > Accessories
- Water Tank Cooler

## → Pest Control & Cleaning (3)

**Consumables:**
- Cleaning Supplies > Carpet & Stain Care > Carpet Cleaner
- Cleaning Supplies > Carpet & Stain Care > Spot Cleaner
- Pest Control > Bed Bug
