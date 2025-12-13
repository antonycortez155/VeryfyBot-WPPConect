import wppconnect from "@wppconnect-team/wppconnect";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import qrcodeTerminal from "qrcode-terminal"; // ← NUEVA DEPENDENCIA

// ======================================================
// 🔑 CREDENCIALES SUPABASE
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
// 🔍 Detección de Chromium
// ======================================================
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
let client; // variable global para usar en sendCode seguro

// ======================================================
// 🚀 Iniciar WPPConnect
// ======================================================
console.log("🚀 Iniciando VerifyBot-AV (WPPConnect)...");

wppconnect
  .create({
    session: "VerifyBotAV",
    folderNameToken: "tokens",

    catchQR: (base64Qr, asciiQR, attempt) => {
      console.log(`\n📸 QR Code generado (Intento ${attempt}) - ¡Escanea rápido!\n`);
      qrcodeTerminal.generate(base64Qr, { small: true });

      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
        base64Qr
      )}&size=500x500&margin=20`;

      console.log("\n🔗 O abre este link directo en tu celular:");
      console.log(qrLink);
      console.log("\n¡Escanea antes de que expire!\n");
    },

    puppeteerOptions: {
      headless: true,
      executablePath: chromiumPath || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--single-process",
        "--no-zygote",
      ],
    },
  })
  .then(async (c) => {
    console.log("🔥 WPPConnect iniciado correctamente");
    client = c;

    console.log("⏱️ CRON activo (cada 20 segundos)");
    cron.schedule("*/20 * * * * *", async () => {
      console.log("🔄 Buscando códigos pendientes...");
      const pendingCodes = await getPendingCodes();

      if (pendingCodes.length === 0) {
        console.log("🟦 No hay códigos pendientes");
      }

      for (const code of pendingCodes) {
        console.log("----------------------------------------------------");
        console.log("📤 Enviando código ID", code.id);
        await sendCode(code);
      }
    });
  })
  .catch((err) => {
    console.log("💥 ERROR CRÍTICO iniciando WPPConnect:", err);
  });

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
// 📤 Enviar código seguro (con LID y check de WhatsApp)
// ======================================================
async function sendCode(code) {
  try {
    const to = code.phone.replace(/\D/g, "").replace(/^0+/, "") + "@c.us";

    // Verificar que el número tenga WhatsApp
    const status = await client.checkNumberStatus(to);
    if (!status?.canReceiveMessage) {
      console.log("❌ El número no tiene WhatsApp:", to);
      await supabase
        .from("pending_codes")
        .update({ status: "error", error_reason: "NO_WHATSAPP" })
        .eq("id", code.id);
      return;
    }

    // Asegurar que el chat exista para crear LID
    await client.getChatById(to).catch(() => null);
    await new Promise((r) => setTimeout(r, 1500));

    const message = `Tu código es: ${code.code}`;
    console.log("🧩 Construyendo mensaje para código", code.code);

    await client.sendText(to, message);

    await supabase
      .from("pending_codes")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", code.id);

    console.log("📤 Código enviado correctamente a", to);
  } catch (err) {
    console.log("❌ Error enviando WhatsApp:", err.message || err);

    await supabase
      .from("pending_codes")
      .update({ status: "error", error_reason: err.message || "UNKNOWN" })
      .eq("id", code.id);
  }
}

// ======================================================
// 🔧 Estado del cliente y recepción de mensajes
// ======================================================
client?.onStateChange((state) => {
  console.log("🔄 Estado del cliente:", state);
});

client?.onMessage(async (message) => {
  console.log("📨 Mensaje recibido:", message.from, message.body);
  // Puedes agregar aquí tu lógica de respuesta automática
});
