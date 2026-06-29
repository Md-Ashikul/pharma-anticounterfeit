require("dotenv").config();
const { connectDB } = require("./mongoose");
const { Entity }    = require("./models");
const { v4: uuidv4 } = require("uuid");

async function seed() {
  await connectDB();

  // Clear existing
  await Entity.deleteMany({});

  const entities = [
    {
      id:            "ENT-001",
      name:          "PharmaCorp Ltd",
      licenseNumber: "MFG-001",
      licenseStatus: "Active",
      role:          "Manufacturer",
      walletAddress: "0x4dEE81d53d984F6B1F3d6Ca9c4F2023E825E939F",
      registeredAt:  "2026-04-01T00:00:00.000Z",
      revokedAt:     null,
    },
    {
      id:            "ENT-002",
      name:          "DistribHub Inc",
      licenseNumber: "DIST-001",
      licenseStatus: "Active",
      role:          "Distributor",
      walletAddress: "0xD528413aa036E01b86D416c38887E2F68889cF64",
      registeredAt:  "2026-04-01T00:00:00.000Z",
      revokedAt:     null,
    },
    {
      id:            "ENT-003",
      name:          "RetailMed Co",
      licenseNumber: "RET-001",
      licenseStatus: "Active",
      role:          "Retailer",
      walletAddress: "0x3Ef9b20cb9aaA19191b40Eac70903c93A5728E75",
      registeredAt:  "2026-04-01T00:00:00.000Z",
      revokedAt:     null,
    },
  ];

  await Entity.insertMany(entities);
  console.log("✅ MongoDB seeded with 3 entities");
  process.exit(0);
}

seed().catch(console.error);