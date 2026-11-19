// fotos-todas.js - ZapGarantia
// Usa o MESMO campo de fotos que já existe. Não cria campo novo.
// Faz TODAS as fotos irem para o link do cliente e para o PDF.
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
  };
})();
