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
// 🔍 Detección de Chromium (opcional en Railway)
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

// Variable global para el cliente
let client;

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

      console.log("\n🔗 O abre este link directo en tu celular (recomendado):");
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

    // ==================== REINICIO AUTOMÁTICO EN CASO DE PROBLEMAS ====================
    client.on('connection_lost', () => {
      console.log("⚠️ Conexión perdida con WhatsApp. Reiniciando contenedor en 10 segundos...");
      setTimeout(() => process.exit(1), 10000);
    });

    client.on('logout', () => {
      console.log("🚪 Sesión cerrada (logout). Reiniciando en 5 segundos...");
      setTimeout(() => process.exit(1), 5000);
    });

    client.on('qr', () => {
      console.log("🔄 Nuevo QR solicitado. Reiniciando para generar uno fresco...");
      setTimeout(() => process.exit(1), 10000);
    });

    // ==================== CRON PARA ENVÍO DE CÓDIGOS ====================
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
        console.log(`📤 Intentando enviar código ID \( {code.id} a \){code.phone}`);
        await sendCode(code);
      }
    });

    // ==================== EVENTOS EXTRA (opcional) ====================
    client.onStateChange((state) => {
      console.log("🔄 Estado del cliente cambiado a:", state);
    });

    client.onMessage(async (message) => {
      console.log(`📨 Mensaje recibido de \( {message.from}: \){message.body}`);
      // Aquí puedes agregar respuestas automáticas en el futuro
    });
  })
  .catch((err) => {
    console.log("💥 ERROR CRÍTICO iniciando WPPConnect:", err);
    // En caso de error grave al iniciar, reinicia también
    setTimeout(() => process.exit(1), 10000);
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
  return data || [];
}

// ======================================================
// 📤 Enviar código de forma segura y estable
// ======================================================
async function sendCode(code) {
  try {
    // Verificar que el cliente esté conectado
    if (!client || !(await client.isConnected())) {
      console.log("❌ Cliente no conectado o no disponible. Forzando reinicio...");
      setTimeout(() => process.exit(1), 5000);
      return;
    }

    const cleanPhone = code.phone.replace(/\D/g, "").replace(/^0+/, "");
    const to = `${cleanPhone}@c.us`;

    // Opcional: verificar si el número tiene WhatsApp
    try {
      const status = await client.checkNumberStatus(to);
      if (!status?.canReceiveMessage) {
        console.log(`❌ El número ${to} no tiene WhatsApp activo`);
        await supabase
          .from("pending_codes")
          .update({ sent: true, status: "error", error_reason: "NO_WHATSAPP" })
          .eq("id", code.id);
        return;
      }
    } catch (checkErr) {
      console.log("⚠️ No se pudo verificar el número, intentando envío directo...");
    }

    const message = buildMessage(code.code);

    await client.sendText(to, message);

    console.log(`✅ Código enviado correctamente a ${to}`);

    // Marcar como enviado solo si todo salió bien
    const { error } = await supabase
      .from("pending_codes")
      .update({
        sent: true,
        sent_at: new Date().toISOString(),
        status: "sent",
      })
      .eq("id", code.id);

    if (error) {
      console.log("❌ Error actualizando Supabase (sent=true):", error);
    } else {
      console.log(`📌 Código ID ${code.id} marcado como enviado permanentemente`);
    }
  } catch (err) {
    console.log("❌ Falló el envío por WhatsApp:", err.message || err);

    // Marcar error en la base para no reintentar infinitamente
    await supabase
      .from("pending_codes")
      .update({
        status: "error",
        error_reason: err.message?.substring(0, 255) || "UNKNOWN_ERROR",
      })
      .eq("id", code.id);
  }

  console.log("----------------------------------------------------");
}
