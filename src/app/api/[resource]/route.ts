import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import {
  AppSettings,
  ElectricityRate,
  ElectricityReading,
  Expense,
  Flat,
  Payment,
  Tenant,
  TenantDocument,
} from "@/lib/models";
import { errorResponse, serializeDocument } from "@/lib/api-response";
import { getSession } from "@/lib/session";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record reference.");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a valid month.");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine((value) => {
    const parsedDate = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid date.");
const flatInput = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().max(2000).optional().default(""),
  monthlyRent: z.coerce.number().min(0),
  meterNumber: z.string().max(80).optional().default(""),
  notes: z.string().max(5000).optional().default(""),
}).strict();
const tenantInput = z.object({
  flatId: objectId,
  fullName: z.string().trim().min(1).max(150),
  phone: z.string().trim().min(1).max(30),
  alternatePhone: z.string().max(30).optional().default(""),
  email: z.string().max(150).optional().default(""),
  permanentAddress: z.string().max(2000).optional().default(""),
  idType: z.string().max(50).optional().default(""),
  idNumber: z.string().max(100).optional().default(""),
  policeVerified: z.boolean().optional().default(false),
  moveInDate: date,
  moveOutDate: z.union([date, z.literal("")]).optional().default(""),
  agreementStart: z.union([date, z.literal("")]).optional().default(""),
  agreementEnd: z.union([date, z.literal("")]).optional().default(""),
  monthlyRent: z.coerce.number().min(0),
  advanceAmount: z.coerce.number().min(0).optional().default(0),
  emergencyName: z.string().max(120).optional().default(""),
  emergencyPhone: z.string().max(30).optional().default(""),
  status: z.enum(["active", "past"]).optional().default("active"),
  notes: z.string().max(5000).optional().default(""),
}).strict();
const documentInput = z.object({
  tenantId: objectId,
  documentType: z.string().trim().min(1).max(80),
  documentNumber: z.string().max(100).optional().default(""),
  expiryDate: z.union([date, z.literal("")]).optional().default(""),
  notes: z.string().max(5000).optional().default(""),
}).strict();
const paymentInput = z.object({
  tenantId: objectId,
  paymentType: z.enum(["rent", "advance", "maintenance", "other"]),
  amount: z.coerce.number().positive(),
  advanceAdjustment: z.coerce.number().min(0).optional().default(0),
  paymentDate: date,
  rentMonth: z.union([month, z.literal("")]).optional().default(""),
  paymentMode: z.string().max(30).optional().default("Cash"),
  referenceNumber: z.string().max(100).optional().default(""),
  notes: z.string().max(5000).optional().default(""),
}).strict();
const expenseInput = z.object({
  flatId: z.union([objectId, z.literal("")]).optional().default(""),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(200),
  amount: z.coerce.number().positive(),
  expenseDate: date,
  paymentMode: z.string().max(30).optional().default("Cash"),
  referenceNumber: z.string().max(100).optional().default(""),
  notes: z.string().max(5000).optional().default(""),
}).strict();
const rateInput = z.object({
  rateName: z.string().trim().min(1).max(80),
  ratePerUnit: z.coerce.number().min(0),
  isActive: z.boolean().optional().default(true),
}).strict();
const readingInput = z.object({
  flatId: objectId,
  billMonth: month,
  previousUnits: z.coerce.number().min(0),
  currentUnits: z.coerce.number().min(0),
  ratePerUnit: z.coerce.number().min(0),
  otherCharge: z.coerce.number().min(0).optional().default(0),
  paid: z.boolean().optional().default(false),
  readingDate: date,
  notes: z.string().max(5000).optional().default(""),
}).strict();
const settingsInput = z.object({
  ownerName: z.string().trim().min(1).max(120),
  appName: z.string().trim().min(1).max(100),
  currencySymbol: z.string().trim().min(1).max(10),
  defaultElectricityRate: z.coerce.number().min(0),
  rentDueDay: z.coerce.number().int().min(1).max(31),
  receiptFooter: z.string().max(255).optional().default(""),
  sessionIdleMinutes: z.coerce.number().int().min(5).max(240),
  sessionMaxHours: z.coerce.number().int().min(1).max(72),
}).strict();

const resources = [
  "flats",
  "tenants",
  "documents",
  "payments",
  "expenses",
  "rates",
  "electricity",
  "settings",
] as const;
type Resource = (typeof resources)[number];
type RouteContext = { params: Promise<{ resource: string }> };

class InputError extends Error {}

function isResource(value: string): value is Resource {
  return resources.includes(value as Resource);
}

