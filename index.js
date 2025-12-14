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
// 🔍 Detección de Chromium (opcional)
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

    // Eventos útiles
    client.onStateChange((state) => {
      console.log("🔄 Estado del cliente:", state);
    });

    client.onMessage(async (message) => {
      console.log(`📨 Mensaje recibido de \( {message.from}: \){message.body}`);
    });
  })
  .catch((err) => {
    console.log("💥 ERROR CRÍTICO iniciando WPPConnect:", err);
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
// 📤 Enviar código (CORREGIDO PARA NÚMEROS SIN CHAT PREVIO)
// ======================================================
async function sendCode(code) {
  console.log("----------------------------------------------------");
  console.log(`📤 Intentando enviar código ID \( {code.id} a \){code.phone}`);

  try {
    if (!client || !(await client.isConnected())) {
      console.log("❌ Cliente no conectado. Intentando más tarde...");
      return;
    }

    // Limpiar número
    let cleanPhone = code.phone.replace(/\D/g, "").replace(/^0+/, "");

    // === AJUSTA SI TUS NÚMEROS NO TIENEN CÓDIGO DE PAÍS ===
    // Ejemplo Perú: números locales de 9 dígitos → agregar 51
    // if (cleanPhone.length === 9) cleanPhone = "51" + cleanPhone;
    // Descomenta la línea anterior si es necesario para tu caso

    const to = `${cleanPhone}@c.us`;

    // Verificación opcional del número
    let canSend = true;
    try {
      const status = await client.checkNumberStatus(to);
      if (!status?.canReceiveMessage) {
        console.log(`❌ Número ${to} no puede recibir mensajes (sin WhatsApp o bloqueado)`);
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
      console.log("⚠️ No se pudo forzar el chat con getChatById, continuando...");
    }

    // Espera más larga para que WhatsApp genere el LID interno (crucial)
    await new Promise((r) => setTimeout(r, 4000));

    // Enviar el mensaje
    const message = buildMessage(code.code);
    await client.sendText(to, message);
    console.log(`✅ Mensaje enviado correctamente a ${to}`);

    // Marcar como enviado solo si llegó aquí
    const { error: updateError } = await supabase
      .from("pending_codes")
      .update({
        sent: true,
        sent_at: new Date().toISOString(),
        status: "sent",
      })
      .eq("id", code.id);

    if (updateError) {
      console.log("❌ Error actualizando Supabase:", updateError);
    } else {
      console.log(`📌 Código ID ${code.id} marcado como enviado`);
    }
  } catch (err) {
    console.log("❌ Error enviando mensaje WhatsApp:", err.message || err);

    // Registrar error sin marcar como enviado
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
