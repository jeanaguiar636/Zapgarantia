// fotos-todas.js - V2 - ZapGarantia
// Mesmo campo de fotos, sem criar campo novo.
// Profissional: coleta TODAS as fotos do campo que já existe.
// Cliente: mostra TODAS as fotos que estão no documento/orçamento.
(function () {
  window.zgColetarTodasFotos = function () {
    var fotos = [];
    document.querySelectorAll('input').forEach(function (inp) {
      var ph = (inp.placeholder || '').toLowerCase();
      var name = (inp.name || '').toLowerCase();
      var id = (inp.id || '').toLowerCase();
      var eFoto = ph.indexOf('link da foto') > -1 || ph.indexOf('foto que subiu') > -1 || name.indexOf('foto') > -1 || name.indexOf('photo') > -1 || name.indexOf('image') > -1 || id.indexOf('foto') > -1 || id.indexOf('photo') > -1;
      if (eFoto) {
        var v = (inp.value || '').trim();
        if (v) fotos.push(v);
      }
      if (inp.dataset && inp.dataset.fotoUrl) fotos.push(inp.dataset.fotoUrl);
    });
    if (Array.isArray(window.__zgFotos)) fotos = fotos.concat(window.__zgFotos);
    var seen = {};
    var out = [];
    fotos.forEach(function (f) {
      f = (f || '').trim();
      if (f && !seen[f]) { seen[f] = 1; out.push(f); }
    });
    return out;
  };

  window.zgNormalizarFotos = function (contrato) {
    if (!contrato) return [];
    var arr = contrato.photos || contrato.images || contrato.fotos || contrato.service_images || [];
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { arr = [arr]; } }
    if (!Array.isArray(arr)) arr = [arr];
    var unica = contrato.image_url || contrato.photo_url || contrato.foto || contrato.imagem || '';
    if (unica) arr.unshift(unica);
    var seen = {};
    var out = [];
    arr.forEach(function (f) {
      f = (f || '').trim();
      if (f && !seen[f]) { seen[f] = 1; out.push(f); }
    });
    return out;
  };

  window.zgMostrarTodasFotos = function (fotos, container) {
    if (!container) return;
    if (!Array.isArray(fotos)) fotos = window.zgNormalizarFotos({ photos: fotos });
    if (!fotos.length) return;
    container.innerHTML = fotos.map(function (src, i) {
      return '<figure style="margin:0 0 12px 0"><img src="' + src + '" style="width:100%;border-radius:12px;display:block" alt="Foto do serviço ' + (i + 1) + '"><figcaption style="font-size:12px;color:#64748b;margin-top:4px">Foto ' + (i + 1) + ' de ' + fotos.length + ' - prova do serviço</figcaption></figure>';
    }).join('');
    // esconde a foto única duplicada que fica fora da caixa
    document.querySelectorAll('img').forEach(function (img) {
      if (img.closest('#zgTodasFotos')) return;
      if (fotos.indexOf(img.src) > -1 || fotos.indexOf(img.getAttribute('src')) > -1) {
        img.style.display = 'none';
      }
    });
  };

  window.zgCarregarFotosCliente = async function () {
    try {
      var params = new URLSearchParams(location.search);
      var token = params.get('token') || params.get('c') || '';
      if (!token) return;
      var sb = window.supabase || window._supabase || window.sb;
      if (!sb) return;
      var res = await sb.from('contracts').select('*').eq('public_token', token).maybeSingle();
      var contrato = res && res.data ? res.data : null;
      if (!contrato) return;
      var fotos = window.zgNormalizarFotos(contrato);
      try {
        var imgs = await sb.from('contract_images').select('*').eq('contract_id', contrato.id);
        if (imgs && imgs.data) {
          imgs.data.forEach(function (r) {
            var u = r.image_url || r.url || r.foto || r.photo_url || '';
            if (u && fotos.indexOf(u) === -1) fotos.push(u);
          });
        }
      } catch (e) {}
      var box = document.getElementById('zgTodasFotos');
      if (!box) {
        var single = document.querySelector('main img, #app img');
        if (single && single.parentNode) {
          box = document.createElement('div');
          box.id = 'zgTodasFotos';
          single.parentNode.insertBefore(box, single.nextSibling);
        }
      }
      if (box) window.zgMostrarTodasFotos(fotos, box);
    } catch (e) {}
  };

  function initCliente() {
    if (location.pathname.indexOf('/c') === -1 && location.search.indexOf('token=') === -1 && location.search.indexOf('c=') === -1) return;
    setTimeout(window.zgCarregarFotosCliente, 1000);
    setTimeout(window.zgCarregarFotosCliente, 2500);
    setTimeout(window.zgCarregarFotosCliente, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCliente);
  else initCliente();
})();
