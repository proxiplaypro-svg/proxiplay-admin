import { getConfiguredAdminEmails, isAllowedAdminEmail } from "./adminAccess";
import { getAdminAuth } from "./admin-app";

export async function assertIsAdminRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new Error("UNAUTHENTICATED");
  }

  const decodedToken = await getAdminAuth().verifyIdToken(token);
  const adminEmails = getConfiguredAdminEmails();

  if (!isAllowedAdminEmail(decodedToken.email, adminEmails)) {
    throw new Error("FORBIDDEN");
  }

  return decodedToken;
}

export function handleAdminAuthError(error: unknown): Response | null {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return Response.json({ error: "Connexion admin requise." }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return Response.json({ error: "Acces admin requis." }, { status: 403 });
  }
  return null;
}
