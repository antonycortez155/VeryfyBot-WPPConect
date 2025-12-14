import wppconnect from "@wppconnect-team/wppconnect";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import qrcodeTerminal from "qrcode-terminal";

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
  `.trim();
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
let client;

// ======================================================
// 🚀 Iniciar WPPConnect
// ======================================================
console.log("🚀 Iniciando VerifyBot-AV (WPPConnect)…");

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
    client = c;
    console.log("🔥 WPPConnect iniciado correctamente");

    // ==================== REINICIO AUTOMÁTICO EN DESCONEXIÓN ====================
    client.on('connection_lost', () => {
      console.log("⚠️ Conexión perdida. Reiniciando contenedor en 10s...");
      setTimeout(() => process.exit(1), 10000);
    });

    client.on('logout', () => {
      console.log("🚪 Logout detectado. Reiniciando...");
      setTimeout(() => process.exit(1), 5000);
    });

    client.onStateChange((state) => {
      console.log("🔄 Estado:", state);
      if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'DISCONNECTED') {
        console.log("❌ Estado crítico detectado. Reiniciando...");
        setTimeout(() => process.exit(1), 8000);
      }
    });

    // ==================== CRON ====================
    console.log("⏱️ CRON activo (cada 20 segundos)");
    cron.schedule("*/20 * * * * *", async () => {
      console.log("🔄 Buscando códigos pendientes...");
      const pendingCodes = await getPendingCodes();

      if (pendingCodes.length === 0) {
        console.log("🟦 No hay códigos pendientes");
        return;
      }

      for (const code of pendingCodes) {
        console.log("----------------------------------------------------");
        console.log(`📤 Enviando código ID \( {code.id} a \){code.phone}`);
        await sendCode(code);
      }
    });

    client.onMessage(async (message) => {
      console.log(`📨 Mensaje recibido de \( {message.from}: \){message.body}`);
    });
  })
  .catch((err) => {
    console.log("💥 ERROR CRÍTICO:", err);
    setTimeout(() => process.exit(1), 10000);
  });

// ======================================================
// 🔎 Obtener códigos pendientes
// ======================================================
async function getPendingCodes() {
  console.log("🔎 Consultando Supabase...");
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("pending_codes")
    .select("*")
    .eq("sent", false)
    .gt("expires_at", now);

  if (error) {
    console.log("❌ ERROR Supabase:", error);
    return [];
  }

  console.log(`📥 Registros: ${data.length}`);
  return data || [];
}

// ======================================================
// 📤 Enviar código (con manejo de detached frame)
// ======================================================
async function sendCode(code) {
  try {
    if (!client || !(await client.isConnected())) {
      console.log("❌ Cliente desconectado. Reiniciando...");
      setTimeout(() => process.exit(1), 8000);
      return;
    }

    let cleanPhone = code.phone.replace(/\D/g, "").replace(/^0+/, "");

    // Ajusta si tus números no tienen código de país
    // if (cleanPhone.length === 9) cleanPhone = "51" + cleanPhone;

    const to = `${cleanPhone}@c.us`;

    const message = buildMessage(code.code);
    await client.sendText(to, message);
    console.log(`✅ Enviado a ${to}`);

    const { error } = await supabase
      .from("pending_codes")
      .update({ sent: true, sent_at: new Date().toISOString(), status: "sent" })
      .eq("id", code.id);

    if (error) console.log("❌ Error Supabase:", error);
    else console.log(`📌 ID ${code.id} marcado como enviado`);

  } catch (err) {
    console.log("❌ Error enviando:", err.message || err);

    if (err.message.includes("detached Frame") || err.message.includes("disconnected")) {
      console.log("🔥 Detached frame detectado. Reiniciando contenedor...");
      setTimeout(() => process.exit(1), 5000);
      return;
    }

    // Registrar error pero no marcar enviado
    await supabase
      .from("pending_codes")
      .update({ status: "error", error_reason: (err.message || "UNKNOWN").substring(0, 255) })
      .eq("id", code.id);
  }

  console.log("----------------------------------------------------");
}
