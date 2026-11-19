// imagens.js - várias fotos, orçamento + entrega, prova do trabalho
function criarCampoFoto(tipoInicial){
  const lista = document.getElementById('listaFotos');
  if(!lista) return;
  const div = document.createElement('div');
  div.style.cssText = 'background:#f8fafc;border-radius:12px;padding:10px;margin-bottom:10px';
  div.innerHTML = ''
    + '<label>Foto - tipo</label>'
    + '<select class="foto-tipo" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:10px;margin-bottom:6px">'
    + '<option value="orcamento" '+(tipoInicial==='entrega'?'':'selected')+'>Foto do orçamento</option>'
    + '<option value="entrega" '+(tipoInicial==='entrega'?'selected':'')+'>Foto da entrega / serviço pronto</option>'
    + '</select>'
    + '<input class="foto-url" type="text" placeholder="Cole o link da foto ou a foto que subiu" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;box-sizing:border-box">'
    + '<button type="button" onclick="this.parentElement.remove()" style="background:#fff;color:#dc2626;border:1px solid #fecaca">Remover esta foto</button>';
  lista.appendChild(div);
}

function coletarFotosParaSalvar(){
  const fotos = [];
  document.querySelectorAll('#listaFotos > div').forEach(function(div){
    const url = div.querySelector('.foto-url').value.trim();
    const tipo = div.querySelector('.foto-tipo').value;
    if(url) fotos.push({ image_url: url, tipo: tipo });
  });
  return fotos;
}

async function salvarFotosDoContrato(publicToken, fotos){
  if(!publicToken || !fotos.length) return;
  for(let f of fotos){
    await supabaseClient.from('contract_images').insert([{
      public_token: publicToken,
      image_url: f.image_url,
      tipo: f.tipo
    }]);
  }
}

async function carregarFotosCliente(publicToken){
  // 1. Fotos novas da tabela contract_images
  let todas = [];
  try{
    const { data } = await supabaseClient.from('contract_images').select('*').eq('public_token', publicToken).order('created_at',{ascending:true});
    if(data) todas = data;
  }catch(e){}
  return todas;
}

function htmlGradeFotos(fotos, fotoAntiga){
  let lista = [];
  // Foto antiga de antes, pra não perder
  if(fotoAntiga) lista.push({ image_url: fotoAntiga, tipo: 'orcamento' });
  if(fotos) lista = lista.concat(fotos);
  if(!lista.length) return '<p class="small">Nenhuma foto enviada.</p>';
  return lista.map(function(f){
    const label = f.tipo === 'entrega' ? 'Foto da entrega' : 'Foto do orçamento';
    return '<div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff">'
      + '<img src="'+f.image_url+'" style="width:100%;display:block" loading="lazy">'
      + '<p style="margin:0;padding:8px;font-size:12px;font-weight:700;color:#1d4ed8;text-align:center">'+label+'</p></div>';
  }).join('');
}
