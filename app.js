(function(){"use strict";
var cfg=window.SITE_CONFIG||{};
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]})}
document.querySelectorAll("#contact-btn").forEach(function(a){if(cfg.contactEmail){a.href="mailto:"+cfg.contactEmail+"?subject=Featured%20listing"}else{a.removeAttribute("href");a.setAttribute("aria-disabled","true");a.textContent+=" (contact email coming soon)"}});
var fp=$("feat-price");if(fp)fp.textContent=cfg.featuredStartingRate||"Ask us";
var su=$("signup");if(su){if(cfg.signupEndpoint){su.action=cfg.signupEndpoint;su.method="post";su.target="_blank"}else{su.addEventListener("submit",function(e){e.preventDefault();$("signup-msg").textContent="Alerts launch soon — thanks for your interest! (Nothing was stored.)"})}}
var aff=$("aff-slot");if(aff&&cfg.activityHeroAffiliateUrl){aff.innerHTML='<p class="aff">Looking for more options? <a rel="sponsored noopener" target="_blank" href="'+esc(cfg.activityHeroAffiliateUrl)+'">Browse more Atlanta camps on ActivityHero</a> <span class="badge">affiliate</span></p>'}
var grid=$("grid");if(!grid||!window.CAMPS)return;
var camps=window.CAMPS,q=$("q"),cat=$("cat"),age=$("age"),sort=$("sort"),low=$("low");
var map={day:/day camp/,stem:/lego|stem|coding|robot/,arts:/art|theatre/,sports:/sport|nature|horse|gymnast|tennis/,after:/after-school/,"break":/break/};
function ageOk(c,a){if(!a)return true;var m=String(c.ages).match(/(\d+)\s*[–-]\s*(\d+)/);if(!m)return true;return a>=+m[1]&&a<=+m[2]}
function render(){var t=q.value.trim().toLowerCase(),a=+age.value||0;
var l=camps.filter(function(c){var blob=(c.category+" "+c.dates).toLowerCase();return(cat.value==="all"||map[cat.value].test(blob))&&(!low.checked||c.free_low_cost)&&ageOk(c,a)&&(!t||[c.name,c.provider,c.area,c.category,c.ages,c.price_week,c.dates].join(" ").toLowerCase().indexOf(t)>-1)});
l.sort(function(x,y){if(sort.value==="price"){var p=x.price_low==null?1e9:x.price_low,r=y.price_low==null?1e9:y.price_low;if(p!==r)return p-r}return x.name.localeCompare(y.name)});
$("count").textContent=l.length+" of "+camps.length+" programs";
grid.innerHTML=l.length?l.map(function(c){return '<article class="card"><div class="badges"><span class="badge price">'+esc(c.price_low==null?"Price: see site":c.price_low===0?"Free":"From $"+c.price_low)+'</span><span class="badge">Ages '+esc(c.ages)+'</span>'+(c.free_low_cost?'<span class="badge ok">Free/low-cost/aid</span>':'')+'</div><h3>'+esc(c.name)+'</h3><p class="meta">'+esc(c.category)+' · '+esc(c.area)+'</p>'+(c.status_flag?'<p class="flag">'+esc(c.status_flag)+'</p>':'')+'<dl><dt>Price</dt><dd>'+esc(c.price_week)+(c.price_note?' <span class="small">'+esc(c.price_note)+'</span>':'')+'</dd><dt>Dates</dt><dd>'+esc(c.dates)+'</dd><dt>Sign-up</dt><dd>'+esc(c.registration)+'</dd></dl><p class="src"><a href="'+esc(c.source_url)+'" target="_blank" rel="noopener">Provider page ↗</a> <span class="small">checked '+esc(c.last_checked)+'</span></p></article>'}).join(""):'<p class="empty">No programs match. <button type="button" class="btn ghost" id="reset2">Clear filters</button></p>';
var r2=$("reset2");if(r2)r2.onclick=reset}
function reset(){q.value="";cat.value="all";age.value="";sort.value="name";low.checked=false;render()}
q.addEventListener("input",render);[cat,age,sort,low].forEach(function(e){e.addEventListener("change",render)});$("reset").onclick=reset;render()})();
