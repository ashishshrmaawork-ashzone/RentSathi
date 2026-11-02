import { NextResponse } from "next/server";

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function serializeDocument<T extends { _id: unknown; __v?: unknown }>(
  document: T,
) {
  const value = document as T & Record<string, unknown>;
  const { _id, __v: _version, legacySourceId: _sourceId, ...fields } = value;
  return { ...fields, id: String(_id) };
}
