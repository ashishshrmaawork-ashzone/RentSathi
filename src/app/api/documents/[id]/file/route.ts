import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { errorResponse } from "@/lib/api-response";
import { TenantDocument } from "@/lib/models";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!(await getSession())) return errorResponse("Please sign in again.", 401);

  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return errorResponse("Document not found.", 404);

  try {
    await connectToDatabase();
    const document = await TenantDocument.findById(id).select(
      "+fileData fileName contentType",
    );
    if (!document?.fileData?.length) {
      return errorResponse("Document file not found.", 404);
    }
    return new NextResponse(new Uint8Array(document.fileData), {
      headers: {
        "Content-Type": document.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${document.fileName.replace(/["\\\r\n]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Document download failed:", error);
    return errorResponse("Unable to open this document right now.", 500);
  }
}
