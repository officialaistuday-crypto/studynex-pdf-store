const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const privateDir = path.join(rootDir, "private");
const storageRoot = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : rootDir;
const dataDir = path.join(storageRoot, "data");
const posterDir = path.join(storageRoot, "uploads", "posters");
const pdfDir = path.join(storageRoot, "uploads", "pdfs");
const productsFile = path.join(dataDir, "products.json");
const ordersFile = path.join(dataDir, "orders.json");
const seedProductsFile = path.join(rootDir, "data", "products.json");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "shivamkumar85958707@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Shivam@123";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || `${ADMIN_EMAIL}:${ADMIN_PASSWORD}:${rootDir}`;

const defaultCategories = [
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

async function ensureStorage() {
  await Promise.all([
    fsp.mkdir(dataDir, { recursive: true }),
    fsp.mkdir(posterDir, { recursive: true }),
    fsp.mkdir(pdfDir, { recursive: true })
  ]);

  if (!fs.existsSync(productsFile)) {
    const seedProducts = fs.existsSync(seedProductsFile) ? await readJson(seedProductsFile, []) : [];
    await writeJson(productsFile, seedProducts);
  }

  if (!fs.existsSync(ordersFile)) {
    await writeJson(ordersFile, []);
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
}

function makeId(title) {
  const slug = String(title || "pdf")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
  return `${slug || "pdf"}-${crypto.randomBytes(3).toString("hex")}`;
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function encodeTokenPart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signToken(payload) {
  return crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(payload).digest("base64url");
}

function makeAdminToken() {
  const payload = encodeTokenPart({
    email: ADMIN_EMAIL,
    exp: Date.now() + 8 * 60 * 60 * 1000
  });
  return `${payload}.${signToken(payload)}`;
}

function isValidAdminToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || signToken(payload) !== signature) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.email === ADMIN_EMAIL && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token");
  if (!isValidAdminToken(token)) {
    return res.status(401).json({ error: "Admin login required." });
  }
  next();
}

function uploadPathFor(fieldname) {
  if (fieldname === "poster") return posterDir;
  if (fieldname === "pdf") return pdfDir;
  return rootDir;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadPathFor(file.fieldname));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    cb(null, `${safeBase || file.fieldname}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 60 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === "poster" && (file.mimetype.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp"].includes(ext))) {
      return cb(null, true);
    }
    if (file.fieldname === "pdf" && (file.mimetype === "application/pdf" || ext === ".pdf")) {
      return cb(null, true);
    }
    cb(new Error("Sirf poster image aur PDF file upload kar sakte hain."));
  }
});

async function deleteLocalFile(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function productFromBody(body, existing = {}) {
  const title = cleanText(body.title, existing.title);
  if (!title) {
    const error = new Error("PDF title zaroori hai.");
    error.status = 400;
    throw error;
  }

  const price = Number(body.price ?? existing.price ?? 0);
  if (!Number.isFinite(price) || price < 0) {
    const error = new Error("Price valid number hona chahiye.");
    error.status = 400;
    throw error;
  }

  const pages = Number(body.pages ?? existing.pages ?? 0);

  return {
    ...existing,
    title,
    category: cleanText(body.category, existing.category || "General"),
    exam: cleanText(body.exam, existing.exam || "All Competitive Exams"),
    price,
    description: cleanText(body.description, existing.description),
    tags: parseTags(body.tags ?? existing.tags),
    pages: Number.isFinite(pages) && pages > 0 ? pages : 0,
    featured: body.featured === "on" || body.featured === "true" || body.featured === true,
    updatedAt: new Date().toISOString()
  };
}

function attachUploads(product, files) {
  const poster = files?.poster?.[0];
  const pdf = files?.pdf?.[0];

  if (poster) {
    product.posterUrl = `/uploads/posters/${poster.filename}`;
  }

  if (pdf) {
    product.pdfFile = {
      filename: pdf.filename,
      originalName: pdf.originalname,
      size: pdf.size,
      uploadedAt: new Date().toISOString()
    };
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads/posters", express.static(posterDir, { fallthrough: false }));
app.use(express.static(publicDir));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "Studynex Pdf" });
});

app.post("/api/admin/login", (req, res) => {
  const email = cleanText(req.body.email).toLowerCase();
  const password = String(req.body.password || "");

  if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Email ya password galat hai." });
  }

  res.json({ token: makeAdminToken(), email: ADMIN_EMAIL });
});

app.get("/api/categories", (req, res) => {
  res.json({ categories: defaultCategories });
});

app.get("/api/products", async (req, res, next) => {
  try {
    const products = await readJson(productsFile, []);
    res.json({
      products: products.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:id", async (req, res, next) => {
  try {
    const products = await readJson(productsFile, []);
    const product = products.find((item) => item.id === req.params.id);
    if (!product) return res.status(404).json({ error: "PDF product nahi mila." });
    res.json({ product });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    const products = await readJson(productsFile, []);
    const product = products.find((item) => item.id === req.body.productId);
    if (!product) return res.status(404).json({ error: "PDF product nahi mila." });

    const name = cleanText(req.body.name);
    const phone = cleanText(req.body.phone);
    const email = cleanText(req.body.email);

    if (!name || !phone) {
      return res.status(400).json({ error: "Naam aur mobile number zaroori hai." });
    }

    const orders = await readJson(ordersFile, []);
    const order = {
      id: crypto.randomUUID(),
      productId: product.id,
      productTitle: product.title,
      price: product.price,
      name,
      phone,
      email,
      message: cleanText(req.body.message),
      status: "New",
      createdAt: new Date().toISOString()
    };
    orders.unshift(order);
    await writeJson(ordersFile, orders);
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res, next) => {
  try {
    res.json({ orders: await readJson(ordersFile, []) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/orders/:id", requireAdmin, async (req, res, next) => {
  try {
    const orders = await readJson(ordersFile, []);
    const order = orders.find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order request nahi mila." });
    order.status = cleanText(req.body.status, order.status);
    order.updatedAt = new Date().toISOString();
    await writeJson(ordersFile, orders);
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/admin/products",
  requireAdmin,
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "pdf", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const products = await readJson(productsFile, []);
      const product = productFromBody(req.body, {
        id: makeId(req.body.title),
        posterUrl: "",
        pdfFile: null,
        createdAt: new Date().toISOString()
      });
      attachUploads(product, req.files);
      products.unshift(product);
      await writeJson(productsFile, products);
      res.status(201).json({ product });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/admin/products/:id",
  requireAdmin,
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "pdf", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const products = await readJson(productsFile, []);
      const index = products.findIndex((item) => item.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: "PDF product nahi mila." });

      const oldProduct = products[index];
      const product = productFromBody(req.body, oldProduct);
      const oldPosterPath = oldProduct.posterUrl?.startsWith("/uploads/posters/")
        ? path.join(rootDir, oldProduct.posterUrl)
        : "";
      const oldPdfPath = oldProduct.pdfFile?.filename ? path.join(pdfDir, oldProduct.pdfFile.filename) : "";

      attachUploads(product, req.files);
      products[index] = product;
      await writeJson(productsFile, products);

      if (req.files?.poster?.[0] && oldPosterPath) await deleteLocalFile(oldPosterPath);
      if (req.files?.pdf?.[0] && oldPdfPath) await deleteLocalFile(oldPdfPath);

      res.json({ product });
    } catch (error) {
      next(error);
    }
  }
);

app.delete("/api/admin/products/:id", requireAdmin, async (req, res, next) => {
  try {
    const products = await readJson(productsFile, []);
    const product = products.find((item) => item.id === req.params.id);
    if (!product) return res.status(404).json({ error: "PDF product nahi mila." });

    const remaining = products.filter((item) => item.id !== req.params.id);
    await writeJson(productsFile, remaining);

    if (product.posterUrl?.startsWith("/uploads/posters/")) {
      await deleteLocalFile(path.join(rootDir, product.posterUrl));
    }
    if (product.pdfFile?.filename) {
      await deleteLocalFile(path.join(pdfDir, product.pdfFile.filename));
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/products/:id/pdf", requireAdmin, async (req, res, next) => {
  try {
    const products = await readJson(productsFile, []);
    const product = products.find((item) => item.id === req.params.id);
    if (!product?.pdfFile?.filename) {
      return res.status(404).json({ error: "Is product me PDF upload nahi hai." });
    }

    res.download(path.join(pdfDir, product.pdfFile.filename), product.pdfFile.originalName || `${product.title}.pdf`);
  } catch (error) {
    next(error);
  }
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(privateDir, "admin.html"));
});

app.get("/admin/assets/admin.js", (req, res) => {
  res.type("application/javascript").sendFile(path.join(privateDir, "admin.js"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || "Server error. Thodi der baad try karein."
  });
});

ensureStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`Studynex Pdf running at http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
    console.log(`Admin email: ${ADMIN_EMAIL}`);
  });
});
