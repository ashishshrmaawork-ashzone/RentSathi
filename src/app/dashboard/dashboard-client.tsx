"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Resource =
  | "flats"
  | "tenants"
  | "documents"
  | "payments"
  | "expenses"
  | "rates"
  | "electricity"
  | "settings";
type Section = "dashboard" | Resource;
type Row = Record<string, unknown> & { id: string };
type UserInfo = { name: string; username: string };
type Option = { value: string; label: string };
type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "month" | "email" | "select" | "checkbox" | "textarea" | "file";
  required?: boolean;
  step?: string;
  options?: Option[];
  full?: boolean;
};

const resourceList: { id: Resource; title: string; icon: string }[] = [
  { id: "flats", title: "Flats & Properties", icon: "⌂" },
  { id: "tenants", title: "Tenant Records", icon: "♙" },
  { id: "documents", title: "Documents & Proofs", icon: "▤" },
  { id: "payments", title: "Rent & Payments", icon: "₹" },
  { id: "expenses", title: "Property Expenses", icon: "↗" },
  { id: "electricity", title: "Electricity Bills", icon: "ϟ" },
  { id: "rates", title: "Electricity Rates", icon: "⚡" },
  { id: "settings", title: "Settings", icon: "⚙" },
];

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const thisMonth = today.slice(0, 7);
const emptyData: Record<Resource, Row[]> = {
  flats: [],
  tenants: [],
  documents: [],
  payments: [],
  expenses: [],
  rates: [],
  electricity: [],
  settings: [],
};

