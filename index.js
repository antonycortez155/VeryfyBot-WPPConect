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
let client; // variable global para el cliente

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

    // ==================== REINICIO AUTOMÁTICO EN CASO DE DESCONEXIÓN ====================
    client.on('connection_lost', () => {
      console.log("⚠️ Conexión perdida con WhatsApp. Reiniciando contenedor en 10 segundos...");
      setTimeout(() => process.exit(1), 10000);
    });

    client.on('logout', () => {
      console.log("🚪 Sesión cerrada (logout). Reiniciando en 5 segundos...");
      setTimeout(() => process.exit(1), 5000);
    });

    client.on('qr', () => {
      console.log("🔄 Nuevo QR solicitado. Reiniciando contenedor...");
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

    // ==================== EVENTOS EXTRA ====================
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
    setTimeout(() => process.exit(1), 10000);
  });

// ======================================================
// 🔎 Obtener códigos pendientes
// ======================================================
async function getPendingCodes() {
  console.log("🔎 Consultando Supabase (pending_codes)…");

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
// 📤 Enviar código de forma segura (MEJORADO PARA NÚMEROS SIN CHAT PREVIO)
// ======================================================
async function sendCode(code) {
  console.log("----------------------------------------------------");
  console.log(`📤 Intentando enviar código ID \( {code.id} a \){code.phone}`);

  try {
    if (!client) {
      console.log("❌ Cliente no inicializado aún");
      return;
    }

    // Verificar conexión activa
    const isConnected = await client.isConnected();
    if (!isConnected) {
      console.log("❌ WhatsApp desconectado. Forzando reinicio del contenedor...");
      setTimeout(() => process.exit(1), 8000);
      return;
    }

    // Limpiar número (elimina todo lo que no sea dígito y ceros iniciales)
    let cleanPhone = code.phone.replace(/\D/g, "").replace(/^0+/, "");

    // === IMPORTANTE: Ajusta según tu país ===
    // Si tus números se guardan sin código de país, agrégalo aquí.
    // Ejemplo para Perú: si el número tiene 9 dígitos, agregar '51'
    // if (cleanPhone.length === 9) cleanPhone = '51' + cleanPhone;
    // Descomenta y ajusta la línea de arriba si es necesario.

    const to = `${cleanPhone}@c.us`;

    // Verificar si el número existe en WhatsApp (opcional pero recomendado)
    let canSend = true;
    try {
      const status = await client.checkNumberStatus(to);
      if (!status?.canReceiveMessage) {
        console.log(`❌ Número ${to} no tiene WhatsApp activo o está bloqueado`);
        canSend = false;
      }
    } catch (e) {
      console.log("⚠️ No se pudo verificar el número, intentando envío directo...");
    }

    if (!canSend) {
      await supabase
        .from("pending_codes")
        .update({ sent: false, status: "error", error_reason: "NO_WHATSAPP" })
        .eq("id", code.id);
      return;
    }

    // === CLAVE: Forzar creación del chat aunque no exista conversación previa ===
    try {
      await client.getChatById(to);
      console.log("✅ Chat forzado/creado con éxito");
    } catch (e) {
      console.log("⚠️ Error al forzar el chat, continuando de todos modos...");
    }

    // Espera suficiente para que WhatsApp genere el LID interno
    await new Promise((r) => setTimeout(r, 3000));

    // Construir y enviar mensaje
    const message = buildMessage(code.code);
    await client.sendText(to, message);
    console.log(`✅ Mensaje enviado correctamente a ${to}`);

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
      console.log("❌ Error actualizando Supabase:", error);
    } else {
      console.log(`📌 Código ID ${code.id} marcado como enviado permanentemente`);
    }

  } catch (err) {
    console.log("❌ Error crítico al enviar mensaje:", err.message || err);

    // Registrar error pero no marcar como enviado
    await supabase
      .from("pending_codes")
      .update({
        status: "error",
        error_reason: (err.message || "SEND_FAILED").substring(0, 255),
      })
      .eq("id", code.id);
  }

  console.log("----------------------------------------------------");
}
