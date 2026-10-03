const API = "http://127.0.0.1:5000";

let currentProduct = null;


/* --------------------------------
   GET ACTIVE TAB PRODUCT
-------------------------------- */

async function getProduct() {

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tabs.length) return null;

  const tab = tabs[0];

  try {

    const result = await chrome.tabs.sendMessage(
      tab.id,
      {
        type: "GET_PRODUCT"
      }
    );

    return result;

  } catch (error) {

    console.error(error);

    return {
      product_name: tab.title || "Unknown product",
      product_description: "",
      product_url: tab.url || "",
      image_url: "",
      price: "",
      category: "Other"
    };
  }
}


/* --------------------------------
   CATEGORY
-------------------------------- */

function updateCategory(category) {

  const select = document.getElementById("category");

  const exists = [...select.options]
    .some(option => option.value === category);

  if (exists) {
    select.value = category;
  }

  document.getElementById("categoryPill")
    .textContent = category;
}


/* --------------------------------
   LOAD PRODUCT
-------------------------------- */

async function loadProduct() {

  setLoading();

  currentProduct = await getProduct();

  if (!currentProduct) return;

  document.getElementById("productName")
    .textContent =
    currentProduct.product_name || "Unknown product";

  document.getElementById("productPrice")
    .textContent =
    currentProduct.price || "";

  const image =
    document.getElementById("productImage");

  if (currentProduct.image_url) {
    image.src = currentProduct.image_url;
    image.style.display = "block";
  } else {
    image.style.display = "none";
  }

  updateCategory(currentProduct.category);

  await analyzeProduct();
}


/* --------------------------------
   ANALYZE
-------------------------------- */

async function analyzeProduct() {

  if (!currentProduct) return;

  const category =
    document.getElementById("category").value;

  try {

    const response = await fetch(
      `${API}/product/analyze`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({

          product_name:
            currentProduct.product_name,

          product_description:
            currentProduct.product_description,

          product_url:
            currentProduct.product_url,

          category,

          price:
            currentProduct.price
        })
      }
    );

    if (!response.ok) {
      throw new Error("Backend analysis failed");
    }

    const data = await response.json();

    renderAnalysis(data);

  } catch (error) {

    console.error(error);

    /*
      Temporary fallback.
      Backend endpoint connect झाल्यावर
      real values दिसतील.
    */

    renderDemoAnalysis(category);
  }
}


/* --------------------------------
   RENDER REAL DATA
-------------------------------- */

function renderAnalysis(data) {

  const score =
    Number(data.eco_score ?? data.score ?? 0);

  document.getElementById("ecoScore")
    .textContent = score;

  document.getElementById("scoreProgress")
    .style.width = `${score}%`;

  document.getElementById("scoreBadge")
    .textContent = score >= 75
      ? "GOOD CHOICE"
      : score >= 50
      ? "MODERATE"
      : "HIGH IMPACT";

  document.getElementById("roomScore")
    .textContent = Math.max(0, 100 - score);

  document.getElementById("improveProgress")
    .style.width = `${Math.max(0, 100 - score)}%`;

  document.getElementById("material")
    .textContent =
    data.material ||
    data.detected_material ||
    "Not identified";

  document.getElementById("packaging")
    .textContent =
    data.packaging || "Not verified";

  document.getElementById("recyclable")
    .textContent =
    data.recyclable || "—";

  document.getElementById("biodegradable")
    .textContent =
    data.biodegradable || "—";

  document.getElementById("certification")
    .textContent =
    data.certification || "Not certified";

  document.getElementById("shipping")
    .textContent =
    data.shipping_distance || "—";

  document.getElementById("carbon")
    .textContent =
    data.carbon_footprint ||
    data.carbon_footprint_kg_co2e_per_kg
      ? `${data.carbon_footprint || data.carbon_footprint_kg_co2e_per_kg} kg CO₂e`
      : "—";

  document.getElementById("durability")
    .textContent =
    data.durability || "—";

  document.getElementById("scoreDescription")
    .textContent =
    data.description ||
    "Based on available sustainability information.";

  renderAlternatives(
    data.alternatives ||
    data.greener_alternatives ||
    []
  );
}


/* --------------------------------
   DEMO DATA
-------------------------------- */

