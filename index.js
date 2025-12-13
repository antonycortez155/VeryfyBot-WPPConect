import wppconnect from "@wppconnect-team/wppconnect";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

// ======================================================
// 🔑 CREDENCIALES SUPABASE (HARDCODED - COMO ANTES)
// ======================================================
const SUPABASE_URL = "https://alksajdslujdxkasymiw.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3NhamRzbHVqZHhrYXN5bWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3NDY4MTYsImV4cCI6MjA3MjMyMjgxNn0.XSnLDa_LjmxpVrgY864CrR-hxSb7hM17gQdV3W8VWGk";

// ======================================================
// 🔌 Conexión a Supabase
// ======================================================
console.log("🟦 Conectando a Supabase...");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("✅ Supabase conectado.");

// ======================================================
// 📩 Construir mensaje de código
// ======================================================
function buildMessage(code) {
  console.log(`🧩 Construyendo mensaje para código ${code}`);
  return `
🔐✨ ¡Aquí está tu código!

Tu código de verificación es: *${code}*

⏳ Tienes 5 minutos para usarlo.

Si no solicitaste este código, simplemente ignora este mensaje.
`;
}

// ======================================================
// 🔎 Obtener códigos pendientes
// ======================================================
async function getPendingCodes() {
  console.log("🔎 Consultando Supabase (pending_codes)...");

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("pending_codes")
    .select("*")
    .eq("sent", false)
    .gt("expires_at", now);

  if (error) {
    console.log("❌ ERROR desde Supabase:", error);
    return [];
  }

  console.log(`📥 Registros recibidos: ${data.length}`);
  return data;
}

// ======================================================
// 📤 Enviar código por WhatsApp
// ======================================================
async function sendCode(client, row) {
  console.log("----------------------------------------------------");
  console.log(`📤 Enviando código ID ${row.id}`);

  try {
    const phone = row.phone.replace(/\D/g, "");
    const jid = `${phone}@c.us`;

    const msg = buildMessage(row.code);

    await client.sendText(jid, msg);

    console.log(`✅ Código enviado a ${row.phone}`);

    const { error } = await supabase
      .from("pending_codes")
      .update({ sent: true })
      .eq("id", row.id);

    if (error) {
      console.log("❌ Error actualizando Supabase:", error);
    } else {
      console.log(`📌 Código ${row.id} marcado como enviado`);
    }

  } catch (err) {
    console.log("❌ Error enviando WhatsApp:", err);
  }

  console.log("----------------------------------------------------");
}


import { execSync } from "child_process";

function getChromiumPath() {
  try {
    const path = execSync("which chromium").toString().trim();
    console.log("🧭 Chromium detectado en:", path);
    return path;
  } catch {
    console.error("❌ Chromium no encontrado en PATH");
    return null;
  }
}

const chromiumPath = getChromiumPath();

// ======================================================
// 🚀 Iniciar WPPConnect
// ======================================================
console.log("🚀 Iniciando VerifyBot-AV (WPPConnect)...");

wppconnect.create({
  session: "VerifyBotAV",

  catchQR: (qr) => {
    console.log("📸 Escanea este QR:");
    console.log(qr);
  },

  puppeteerOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--single-process', // opcional, ayuda con memoria
    ],
  },
})
  .then((client) => {
    console.log("🔥 WPPConnect iniciado correctamente");
    console.log("⏱️ CRON activo (cada 20 segundos)");

    cron.schedule("*/20 * * * * *", async () => {
      console.log("🔄 Buscando códigos pendientes...");
      const rows = await getPendingCodes();

      if (rows.length === 0) {
        console.log("🟦 No hay códigos pendientes");
      }

      for (const row of rows) {
        await sendCode(client, row);
      }
    });
  })
  .catch((err) => {
    console.log("💥 ERROR CRÍTICO iniciando WPPConnect:", err);
  });
