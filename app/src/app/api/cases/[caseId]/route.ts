import { caseStore } from "@/server/store/case-store";

/** `DELETE /api/cases/{caseId}` (ADR-002 §5): removes the case; idempotent, always 204. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ caseId: string }> }): Promise<Response> {
  const { caseId } = await params;
  caseStore.delete(caseId);
  return new Response(null, { status: 204 });
}
