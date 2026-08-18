export function onRequestGet({ request }) {
  const cf = request.cf || {};
  return Response.json(
    {
      ipAddress: request.headers.get("CF-Connecting-IP") || "",
      country: typeof cf.country === "string" ? cf.country : "",
      city: typeof cf.city === "string" ? cf.city : "",
      region: typeof cf.region === "string" ? cf.region : "",
      timezone: typeof cf.timezone === "string" ? cf.timezone : "",
      datacenter: request.headers.get("CF-Ray")?.split("-")[1] || "",
      platformHint: request.headers.get("Sec-CH-UA-Platform")?.replaceAll('"', "") || "",
      mobileHint: request.headers.get("Sec-CH-UA-Mobile") === "?1",
    },
    { headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8" } },
  );
}
