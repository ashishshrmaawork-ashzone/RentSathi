import { createRequire } from "node:module";
import path from "node:path";
import { access, readFile } from "node:fs/promises";
import mongoose from "mongoose";
import mysql from "mysql2/promise";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const sourceDatabase = process.env.LEGACY_MYSQL_DATABASE || "house_rent_manager";
const sourcePrefix = `mysql:${sourceDatabase}:`;
const applyChanges = process.argv.includes("--apply");
const allowedTables = [
  "settings",
  "flats",
  "tenants",
  "documents",
  "payments",
  "expenses",
  "electricity_rates",
  "electricity_readings",
];
const collectionByTable = {
  flats: "flats",
  tenants: "tenants",
  documents: "tenantdocuments",
  payments: "payments",
  expenses: "expenses",
  electricity_rates: "electricityrates",
  electricity_readings: "electricityreadings",
  settings: "appsettings",
};

function sourceId(table, id) {
  return `${sourcePrefix}${table}:${String(id)}`;
}

function string(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function number(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateOnly(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timestamp(value) {
  if (value == null || value === "") return new Date();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function valueForEnum(value, allowed, fallback) {
  const normalized = string(value).trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function checkReferences(rows, childTable, field, parentRows, parentField = "id") {
  const parentIds = new Set(parentRows.map((row) => String(row[parentField])));
  return rows.reduce(
    (missing, row) =>
      row[field] != null && !parentIds.has(String(row[field]))
        ? missing + 1
        : missing,
    0,
  );
}

function preflight(rows) {
  const issues = [];
  const missingTenantFlats = checkReferences(
    rows.tenants,
    "tenants",
    "flat_id",
    rows.flats,
  );
  const missingDocumentTenants = checkReferences(
    rows.documents,
    "documents",
    "tenant_id",
    rows.tenants,
  );
  const missingPaymentTenants = checkReferences(
    rows.payments,
    "payments",
    "tenant_id",
    rows.tenants,
  );
  const missingReadingFlats = checkReferences(
    rows.electricity_readings,
    "electricity_readings",
    "flat_id",
    rows.flats,
  );
  const missingReadingTenants = checkReferences(
    rows.electricity_readings,
    "electricity_readings",
    "tenant_id",
    rows.tenants,
  );
  const missingExpenseFlats = checkReferences(
    rows.expenses,
    "expenses",
    "flat_id",
    rows.flats,
  );
  if (missingTenantFlats) issues.push(`${missingTenantFlats} tenant(s) reference missing flats.`);
  if (missingDocumentTenants) issues.push(`${missingDocumentTenants} document(s) reference missing tenants.`);
  if (missingPaymentTenants) issues.push(`${missingPaymentTenants} payment(s) reference missing tenants.`);
  if (missingReadingFlats) issues.push(`${missingReadingFlats} electricity record(s) reference missing flats.`);
  if (missingReadingTenants) issues.push(`${missingReadingTenants} electricity record(s) reference missing tenants.`);
  if (missingExpenseFlats) issues.push(`${missingExpenseFlats} expense(s) reference missing flats.`);
  const activeByFlat = new Set();
  let duplicateActiveTenants = 0;
  for (const tenant of rows.tenants) {
    if (tenant.status !== "active") continue;
    const flatId = String(tenant.flat_id);
    if (activeByFlat.has(flatId)) duplicateActiveTenants += 1;
    activeByFlat.add(flatId);
  }
  if (duplicateActiveTenants) {
    issues.push(
      `${duplicateActiveTenants} additional active tenant(s) share a flat; resolve them before importing.`,
    );
  }

  const rentKeys = new Set();
  let duplicateRents = 0;
  for (const payment of rows.payments) {
    if (payment.payment_type !== "rent" || !payment.rent_month) continue;
    const key = `${payment.tenant_id}:${string(payment.rent_month).trim()}`;
    if (rentKeys.has(key)) duplicateRents += 1;
    rentKeys.add(key);
  }
  if (duplicateRents) {
    issues.push(
      `${duplicateRents} duplicate rent-month payment(s) exist; resolve them before importing.`,
    );
  }

  const readingKeys = new Set();
  let duplicateReadings = 0;
  for (const reading of rows.electricity_readings) {
    const key = `${reading.flat_id}:${string(reading.bill_month).trim()}`;
    if (readingKeys.has(key)) duplicateReadings += 1;
    readingKeys.add(key);
  }
  if (duplicateReadings) {
    issues.push(
      `${duplicateReadings} duplicate flat/month electricity record(s) exist.`,
    );
  }
  return issues;
}

async function loadSourceRows(connection) {
  const result = {};
  for (const table of allowedTables) {
    const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
    result[table] = rows;
  }
  return result;
}

async function ensureImportIndexes(database) {
  for (const collectionName of Object.values(collectionByTable)) {
    await database
      .collection(collectionName)
      .createIndex({ legacySourceId: 1 }, { unique: true, sparse: true });
  }
}

async function importRows(database, table, rows, convert) {
  const collection = database.collection(collectionByTable[table]);
  const operations = rows.map((row) => {
    const legacySourceId = sourceId(table, row.id);
    const createdAt = timestamp(row.created_at ?? row.uploaded_at);
    return {
      updateOne: {
        filter: { legacySourceId },
        update: {
          $setOnInsert: {
            ...convert(row),
            legacySourceId,
            createdAt,
            updatedAt: createdAt,
          },
        },
        upsert: true,
      },
    };
  });
  if (operations.length) {
    await collection.bulkWrite(operations, { ordered: true });
  }
  const sourceIds = rows.map((row) => sourceId(table, row.id));
  const existing = sourceIds.length
    ? await collection
        .find(
          { legacySourceId: { $in: sourceIds } },
          { projection: { _id: 1, legacySourceId: 1 } },
        )
        .toArray()
    : [];
  return new Map(existing.map((record) => [record.legacySourceId, record._id]));
}

async function checkDocumentFiles(rows, uploadsDirectory) {
  const result = new Map();
  let missing = 0;
  let invalid = 0;
  for (const row of rows) {
    const relative = string(row.file_path).replaceAll("\\", "/");
    const basename = path.posix.basename(relative);
    if (!basename || basename === ".") {
      result.set(String(row.id), null);
      continue;
    }
    const extension = path.extname(basename).toLowerCase();
    if (![".pdf", ".jpg", ".jpeg", ".png"].includes(extension)) {
      result.set(String(row.id), null);
      invalid += 1;
      continue;
    }
    const absolutePath = path.resolve(uploadsDirectory, basename);
    if (path.dirname(absolutePath) !== path.resolve(uploadsDirectory)) {
      result.set(String(row.id), null);
      invalid += 1;
      continue;
    }
    try {
      await access(absolutePath);
      const content = await readFile(absolutePath);
      const valid =
        (extension === ".pdf" && content.subarray(0, 5).toString("ascii") === "%PDF-") ||
        ((extension === ".jpg" || extension === ".jpeg") &&
          content[0] === 0xff &&
          content[1] === 0xd8 &&
          content[2] === 0xff) ||
        (extension === ".png" &&
          content
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
      if (!valid || content.length > 12 * 1024 * 1024) {
        result.set(String(row.id), null);
        invalid += 1;
        continue;
      }
      result.set(String(row.id), {
        fileName: basename.slice(0, 180),
        contentType:
          extension === ".pdf"
            ? "application/pdf"
            : extension === ".png"
              ? "image/png"
              : "image/jpeg",
        fileData: content,
      });
    } catch (error) {
      if (error?.code === "ENOENT") {
        result.set(String(row.id), null);
        missing += 1;
        continue;
      }
      throw error;
    }
  }
  return { files: result, missing, invalid };
}

async function importSettings(database, rows) {
  const row = rows[0];
  if (!row) return 0;
  const legacySourceId = sourceId("settings", row.id);
  const collection = database.collection(collectionByTable.settings);
  const alreadyImported = await collection.findOne(
    { legacySourceId },
    { projection: { _id: 1 } },
  );
  if (alreadyImported) return 0;

  const createdAt = timestamp(row.created_at);
  const fields = {
    ownerName: string(row.owner_name, "My Properties"),
    appName: string(row.app_name, "RentSathi"),
    currencySymbol: string(row.currency_symbol, "₹"),
    defaultElectricityRate: number(row.default_electricity_rate, 8),
    rentDueDay: number(row.rent_due_day, 5),
    receiptFooter: string(row.receipt_footer, "Thank you for your payment."),
    sessionIdleMinutes: Math.min(240, Math.max(5, number(row.session_idle_minutes, 30))),
    sessionMaxHours: Math.min(72, Math.max(1, number(row.session_max_hours, 8))),
    legacySourceId,
    updatedAt: new Date(),
  };
  await collection.updateOne(
    { key: "global" },
    { $set: fields, $setOnInsert: { key: "global", createdAt } },
    { upsert: true },
  );
  return 1;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI; configure the destination database first.");
  }
  const uploadsDirectory =
    process.env.LEGACY_UPLOADS_DIR ||
    path.resolve(process.cwd(), "..", "uploads");
  const connection = await mysql.createConnection({
    host: process.env.LEGACY_MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.LEGACY_MYSQL_PORT || 3306),
    database: sourceDatabase,
    user: process.env.LEGACY_MYSQL_USER || "root",
    password: process.env.LEGACY_MYSQL_PASSWORD || "",
    dateStrings: true,
    connectTimeout: 10000,
  });

  let mongoConnection;
  try {
    const rows = await loadSourceRows(connection);
    const issues = preflight(rows);
    const { files, missing, invalid } = await checkDocumentFiles(
      rows.documents,
      uploadsDirectory,
    );

    console.log(`Legacy database: ${sourceDatabase}`);
    for (const table of allowedTables) {
      console.log(`${table}: ${rows[table].length}`);
    }
    console.log(`Document files found and validated: ${[...files.values()].filter(Boolean).length}`);
    console.log(`Document files missing: ${missing}`);
    console.log(`Document files rejected by type/signature: ${invalid}`);
    if (issues.length) {
      console.error("Preflight failed; no data was written:");
      for (const issue of issues) console.error(`- ${issue}`);
      process.exitCode = 1;
      return;
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 15000,
    });
    mongoConnection = mongoose.connection;
    const destination = mongoConnection.db;
    if (!destination) throw new Error("MongoDB did not provide a destination database.");

    const totals = {};
    for (const table of allowedTables) {
      const collection = destination.collection(collectionByTable[table]);
      const sourceIds = rows[table].map((row) => sourceId(table, row.id));
      totals[table] = sourceIds.length
        ? await collection.countDocuments({ legacySourceId: { $in: sourceIds } })
        : 0;
    }
    console.log(
      `Already imported records: ${Object.entries(totals)
        .map(([table, count]) => `${table}=${count}`)
        .join(", ")}`,
    );
    const conflicts = [];
    for (const table of allowedTables) {
      if (!rows[table].length) continue;
      const filter =
        table === "settings"
          ? { key: { $ne: "global" } }
          : { legacySourceId: { $exists: false } };
      const count = await destination
        .collection(collectionByTable[table])
        .countDocuments(filter);
      if (count) conflicts.push(`${table}=${count}`);
    }
    if (conflicts.length) {
      throw new Error(
        `Destination contains existing non-migration records (${conflicts.join(", ")}); refusing to merge to avoid overwriting or linking the wrong records.`,
      );
    }
    if (!applyChanges) {
      console.log("Dry run only. Review these counts, then run npm run migrate:legacy -- --apply.");
      return;
    }

    await ensureImportIndexes(destination);
    const flatIds = await importRows(destination, "flats", rows.flats, (row) => ({
      name: string(row.flat_name),
      address: string(row.address),
      monthlyRent: number(row.monthly_rent),
      meterNumber: string(row.meter_number),
      status: valueForEnum(row.status, ["vacant", "occupied"], "vacant"),
      notes: string(row.notes),
    }));
    const tenantIds = await importRows(destination, "tenants", rows.tenants, (row) => {
      const flatId = flatIds.get(sourceId("flats", row.flat_id));
      if (!flatId) throw new Error("A referenced flat was not imported.");
      return {
        flatId,
        fullName: string(row.full_name),
        phone: string(row.phone),
        alternatePhone: string(row.alternate_phone),
        email: string(row.email),
        permanentAddress: string(row.permanent_address),
        idType: string(row.id_type),
        idNumber: string(row.id_number),
        policeVerified: Boolean(number(row.police_verified)),
        moveInDate: dateOnly(row.move_in_date),
        moveOutDate: dateOnly(row.move_out_date),
        agreementStart: dateOnly(row.agreement_start),
        agreementEnd: dateOnly(row.agreement_end),
        monthlyRent: number(row.monthly_rent),
        advanceAmount: number(row.advance_amount),
        emergencyName: string(row.emergency_name),
        emergencyPhone: string(row.emergency_phone),
        status: valueForEnum(row.status, ["active", "past"], "past"),
        notes: string(row.notes),
      };
    });

    const documentFiles = await checkDocumentFiles(rows.documents, uploadsDirectory);
    const importedDocuments = await importRows(
      destination,
      "documents",
      rows.documents,
      (row) => {
        const tenantId = tenantIds.get(sourceId("tenants", row.tenant_id));
        if (!tenantId) throw new Error("A referenced tenant was not imported.");
        return {
          tenantId,
          documentType: string(row.document_type, "Other"),
          documentNumber: string(row.document_number),
          expiryDate: dateOnly(row.expiry_date),
          notes: string(row.notes),
          ...(documentFiles.files.get(String(row.id)) ?? {}),
        };
      },
    );

    const paymentIds = await importRows(destination, "payments", rows.payments, (row) => {
      const tenantId = tenantIds.get(sourceId("tenants", row.tenant_id));
      if (!tenantId) throw new Error("A referenced tenant was not imported.");
      return {
        tenantId,
        paymentType: valueForEnum(
          row.payment_type,
          ["rent", "advance", "maintenance", "other"],
          "other",
        ),
        amount: number(row.amount),
        advanceAdjustment: number(row.advance_adjustment),
        paymentDate: dateOnly(row.payment_date),
        rentMonth:
          row.payment_type === "rent" ? string(row.rent_month).trim() : "",
        paymentMode: string(row.payment_mode, "Cash"),
        referenceNumber: string(row.reference_number),
        notes: string(row.notes),
      };
    });
    const expenseIds = await importRows(destination, "expenses", rows.expenses, (row) => ({
      flatId:
        row.flat_id == null ? null : flatIds.get(sourceId("flats", row.flat_id)) ?? null,
      category: string(row.category, "Other"),
      description: string(row.description, "Imported expense"),
      amount: Math.max(0.01, number(row.amount, 0.01)),
      expenseDate: dateOnly(row.expense_date),
      paymentMode: string(row.payment_mode, "Cash"),
      referenceNumber: string(row.reference_number),
      notes: string(row.notes),
    }));
    const rateIds = await importRows(
      destination,
      "electricity_rates",
      rows.electricity_rates,
      (row) => ({
        rateName: string(row.rate_name, "Imported rate"),
        ratePerUnit: number(row.rate_per_unit),
        isActive: Boolean(number(row.is_active, 1)),
      }),
    );
    const readingIds = await importRows(
      destination,
      "electricity_readings",
      rows.electricity_readings,
      (row) => {
        const flatId = flatIds.get(sourceId("flats", row.flat_id));
        if (!flatId) throw new Error("A referenced flat was not imported.");
        const tenantId =
          row.tenant_id == null
            ? null
            : tenantIds.get(sourceId("tenants", row.tenant_id)) ?? null;
        return {
          flatId,
          tenantId,
          billMonth: string(row.bill_month).trim(),
          previousUnits: number(row.previous_units),
          currentUnits: number(row.current_units),
          ratePerUnit: number(row.rate_per_unit),
          otherCharge: number(row.other_charge),
          paid: Boolean(number(row.paid)),
          readingDate: dateOnly(row.reading_date),
          notes: string(row.notes),
        };
      },
    );
    const settings = await importSettings(destination, rows.settings);

    const result = {
      flats: flatIds.size,
      tenants: tenantIds.size,
      documents: importedDocuments.size,
      payments: paymentIds.size,
      expenses: expenseIds.size,
      electricity_rates: rateIds.size,
      electricity_readings: readingIds.size,
      settings,
      missingDocumentFiles: missing,
      rejectedDocumentFiles: invalid,
    };
    await destination.collection("legacyMigrationRuns").updateOne(
      { key: `mysql:${sourceDatabase}` },
      {
        $set: {
          sourceDatabase,
          completedAt: new Date(),
          counts: result,
          mode: "idempotent-insert",
        },
      },
      { upsert: true },
    );
    console.log("Migration completed; source MySQL data was not modified.");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await connection.end();
    if (mongoConnection) await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Legacy migration failed:", error.message);
  process.exitCode = 1;
});