function renderDemoAnalysis(category) {

  const demo = {

    "T-Shirt": {
      score: 78,
      material: "Organic cotton",
      packaging: "Recycled paper",
      recyclable: "65%",
      biodegradable: "4 / 5",
      certification: "GOTS",
      shipping: "2,100 km",
      carbon: "3.8 kg CO₂e",
      durability: "8 / 10"
    },

    "Shirt": {
      score: 71,
      material: "Cotton poplin",
      packaging: "Plastic polybag",
      recyclable: "28%",
      biodegradable: "2 / 5",
      certification: "Not certified",
      shipping: "5,200 km",
      carbon: "6.4 kg CO₂e",
      durability: "6 / 10"
    },

    "Saree": {
      score: 84,
      material: "Organic cotton",
      packaging: "Reusable cloth",
      recyclable: "72%",
      biodegradable: "5 / 5",
      certification: "Verified",
      shipping: "1,400 km",
      carbon: "2.9 kg CO₂e",
      durability: "9 / 10"
    },

    "Jeans": {
      score: 62,
      material: "Cotton denim",
      packaging: "Cardboard",
      recyclable: "40%",
      biodegradable: "3 / 5",
      certification: "Not certified",
      shipping: "4,800 km",
      carbon: "8.1 kg CO₂e",
      durability: "8 / 10"
    },

    "Dress": {
      score: 68,
      material: "Cotton blend",
      packaging: "Plastic polybag",
      recyclable: "32%",
      biodegradable: "3 / 5",
      certification: "Not certified",
      shipping: "4,200 km",
      carbon: "5.7 kg CO₂e",
      durability: "7 / 10"
    },

    "Shoes": {
      score: 58,
      material: "Synthetic leather",
      packaging: "Cardboard",
      recyclable: "22%",
      biodegradable: "1 / 5",
      certification: "Not certified",
      shipping: "6,000 km",
      carbon: "9.2 kg CO₂e",
      durability: "7 / 10"
    }

  };

  const d =
    demo[category] ||
    demo["Shirt"];

  renderAnalysis({

    eco_score: d.score,

    material: d.material,

    packaging: d.packaging,

    recyclable: d.recyclable,

    biodegradable: d.biodegradable,

    certification: d.certification,

    shipping_distance: d.shipping,

    carbon_footprint: d.carbon,

    durability: d.durability,

    description:
      "Sustainability estimate based on material, packaging, durability, certification and estimated carbon impact.",

    alternatives: [
      {
        name: "Organic Cotton Alternative",
        score: 88,
        material: "Organic cotton",
        carbon: "3.1 kg CO₂e"
      },
      {
        name: "Recycled Material Alternative",
        score: 82,
        material: "Recycled fibre",
        carbon: "3.6 kg CO₂e"
      }
    ]

  });
}


/* --------------------------------
   ALTERNATIVES
-------------------------------- */

function renderAlternatives(items) {

  const container =
    document.getElementById("alternativesList");

  container.innerHTML = "";

  if (!items.length) {

    container.innerHTML = `
      <div class="alternative">
        <div class="alt-content">
          <div class="alt-name">
            No greener alternatives found
          </div>
        </div>
      </div>
    `;

    return;
  }

  items.slice(0, 3).forEach(item => {

    const div =
      document.createElement("div");

    div.className = "alternative";

    div.innerHTML = `

      <div class="alt-content">

        <div class="alt-name">
          ${escapeHtml(
            item.name ||
            item.product_name ||
            "Greener option"
          )}
        </div>

        <div class="alt-meta">
          ${escapeHtml(
            item.material ||
            "Sustainable material"
          )}
          •
          ${escapeHtml(
            item.carbon ||
            "Lower impact"
          )}
        </div>

      </div>

      <div class="alt-score">
        ${Number(item.score || item.eco_score || 0)}/100
      </div>

    `;

    container.appendChild(div);
  });
}


/* --------------------------------
   LOADING
-------------------------------- */

function setLoading() {

  document.getElementById("ecoScore")
    .textContent = "…";

  document.getElementById("scoreBadge")
    .textContent = "ANALYZING";

  document.getElementById("material")
    .textContent = "Analyzing...";

  document.getElementById("packaging")
    .textContent = "Analyzing...";

  document.getElementById("alternativesList")
    .innerHTML = `
      <div class="alternative skeleton"></div>
      <div class="alternative skeleton"></div>
    `;
}


/* --------------------------------
   ESCAPE
-------------------------------- */

function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* --------------------------------
   EVENTS
-------------------------------- */

document
  .getElementById("refreshBtn")
  .addEventListener("click", loadProduct);

document
  .getElementById("category")
  .addEventListener("change", analyzeProduct);

document
  .getElementById("analysisBtn")
  .addEventListener("click", () => {

    if (!currentProduct?.product_url) return;

    chrome.tabs.create({
      url:
        currentProduct.product_url
    });

  });


loadProduct();