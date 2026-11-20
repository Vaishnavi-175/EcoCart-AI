# 🌿 EcoCart AI

**An AI-powered Chrome extension that shows the real environmental impact of clothes while you shop, and recommends greener alternatives.**

B.Tech Final Year Project · DYPCET, Kolhapur

![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-1a9b66)
![Backend](https://img.shields.io/badge/Backend-Flask-2c3e50)
![Database](https://img.shields.io/badge/Database-PostgreSQL%20(Neon)-336791)
![Hosting](https://img.shields.io/badge/Hosted%20on-Render-46e3b7)

---

## 📑 Contents
- [About](#-about)
- [Problem statement](#-problem-statement)
- [Objectives](#-objectives)
- [Features](#-features)
- [How the eco score works](#-how-the-eco-score-works)
- [System design](#-system-design)
- [Modules](#-modules)
- [Data and database](#-data-and-database)
- [Tech stack](#-tech-stack)
- [Setup guide](#-setup-guide-step-by-step)
- [Deployment](#-deployment-render)
- [API endpoints](#-api-endpoints)
- [Limitations](#-limitations)
- [Future work](#-future-work)
- [Team](#-team)

## 📌 About

Fast fashion has a large carbon and water footprint, but a shopper cannot see it on a product page. EcoCart AI adds that missing information. You press **Add to bag** on any shopping website (or type a fabric, or take a photo), and the extension shows an **eco score out of 100**, the estimated carbon and water cost of the garment, care and recycling advice, and **similar products with a higher eco score**.

## ❓ Problem statement

Online shoppers who want to buy sustainably have no easy way to compare clothes. Product pages list price and style, but not the environmental cost of the fabric. Eco-friendly claims are often vague ("green", "conscious") and hard to verify. Existing sustainability tools are usually separate websites that a shopper must visit on purpose, so most people never use them.

**EcoCart AI solves this inside the shopping flow.** It reads the fabric information already on the page, turns it into a clear score, and suggests better options without the shopper leaving the website.

## 🎯 Objectives

1. Convert fabric composition into a simple 0–100 eco score using carbon and water data.
2. Show the impact of a whole garment (carbon, water, carbon per wear), not just the fibre.
3. Work on any shopping website through a browser extension.
4. Recommend similar products with a higher eco score from a real product catalogue.
5. Detect eco-label claims (GOTS, OEKO-TEX, GRS and others) and warn about vague wording.
6. Let users track their choices and see their total estimated impact.
7. Support a photo-based path using a garment detection model.

## 👥 Target users

Students and young shoppers buying clothes online, sustainability-minded buyers, and anyone who wants a quick check before pressing "Buy".

## ✨ Features

| Feature | What it does |
|---|---|
| **Eco score** | Scores a fabric or a blend from 0 to 100 using carbon and water data. Green (70+), amber (45–69), red (below 45). |
| **Page scan and Add to bag** | Reads the fabric composition from a shopping page, scores it and saves it to your bag. Also works from the right-click menu. |
| **Camera and Upload** | Take a photo with your webcam or upload one. A YOLO model detects the garment type, then you confirm the fabric. If the model is unavailable you can pick the garment manually. |
| **Colour-coded Bag** | Items are marked green, amber or red, with filters (tier, minimum score, maximum price, search) and a "Greenest in bag" tag. |
| **Compare** | Side-by-side comparison of up to six fabrics or products on eco score, carbon, water, carbon per wear and price, with a winner for every metric. |
| **Impact dashboard** | Tappable cards for items tracked, estimated carbon, estimated water and spend, each explaining where the number comes from. |
| **Recommendations** | A content-based recommender suggests similar products with a better eco score from a catalogue of imported products. |
| **Eco-label detection** | Finds claims such as GOTS, OEKO-TEX and GRS on the page and warns about vague "green" wording. |
| **Fabric health check** | Microplastic shedding, durability, recyclability, biodegradability and care tips. |

## 🧮 How the eco score works

For a material with carbon footprint `C` (kg CO₂e per kg) and water use `W` (litres per kg):

```
Sc = clamp(100 − C / 35 × 100)
Sw = clamp(100 − W / 180000 × 100)
Eco score E = round(0.6 × Sc + 0.4 × Sw)
```

If water data is missing, `E = round(Sc)`. For blends, the score is weighted by each fibre's share. Tiers: **70 and above = Good**, **45–69 = Average**, **below 45 = High impact**.

**Garment impact:** garment carbon = fabric carbon per kg × typical garment weight (for example a T-shirt or jeans). Carbon per wear = garment carbon ÷ expected number of wears for that fabric's durability.

**Recommender:** cosine similarity on product-name words, plus an eco gain term:
`R = 0.55 × similarity + 0.45 × gain`, where `gain = clamp((Ep − E0) / 40)`. If no close match exists, it falls back in three steps: same garment, similar words, then the greenest products.

> All values are **estimates** from our materials database, not exact measurements.

## 🏗 System design

```
┌──────────────────────┐   HTTPS    ┌────────────────────┐    SQL    ┌────────────────────┐
│  Chrome Extension    │ ─────────► │  Flask API         │ ────────► │  Neon PostgreSQL   │
│  popup · content ·   │            │  (Render)          │           │  materials,        │
│  background · camera │ ◄───────── │  /eco-score        │           │  product_dataset,  │
└──────────────────────┘    JSON    │  /recommend /detect│           │  catalog_products  │
                                    └────────────────────┘           └────────────────────┘
```

**Flow of a typical use:**
1. The user opens a product page and presses **Add to bag** (or **Scan this page**).
2. The content script reads the title, price, image and the fabric text.
3. The extension finds the fibres and their percentages, then asks the backend for each fibre's score.
4. The extension combines them into a garment report and saves the item in the bag (`chrome.storage.local`).
5. For recommendations, the backend compares the product name with the catalogue and returns similar products with a higher eco score.

## 🧩 Modules

| Module | Files | Responsibility |
|---|---|---|
| **Popup UI** | `extension/popup.html`, `popup.js` | Five tabs: Material, Camera, Bag, Compare, Impact |
| **Camera page** | `extension/camera.html`, `camera.js` | Live webcam capture, hands the photo to the popup |
| **Page reader** | `extension/content.js`, `page.js` | Reads title, price, image, fabric and eco-label text from shopping pages |
| **Background worker** | `extension/background.js` | Right-click "Add to bag", saves the captured product |
| **Reference data** | `extension/data.js` | Garment weights, durability, microplastics, care and eco-label tables |
| **API** | `backend/app.py` | Eco score, alternatives, catalogue, detection, accounts, cart |
| **Recommender** | `backend/recommender.py` | Content-based product recommendation |
| **Garment detector** | `backend/garment_detector.py` | YOLO model that detects the garment type in a photo |
| **Importer** | `scripts/import_products.py` | Cleans and loads product datasets into the database |

## 🗄 Data and database

**Tables:** `materials` (carbon and water per kg for each fabric), `catalog_products` (small demo catalogue), `product_dataset` (imported products), `cart_items`, `users`.

**Product data sources** (public datasets):
- Flipkart products (Kaggle, `PromptCloudHQ/flipkart-products`, 20,000 rows)
- Myntra products (Hugging Face, `Gssmc/myntra_dataset`, 15,000 rows)

**Import pipeline:** the script detects the dataset format, keeps clothing items only, finds the main fibre of each product (largest percentage, otherwise the first named fibre), maps it to a material in the `materials` table, removes duplicates by (name, brand) and inserts the rest. In a dry run on Flipkart and Myntra together it found about 3,400 usable products.

**Fabrics:** cotton, denim, elastane/spandex, linen, modal, nylon, polyester, silk, viscose/rayon and wool are in the materials table at the time of writing.

## 🛠 Tech stack

- **Extension:** JavaScript, Chrome Manifest V3, `chrome.storage`
- **Backend:** Python, Flask, psycopg2, Flask-CORS
- **Database:** PostgreSQL on Neon
- **AI/ML:** Ultralytics YOLO (garment detection), content-based recommender (cosine similarity)
- **Hosting:** Render (free plan)

## 📁 Project structure

```
EcoCart-AI/
├── extension/            Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── camera.html / camera.js
│   ├── background.js
│   ├── content.js, page.js
│   └── data.js
├── backend/
│   ├── app.py
│   ├── recommender.py
│   ├── garment_detector.py
│   └── requirements.txt
├── scripts/
│   └── import_products.py
├── frontend/             project website
└── README.md
```

---

## 🚀 Setup guide (step by step)

### Requirements
- Google Chrome
- Python 3.10 or newer
- Git
- A free [Neon](https://neon.tech) account (PostgreSQL)

### Step 1: Clone the repository
```bash
git clone https://github.com/Vaishnavi-175/EcoCart-AI.git
cd EcoCart-AI
```

### Step 2: Set up the database
1. Create a project on Neon and copy the **pooled** connection string (the host contains `-pooler`).
2. Create the tables `materials`, `catalog_products`, `product_dataset`, `cart_items` and `users`, and load the materials data (carbon and water per kg for each fabric).

### Step 3: Run the backend locally
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

Set the environment variables, then start the server:

```bash
# Windows PowerShell
$env:DB_HOST="<neon-host>"
$env:DB_NAME="<database>"
$env:DB_USER="<user>"
$env:DB_PASSWORD="<password>"
$env:DB_PORT="5432"
python app.py
```

Check it: open `http://localhost:5000/eco-score/cotton`. You should see JSON with an eco score.

> Never commit your database password. Keep it in environment variables only.

### Step 4: Import the product dataset (optional, for better recommendations)
Download the datasets and put the CSV files in a `data/` folder:

- Flipkart: Kaggle `PromptCloudHQ/flipkart-products`
- Myntra: Hugging Face `Gssmc/myntra_dataset` (`train.csv`)

First do a dry run to see how many rows are usable, then do the real import:

```bash
python scripts/import_products.py --dry-run
python scripts/import_products.py
```

### Step 5: Load the extension in Chrome
1. If you run the backend locally, set `API` at the top of `extension/popup.js` to `http://localhost:5000`. (The default points to the hosted server.)
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension` folder.
5. Pin the EcoCart AI icon to the toolbar.
6. After any code change, click **Reload** on the extension and refresh the shopping tab.

### Step 6: Use it
1. Open any clothing product page (Myntra, Amazon, Flipkart, Meesho) and press **Add to bag**, or open the popup and use **Scan this page**.
2. **Material tab:** type a fabric (for example `polyester`) to see its report.
3. **Camera tab:** press **Take photo**, allow the camera, press **Capture**, then **Use this photo**, then click the EcoCart icon. You can also press **Upload**.
4. **Bag tab:** filter by colour, score or price. Use **+ Compare** and **Greener swap**.
5. **Compare** and **Impact** tabs show the comparison and your totals. Tap a card to see how a number is calculated.

## ☁ Deployment (Render)

1. Push the repository to GitHub.
2. On Render, create a **Web Service** from the repository, with root directory `backend`.
3. Build command: `pip install -r requirements.txt`. Start command: `gunicorn app:app`.
4. Add the environment variables `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`.
5. Deploy, then open `/catalog/stats` to confirm the server works.

> **Note:** the free plan sleeps after inactivity (the first request can take about a minute) and has 512 MB of RAM. The YOLO model may not fit in that memory, so camera detection can fail on the free plan. The manual garment picker is the fallback.

## 🔌 API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/eco-score/<material>` | Eco score, carbon and water for a material |
| GET | `/eco-score-detail/<material>` | Detailed material data |
| GET | `/alternatives/<material>` | Greener material alternatives |
| GET | `/recommend?name=&garment=&score=&limit=` | Similar products with a higher eco score |
| GET | `/recommend/debug` | Shows which product table the recommender uses |
| GET | `/catalog`, `/catalog/stats` | Catalogue and its size |
| POST | `/detect` | Detects the garment in an uploaded image (`image` field) |
| POST | `/signup`, `/login` | User accounts |
| POST/GET/DELETE | `/cart/...` | Cart storage |

## ⚠ Limitations

- Scores are estimates based on material averages, not the real supply chain of a product.
- Fabric is read from page text. If a page has no composition, the score is estimated or missing.
- The recommender uses product names and fabrics, not images.
- Camera detection depends on the server model and the free hosting plan.
- Only the fabrics present in the materials table can be scored.

## 🔭 Future work

- Brand-level sustainability data and certificate verification
- Support for more fabrics and regions
- Faster, lighter detection model, or on-device detection
- Firefox and Edge support



**Guide:** [Niraj A. Haval], Department of [CSE], DYPCET Kolhapur

## 📄 License

Academic project. [Replace with MIT or another licence if you want it open source.]

## 🙏 Acknowledgements

Datasets: Flipkart products (PromptCloud, Kaggle), Myntra dataset (Hugging Face `Gssmc/myntra_dataset`). Models: Ultralytics YOLO, trained on a Fashionpedia subset.
