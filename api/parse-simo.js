// Vercel Serverless Function — Proxy Anthropic API (evita CORS do browser)
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({error:'Method not allowed'}); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey){ res.status(500).json({error:'ANTHROPIC_API_KEY não configurada. Acesse Vercel → Settings → Environment Variables e adicione ANTHROPIC_API_KEY.'}); return; }

  const { pdfBase64 } = req.body;
  if(!pdfBase64){ res.status(400).json({error:'pdfBase64 é obrigatório'}); return; }

  const prompt = `Analise este PDF de Cronograma de Desligamento da CELESC (SIMO) e extraia TODOS os desligamentos em JSON.

Para cada entrada, extraia:
- obraNumero: número OIS de 9 dígitos (ex: "400820313")
- dataProgram: data em YYYY-MM-DD (converter de DD/MM/YYYY)
- inicioHora: "13:00"
- fimHora: "18:00"
- empreiteira: "CS ELETRICIDADE" para turmas com "CS ELET", "ELETELSUL" para "ELETELSUI"/"ELETELSUL", outros: nome da turma literal
- status: "aguarda_programador" para "AGUARDA AUT. PROGRAMADOR", "aguarda_execucao" para "AGUARDA EXECUCAO MANUTENCAO"
- localidade: primeira localidade listada
- responsavel: nome do Resp. Titular

Responda APENAS JSON array sem markdown.`;

  try{
    const r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-sonnet-4-6', max_tokens:4000,
        messages:[{role:'user',content:[
          {type:'document',source:{type:'base64',media_type:'application/pdf',data:pdfBase64}},
          {type:'text',text:prompt}
        ]}]
      })
    });
    const data = await r.json();
    res.status(r.status).json(data);
  }catch(e){ res.status(500).json({error:e.message}); }
}