function issueMessage(result: { error: z.ZodError }) {
  return result.error.issues[0]?.message ?? "Invalid form data.";
}

function handleFailure(error: unknown, action: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  ) {
    return errorResponse(
      "A record for this tenant/flat and month already exists.",
      409,
    );
  }
  console.error(`${action} failed:`, error);
  return errorResponse(`Unable to ${action} right now.`, 500);
}

async function requireUser() {
  const session = await getSession();
  return session;
}

async function readInput(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const raw: Record<string, FormDataEntryValue | string> = {};
    for (const [key, value] of form.entries()) {
      if (key !== "file") raw[key] = value;
    }
    return { data: raw, file: form.get("file") };
  }
  try {
    return { data: await request.json(), file: null };
  } catch {
    throw new InputError("Invalid request body.");
  }
}

async function parseDocumentFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { fileName: "", contentType: "", fileData: undefined };
  }
  const allowedTypes: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
  };
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!extension || !allowedTypes[file.type]?.includes(extension)) {
    throw new InputError("Only PDF, JPG and PNG documents are allowed.");
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new InputError("Document must be 4 MB or smaller.");
  }
  const fileData = Buffer.from(await file.arrayBuffer());
  const validSignature =
    (file.type === "application/pdf" &&
      fileData.subarray(0, 5).toString("ascii") === "%PDF-") ||
    (file.type === "image/jpeg" &&
      fileData[0] === 0xff &&
      fileData[1] === 0xd8 &&
      fileData[2] === 0xff) ||
    (file.type === "image/png" &&
      fileData.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  if (!validSignature) {
    throw new InputError("The uploaded file content does not match its file type.");
  }
  return {
    fileName: file.name.slice(0, 180),
    contentType: file.type,
    fileData,
  };
}

async function updateFlatOccupancy(flatId: Types.ObjectId) {
  const hasActiveTenant = await Tenant.exists({ flatId, status: "active" });
  await Flat.updateOne(
    { _id: flatId },
    { $set: { status: hasActiveTenant ? "occupied" : "vacant" } },
  );
}

async function validateTenantFlat(flatId: string, currentTenantId?: string) {
  if (!(await Flat.exists({ _id: flatId }))) {
    throw new InputError("Choose an existing flat.");
  }
  const activeTenant = await Tenant.exists({
    flatId,
    status: "active",
    ...(currentTenantId ? { _id: { $ne: currentTenantId } } : {}),
  });
  if (activeTenant) {
    throw new InputError("This flat already has an active tenant.");
  }
}

