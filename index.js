// index.js - VerifyBot-AV WPPConnect
import { create } from '@wppconnect-team/wppconnect';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

let client;

(async () => {
  console.log('🟦 Conectando a Supabase...');
  // Puedes agregar test de conexión si quieres
  console.log('✅ Supabase conectado.');

  console.log('🚀 Iniciando VerifyBot-AV (WPPConnect)...');
  client = await create({
    session: 'VerifyBotAV',
    puppeteerOptions: { headless: true }
  });

  console.log('🔄 Buscando códigos pendientes...');
  await processPendingCodes();
})();

// Función para consultar y procesar códigos pendientes
async function processPendingCodes() {
  try {
    const { data: pendingCodes } = await supabase
      .from('pending_codes')
      .select('*')
      .eq('status', 'pending');

    console.log('🔎 Consultando Supabase (pending_codes)...');
    console.log('📥 Registros recibidos:', pendingCodes.length);

    if (!pendingCodes.length) {
      console.log('🟦 No hay códigos pendientes');
      return;
    }

    for (const code of pendingCodes) {
      console.log('----------------------------------------------------');
      console.log('📤 Enviando código ID', code.id);
      await sendCode(code);
    }

    // Espera 5 segundos y vuelve a consultar
    setTimeout(processPendingCodes, 5000);

  } catch (err) {
    console.error('❌ Error consultando códigos pendientes:', err);
    setTimeout(processPendingCodes, 10000);
  }
}

// --------------------------
// Función ajustada de envío de WhatsApp
// --------------------------
async function sendCode(code) {
  try {
    const to = code.phone.replace(/\D/g, '').replace(/^0+/, '') + '@c.us';

    // Verifica que el número pueda recibir mensajes
    const status = await client.checkNumberStatus(to);
    if (!status?.canReceiveMessage) {
      console.log('❌ El número no tiene WhatsApp:', to);
      await supabase
        .from('pending_codes')
        .update({ status: 'error', error_reason: 'NO_WHATSAPP' })
        .eq('id', code.id);
      return;
    }

    // Asegurar que el chat exista para crear LID
    await client.getChatById(to).catch(() => null);
    await new Promise(r => setTimeout(r, 1500)); // espera 1.5s para que se cree LID

    const message = `Tu código es: ${code.code}`;
    console.log('🧩 Construyendo mensaje para código', code.code);

    await client.sendText(to, message);

    await supabase
      .from('pending_codes')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', code.id);

    console.log('📤 Código enviado correctamente a', to);

  } catch (err) {
    console.log('❌ Error enviando WhatsApp:', err.message || err);
    await supabase
      .from('pending_codes')
      .update({ status: 'error', error_reason: err.message || 'UNKNOWN' })
      .eq('id', code.id);
  }
}

// --------------------------
// Mantenimiento de sesión y logs adicionales
// --------------------------
client.onStateChange((state) => {
  console.log('🔄 Estado del cliente:', state);
});

client.onMessage(async (message) => {
  console.log('📨 Mensaje recibido:', message.from, message.body);
  // Aquí puedes agregar lógica de respuesta automática si quieres
});
