/* Nexorally docs, theme + search */
(function(){
  // ---- theme ----
  try{
    var saved = localStorage.getItem('pbt-docs-theme');
    var t = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
  }catch(e){}
  window.toggleTheme = function(){
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    try{ localStorage.setItem('pbt-docs-theme', cur); }catch(e){}
  };

  // ---- search ----
  var q = document.getElementById('q');
  var box = document.getElementById('results');
  var docs = (window.DOCS || []);
  var hits = [], sel = -1;

  function esc(s){ return s.replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
  function snippet(text, terms){
    var low = text.toLowerCase(), pos = -1;
    for(var i=0;i<terms.length;i++){ var p = low.indexOf(terms[i]); if(p>-1){ pos=p; break; } }
    if(pos<0) return text.slice(0,90);
    var start = Math.max(0, pos-30);
    return (start>0?'…':'') + text.slice(start, start+100);
  }
  function run(){
    var val = q.value.trim().toLowerCase();
    if(val.length < 2){ box.classList.remove('show'); box.innerHTML=''; hits=[]; sel=-1; return; }
    var terms = val.split(/\s+/);
    hits = docs.map(function(d){
      var hay = (d.t + ' ' + d.s).toLowerCase(), score = 0;
      terms.forEach(function(tm){
        if(d.t.toLowerCase().indexOf(tm) > -1) score += 5;
        if(hay.indexOf(tm) > -1) score += 1;
      });
      return {d:d, score:score};
    }).filter(function(x){ return x.score > 0; })
      .sort(function(a,b){ return b.score - a.score; }).slice(0, 8);
    if(!hits.length){ box.innerHTML = '<div class="empty">No matches</div>'; box.classList.add('show'); return; }
    box.innerHTML = hits.map(function(h, i){
      return '<a href="'+h.d.u+'" data-i="'+i+'"><div class="rt">'+esc(h.d.t)+'</div>'+
             '<div class="rg">'+esc(h.d.g)+'</div>'+
             '<div class="rs">'+esc(snippet(h.d.s, terms))+'</div></a>';
    }).join('');
    box.classList.add('show'); sel = -1;
  }
  function move(dir){
    var links = box.querySelectorAll('a'); if(!links.length) return;
    sel = (sel + dir + links.length) % links.length;
    links.forEach(function(a,i){ a.classList.toggle('sel', i===sel); });
    links[sel].scrollIntoView({block:'nearest'});
  }
  if(q){
    q.addEventListener('input', run);
    q.addEventListener('keydown', function(e){
      if(e.key === 'ArrowDown'){ e.preventDefault(); move(1); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); move(-1); }
      else if(e.key === 'Enter'){
        var links = box.querySelectorAll('a');
        if(links.length){ e.preventDefault(); (links[sel] || links[0]).click(); }
      } else if(e.key === 'Escape'){ box.classList.remove('show'); q.blur(); }
    });
    document.addEventListener('click', function(e){
      if(!e.target.closest('.docs-search')) box.classList.remove('show');
    });
    // keyboard shortcut: / focuses search
    document.addEventListener('keydown', function(e){
      if(e.key === '/' && document.activeElement !== q){ e.preventDefault(); q.focus(); }
    });
  }
})();