const fieldsByResource: Record<Resource, Field[]> = {
  flats: [
    { name: "name", label: "Flat / property name", required: true },
    { name: "address", label: "Address", type: "textarea", full: true },
    { name: "monthlyRent", label: "Monthly rent", type: "number", step: "0.01", required: true },
    { name: "meterNumber", label: "Meter number" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ],
  tenants: [
    { name: "flatId", label: "Flat", type: "select", required: true },
    { name: "fullName", label: "Full name", required: true },
    { name: "phone", label: "Phone", required: true },
    { name: "alternatePhone", label: "Alternate phone" },
    { name: "email", label: "Email", type: "email" },
    { name: "permanentAddress", label: "Permanent address", type: "textarea", full: true },
    { name: "idType", label: "ID type", type: "select", options: ["", "Aadhaar Card", "PAN Card", "Passport", "Other"].map((x) => ({ value: x, label: x || "Select ID type" })) },
    { name: "idNumber", label: "ID number" },
    { name: "policeVerified", label: "Police verified", type: "checkbox" },
    { name: "moveInDate", label: "Move-in date", type: "date", required: true },
    { name: "moveOutDate", label: "Move-out date", type: "date" },
    { name: "agreementStart", label: "Agreement start", type: "date" },
    { name: "agreementEnd", label: "Agreement end", type: "date" },
    { name: "monthlyRent", label: "Monthly rent", type: "number", step: "0.01", required: true },
    { name: "advanceAmount", label: "Initial advance", type: "number", step: "0.01" },
    { name: "emergencyName", label: "Emergency contact name" },
    { name: "emergencyPhone", label: "Emergency contact phone" },
    { name: "status", label: "Tenant status", type: "select", options: [{ value: "active", label: "Active" }, { value: "past", label: "Past / moved out" }] },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ],
  documents: [
    { name: "tenantId", label: "Tenant", type: "select", required: true },
    { name: "documentType", label: "Document type", type: "select", required: true, options: ["Aadhaar Card", "Rent Agreement", "Police Verification", "PAN Card", "Photo", "Other"].map((x) => ({ value: x, label: x })) },
    { name: "documentNumber", label: "Document number" },
    { name: "expiryDate", label: "Expiry date", type: "date" },
    { name: "file", label: "Upload PDF / JPG / PNG (max 4 MB)", type: "file" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ],
  payments: [
    { name: "tenantId", label: "Tenant", type: "select", required: true },
    { name: "paymentType", label: "Payment type", type: "select", options: ["rent", "advance", "maintenance", "other"].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) })) },
    { name: "amount", label: "Cash amount", type: "number", step: "0.01", required: true },
    { name: "advanceAdjustment", label: "Advance adjustment", type: "number", step: "0.01" },
    { name: "paymentDate", label: "Payment date", type: "date", required: true },
    { name: "rentMonth", label: "Rent month", type: "month" },
    { name: "paymentMode", label: "Payment mode", type: "select", options: ["Cash", "UPI", "Bank Transfer", "Cheque"].map((x) => ({ value: x, label: x })) },
    { name: "referenceNumber", label: "Reference / UTR" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ],
  expenses: [
    { name: "flatId", label: "Flat (optional)", type: "select" },
    { name: "category", label: "Category", type: "select", required: true, options: ["Repairs", "Maintenance", "Utilities", "Taxes", "Cleaning", "Other"].map((x) => ({ value: x, label: x })) },
    { name: "description", label: "Description", required: true },
    { name: "amount", label: "Amount", type: "number", step: "0.01", required: true },
    { name: "expenseDate", label: "Expense date", type: "date", required: true },
    { name: "paymentMode", label: "Payment mode", type: "select", options: ["Cash", "UPI", "Bank Transfer", "Cheque"].map((x) => ({ value: x, label: x })) },
    { name: "referenceNumber", label: "Reference / UTR" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ],
  rates: [
    { name: "rateName", label: "Rate name", required: true },
    { name: "ratePerUnit", label: "Rate per unit", type: "number", step: "0.01", required: true },
    { name: "isActive", label: "Active", type: "checkbox" },
  ],
  electricity: [
    { name: "flatId", label: "Flat", type: "select", required: true },
    { name: "billMonth", label: "Bill month", type: "month", required: true },
    { name: "previousUnits", label: "Previous units", type: "number", step: "0.01", required: true },
    { name: "currentUnits", label: "Current units", type: "number", step: "0.01", required: true },
    { name: "ratePerUnit", label: "Rate per unit", type: "number", step: "0.01", required: true },
    { name: "otherCharge", label: "Other charges", type: "number", step: "0.01" },
    { name: "readingDate", label: "Reading date", type: "date", required: true },
    { name: "paid", label: "Mark as paid", type: "checkbox" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ],
  settings: [
    { name: "ownerName", label: "Owner / property group", required: true },
    { name: "appName", label: "Application name", required: true },
    { name: "currencySymbol", label: "Currency symbol", required: true },
    { name: "defaultElectricityRate", label: "Default electricity rate", type: "number", step: "0.01", required: true },
    { name: "rentDueDay", label: "Rent due day", type: "number", required: true },
    { name: "receiptFooter", label: "Receipt footer", type: "textarea", full: true },
    { name: "sessionIdleMinutes", label: "Session idle limit (minutes)", type: "number", required: true },
    { name: "sessionMaxHours", label: "Session max duration (hours)", type: "number", required: true },
  ],
};

const columnsByResource: Record<Resource, { key: string; label: string }[]> = {
  flats: [{ key: "name", label: "Property" }, { key: "address", label: "Address" }, { key: "monthlyRent", label: "Rent" }, { key: "meterNumber", label: "Meter" }, { key: "status", label: "Status" }],
  tenants: [{ key: "fullName", label: "Tenant" }, { key: "flatId", label: "Flat" }, { key: "phone", label: "Phone" }, { key: "monthlyRent", label: "Rent" }, { key: "moveInDate", label: "Move in" }, { key: "status", label: "Status" }],
  documents: [{ key: "documentType", label: "Document" }, { key: "tenantId", label: "Tenant" }, { key: "documentNumber", label: "Number" }, { key: "expiryDate", label: "Expiry" }, { key: "fileName", label: "File" }],
  payments: [{ key: "paymentDate", label: "Date" }, { key: "tenantId", label: "Tenant" }, { key: "paymentType", label: "Type" }, { key: "rentMonth", label: "Rent month" }, { key: "amount", label: "Amount" }, { key: "advanceAdjustment", label: "Advance used" }, { key: "paymentMode", label: "Mode" }],
  expenses: [{ key: "expenseDate", label: "Date" }, { key: "category", label: "Category" }, { key: "description", label: "Description" }, { key: "flatId", label: "Flat" }, { key: "amount", label: "Amount" }, { key: "paymentMode", label: "Mode" }],
  rates: [{ key: "rateName", label: "Rate name" }, { key: "ratePerUnit", label: "Rate / unit" }, { key: "isActive", label: "Status" }],
  electricity: [{ key: "billMonth", label: "Month" }, { key: "flatId", label: "Flat" }, { key: "previousUnits", label: "Previous" }, { key: "currentUnits", label: "Current" }, { key: "ratePerUnit", label: "Rate" }, { key: "otherCharge", label: "Other" }, { key: "paid", label: "Status" }],
  settings: [{ key: "ownerName", label: "Owner" }, { key: "appName", label: "App name" }, { key: "currencySymbol", label: "Currency" }, { key: "rentDueDay", label: "Rent due day" }],
};

function nameFor(id: unknown, rows: Row[], key: string) {
  if (!id) return "—";
  return String(rows.find((row) => row.id === String(id))?.[key] ?? "—");
}

function money(value: unknown, symbol = "₹") {
  const amount = Number(value ?? 0);
  return `${symbol}${Number.isFinite(amount) ? amount.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0"}`;
}

function rowValue(
  row: Row,
  key: string,
  resource: Resource,
  data: Record<Resource, Row[]>,
  currency: string,
): ReactNode {
  const value = row[key];
  if (key === "flatId") return nameFor(value, data.flats, "name");
  if (key === "tenantId") return nameFor(value, data.tenants, "fullName");
  if (["monthlyRent", "amount", "advanceAdjustment", "ratePerUnit", "otherCharge"].includes(key)) {
    return money(value, currency);
  }
  if (["paid", "policeVerified", "isActive"].includes(key)) {
    const active = Boolean(value);
    const label = key === "isActive" ? (active ? "Active" : "Inactive") : active ? "Yes" : "No";
    return <span className={`badge ${active ? "good" : "warn"}`}>{label}</span>;
  }
  if (key === "status") {
    const active = value === "active" || value === "occupied";
    return <span className={`badge ${active ? "good" : "warn"}`}>{String(value ?? "—")}</span>;
  }
  if (resource === "documents" && key === "fileName" && value) return String(value);
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function createOptions(field: Field, data: Record<Resource, Row[]>): Option[] {
  if (field.options) return field.options;
  if (field.name === "flatId") {
    const allowEmpty = field.label.includes("optional");
    return [
      ...(allowEmpty ? [{ value: "", label: "No specific flat" }] : []),
      ...data.flats.map((flat) => ({ value: flat.id, label: String(flat.name) })),
    ];
  }
  if (field.name === "tenantId") {
    return data.tenants.map((tenant) => ({
      value: tenant.id,
      label: `${String(tenant.fullName)} · ${nameFor(tenant.flatId, data.flats, "name")}`,
    }));
  }
  return [];
}

function initialValue(field: Field, editing: Row | null, data: Record<Resource, Row[]>) {
  if (editing && editing[field.name] !== undefined && editing[field.name] !== null) {
    return String(editing[field.name]);
  }
  if (field.name === "paymentDate" || field.name === "moveInDate" || field.name === "expenseDate" || field.name === "readingDate") return today;
  if (field.name === "rentMonth" || field.name === "billMonth") return thisMonth;
  if (field.name === "currencySymbol") return "₹";
  if (field.name === "appName") return "RentSathi";
  if (field.name === "ownerName") return "My Properties";
  if (field.name === "defaultElectricityRate") {
    return String(data.settings[0]?.defaultElectricityRate ?? 8);
  }
  if (field.name === "ratePerUnit" && data.settings[0]?.defaultElectricityRate) {
    return String(data.settings[0].defaultElectricityRate);
  }
  if (field.type === "checkbox") return "false";
  if (field.name === "paymentMode") return "Cash";
  if (field.name === "status") return "active";
  if (field.name === "isActive") return "true";
  if (field.name === "rentDueDay") return "5";
  if (field.name === "sessionIdleMinutes") return "30";
  if (field.name === "sessionMaxHours") return "8";
  if (field.name === "advanceAdjustment" || field.name === "advanceAmount" || field.name === "otherCharge" || field.name === "previousUnits") return "0";
  return "";
}

export default function DashboardClient({ user }: { user: UserInfo }) {
  const [section, setSection] = useState<Section>("dashboard");
  const [data, setData] = useState<Record<Resource, Row[]>>(emptyData);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [electricityTotal, setElectricityTotal] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(
        resourceList.map(async ({ id }) => {
          const response = await fetch(`/api/${id}`, { cache: "no-store" });
          const result = (await response.json()) as Row[] | { error?: string };
          if (!response.ok) {
            throw new Error(!Array.isArray(result) ? result.error : "Unable to load records.");
          }
          return [id, result as Row[]] as const;
        }),
      );
      setData(Object.fromEntries(entries) as Record<Resource, Row[]>);
      setMessage(null);
    } catch (loadError) {
      setMessage({
        type: "error",
        text: loadError instanceof Error ? loadError.message : "Unable to load records.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let lastRefresh = 0;
    const refreshSession = () => {
      if (Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      void fetch("/api/auth/session", { method: "POST" }).then((response) => {
        if (response.status === 401) window.location.assign("/login");
      }).catch(() => {
        setMessage({ type: "error", text: "Unable to refresh your session. Check your connection." });
      });
    };
    window.addEventListener("pointerdown", refreshSession, { passive: true });
    window.addEventListener("keydown", refreshSession);
    window.addEventListener("touchstart", refreshSession, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", refreshSession);
      window.removeEventListener("keydown", refreshSession);
      window.removeEventListener("touchstart", refreshSession);
    };
  }, []);

  const activeResource = section === "dashboard" ? null : section;
  const currentTitle = activeResource
    ? resourceList.find((item) => item.id === activeResource)?.title ?? "Overview"
    : "Overview";
  const currency = String(data.settings[0]?.currencySymbol ?? "₹");

  const filteredRows = useMemo(() => {
    if (!activeResource) return [];
    const query = search.trim().toLowerCase();
    const rows = data[activeResource] ?? [];
    if (!query) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query)),
    );
  }, [activeResource, data, search]);

  function navigate(next: Section) {
    setSection(next);
    setEditing(null);
    setElectricityTotal(null);
    setSearch("");
    setMessage(null);
    setMobileMenu(false);
  }

  function formFields(resource: Resource): Field[] {
    return fieldsByResource[resource].map((field) => {
      if (field.name === "flatId" && resource === "tenants") {
        return {
          ...field,
          options: [
            { value: "", label: "Select a vacant flat" },
            ...data.flats
              .filter((flat) => flat.status !== "occupied" || editing?.flatId === flat.id)
              .map((flat) => ({ value: flat.id, label: String(flat.name) })),
          ],
        };
      }
      if (field.name === "flatId" || field.name === "tenantId") {
        return { ...field, options: createOptions(field, data) };
      }
      return field;
    });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeResource) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const values: Record<string, string | number | boolean> = {};
    for (const field of formFields(activeResource)) {
      if (field.type === "file") continue;
      const raw = formData.get(field.name);
      if (field.type === "checkbox") {
        values[field.name] = form.querySelector<HTMLInputElement>(`[name="${field.name}"]`)?.checked ?? false;
      } else if (field.type === "number") {
        values[field.name] = raw === null || raw === "" ? 0 : Number(raw);
      } else {
        values[field.name] = String(raw ?? "");
      }
    }
    if (editing) values.id = editing.id;

    setBusy(true);
    setMessage(null);
    try {
      const hasFile = activeResource === "documents";
      let body: BodyInit;
      const headers: Record<string, string> = {};
      if (hasFile) {
        const multipart = new FormData();
        for (const [key, value] of Object.entries(values)) multipart.set(key, String(value));
        const file = formData.get("file");
        if (file instanceof File && file.size > 0) multipart.set("file", file);
        body = multipart;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(values);
      }
      const response = await fetch(`/api/${activeResource}`, {
        method: editing ? "PATCH" : "POST",
        headers,
        body,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to save record.");
      await loadData();
      setEditing(null);
      setElectricityTotal(null);
      form.reset();
      setMessage({ type: "success", text: editing ? "Record updated." : "Record added." });
    } catch (saveError) {
      setMessage({
        type: "error",
        text: saveError instanceof Error ? saveError.message : "Unable to save record.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(resource: Resource, row: Row) {
    const label = String(row.fullName ?? row.name ?? row.documentType ?? row.description ?? "this record");
    if (!window.confirm(`Delete ${label}? This action cannot be undone.`)) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/${resource}?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete record.");
      await loadData();
      setMessage({ type: "success", text: "Record deleted." });
    } catch (deleteError) {
      setMessage({
        type: "error",
        text: deleteError instanceof Error ? deleteError.message : "Unable to delete record.",
      });
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  function handleFlatSelection(event: ChangeEvent<HTMLSelectElement>) {
    if (activeResource !== "electricity") return;
    const flatId = event.currentTarget.value;
    const priorReading = data.electricity
      .filter((reading) => reading.flatId === flatId)
      .sort((a, b) => String(b.billMonth).localeCompare(String(a.billMonth)))[0];
    const form = event.currentTarget.form;
    if (form) {
      const previous = form.elements.namedItem("previousUnits");
      const month = form.elements.namedItem("billMonth");
      const readingDate = form.elements.namedItem("readingDate");
      if (previous instanceof HTMLInputElement) previous.value = String(priorReading?.currentUnits ?? 0);
      const targetMonth = priorReading
        ? (() => {
            const [year, monthValue] = String(priorReading.billMonth).split("-").map(Number);
            return new Date(Date.UTC(year, monthValue, 1)).toISOString().slice(0, 7);
          })()
        : thisMonth;
      if (month instanceof HTMLInputElement) month.value = targetMonth;
      if (readingDate instanceof HTMLInputElement) {
        const [year, monthValue] = targetMonth.split("-").map(Number);
        const lastDay = new Date(year, monthValue, 0).getDate();
        readingDate.value = `${targetMonth}-${String(lastDay).padStart(2, "0")}`;
      }
      updateElectricityTotal(form);
    }
  }

  function updateElectricityTotal(form: HTMLFormElement | null) {
    if (!form) return;
    const read = (name: string) => {
      const field = form.elements.namedItem(name);
      return field instanceof HTMLInputElement ? Number(field.value) || 0 : 0;
    };
    const units = Math.max(0, read("currentUnits") - read("previousUnits"));
    setElectricityTotal(units * read("ratePerUnit") + read("otherCharge"));
  }

  function handleRentMonthChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    const form = event.currentTarget.form;
    const paymentDate = form?.elements.namedItem("paymentDate");
    if (!(paymentDate instanceof HTMLInputElement)) return;
    const [year, monthValue] = value.split("-").map(Number);
    const lastDay = new Date(year, monthValue, 0).getDate();
    paymentDate.value = `${value}-${String(lastDay).padStart(2, "0")}`;
  }

  function renderField(field: Field) {
    const value = initialValue(field, editing, data);
    const common = {
      id: field.name,
      name: field.name,
      required: field.required,
      defaultValue: field.type === "checkbox" || field.type === "file" ? undefined : value,
    };
    if (field.type === "checkbox") {
      return (
        <div className="field checkbox" key={field.name}>
          <input id={field.name} name={field.name} type="checkbox" defaultChecked={value === "true"} />
          <label htmlFor={field.name}>{field.label}</label>
        </div>
      );
    }
    let control: ReactNode;
    if (field.type === "select") {
      control = (
        <select {...common} onChange={field.name === "flatId" ? handleFlatSelection : undefined}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      );
    } else if (field.type === "textarea") {
      control = <textarea {...common} />;
    } else {
      control = (
        <input
          {...common}
          type={field.type ?? "text"}
          step={field.step}
          accept={field.type === "file" ? ".pdf,.jpg,.jpeg,.png" : undefined}
          onChange={
            activeResource === "electricity" &&
            ["previousUnits", "currentUnits", "ratePerUnit", "otherCharge"].includes(field.name)
              ? (event) => updateElectricityTotal(event.currentTarget.form)
              : activeResource === "payments" && field.name === "rentMonth"
                ? handleRentMonthChange
                : undefined
          }
        />
      );
    }
    return (
      <div className={`field ${field.full ? "full" : ""}`} key={field.name}>
        <label htmlFor={field.name}>{field.label}</label>
        {control}
      </div>
    );
  }

  function renderDashboard() {
    const activeTenants = data.tenants.filter((tenant) => tenant.status === "active");
    const rentMonth = thisMonth;
    const paidTenants = new Set(
      data.payments
        .filter((payment) => payment.paymentType === "rent" && payment.rentMonth === rentMonth)
        .map((payment) => String(payment.tenantId)),
    );
    const pending = activeTenants.filter((tenant) => !paidTenants.has(tenant.id));
    const rentReceived = data.payments
      .filter((payment) => payment.paymentType === "rent" && payment.rentMonth === rentMonth)
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0) + Number(payment.advanceAdjustment ?? 0), 0);
    const monthExpenses = data.expenses
      .filter((expense) => String(expense.expenseDate ?? "").startsWith(rentMonth))
      .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
    const recentPayments = [...data.payments].sort((a, b) =>
      String(b.paymentDate).localeCompare(String(a.paymentDate)),
    ).slice(0, 5);

    return (
      <>
        <div className="stats-grid">
          <Stat label="Total properties" value={data.flats.length} hint={`${data.flats.filter((flat) => flat.status === "occupied").length} occupied`} />
          <Stat label="Active tenants" value={activeTenants.length} hint={`${data.tenants.length - activeTenants.length} past tenants`} />
          <Stat label={`${new Date().toLocaleString("en-US", { month: "short" })} rent received`} value={money(rentReceived, currency)} hint={`${pending.length} pending`} />
          <Stat label="Expenses this month" value={money(monthExpenses, currency)} hint="All properties" />
        </div>
        <div className="dashboard-columns">
          <section className="panel">
            <div className="panel-heading">
              <h2>Pending rent · {rentMonth}</h2>
              <button className="button secondary small" onClick={() => navigate("payments")}>Record payment</button>
            </div>
            {pending.length === 0 ? (
              <div className="empty">No pending rent records for this month.</div>
            ) : (
              <div className="quick-list">
                {pending.map((tenant) => (
                  <div className="quick-item" key={tenant.id}>
                    <span><b>{String(tenant.fullName)}</b><br /><small className="muted">{nameFor(tenant.flatId, data.flats, "name")}</small></span>
                    <b>{money(tenant.monthlyRent, currency)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading"><h2>Recent payments</h2></div>
            {recentPayments.length === 0 ? (
              <div className="empty">No payment records yet.</div>
            ) : (
              <div className="quick-list">
                {recentPayments.map((payment) => (
                  <div className="quick-item" key={payment.id}>
                    <span><b>{nameFor(payment.tenantId, data.tenants, "fullName")}</b><br /><small className="muted">{String(payment.paymentDate)} · {String(payment.paymentType)}</small></span>
                    <b>{money(payment.amount, currency)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <section className="panel">
          <div className="panel-heading"><h2>Property status</h2><button className="button small" onClick={() => navigate("flats")}>Manage properties</button></div>
          {data.flats.length === 0 ? (
            <div className="empty">No properties added yet. Add your first flat to get started.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Property</th><th>Tenant</th><th>Monthly rent</th><th>Status</th></tr></thead>
                <tbody>{data.flats.map((flat) => {
                  const tenant = activeTenants.find((item) => item.flatId === flat.id);
                  return <tr key={flat.id}><td><b>{String(flat.name)}</b></td><td>{String(tenant?.fullName ?? "—")}</td><td>{money(flat.monthlyRent, currency)}</td><td><span className={`badge ${flat.status === "occupied" ? "good" : "warn"}`}>{String(flat.status)}</span></td></tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  }

  function renderResource(resource: Resource) {
    const form = resource === "settings" ? data.settings[0] : null;
    return (
      <>
        <div className="section-title">
          <div><h2>{currentTitle}</h2><span className="muted">{resource === "settings" ? "Manage app branding, currency and session limits." : `${data[resource].length} record${data[resource].length === 1 ? "" : "s"}`}</span></div>
          {resource === "settings" && <button className="button secondary" onClick={() => setEditing(form ?? null)}>Edit settings</button>}
        </div>
        {(resource !== "settings" || editing) && (
          <form
            className="form-card"
            key={`${resource}-${editing?.id ?? "new"}`}
            onSubmit={submitForm}
          >
            <div className="panel-heading">
              <h2>{editing ? "Update record" : resource === "settings" ? "Application settings" : `Add ${resource === "electricity" ? "meter reading" : resource.slice(0, -1)}`}</h2>
              {editing && <button type="button" className="button secondary small" onClick={() => { setEditing(null); setElectricityTotal(null); }}>Cancel edit</button>}
            </div>
            {resource === "documents" && typeof editing?.fileName === "string" && editing.fileName.length > 0 && <p className="muted">Current file: {editing.fileName}. Choose a replacement only if needed.</p>}
            <div className="form-grid">{formFields(resource).map(renderField)}</div>
            {resource === "electricity" && <div className="calc">Bill total: {money(electricityTotal ?? ((Number(editing?.currentUnits ?? 0) - Number(editing?.previousUnits ?? 0)) * Number(editing?.ratePerUnit ?? 0) + Number(editing?.otherCharge ?? 0)), currency)}</div>}
            <div className="form-actions">
              <button className="button" type="submit" disabled={busy}>{busy ? "Saving..." : editing ? "Update record" : "Save record"}</button>
              {editing && <button className="button secondary" type="button" onClick={() => { setEditing(null); setElectricityTotal(null); }}>Cancel</button>}
            </div>
          </form>
        )}
        {resource === "settings" && !form && !editing && <div className="panel empty">Settings are being initialized. Refresh in a moment.</div>}
        {resource !== "settings" && (
          <section className="panel">
            <div className="table-tools">
              <h2>{resource === "payments" ? "Payment history" : resource === "electricity" ? "Electricity history" : `${currentTitle} history`}</h2>
              <input className="search-input" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search records..." aria-label="Search records" />
            </div>
            {loading ? <div className="empty">Loading records...</div> : filteredRows.length === 0 ? (
              <div className="empty">{data[resource].length ? "No matching records." : "No records yet."}</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr>{columnsByResource[resource].map((column) => <th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id}>
                        {columnsByResource[resource].map((column) => (
                          <td key={column.key}>{rowValue(row, column.key, resource, data, currency)}</td>
                        ))}
                        <td>
                          <div className="row-actions">
                            {resource === "documents" && typeof row.fileName === "string" && row.fileName.length > 0 && <a className="button secondary small" href={`/api/documents/${row.id}/file`} target="_blank" rel="noreferrer">Open</a>}
                            <button className="button secondary small" onClick={() => { setEditing(row); setElectricityTotal(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                            <button className="button danger small" onClick={() => void removeRow(resource, row)}>Delete</button>
                            {resource === "payments" && <button className="button secondary small" onClick={() => window.print()}>Print</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </>
    );
  }

  return (
    <div className="layout">
      <aside className={`side ${mobileMenu ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark">R</span><span>{String(data.settings[0]?.appName ?? "RentSathi")}</span></div>
        <nav aria-label="Main navigation">
          <button className={section === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")}><span className="nav-icon">▦</span>Dashboard</button>
          {resourceList.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <span className="nav-icon">{item.icon}</span>{item.title}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="top">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <button className="mobile-menu" onClick={() => setMobileMenu((open) => !open)} aria-label="Toggle navigation">☰</button>
            <div><h1>{currentTitle}</h1><p>Manage your properties from one secure workspace.</p></div>
          </div>
          <div className="top-actions">
            <div className="user-menu"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="avatar-copy"><b>{user.name}</b><small>{user.username}</small></span></div>
            <button className="button secondary" onClick={() => void logout()}>Logout</button>
          </div>
        </header>
        {message && <div className={`alert ${message.type}`} role="status">{message.text}</div>}
        {loading && <div className="panel empty">Loading your property records...</div>}
        {!loading && section === "dashboard" && renderDashboard()}
        {!loading && activeResource && renderResource(activeResource)}
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <section className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><small className="muted">{hint}</small></section>;
}
