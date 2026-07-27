// ══════════════════════════════════════════════════════
//  EMAILJS CONFIG — SPPC ARLAG
//  Plano gratuito: apenas 1 template necessário
// ══════════════════════════════════════════════════════
const EMAILJS_CONFIG = {
  // 1. Chave pública da sua conta EmailJS (Account → General → Public Key)
  publicKey:    "I1QkRvQBCcLdtW_77",

  // 2. ID do serviço de e-mail (Email Services → seu serviço Gmail)
  serviceId:    "service_w0c4kvq",

  // 3. ID do único template genérico (Email Templates → sppc_notificacao)
  tplGeral:     "template_g74nsbm",

  // 4. E-mail do gerente — recebe cópia de todos os avisos
  emailGerente: "ronaldobd@celesc.com.br",

  // 5. Dias de antecedência para avisos automáticos de prazo
  diasAvisoObra:    15,   // avisa empreiteira 15 dias antes do vencimento
  diasAvisoMedida:  5,    // avisa fiscal 5 dias antes do prazo das medidas
  diasCritico:      1,    // aviso crítico: 1 dia restante ou vencido
};
export default EMAILJS_CONFIG;