async function getAdvanceBalance(
  tenantId: string,
  excludePaymentId?: string,
  replacement?: z.infer<typeof paymentInput>,
  startingAdvanceAmount?: number,
) {
  const tenant = await Tenant.findById(tenantId).select("advanceAmount");
  if (!tenant) throw new InputError("Tenant record was not found.");

  const excludedPayment = excludePaymentId
    ? { _id: { $ne: new Types.ObjectId(excludePaymentId) } }
    : {};
  const advancePayments = await Payment.aggregate<{ total: number }>([
    {
      $match: {
        tenantId: tenant._id,
        paymentType: "advance",
        ...excludedPayment,
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const adjustedPayments = await Payment.aggregate<{ total: number }>([
    { $match: { tenantId: tenant._id, ...excludedPayment } },
    { $group: { _id: null, total: { $sum: "$advanceAdjustment" } } },
  ]);
  let balance =
    (startingAdvanceAmount ?? tenant.advanceAmount) +
    (advancePayments[0]?.total ?? 0) -
    (adjustedPayments[0]?.total ?? 0);

  if (replacement?.tenantId === tenantId) {
    if (replacement.paymentType === "advance") balance += replacement.amount;
    if (replacement.paymentType === "rent") {
      balance -= replacement.advanceAdjustment;
    }
  }
  return balance;
}

async function validatePayment(
  input: z.infer<typeof paymentInput>,
  currentId?: string,
) {
  if (!(await Tenant.exists({ _id: input.tenantId }))) {
    throw new InputError("Choose an existing tenant.");
  }
  if (input.paymentType !== "rent") {
    if (input.advanceAdjustment > 0) {
      throw new InputError("Advance adjustment is only valid for rent payments.");
    }
    return;
  }
  if (!input.rentMonth) throw new InputError("Choose the rent month.");

  const duplicate = await Payment.exists({
    tenantId: input.tenantId,
    paymentType: "rent",
    rentMonth: input.rentMonth,
    ...(currentId ? { _id: { $ne: currentId } } : {}),
  });
  if (duplicate) throw new InputError("Rent for this tenant and month is already recorded.");

  const available = await getAdvanceBalance(input.tenantId, currentId);
  if (input.advanceAdjustment > available) {
    throw new InputError(`Advance adjustment exceeds the available balance of ${available}.`);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  if (!user) return errorResponse("Please sign in again.", 401);

  const { resource } = await context.params;
  if (!isResource(resource)) return errorResponse("Unknown module.", 404);

  try {
    await connectToDatabase();
    let records: { _id: unknown; __v?: unknown }[] = [];
    switch (resource) {
      case "flats":
        records = await Flat.find().sort({ createdAt: -1 }).lean();
        break;
      case "tenants":
        records = await Tenant.find().sort({ createdAt: -1 }).lean();
        break;
      case "documents":
        records = await TenantDocument.find()
          .select("-fileData")
          .sort({ createdAt: -1 })
          .lean();
        break;
      case "payments":
        records = await Payment.find().sort({ paymentDate: -1 }).lean();
        break;
      case "expenses":
        records = await Expense.find().sort({ expenseDate: -1 }).lean();
        break;
      case "rates":
        records = await ElectricityRate.find().sort({ createdAt: -1 }).lean();
        break;
      case "electricity":
        records = await ElectricityReading.find().sort({ billMonth: -1 }).lean();
        break;
      case "settings": {
        const settings = await AppSettings.findOneAndUpdate(
          { key: "global" },
          { $setOnInsert: { key: "global" } },
          { upsert: true, new: true },
        ).lean();
        records = settings ? [settings] : [];
        break;
      }
    }
    return NextResponse.json(
      records.map((record) => serializeDocument(record)),
    );
  } catch (error) {
    return handleFailure(error, "load records");
  }
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  if (!user) return errorResponse("Please sign in again.", 401);

  const { resource } = await context.params;
  if (!isResource(resource)) return errorResponse("Unknown module.", 404);

  try {
    await connectToDatabase();
    const { data, file } = await readInput(request);
    switch (resource) {
      case "flats": {
        const parsed = flatInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const created = await Flat.create(parsed.data);
        return NextResponse.json(serializeDocument(created), { status: 201 });
      }
      case "tenants": {
        const parsed = tenantInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        await validateTenantFlat(parsed.data.flatId);
        const created = await Tenant.create({
          ...parsed.data,
          flatId: new Types.ObjectId(parsed.data.flatId),
        });
        await updateFlatOccupancy(created.flatId);
        return NextResponse.json(serializeDocument(created), { status: 201 });
      }
      case "documents": {
        const parsed = documentInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        if (!(await Tenant.exists({ _id: parsed.data.tenantId }))) {
          return errorResponse("Choose an existing tenant.");
        }
        const fileData = await parseDocumentFile(file);
        const created = await TenantDocument.create({
          ...parsed.data,
          tenantId: new Types.ObjectId(parsed.data.tenantId),
          ...fileData,
        });
        const plain = created.toObject();
        delete plain.fileData;
        return NextResponse.json(serializeDocument(plain), { status: 201 });
      }
      case "payments": {
        const parsed = paymentInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        await validatePayment(parsed.data);
        const created = await Payment.create({
          ...parsed.data,
          tenantId: new Types.ObjectId(parsed.data.tenantId),
          rentMonth: parsed.data.paymentType === "rent" ? parsed.data.rentMonth : "",
          advanceAdjustment:
            parsed.data.paymentType === "rent" ? parsed.data.advanceAdjustment : 0,
        });
        return NextResponse.json(serializeDocument(created), { status: 201 });
      }
      case "expenses": {
        const parsed = expenseInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        if (
          parsed.data.flatId &&
          !(await Flat.exists({ _id: parsed.data.flatId }))
        ) {
          return errorResponse("Choose an existing flat.");
        }
        const created = await Expense.create({
          ...parsed.data,
          flatId: parsed.data.flatId
            ? new Types.ObjectId(parsed.data.flatId)
            : null,
        });
        return NextResponse.json(serializeDocument(created), { status: 201 });
      }
      case "rates": {
        const parsed = rateInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const created = await ElectricityRate.create(parsed.data);
        return NextResponse.json(serializeDocument(created), { status: 201 });
      }
      case "electricity": {
        const parsed = readingInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        if (parsed.data.currentUnits < parsed.data.previousUnits) {
          return errorResponse("Current units cannot be lower than previous units.");
        }
        const flat = await Flat.findById(parsed.data.flatId).select("_id");
        if (!flat) return errorResponse("Choose an existing flat.");
        const activeTenant = await Tenant.findOne({
          flatId: flat._id,
          status: "active",
        }).select("_id");
        const created = await ElectricityReading.create({
          ...parsed.data,
          flatId: flat._id,
          tenantId: activeTenant?._id ?? null,
        });
        return NextResponse.json(serializeDocument(created), { status: 201 });
      }
      case "settings": {
        const parsed = settingsInput.safeParse(data);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const updated = await AppSettings.findOneAndUpdate(
          { key: "global" },
          { $set: parsed.data, $setOnInsert: { key: "global" } },
          { upsert: true, new: true, runValidators: true },
        );
        return NextResponse.json(serializeDocument(updated!));
      }
    }
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(error.message);
    }
    return handleFailure(error, "save record");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireUser();
  if (!user) return errorResponse("Please sign in again.", 401);

  const { resource } = await context.params;
  if (!isResource(resource)) return errorResponse("Unknown module.", 404);

  try {
    await connectToDatabase();
    const { data, file } = await readInput(request);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return errorResponse("Invalid request body.");
    }
    const raw = data as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!objectId.safeParse(id).success) return errorResponse("Invalid record ID.");
    delete raw.id;

    switch (resource) {
      case "flats": {
        const parsed = flatInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const updated = await Flat.findByIdAndUpdate(id, parsed.data, {
          new: true,
          runValidators: true,
        });
        return updated
          ? NextResponse.json(serializeDocument(updated))
          : errorResponse("Flat not found.", 404);
      }
      case "tenants": {
        const parsed = tenantInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const existing = await Tenant.findById(id);
        if (!existing) return errorResponse("Tenant not found.", 404);
        if (parsed.data.advanceAmount !== undefined) {
          const balance = await getAdvanceBalance(
            id,
            undefined,
            undefined,
            parsed.data.advanceAmount,
          );
          if (balance < 0) {
            throw new InputError("Initial advance cannot be lower than the amount already adjusted.");
          }
        }
        const newFlatId = parsed.data.flatId ?? existing.flatId.toString();
        const newStatus = parsed.data.status ?? existing.status;
        if (newStatus === "active") await validateTenantFlat(newFlatId, id);
        const updated = await Tenant.findByIdAndUpdate(
          id,
          {
            ...parsed.data,
            ...(parsed.data.flatId
              ? { flatId: new Types.ObjectId(parsed.data.flatId) }
              : {}),
          },
          { new: true, runValidators: true },
        );
        await updateFlatOccupancy(existing.flatId);
        if (updated && !updated.flatId.equals(existing.flatId)) {
          await updateFlatOccupancy(updated.flatId);
        }
        return NextResponse.json(serializeDocument(updated!));
      }
      case "documents": {
        const parsed = documentInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        if (
          parsed.data.tenantId &&
          !(await Tenant.exists({ _id: parsed.data.tenantId }))
        ) {
          return errorResponse("Choose an existing tenant.");
        }
        const patch: Record<string, unknown> = {
          ...parsed.data,
          ...(parsed.data.tenantId
            ? { tenantId: new Types.ObjectId(parsed.data.tenantId) }
            : {}),
        };
        if (file instanceof File && file.size > 0) {
          Object.assign(patch, await parseDocumentFile(file));
        }
        const updated = await TenantDocument.findByIdAndUpdate(id, patch, {
          new: true,
          runValidators: true,
        }).select("-fileData");
        return updated
          ? NextResponse.json(serializeDocument(updated))
          : errorResponse("Document not found.", 404);
      }
      case "payments": {
        const parsed = paymentInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const existing = await Payment.findById(id);
        if (!existing) return errorResponse("Payment not found.", 404);
        const merged = paymentInput.safeParse({
          tenantId: existing.tenantId.toString(),
          paymentType: existing.paymentType,
          amount: existing.amount,
          advanceAdjustment: existing.advanceAdjustment,
          paymentDate: existing.paymentDate,
          rentMonth: existing.rentMonth,
          paymentMode: existing.paymentMode,
          referenceNumber: existing.referenceNumber,
          notes: existing.notes,
          ...parsed.data,
        });
        if (!merged.success) return errorResponse(issueMessage(merged));
        await validatePayment(merged.data, id);
        for (const tenantId of new Set([
          existing.tenantId.toString(),
          merged.data.tenantId,
        ])) {
          const balance = await getAdvanceBalance(tenantId, id, merged.data);
          if (balance < 0) {
            throw new InputError("This payment change would overdraw the tenant's advance balance.");
          }
        }
        const updated = await Payment.findByIdAndUpdate(
          id,
          {
            ...parsed.data,
            ...(parsed.data.tenantId
              ? { tenantId: new Types.ObjectId(parsed.data.tenantId) }
              : {}),
            ...(merged.data.paymentType !== "rent"
              ? { rentMonth: "", advanceAdjustment: 0 }
              : {}),
          },
          { new: true, runValidators: true },
        );
        return NextResponse.json(serializeDocument(updated!));
      }
      case "expenses": {
        const parsed = expenseInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        if (
          parsed.data.flatId &&
          !(await Flat.exists({ _id: parsed.data.flatId }))
        ) {
          return errorResponse("Choose an existing flat.");
        }
        const updated = await Expense.findByIdAndUpdate(
          id,
          {
            ...parsed.data,
            ...(parsed.data.flatId !== undefined
              ? {
                  flatId: parsed.data.flatId
                    ? new Types.ObjectId(parsed.data.flatId)
                    : null,
                }
              : {}),
          },
          { new: true, runValidators: true },
        );
        return updated
          ? NextResponse.json(serializeDocument(updated))
          : errorResponse("Expense not found.", 404);
      }
      case "rates": {
        const parsed = rateInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const updated = await ElectricityRate.findByIdAndUpdate(id, parsed.data, {
          new: true,
          runValidators: true,
        });
        return updated
          ? NextResponse.json(serializeDocument(updated))
          : errorResponse("Rate not found.", 404);
      }
      case "electricity": {
        const parsed = readingInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const existing = await ElectricityReading.findById(id);
        if (!existing) return errorResponse("Electricity record not found.", 404);
        const merged = {
          previousUnits: parsed.data.previousUnits ?? existing.previousUnits,
          currentUnits: parsed.data.currentUnits ?? existing.currentUnits,
        };
        if (merged.currentUnits < merged.previousUnits) {
          return errorResponse("Current units cannot be lower than previous units.");
        }
        if (parsed.data.flatId && !(await Flat.exists({ _id: parsed.data.flatId }))) {
          return errorResponse("Choose an existing flat.");
        }
        const updated = await ElectricityReading.findByIdAndUpdate(
          id,
          {
            ...parsed.data,
            ...(parsed.data.flatId
              ? { flatId: new Types.ObjectId(parsed.data.flatId) }
              : {}),
          },
          { new: true, runValidators: true },
        );
        return NextResponse.json(serializeDocument(updated!));
      }
      case "settings": {
        const parsed = settingsInput.partial().safeParse(raw);
        if (!parsed.success) return errorResponse(issueMessage(parsed));
        const updated = await AppSettings.findOneAndUpdate(
          { key: "global" },
          { $set: parsed.data, $setOnInsert: { key: "global" } },
          { upsert: true, new: true, runValidators: true },
        );
        return NextResponse.json(serializeDocument(updated!));
      }
    }
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(error.message);
    }
    return handleFailure(error, "update record");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requireUser();
  if (!user) return errorResponse("Please sign in again.", 401);

  const { resource } = await context.params;
  if (!isResource(resource)) return errorResponse("Unknown module.", 404);
  if (resource === "settings") return errorResponse("Settings cannot be deleted.", 405);

  try {
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!objectId.safeParse(id).success) return errorResponse("Invalid record ID.");

    switch (resource) {
      case "flats": {
        const linkedTenant = await Tenant.exists({ flatId: id });
        const linkedReading = await ElectricityReading.exists({ flatId: id });
        if (linkedTenant || linkedReading) {
          return errorResponse("A flat with tenant or electricity history cannot be deleted.", 409);
        }
        await Expense.updateMany({ flatId: id }, { $set: { flatId: null } });
        await Flat.findByIdAndDelete(id);
        break;
      }
      case "tenants": {
        const linkedPayment = await Payment.exists({ tenantId: id });
        const linkedReading = await ElectricityReading.exists({ tenantId: id });
        if (linkedPayment || linkedReading) {
          return errorResponse("A tenant with payment or electricity history cannot be deleted.", 409);
        }
        const tenant = await Tenant.findByIdAndDelete(id);
        if (tenant) await TenantDocument.deleteMany({ tenantId: id });
        if (tenant) await updateFlatOccupancy(tenant.flatId);
        break;
      }
      case "documents":
        await TenantDocument.findByIdAndDelete(id);
        break;
      case "payments":
        await Payment.findByIdAndDelete(id);
        break;
      case "expenses":
        await Expense.findByIdAndDelete(id);
        break;
      case "rates":
        await ElectricityRate.findByIdAndDelete(id);
        break;
      case "electricity":
        await ElectricityReading.findByIdAndDelete(id);
        break;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleFailure(error, "delete record");
  }
}
