(function(){"use strict";
var cfg=window.SITE_CONFIG||{};
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]})}
document.querySelectorAll("#contact-btn").forEach(function(a){if(cfg.contactEmail){a.href="mailto:"+cfg.contactEmail+"?subject=Featured%20listing"}else{a.removeAttribute("href");a.setAttribute("aria-disabled","true");a.textContent+=" (contact email coming soon)"}});
var fp=$("feat-price");if(fp)fp.textContent=cfg.featuredStartingRate||"Ask us";

/* ---- Sign-up alerts ---- */
var dlg=$("alert-dlg"),af=$("alert-form"),live=!!cfg.signupEndpoint,lastFocus=null;
var LABELS={day:"Day camps",stem:"LEGO / STEM",arts:"Arts & theatre",sports:"Sports & outdoors","break":"School-break camps",after:"After-school",tennis:"Tennis",horse:"Horseback riding",swim:"Swim",gym:"Gymnastics",nature:"Nature & outdoors",library:"Free library & community"};
function seasonGuess(c){var t=(c.category+" "+c.dates).toLowerCase(),o=[];if(/spring|break/.test(t))o.push("Spring break");if(/summer|weeks|may|june|july/.test(t))o.push("Summer");if(/fall|winter|break/.test(t))o.push("Fall/Winter break");return o}
function err(id,m){var e=$(id);if(e)e.textContent=m||""}
function openAlert(o){if(!dlg)return;lastFocus=document.activeElement;af.reset();["a-email-err","a-what-err","a-season-err","a-consent-err"].forEach(function(i){err(i)});$("a-msg").textContent="";
$("a-camp").value=o.camp||"";$("a-act").value=o.activity||"";
var ss=o.seasons||[];af.querySelectorAll('input[name=season_opt]').forEach(function(b){b.checked=ss.indexOf(b.value)>-1});
if(o.area){var sel=$("a-area");for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.toLowerCase().indexOf(o.area.toLowerCase())===0)sel.selectedIndex=i}}
$("alert-title").textContent="Email me when "+(o.camp||o.activity||"camp")+" sign-ups open";
$("alert-soon").hidden=live;$("a-submit").disabled=!live;$("a-submit").textContent=live?"Email me":"Alerts launching soon";
if(dlg.showModal)dlg.showModal();else dlg.setAttribute("open","");$("a-email").focus()}
function closeAlert(){if(dlg.close)dlg.close();else dlg.removeAttribute("open");if(lastFocus&&lastFocus.focus)lastFocus.focus()}
if(dlg){$("alert-close").onclick=closeAlert;$("alert-cancel").onclick=closeAlert;dlg.addEventListener("click",function(e){if(e.target===dlg)closeAlert()});
if(live){af.action=cfg.signupEndpoint;af.method="post";af.target="_blank";if(cfg.signupHoneypot){var h=document.createElement("input");h.type="text";h.name=cfg.signupHoneypot;h.tabIndex=-1;h.value="";h.setAttribute("aria-hidden","true");h.className="hp";af.appendChild(h)}}
af.addEventListener("submit",function(e){var ok=true,em=$("a-email").value.trim();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){err("a-email-err","Enter a valid email address.");ok=false}else err("a-email-err");
if(!$("a-camp").value.trim()&&!$("a-act").value.trim()){err("a-what-err","Name a camp or an activity.");ok=false}else err("a-what-err");
var ss=[].map.call(af.querySelectorAll('input[name=season_opt]:checked'),function(b){return b.value});if(!ss.length){err("a-season-err","Pick at least one season.");ok=false}else err("a-season-err");
if(!$("a-consent").checked){err("a-consent-err","Please agree so we can email you.");ok=false}else err("a-consent-err");
if(!ok||!live){e.preventDefault();if(ok&&!live)$("a-msg").textContent="Alerts aren’t live yet, so nothing was saved.";return}
$("a-season").value=ss.join(", ");$("a-tags").value=cfg.signupTags||"";if(!cfg.signupTags)$("a-tags").disabled=true;
$("a-msg").textContent="Opening our email provider in a new tab to confirm your sign-up…"})}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest(".alert-open");if(!b)return;e.preventDefault();openAlert({camp:b.getAttribute("data-camp")||"",activity:b.getAttribute("data-activity")||"",seasons:(b.getAttribute("data-seasons")||"").split("|").filter(Boolean),area:b.getAttribute("data-area")||""})});
var aff=$("aff-slot");if(aff&&cfg.activityHeroAffiliateUrl){aff.innerHTML='<p class="aff">Looking for more options? <a rel="sponsored noopener" target="_blank" href="'+esc(cfg.activityHeroAffiliateUrl)+'">Browse more Atlanta camps on ActivityHero</a> <span class="badge">affiliate</span></p>'}
var grid=$("grid");if(!grid||!window.CAMPS)return;
var camps=window.CAMPS,q=$("q"),cat=$("cat"),age=$("age"),sort=$("sort"),low=$("low");
var map={day:/day camp/,stem:/lego|stem|coding|robot/,arts:/art|theatre/,sports:/sport|nature|horse|gymnast|tennis|swim/,after:/after-school/,"break":/break/,tennis:/tennis/,horse:/horse/,swim:/swim/,gym:/gymnast/,nature:/nature|outdoor/,library:/library|storytime|community/};
var county=(document.getElementById("camps")||{}).getAttribute?document.getElementById("camps").getAttribute("data-county"):"";
function ageOk(c,a){if(!a)return true;var m=String(c.ages).match(/(\d+)\s*[–-]\s*(\d+)/);if(!m)return true;return a>=+m[1]&&a<=+m[2]}
function render(){var t=q.value.trim().toLowerCase(),a=+age.value||0;
var l=camps.filter(function(c){var blob=(c.name+" "+c.category+" "+c.dates).toLowerCase();return(cat.value==="all"||map[cat.value].test(blob))&&(!low.checked||c.free_low_cost)&&ageOk(c,a)&&(!t||[c.name,c.provider,c.area,c.category,c.ages,c.price_week,c.dates].join(" ").toLowerCase().indexOf(t)>-1)});
l.sort(function(x,y){if(sort.value==="price"){var p=x.price_low==null?1e9:x.price_low,r=y.price_low==null?1e9:y.price_low;if(p!==r)return p-r}return x.name.localeCompare(y.name)});
$("count").textContent=l.length+" of "+camps.length+" programs";
grid.innerHTML=l.length?l.map(function(c){return '<article class="card"><div class="badges"><span class="badge price">'+esc(c.price_low==null?"Price: see site":c.price_low===0?"Free":"From $"+c.price_low)+'</span><span class="badge">Ages '+esc(c.ages)+'</span>'+(c.free_low_cost?'<span class="badge ok">Free/low-cost/aid</span>':'')+'</div><h3>'+esc(c.name)+'</h3><p class="meta">'+esc(c.category)+' · '+esc(c.area)+'</p>'+(c.status_flag?'<p class="flag">'+esc(c.status_flag)+'</p>':'')+'<dl><dt>Price</dt><dd>'+esc(c.price_week)+(c.price_note?' <span class="small">'+esc(c.price_note)+'</span>':'')+'</dd><dt>Dates</dt><dd>'+esc(c.dates)+'</dd><dt>Sign-up</dt><dd>'+esc(c.registration)+'</dd></dl><p class="src"><a href="'+esc(c.source_url)+'" target="_blank" rel="noopener">Provider page ↗</a> <span class="small">checked '+esc(c.last_checked)+'</span></p><button type="button" class="btn ghost sm alert-open" data-camp="'+esc(c.name)+'" data-activity="'+esc(c.category)+'" data-seasons="'+esc(seasonGuess(c).join("|"))+'" data-area="'+esc(county||"")+'">🔔 Email me when sign-ups open</button></article>'}).join(""):'<p class="empty">No programs match. <button type="button" class="btn ghost" id="reset2">Clear filters</button></p>';
var r2=$("reset2");if(r2)r2.onclick=reset;
var aa=$("act-alert");if(aa){if(cat.value!=="all"){var lab=LABELS[cat.value];aa.hidden=false;aa.innerHTML='<p><strong>Want '+esc(lab)+' alerts?</strong> Get one email when '+esc(lab.toLowerCase())+' sign-ups open'+(l.length?'':' (we’ll add listings as camps announce)')+'.</p><button type="button" class="btn sm alert-open" data-activity="'+esc(lab)+'" data-area="'+esc(county||"")+'">🔔 Email me when '+esc(lab)+' sign-ups open</button>'}else{aa.hidden=true;aa.innerHTML=""}}
document.querySelectorAll(".chip").forEach(function(ch){ch.setAttribute("aria-pressed",ch.getAttribute("data-cat")===cat.value?"true":"false")})}
function reset(){q.value="";cat.value="all";age.value="";sort.value="name";low.checked=false;render()}
q.addEventListener("input",render);[cat,age,sort,low].forEach(function(e){e.addEventListener("change",render)});$("reset").onclick=reset;document.querySelectorAll(".chip").forEach(function(ch){ch.onclick=function(){cat.value=ch.getAttribute("data-cat")===cat.value?"all":ch.getAttribute("data-cat");render()}});render()})();
