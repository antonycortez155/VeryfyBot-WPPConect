import wppconnect from "@wppconnect-team/wppconnect";
import dotenv from "dotenv";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// ======================================================
// 🔌 Conexión REAL a Supabase (la que enviaste)
// ======================================================
console.log("🟦 Conectando a Supabase...");

const supabaseUrl = 'https://alksajdslujdxkasymiw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3NhamRzbHVqZHhrYXN5bWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3NDY4MTYsImV4cCI6MjA3MjMyMjgxNn0.XSnLDa_LjmxpVrgY864CrR-hxSb7hM17gQdV3W8VWGk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log("✅ Supabase conectado.");

// ======================================================
// 📩 Mensaje de código
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
  console.log("🕒 Fecha actual ISO:", now);

  const { data, error } = await supabase
    .from("pending_codes")
    .select("*")
    .eq("sent", false)
    .gt("expires_at", now);

  if (error) {
    console.log("❌ ERROR desde Supabase:", error);
    return [];
  }

  console.log("📥 Registros recibidos:", data.length);
  if (data.length > 0) {
    console.log("📄 Primer registro:", data[0]);
  }

  return data;
}

// ======================================================
// 📤 Enviar código por WhatsApp
// ======================================================
async function sendCode(client, row) {
  console.log("----------------------------------------------------");
  console.log(`📤 INICIO envío de código (ID ${row.id})`);
  console.log("📱 Teléfono:", row.phone);
  console.log("🔢 Código:", row.code);

  try {
    const phone = row.phone.replace(/\D/g, "");
    const jid = `${phone}@c.us`;

    console.log("📨 Enviando a JID:", jid);

    const msg = buildMessage(row.code);

    console.log("📤 Enviando mensaje real...");

    await client.sendText(jid, msg);

    console.log(`✅ Mensaje enviado correctamente a ${row.phone}`);

    // 📌 Actualizar en Supabase
    console.log("📌 Marcando como enviado en Supabase...");

    const { error } = await supabase
      .from("pending_codes")
      .update({ sent: true })
      .eq("id", row.id);

    if (error) {
      console.log("❌ ERROR marcando enviado:", error);
    } else {
      console.log(`📌 OK — Registro ID ${row.id} actualizado.`);
    }

  } catch (err) {
    console.log("❌ ERROR enviando mensaje:");
    console.log(err);
  }

  console.log("----------------------------------------------------");
}

// ======================================================
// 🚀 Iniciar WPPConnect
// ======================================================
console.log("🚀 Iniciando VerifyBot-AV (WPPConnect)...");

wppconnect
  .create({
    session: "VerifyBotAV",
    browserArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
    puppeteerOptions: {
      headless: false,
    },
    catchQR: (qr) => {
      console.log("📸 Escanea este QR para conectar:");
      console.log(qr);
    }
  })
  .then((client) => {
    console.log("🔥 WPPConnect iniciado correctamente");
    console.log("⏱️ Iniciando cron... cada 20 segundos");

    // ======================================================
    // ⏱️ CRON — Ejecutar cada 20 segundos
    // ======================================================
    cron.schedule("*/20 * * * * *", async () => {
      console.log("===================================================");
      console.log("🔄 CRON: Verificando códigos pendientes...");

      const rows = await getPendingCodes();

      if (rows.length === 0) {
        console.log("🟦 No hay códigos pendientes por enviar.");
      }

      for (const row of rows) {
        await sendCode(client, row);
      }
    });
  })
  .catch((err) => {
    console.log("💥 ERROR CRÍTICO iniciando WPPConnect:");
    console.log(err);
  });
