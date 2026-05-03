require("dotenv").config();

const express     = require("express");
const cors        = require("cors");
const helmet      = require("helmet");
const rateLimit   = require("express-rate-limit");

const governmentRoutes  = require("./routes/government");
const supplyChainRoutes = require("./routes/supplyChain");
const consumerRoutes    = require("./routes/consumer");

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet());

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    process.env.PWA_URL      || "http://localhost:3001",
  ],
  methods: ["GET", "POST", "PATCH"],
}));

// Rate limiting — stricter for consumer verify (anti-spam)
const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      100,
  message:  { success: false, error: "Too many requests" },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20, // Only 20 verifications per 15 min per IP
  message:  { success: false, error: "Too many verification attempts" },
});

app.use(defaultLimiter);
app.use(express.json());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    success:   true,
    service:   "Pharma Anti-Counterfeit Backend",
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || "development",
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/government",   governmentRoutes);
app.use("/api/supply-chain", supplyChainRoutes);
app.use("/api/consumer",     verifyLimiter, consumerRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("[GlobalError]", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   PHARMA BACKEND API — Running               ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Port     : ${PORT}`);
  console.log(`  Health   : http://localhost:${PORT}/health`);
  console.log(`  Govt API : http://localhost:${PORT}/api/government`);
  console.log(`  Supply   : http://localhost:${PORT}/api/supply-chain`);
  console.log(`  Consumer : http://localhost:${PORT}/api/consumer\n`);
});

module.exports = app;