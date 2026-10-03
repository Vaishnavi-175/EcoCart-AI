```jsx
import { useMemo, useState } from "react";
import {
  Camera,
  ScanBarcode,
  Link,
  PenLine,
  Leaf,
  ShoppingCart,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Recycle,
  BarChart3,
  X,
  Info,
  CheckCircle2,
  CircleAlert,
  Plus,
} from "lucide-react";
import "./App.css";

const MATERIALS = {
  cotton: {
    name: "Cotton",
    carbon: 8.0,
    baseScore: 62,
    recyclability: "Moderate",
  },
  polyester: {
    name: "Polyester",
    carbon: 12.5,
    baseScore: 48,
    recyclability: "Moderate",
  },
  recycled: {
    name: "Recycled Polyester",
    carbon: 6.5,
    baseScore: 78,
    recyclability: "Moderate",
  },
  linen: {
    name: "Linen",
    carbon: 5.0,
    baseScore: 82,
    recyclability: "Good",
  },
  wool: {
    name: "Wool",
    carbon: 9.5,
    baseScore: 67,
    recyclability: "Moderate",
  },
  viscose: {
    name: "Viscose",
    carbon: 7.0,
    baseScore: 58,
    recyclability: "Moderate",
  },
  nylon: {
    name: "Nylon",
    carbon: 13.0,
    baseScore: 45,
    recyclability: "Low",
  },
};

function findMaterial(value) {
  const text = value.toLowerCase().trim();

  const key = Object.keys(MATERIALS).find((item) =>
    text.includes(item)
  );

  return MATERIALS[key] || {
    name: value || "Unknown",
    carbon: 10,
    baseScore: 50,
    recyclability: "Unknown",
  };
}

function calculateScore({
  material,
  weight,
  recycledContent,
}) {
  const materialData = findMaterial(material);

  const safeWeight = Number(weight) || 0.25;
  const recycled = Math.min(
    100,
    Math.max(0, Number(recycledContent) || 0)
  );

  let score = materialData.baseScore;

  // Recycled-content benefit
  score += recycled * 0.18;

  // Lightweight-product adjustment
  if (safeWeight <= 0.2) {
    score += 5;
  } else if (safeWeight >= 1) {
    score -= 8;
  }

  score = Math.round(Math.max(0, Math.min(100, score)));

  const carbon = Number(
    (materialData.carbon * safeWeight).toFixed(2)
  );

  let level = "Needs improvement";

  if (score >= 80) {
    level = "Excellent";
  } else if (score >= 65) {
    level = "Good";
  } else if (score >= 50) {
    level = "Moderate";
  }

  return {
    score,
    level,
    carbon,
    material: materialData.name,
    recyclability: materialData.recyclability,
  };
}

function App() {
  const [activeMode, setActiveMode] = useState("manual");
  const [showManual, setShowManual] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const [compareCart, setCompareCart] = useState([]);

  const [form, setForm] = useState({
    productName: "",
    category: "Fashion",
    material: "",
    price: "",
    weight: "",
    recycledContent: "",
  });

  const [result, setResult] = useState(null);

  const modes = [
    {
      id: "camera",
      icon: Camera,
      title: "Camera",
      description: "Identify a product with AI",
    },
    {
      id: "barcode",
      icon: ScanBarcode,
      title: "Barcode",
      description: "Scan or enter a barcode",
    },
    {
      id: "url",
      icon: Link,
      title: "Product URL",
      description: "Analyze a shopping page",
    },
    {
      id: "manual",
      icon: PenLine,
      title: "Manual",
      description: "Enter product details",
    },
  ];

  const updateForm = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleMode = (mode) => {
    setActiveMode(mode);

    if (mode === "manual") {
      setShowManual(true);
    }
  };

  const handleCalculate = () => {
    if (!form.productName.trim()) {
      alert("Please enter a product name.");
      return;
    }

    if (!form.material.trim()) {
      alert("Please enter the main material.");
      return;
    }

    const calculated = calculateScore(form);

    setResult({
      ...calculated,
      productName: form.productName,
      category: form.category,
      price: form.price,
      weight: form.weight,
      recycledContent: form.recycledContent,
    });

    setShowManual(false);
    setShowExplanation(false);
  };

  const addToCompare = () => {
    if (!result) return;

    const alreadyAdded = compareCart.some(
      (item) => item.productName === result.productName
    );

    if (alreadyAdded) {
      return;
    }

    setCompareCart((previous) => [
      ...previous,
      result,
    ]);
  };

  const removeFromCompare = (productName) => {
    setCompareCart((previous) =>
      previous.filter(
        (item) => item.productName !== productName
      )
    );
  };

  const scoreMessage = useMemo(() => {
    if (!result) return "";

    if (result.score >= 80) {
      return "This product has a relatively strong sustainability profile based on the information provided.";
    }

    if (result.score >= 65) {
      return "This product shows several positive sustainability characteristics, with some areas that could still improve.";
    }

    if (result.score >= 50) {
      return "This product has a moderate sustainability profile. Material choice and recycled content are important improvement areas.";
    }

    return "This product has a lower sustainability score under the current model. Consider alternative materials or higher recycled content.";
  }, [result]);

  return (
    <div className="app">

      {/* NAVBAR */}
      <nav className="navbar">
        <div className="brand">
          <div className="brand-icon">
            <Leaf size={22} />
          </div>

          <div>
            <div className="brand-name">
              EcoCart-AI
            </div>

            <div className="brand-tagline">
              Sustainable Shopping Intelligence
            </div>
          </div>
        </div>

        <div className="nav-links">
          <button
            onClick={() => setActiveMode("manual")}
          >
            Analyzer
          </button>

          <button
            onClick={() => {
              if (compareCart.length > 0) {
                alert(
                  `${compareCart.length} product(s) added for comparison.`
                );
              } else {
                alert("Add products to Compare Cart first.");
              }
            }}
          >
            Compare
          </button>

          <button
            onClick={() =>
              alert(
                "EcoCart-AI analyzes product information using material, weight and recycled-content signals."
              )
            }
          >
            How it works
          </button>
        </div>

        <button className="cart-button">
          <ShoppingCart size={19} />
          Compare Cart

          <span className="cart-count">
            {compareCart.length}
          </span>
        </button>
      </nav>

      {/* HERO */}
      <main>
        <section className="hero">

          <div className="hero-badge">
            <Sparkles size={15} />
            AI-Powered Sustainability Intelligence
          </div>

          <h1>
            Shop smarter.
            <br />
            <span>Understand your impact.</span>
          </h1>

          <p className="hero-description">
            Analyze products using AI, barcode, URL or manual
            input. Discover carbon impact, materials,
            recyclability and an explainable Eco Score.
          </p>

          {/* ANALYZER CARD */}
          <div className="analyzer-card">

            <div className="card-header">
              <div>
                <h2>Analyze any product</h2>

                <p>
                  Choose how you want to identify your product.
                </p>
              </div>

              <div className="secure-badge">
                <ShieldCheck size={16} />
                Privacy-first
              </div>
            </div>

            <div className="mode-grid">

              {modes.map((mode) => {
                const Icon = mode.icon;
                const active =
                  activeMode === mode.id;

                return (
                  <button
                    key={mode.id}
                    className={`mode-card ${
                      active ? "active" : ""
                    }`}
                    onClick={() =>
                      handleMode(mode.id)
                    }
                  >
                    <div className="mode-icon">
                      <Icon size={25} />
                    </div>

                    <div className="mode-content">
                      <strong>{mode.title}</strong>
                      <span>
                        {mode.description}
                      </span>
                    </div>

                    <ArrowRight
                      className="mode-arrow"
                      size={18}
                    />
                  </button>
                );
              })}

            </div>

            {/* INPUT AREA */}
            <div className="input-area">

              {activeMode === "url" && (
                <>
                  <div className="input-label">
                    Product URL
                  </div>

                  <div className="input-row">
                    <Link size={20} />

                    <input
                      type="text"
                      placeholder="Paste a product page URL..."
                    />

                    <button
                      className="analyze-button"
                      onClick={() =>
                        alert(
                          "URL Analyzer is the next integration module."
                        )
                      }
                    >
                      Analyze
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </>
              )}

              {activeMode === "barcode" && (
                <>
                  <div className="input-label">
                    Barcode
                  </div>

                  <div className="input-row">
                    <ScanBarcode size={20} />

                    <input
                      type="text"
                      placeholder="Enter product barcode..."
                    />

                    <button
                      className="analyze-button"
                      onClick={() =>
                        alert(
                          "Barcode Analyzer is ready for database/API integration."
                        )
                      }
                    >
                      Analyze
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </>
              )}

              {activeMode === "camera" && (
                <div className="camera-placeholder">
                  <Camera size={36} />

                  <h3>
                    Camera analysis
                  </h3>

                  <p>
                    Camera-based garment detection
                    will identify the product category
                    using the EcoCart AI vision engine.
                  </p>

                  <button
                    className="primary-button"
                    onClick={() =>
                      alert(
                        "Camera module will connect to the YOLO garment detector."
                      )
                    }
                  >
                    <Camera size={18} />
                    Open Camera
                  </button>
                </div>
              )}

              {activeMode === "manual" && (
                <div className="manual-placeholder">

                  <PenLine size={30} />

                  <div>
                    <h3>
                      Enter product details
                    </h3>

                    <p>
                      Add product information to
                      calculate its sustainability
                      profile.
                    </p>
                  </div>

                  <button
                    className="primary-button"
                    onClick={() =>
                      setShowManual(true)
                    }
                  >
                    Start Analysis
                    <ArrowRight size={18} />
                  </button>

                </div>
              )}

            </div>
          </div>
        </section>

        {/* RESULT */}
        {result && (
          <section className="result-section">

            <div className="result-header">
              <div>
                <div className="hero-badge">
                  <CheckCircle2 size={15} />
                  Analysis complete
                </div>

                <h2>
                  {result.productName}
                </h2>

                <p>
                  {result.category} ·{" "}
                  {result.material}
                </p>
              </div>

              <button
                className="primary-button"
                onClick={addToCompare}
              >
                <Plus size={18} />
                Add to Compare
              </button>
            </div>

            <div className="result-grid">

              <div className="score-card">

                <div className="score-label">
                  ECO SCORE
                </div>

                <div className="score-number">
                  {result.score}
                  <span>/100</span>
                </div>

                <div className="score-level">
                  {result.level}
                </div>

                <div className="score-bar">
                  <div
                    style={{
                      width: `${result.score}%`,
                    }}
                  />
                </div>

                <p>
                  {scoreMessage}
                </p>

              </div>

              <div className="insight-card">

                <div className="insight-row">
                  <Leaf size={21} />

                  <div>
                    <span>Material</span>
                    <strong>
                      {result.material}
                    </strong>
                  </div>
                </div>

                <div className="insight-row">
                  <BarChart3 size={21} />

                  <div>
                    <span>
                      Estimated carbon impact
                    </span>

                    <strong>
                      {result.carbon} kg CO₂e
                    </strong>
                  </div>
                </div>

                <div className="insight-row">
                  <Recycle size={21} />

                  <div>
                    <span>Recyclability</span>

                    <strong>
                      {result.recyclability}
                    </strong>
                  </div>
                </div>

                <div className="insight-row">
                  <ShieldCheck size={21} />

                  <div>
                    <span>
                      Recycled content
                    </span>

                    <strong>
                      {result.recycledContent || 0}%
                    </strong>
                  </div>
                </div>

              </div>

            </div>

            <button
              className="explain-button"
              onClick={() =>
                setShowExplanation(
                  !showExplanation
                )
              }
            >
              <Info size={18} />
              Explain My Score
            </button>

            {showExplanation && (
              <div className="explanation-card">

                <h3>
                  Why did I get this score?
                </h3>

                <p>
                  EcoCart-AI currently combines
                  material characteristics,
                  estimated carbon intensity,
                  product weight and recycled
                  content into an interpretable
                  sustainability score.
                </p>

                <div className="explanation-list">

                  <div>
                    <CheckCircle2 size={17} />
                    <span>
                      Material choice contributes
                      significantly to the baseline
                      score.
                    </span>
                  </div>

                  <div>
                    <CheckCircle2 size={17} />
                    <span>
                      Higher recycled content can
                      improve the score.
                    </span>
                  </div>

                  <div>
                    <CheckCircle2 size={17} />
                    <span>
                      Product weight affects the
                      estimated carbon impact.
                    </span>
                  </div>

                  <div>
                    <CircleAlert size={17} />
                    <span>
                      Estimates depend on the
                      information supplied and should
                      not be treated as a certified
                      lifecycle assessment.
                    </span>
                  </div>

                </div>

              </div>
            )}

          </section>
        )}

        {/* COMPARE CART */}
        {compareCart.length > 0 && (
          <section className="compare-section">

            <div className="section-heading">
              <div>
                <h2>
                  Compare Cart
                </h2>

                <p>
                  Products you've selected for
                  side-by-side comparison.
                </p>
              </div>

              <ShoppingCart size={25} />
            </div>

            <div className="compare-grid">

              {compareCart.map((item) => (
                <div
                  className="compare-card"
                  key={item.productName}
                >

                  <button
                    className="compare-remove"
                    onClick={() =>
                      removeFromCompare(
                        item.productName
                      )
                    }
                  >
                    <X size={16} />
                  </button>

                  <h3>
                    {item.productName}
                  </h3>

                  <div className="compare-score">
                    {item.score}
                    <span>/100</span>
                  </div>

                  <p>
                    {item.material}
                  </p>

                  <div className="compare-details">
                    <span>
                      Carbon
                    </span>

                    <strong>
                      {item.carbon} kg CO₂e
                    </strong>
                  </div>

                  <div className="compare-details">
                    <span>
                      Recycled
                    </span>

                    <strong>
                      {item.recycledContent || 0}%
                    </strong>
                  </div>

                </div>
              ))}

            </div>
          </section>
        )}

        {/* TRUST FEATURES */}
        <section className="feature-section">

          <div className="feature">

            <div className="feature-icon">
              <BarChart3 size={22} />
            </div>

            <div>
              <h3>Eco Score</h3>

              <p>
                Understand sustainability on a
                simple 0–100 scale.
              </p>
            </div>

          </div>

          <div className="feature">

            <div className="feature-icon">
              <Leaf size={22} />
            </div>

            <div>
              <h3>
                Carbon Intelligence
              </h3>

              <p>
                Estimate product-level
                environmental impact.
              </p>
            </div>

          </div>

          <div className="feature">

            <div className="feature-icon">
              <Recycle size={22} />
            </div>

            <div>
              <h3>
                Material Insights
              </h3>

              <p>
                Explore materials, recycled
                content and recyclability.
              </p>
            </div>

          </div>

        </section>
      </main>

      {/* MANUAL MODAL */}
      {showManual && (
        <div className="modal-overlay">

          <div className="modal">

            <button
              className="close-button"
              onClick={() =>
                setShowManual(false)
              }
            >
              <X size={20} />
            </button>

            <div className="modal-icon">
              <Leaf size={25} />
            </div>

            <h2>
              Manual Product Analysis
            </h2>

            <p>
              Enter basic product information
              to generate an explainable
              sustainability profile.
            </p>

            <div className="form-grid">

              <div className="form-field">
                <label>
                  Product name
                </label>

                <input
                  value={form.productName}
                  onChange={(e) =>
                    updateForm(
                      "productName",
                      e.target.value
                    )
                  }
                  placeholder="e.g. Cotton T-Shirt"
                />
              </div>

              <div className="form-field">
                <label>
                  Category
                </label>

                <select
                  value={form.category}
                  onChange={(e) =>
                    updateForm(
                      "category",
                      e.target.value
                    )
                  }
                >
                  <option>
                    Fashion
                  </option>

                  <option>
                    Food
                  </option>

                  <option>
                    Electronics
                  </option>

                  <option>
                    Beauty
                  </option>

                  <option>
                    Home
                  </option>

                  <option>
                    Other
                  </option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Main material
                </label>

                <input
                  value={form.material}
                  onChange={(e) =>
                    updateForm(
                      "material",
                      e.target.value
                    )
                  }
                  placeholder="e.g. Cotton"
                />
              </div>

              <div className="form-field">
                <label>
                  Price (₹)
                </label>

                <input
                  value={form.price}
                  onChange={(e) =>
                    updateForm(
                      "price",
                      e.target.value
                    )
                  }
                  type="number"
                  placeholder="1299"
                />
              </div>

              <div className="form-field">
                <label>
                  Product weight (kg)
                </label>

                <input
                  value={form.weight}
                  onChange={(e) =>
                    updateForm(
                      "weight",
                      e.target.value
                    )
                  }
                  type="number"
                  step="0.01"
                  placeholder="0.25"
                />
              </div>

              <div className="form-field">
                <label>
                  Recycled content (%)
                </label>

                <input
                  value={form.recycledContent}
                  onChange={(e) =>
                    updateForm(
                      "recycledContent",
                      e.target.value
                    )
                  }
                  type="number"
                  min="0"
                  max="100"
                  placeholder="20"
                />
              </div>

            </div>

            <button
              className="modal-analyze"
              onClick={handleCalculate}
            >
              Calculate Eco Score
              <ArrowRight size={18} />
            </button>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
```
