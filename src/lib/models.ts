import {
  model,
  models,
  Schema,
  type InferSchemaType,
  type Model,
} from "mongoose";

const flatSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    address: { type: String, default: "", maxlength: 2000 },
    monthlyRent: { type: Number, min: 0, default: 0 },
    meterNumber: { type: String, default: "", maxlength: 80 },
    status: { type: String, enum: ["vacant", "occupied"], default: "vacant" },
    notes: { type: String, default: "", maxlength: 5000 },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
flatSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
export type FlatFields = InferSchemaType<typeof flatSchema>;
export const Flat =
  (models.Flat as Model<FlatFields> | undefined) ??
  model<FlatFields>("Flat", flatSchema);

const tenantSchema = new Schema(
  {
    flatId: { type: Schema.Types.ObjectId, ref: "Flat", required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 150 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    alternatePhone: { type: String, default: "", maxlength: 30 },
    email: { type: String, default: "", maxlength: 150 },
    permanentAddress: { type: String, default: "", maxlength: 2000 },
    idType: { type: String, default: "", maxlength: 50 },
    idNumber: { type: String, default: "", maxlength: 100 },
    policeVerified: { type: Boolean, default: false },
    moveInDate: { type: String, required: true },
    moveOutDate: { type: String, default: "" },
    agreementStart: { type: String, default: "" },
    agreementEnd: { type: String, default: "" },
    monthlyRent: { type: Number, required: true, min: 0 },
    advanceAmount: { type: Number, default: 0, min: 0 },
    emergencyName: { type: String, default: "", maxlength: 120 },
    emergencyPhone: { type: String, default: "", maxlength: 30 },
    status: { type: String, enum: ["active", "past"], default: "active" },
    notes: { type: String, default: "", maxlength: 5000 },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
tenantSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
tenantSchema.index(
  { flatId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
export type TenantFields = InferSchemaType<typeof tenantSchema>;
export const Tenant =
  (models.Tenant as Model<TenantFields> | undefined) ??
  model<TenantFields>("Tenant", tenantSchema);

const documentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    documentType: { type: String, required: true, maxlength: 80 },
    documentNumber: { type: String, default: "", maxlength: 100 },
    expiryDate: { type: String, default: "" },
    notes: { type: String, default: "", maxlength: 5000 },
    fileName: { type: String, default: "" },
    contentType: { type: String, default: "" },
    fileData: { type: Buffer, select: false },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
documentSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
export type DocumentFields = InferSchemaType<typeof documentSchema>;
export const TenantDocument =
  (models.TenantDocument as Model<DocumentFields> | undefined) ??
  model<DocumentFields>("TenantDocument", documentSchema);

const paymentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    paymentType: {
      type: String,
      enum: ["rent", "advance", "maintenance", "other"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    advanceAdjustment: { type: Number, default: 0, min: 0 },
    paymentDate: { type: String, required: true },
    rentMonth: { type: String, default: "" },
    paymentMode: { type: String, default: "Cash", maxlength: 30 },
    referenceNumber: { type: String, default: "", maxlength: 100 },
    notes: { type: String, default: "", maxlength: 5000 },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
paymentSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
paymentSchema.index(
  { tenantId: 1, rentMonth: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentType: "rent", rentMonth: { $type: "string" } },
  },
);
export type PaymentFields = InferSchemaType<typeof paymentSchema>;
export const Payment =
  (models.Payment as Model<PaymentFields> | undefined) ??
  model<PaymentFields>("Payment", paymentSchema);

const expenseSchema = new Schema(
  {
    flatId: { type: Schema.Types.ObjectId, ref: "Flat", default: null },
    category: { type: String, required: true, maxlength: 80 },
    description: { type: String, required: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0.01 },
    expenseDate: { type: String, required: true },
    paymentMode: { type: String, default: "Cash", maxlength: 30 },
    referenceNumber: { type: String, default: "", maxlength: 100 },
    notes: { type: String, default: "", maxlength: 5000 },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
expenseSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
export type ExpenseFields = InferSchemaType<typeof expenseSchema>;
export const Expense =
  (models.Expense as Model<ExpenseFields> | undefined) ??
  model<ExpenseFields>("Expense", expenseSchema);

const rateSchema = new Schema(
  {
    rateName: { type: String, required: true, maxlength: 80 },
    ratePerUnit: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
rateSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
export type RateFields = InferSchemaType<typeof rateSchema>;
export const ElectricityRate =
  (models.ElectricityRate as Model<RateFields> | undefined) ??
  model<RateFields>("ElectricityRate", rateSchema);

const readingSchema = new Schema(
  {
    flatId: { type: Schema.Types.ObjectId, ref: "Flat", required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    billMonth: { type: String, required: true },
    previousUnits: { type: Number, required: true, min: 0 },
    currentUnits: { type: Number, required: true, min: 0 },
    ratePerUnit: { type: Number, required: true, min: 0 },
    otherCharge: { type: Number, default: 0, min: 0 },
    paid: { type: Boolean, default: false },
    readingDate: { type: String, required: true },
    notes: { type: String, default: "", maxlength: 5000 },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
readingSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
readingSchema.index({ flatId: 1, billMonth: 1 }, { unique: true });
export type ReadingFields = InferSchemaType<typeof readingSchema>;
export const ElectricityReading =
  (models.ElectricityReading as Model<ReadingFields> | undefined) ??
  model<ReadingFields>("ElectricityReading", readingSchema);

const settingsSchema = new Schema(
  {
    key: { type: String, default: "global", unique: true },
    ownerName: { type: String, default: "My Properties", maxlength: 120 },
    appName: { type: String, default: "RentSathi", maxlength: 100 },
    currencySymbol: { type: String, default: "₹", maxlength: 10 },
    defaultElectricityRate: { type: Number, default: 8, min: 0 },
    rentDueDay: { type: Number, default: 5, min: 1, max: 31 },
    receiptFooter: {
      type: String,
      default: "Thank you for your payment.",
      maxlength: 255,
    },
    sessionIdleMinutes: { type: Number, default: 30, min: 5, max: 240 },
    sessionMaxHours: { type: Number, default: 8, min: 1, max: 72 },
    legacySourceId: { type: String, select: false },
  },
  { timestamps: true },
);
settingsSchema.index({ legacySourceId: 1 }, { unique: true, sparse: true });
export type SettingsFields = InferSchemaType<typeof settingsSchema>;
export const AppSettings =
  (models.AppSettings as Model<SettingsFields> | undefined) ??
  model<SettingsFields>("AppSettings", settingsSchema);

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, maxlength: 120 },
    username: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true },
);
export type UserFields = InferSchemaType<typeof userSchema>;
export const User =
  (models.User as Model<UserFields> | undefined) ??
  model<UserFields>("User", userSchema);
