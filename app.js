const state = {
  products: [],
  activeCategory: "All",
  search: ""
};

const colors = {
  History: "#d71920",
  Geography: "#2563eb",
  Polity: "#7c3aed",
  Economics: "#d78b00",
  Physics: "#0f9f6e",
  Biology: "#15803d",
  "Current Affairs": "#db2777",
  "Static GK": "#ea580c",
  Statistics: "#0891b2",
  Maths: "#9333ea",
  Reasoning: "#475569"
};

const categories = [
  "History",
  "Geography",
  "Polity",
  "Economics",
  "Physics",
  "Biology",
  "Current Affairs",
  "Static GK",
  "Statistics",
  "Maths",
  "Reasoning"
];

const productGrid = document.querySelector("#productGrid");
const categoryFilters = document.querySelector("#categoryFilters");
const subjectList = document.querySelector("#subjectList");
const searchInput = document.querySelector("#searchInput");
const emptyState = document.querySelector("#emptyState");
const pdfCount = document.querySelector("#pdfCount");
const buyDialog = document.querySelector("#buyDialog");
const modalContent = document.querySelector("#modalContent");

function rupee(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function posterMarkup(product) {
  const color = colors[product.category] || "#d71920";
  if (product.posterUrl) {
    return `<div class="poster-frame"><img src="${escapeHtml(product.posterUrl)}" alt="${escapeHtml(product.title)} poster"></div>`;
  }

  return `
    <div class="poster-frame">
      <div class="poster-fallback" style="--poster-color:${color}">
        <span>${escapeHtml(product.category)}</span>
        <strong>${escapeHtml(product.title)}</strong>
        <small>${escapeHtml(product.exam)}</small>
      </div>
    </div>
  `;
}

function productCard(product) {
  const tags = (product.tags || []).slice(0, 3);
  return `
    <article class="product-card">
      ${posterMarkup(product)}
      <div class="product-body">
        <div class="product-meta">
          <span class="pill">${escapeHtml(product.category)}</span>
          <span class="pill alt">${escapeHtml(product.exam)}</span>
        </div>
        <h3>${escapeHtml(product.title)}</h3>
        <p>${escapeHtml(product.description)}</p>
        <div class="product-meta">
          ${tags.map((tag) => `<span class="pill alt">${escapeHtml(tag)}</span>`).join("")}
          ${product.pages ? `<span class="pill alt">${product.pages} pages</span>` : ""}
        </div>
        <div class="price-row">
          <span class="price">${rupee(product.price)}</span>
          <button class="button primary buy-button" data-id="${escapeHtml(product.id)}" type="button">Buy request</button>
        </div>
      </div>
    </article>
  `;
}

function filteredProducts() {
  const search = state.search.toLowerCase();
  return state.products.filter((product) => {
    const inCategory = state.activeCategory === "All" || product.category === state.activeCategory;
    const haystack = [product.title, product.category, product.exam, product.description, ...(product.tags || [])]
      .join(" ")
      .toLowerCase();
    return inCategory && haystack.includes(search);
  });
}

function renderProducts() {
  const products = filteredProducts();
  productGrid.innerHTML = products.map(productCard).join("");
  emptyState.hidden = products.length > 0;
  pdfCount.textContent = `${state.products.length}+`;
}

function renderFilters() {
  const allCategories = ["All", ...new Set([...categories, ...state.products.map((item) => item.category)])];
  categoryFilters.innerHTML = allCategories
    .map(
      (category) => `
        <button class="filter-button ${category === state.activeCategory ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
          ${escapeHtml(category)}
        </button>
      `
    )
    .join("");
}

function renderSubjects() {
  const allCategories = [...new Set([...categories, ...state.products.map((item) => item.category)])];
  subjectList.innerHTML = allCategories.map((category) => `<div class="subject-chip">${escapeHtml(category)}</div>`).join("");
}

function openBuyDialog(product) {
  modalContent.innerHTML = `
    <div class="modal-body">
      <div>
        <p class="eyebrow">Buy Request</p>
        <h2>${escapeHtml(product.title)}</h2>
        <p class="muted-text">${escapeHtml(product.category)} | ${escapeHtml(product.exam)} | ${rupee(product.price)}</p>
      </div>
      <form class="buy-form" id="buyForm">
        <label>
          Name
          <input name="name" required placeholder="Aapka naam">
        </label>
        <label>
          Mobile number
          <input name="phone" required placeholder="9876543210">
        </label>
        <label>
          Email
          <input name="email" type="email" placeholder="optional@email.com">
        </label>
        <label>
          Message
          <textarea name="message" rows="3" placeholder="Kis exam ke liye PDF chahiye?"></textarea>
        </label>
        <button class="button primary" type="submit">Request send karein</button>
        <p class="form-status" id="buyStatus"></p>
      </form>
    </div>
  `;

  const form = modalContent.querySelector("#buyForm");
  const status = modalContent.querySelector("#buyStatus");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Sending...";
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.productId = product.id;

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      status.textContent = result.error || "Request send nahi hui.";
      return;
    }
    form.reset();
    status.textContent = "Request save ho gayi. Admin panel me lead dikh jayegi.";
  });

  buyDialog.showModal();
}

categoryFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  renderFilters();
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".buy-button");
  if (!button) return;
  const product = state.products.find((item) => item.id === button.dataset.id);
  if (product) openBuyDialog(product);
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  renderProducts();
});

async function init() {
  const response = await fetch("/api/products");
  const result = await response.json();
  state.products = result.products || [];
  renderFilters();
  renderSubjects();
  renderProducts();
}

init().catch(() => {
  productGrid.innerHTML = "";
  emptyState.hidden = false;
  emptyState.textContent = "Products load nahi ho paaye.";
});
