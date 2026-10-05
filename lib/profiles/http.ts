/** JSON, or a form post from a plain HTML form. Null when neither parses. */
export async function readBody(request: Request): Promise<Record<string, unknown> | FormData | null> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    return request.formData().catch(() => null);
  }
  const json = await request.json().catch(() => null);
  return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
}
