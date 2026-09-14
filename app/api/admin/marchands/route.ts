import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { createMerchant, manageMerchantAccount, readMerchantAccount } from "@/lib/admin/merchantServer";
import { MerchantError, textField } from "@/lib/admin/merchantSchema";

export const runtime = "nodejs";
function failure(error: unknown) {
  const authError = handleAdminAuthError(error);
  if (authError) return authError;
  if (error instanceof MerchantError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  const code = (error as { code?: string })?.code;
  if (code === "auth/email-already-exists") return Response.json({ error: "Cette adresse email est déjà utilisée. Vérifiez le compte avant de réessayer.", code: "email-in-use" }, { status: 409 });
  if (code?.startsWith("auth/id-token") || code === "auth/argument-error") return Response.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
  if (error instanceof SyntaxError) return Response.json({ error: "Requête invalide." }, { status: 400 });
  console.error("Merchant operation failed", { code: code ?? "internal" });
  return Response.json({ error: "Impossible d’enregistrer le commerçant pour le moment." }, { status: 500 });
}
function idFrom(request: Request) {
  const id = textField(new URL(request.url).searchParams.get("merchantId"), "Commerce", 150);
  if (!id || id.includes("/")) throw new MerchantError("Commerce invalide.");
  return id;
}
async function bodyFrom(request: Request) {
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new MerchantError("Requête invalide.");
  return body as Record<string, unknown>;
}
export async function POST(request: Request) {
  try { await assertIsAdminRequest(request); return Response.json(await createMerchant(await bodyFrom(request)), { status: 201 }); }
  catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  try { await assertIsAdminRequest(request); return Response.json(await readMerchantAccount(idFrom(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try { await assertIsAdminRequest(request); return Response.json(await manageMerchantAccount(idFrom(request), await bodyFrom(request))); }
  catch (error) { return failure(error); }
}
