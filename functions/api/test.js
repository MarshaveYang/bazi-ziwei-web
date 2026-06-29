export async function onRequest(context) {
  return new Response(JSON.stringify({ ok: true, route: "/api/test" }), {
    headers: { "Content-Type": "application/json" }
  });
}
