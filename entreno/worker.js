// Servidor de pasos para Entreno (Cloudflare Worker, plan gratuito).
// Recibe los pasos de hoy desde un Atajo de iOS y se los da a la app.
//
// Necesita en Cloudflare:
//   - Un espacio KV enlazado con el nombre de variable PASOS
//   - Una variable secreta CLAVE (una contraseña larga inventada por ti)
//
// Atajo:  POST https://<tu-worker>.workers.dev/<CLAVE>   cuerpo = número de pasos
// App:    GET  https://<tu-worker>.workers.dev/<CLAVE>   → { pasos: { "2026-11-08": 8432, ... }, actualizado }

const ZONA = "Europe/Madrid";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function hoy() {
  // Fecha local (AAAA-MM-DD) en la zona horaria del usuario
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const clave = new URL(req.url).pathname.slice(1);
    if (!env.CLAVE || clave !== env.CLAVE) return json({ error: "clave incorrecta" }, 403);

    const datos = (await env.PASOS.get("datos", "json")) || { pasos: {}, actualizado: 0 };

    if (req.method === "POST") {
      const texto = (await req.text()).trim();
      let fecha = hoy(), n = null;
      try {
        const o = JSON.parse(texto);
        if (o && typeof o === "object") { n = Number(o.pasos); if (/^\d{4}-\d{2}-\d{2}$/.test(o.fecha || "")) fecha = o.fecha; }
        else n = Number(o);
      } catch { n = Number(texto.replace(/[^\d]/g, "")); }
      if (!Number.isFinite(n) || n < 0) return json({ error: "número de pasos no válido" }, 400);

      datos.pasos[fecha] = Math.round(n);
      datos.actualizado = Date.now();
      // Guarda solo los últimos 60 días
      const dias = Object.keys(datos.pasos).sort();
      for (const d of dias.slice(0, Math.max(0, dias.length - 60))) delete datos.pasos[d];
      await env.PASOS.put("datos", JSON.stringify(datos));
      return json({ ok: true, fecha, pasos: datos.pasos[fecha] });
    }

    if (req.method === "GET") return json(datos);
    return json({ error: "método no permitido" }, 405);
  },
};
