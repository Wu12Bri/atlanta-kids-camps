(function(){"use strict";
var cfg=window.SITE_CONFIG||{};
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]})}
document.querySelectorAll("#contact-btn").forEach(function(a){if(cfg.contactEmail){a.href="mailto:"+cfg.contactEmail+"?subject=Featured%20listing"}else{a.removeAttribute("href");a.setAttribute("aria-disabled","true");a.textContent+=" (contact email coming soon)"}});
var fp=$("feat-price");if(fp)fp.textContent=cfg.featuredStartingRate||"Pricing coming January 2027";

/* ---- Sign-up alerts ---- */
var dlg=$("alert-dlg"),af=$("alert-form"),live=!!cfg.signupEndpoint,lastFocus=null;
var LABELS={tennis:"Tennis",farm:"Farm & animals",horse:"Horses",nature:"Nature & outdoors",garden:"Gardening",survival:"Survival skills",trades:"Blacksmithing & maker",art:"Art",theatre:"Theatre",dance:"Dance",swim:"Swim",sports:"Sports",gym:"Gymnastics",stem:"STEM / LEGO / coding",day:"Day camps","break":"School-break",after:"After-school",library:"Library",free:"Free programs",unusual:"Unusual & offbeat",outdoor:"Outdoor & adventure"};
var CAT_MAP={stem:"STEM / LEGO / coding",art:"Arts and theatre",theatre:"Arts and theatre",dance:"Arts and theatre",trades:"Arts and theatre",sports:"Sports and outdoors",tennis:"Sports and outdoors",horse:"Sports and outdoors",swim:"Sports and outdoors",gym:"Sports and outdoors",nature:"Sports and outdoors",farm:"Sports and outdoors",garden:"Sports and outdoors",survival:"Sports and outdoors",unusual:"Sports and outdoors",day:"Day camps",after:"Day camps",library:"Free library and community",free:"Free library and community","break":"School-break camps",outdoor:"Sports and outdoors"};
var COUNTY={cobb:"Cobb","north-fulton":"North Fulton",atlanta:"Atlanta / DeKalb",gwinnett:"Gwinnett",metro:"Metro-wide","day-trip":"Day trip / overnight"};
function seasonGuess(c){var t=(c.category+" "+c.dates).toLowerCase(),o=[];if(/spring|break/.test(t))o.push("Spring break");if(/summer|weeks|may|june|july/.test(t))o.push("Summer");if(/fall|winter|break/.test(t))o.push("Fall/Winter break");return o}
function err(id,m){var e=$(id);if(e)e.textContent=m||""}
function openAlert(o){if(!dlg)return;lastFocus=document.activeElement;af.reset();["a-email-err","a-what-err","a-season-err","a-consent-err"].forEach(function(i){err(i)});$("a-msg").textContent="";
$("a-camp").value=o.camp||"";$("a-act").value=o.activity||"";
var ss=o.seasons||[];af.querySelectorAll('input[name=season_opt]').forEach(function(b){b.checked=ss.indexOf(b.value)>-1});
var cats=o.categories||[];if(!cats.length&&o.activity&&CAT_MAP[o.catKey])cats=[CAT_MAP[o.catKey]];if(!cats.length&&o.activity){af.querySelectorAll('input[name=cat_opt]').forEach(function(b){if((o.activity||"").toLowerCase().indexOf(b.value.toLowerCase().split(" / ")[0])>-1)b.checked=true})}
af.querySelectorAll('input[name=cat_opt]').forEach(function(b){if(cats.indexOf(b.value)>-1)b.checked=true});
if(o.area){var sel=$("a-area");for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.toLowerCase().indexOf(o.area.toLowerCase())===0)sel.selectedIndex=i}}
$("alert-title").textContent="Email me when "+(o.camp||o.activity||"camp")+" sign-ups open";
$("alert-soon").hidden=live;$("a-submit").disabled=!live;$("a-submit").textContent=live?"Email me":"Alerts launching soon";
if(dlg.showModal)dlg.showModal();else dlg.setAttribute("open","");$("a-email").focus()}
window.openCampAlert=function(o){openAlert(o||{})};
function closeAlert(){if(dlg.close)dlg.close();else dlg.removeAttribute("open");if(lastFocus&&lastFocus.focus)lastFocus.focus()}
function isAjaxEndpoint(u){return /\/ajax\//.test(u||"")||(cfg.signupMode==="ajax")}
if(dlg){$("alert-close").onclick=closeAlert;$("alert-cancel").onclick=closeAlert;dlg.addEventListener("click",function(e){if(e.target===dlg)closeAlert()});
if(live&&!isAjaxEndpoint(cfg.signupEndpoint)){af.action=cfg.signupEndpoint;af.method="post";af.target="_blank"}
if(live&&cfg.signupHoneypot){var h=document.createElement("input");h.type="text";h.name=cfg.signupHoneypot;h.tabIndex=-1;h.value="";h.setAttribute("aria-hidden","true");h.className="hp";h.autocomplete="off";af.appendChild(h)}
af.addEventListener("submit",function(e){var ok=true,em=$("a-email").value.trim();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){err("a-email-err","Enter a valid email address.");ok=false}else err("a-email-err");
var cats=[].map.call(af.querySelectorAll('input[name=cat_opt]:checked'),function(b){return b.value});
if(!$("a-camp").value.trim()&&!$("a-act").value.trim()&&!cats.length){err("a-what-err","Pick a category, or name a camp or activity.");ok=false}else err("a-what-err");
var ss=[].map.call(af.querySelectorAll('input[name=season_opt]:checked'),function(b){return b.value});if(!ss.length){err("a-season-err","Pick at least one season.");ok=false}else err("a-season-err");
if(!$("a-consent").checked){err("a-consent-err","Please agree so we can email you.");ok=false}else err("a-consent-err");
$("a-season").value=ss.join(", ");$("a-activities").value=cats.join(", ");$("a-tags").value=cfg.signupTags||"";if(!cfg.signupTags)$("a-tags").disabled=true;
if(!ok||!live){e.preventDefault();if(ok&&!live)$("a-msg").textContent="Alerts aren’t live yet, so nothing was saved.";return}
if(!isAjaxEndpoint(cfg.signupEndpoint)){$("a-msg").textContent="Opening our email provider in a new tab to confirm your sign-up…";return}
e.preventDefault();
var payload={EMAIL:em,CAMP:$("a-camp").value.trim(),ACTIVITY:$("a-act").value.trim(),ACTIVITIES:cats.join(", "),SEASON:ss.join(", "),AREA:$("a-area").value,_subject:"Camp alert signup — Atlanta Kids Camps",_template:"table",_captcha:"false",_replyto:em};
if(cfg.signupHoneypot)payload[cfg.signupHoneypot]="";
$("a-submit").disabled=true;$("a-msg").textContent="Saving your alert…";
function mailtoFallback(){var body=["EMAIL: "+em,"CAMP: "+payload.CAMP,"ACTIVITY: "+payload.ACTIVITY,"ACTIVITIES: "+payload.ACTIVITIES,"SEASON: "+payload.SEASON,"AREA: "+payload.AREA,"Consent: yes"].join("\n");var href="mailto:signup@atlantakidscamps.com?subject="+encodeURIComponent("Camp alert signup — Atlanta Kids Camps")+"&body="+encodeURIComponent(body);$("a-msg").textContent="Our web form relay is busy — opening your email app to finish. Or email signup@atlantakidscamps.com.";window.location.href=href;$("a-submit").disabled=false}
fetch(cfg.signupEndpoint,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)})
.then(function(r){return r.text().then(function(txt){var j=null;try{j=JSON.parse(txt)}catch(e){};return {ok:r.ok,j:j,txt:txt}})}).then(function(x){
  if(x.ok||(x.j&&(x.j.success==="true"||x.j.success===true))){try{if(window.mogulStats)window.mogulStats.track("signup")}catch(_e){}$("a-msg").textContent="You’re on the list. We’ll email you when matching sign-ups open. Use the link in any alert email to change preferences or unsubscribe.";setTimeout(closeAlert,1600)}
  else{mailtoFallback()}
}).catch(function(){mailtoFallback()})})}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest(".alert-open");if(!b)return;e.preventDefault();
var catKey=b.getAttribute("data-cat")||"";openAlert({camp:b.getAttribute("data-camp")||"",activity:b.getAttribute("data-activity")||"",seasons:(b.getAttribute("data-seasons")||"").split("|").filter(Boolean),area:b.getAttribute("data-area")||"",catKey:catKey,categories:catKey&&CAT_MAP[catKey]?[CAT_MAP[catKey]]:[]})});
var aff=$("aff-slot");if(aff&&cfg.activityHeroAffiliateUrl){aff.innerHTML='<p class="aff">Looking for more options? <a rel="sponsored noopener" target="_blank" href="'+esc(cfg.activityHeroAffiliateUrl)+'">Browse more Atlanta camps on ActivityHero</a> <span class="badge">affiliate</span></p>'}
var grid=$("grid");if(!grid||!window.CAMPS)return;
var q=$("q"),cat=$("cat"),age=$("age"),sort=$("sort"),low=$("low"),area=$("area");
var sec=document.getElementById("camps"),county=sec?(sec.getAttribute("data-county")||""):"";
var camps=county?window.CAMPS.filter(function(c){return c.county===county||c.county==="metro"}):window.CAMPS;
function tagsOf(c){return c.interests||[]}
function interestOk(c,v){if(!v||v==="all")return true;var t=tagsOf(c);if(v==="free")return c.price_low===0||t.indexOf("free")>-1;return t.indexOf(v)>-1}
function ageOk(c,a){if(a===null)return true;if(c.age_min==null||c.age_max==null)return false;return a>=c.age_min&&a<=c.age_max}
function areaOk(c,v){return !v||v==="all"||c.county===v||c.county==="metro"}
function ageVal(){return age.value===""?null:+age.value}
function setSel(el,v){if(!el||v==null)return;for(var i=0;i<el.options.length;i++){if(el.options[i].value===v){el.value=v;return}}}
try{var P=new URLSearchParams(location.search);if(P.get("q"))q.value=P.get("q");setSel(cat,P.get("interest"));setSel(age,P.get("age"));setSel(area,P.get("area"));if(P.get("free")==="1")low.checked=true;setSel(sort,P.get("sort"))}catch(e){}
function syncUrl(){try{var P=new URLSearchParams(location.search);["q","interest","age","area","free","sort"].forEach(function(k){P.delete(k)});var t=q.value.trim();if(t)P.set("q",t);if(cat.value!=="all")P.set("interest",cat.value);if(age.value!=="")P.set("age",age.value);if(area&&area.value!=="all")P.set("area",area.value);if(low.checked)P.set("free","1");if(sort.value!=="name")P.set("sort",sort.value);var s=P.toString();history.replaceState(null,"",location.pathname+(s?"?"+s:"")+location.hash)}catch(e){}}
function render(){var t=q.value.trim().toLowerCase(),a=ageVal(),av=area?area.value:"all";
var l=camps.filter(function(c){return interestOk(c,cat.value)&&areaOk(c,av)&&(!low.checked||c.free_low_cost||c.price_low===0)&&ageOk(c,a)&&(!t||[c.name,c.provider,c.area,c.category,c.ages,c.price_week,c.dates,tagsOf(c).map(function(k){return LABELS[k]||k}).join(" ")].join(" ").toLowerCase().indexOf(t)>-1)});
l.sort(function(x,y){if(sort.value==="price"){var p=x.price_low==null?1e9:x.price_low,r=y.price_low==null?1e9:y.price_low;if(p!==r)return p-r}return x.name.localeCompare(y.name)});
$("count").textContent=l.length+" of "+camps.length+" programs";
grid.innerHTML=l.length?l.map(function(c){var tg=tagsOf(c).filter(function(k){return k!=="free"&&k!=="unusual"}).slice(0,4);return '<article class="card"><div class="badges"><span class="badge price">'+esc(c.price_low==null?"Price: see site":c.price_low===0?"Free":"From $"+c.price_low)+'</span><span class="badge">Ages '+esc(c.ages)+'</span>'+(c.free_low_cost?'<span class="badge ok">Free/low-cost/aid</span>':'')+(tagsOf(c).indexOf("unusual")>-1?'<span class="badge odd">Unusual</span>':'')+'</div><h3>'+esc(c.name)+'</h3><p class="meta">'+esc(c.category)+' · '+esc(c.area)+(COUNTY[c.county]&&!county?' · <strong>'+esc(COUNTY[c.county])+'</strong>':'')+'</p>'+(tg.length?'<p class="tags">'+tg.map(function(k){return '<span class="tag">'+esc(LABELS[k]||k)+'</span>'}).join("")+'</p>':'')+(c.status_flag?'<p class="flag">'+esc(c.status_flag)+'</p>':'')+'<dl><dt>Price</dt><dd>'+esc(c.price_week)+(c.price_note?' <span class="small">'+esc(c.price_note)+'</span>':'')+'</dd><dt>Dates</dt><dd>'+esc(c.dates)+'</dd><dt>Sign-up</dt><dd>'+esc(c.registration)+'</dd></dl><p class="src"><a href="'+esc(c.source_url)+'" target="_blank" rel="noopener">Provider page ↗</a> <span class="small">checked '+esc(c.last_checked)+'</span></p><button type="button" class="btn ghost sm alert-open" data-camp="'+esc(c.name)+'" data-activity="'+esc(c.category)+'" data-cat="'+esc(tagsOf(c)[0]||"")+'" data-seasons="'+esc(seasonGuess(c).join("|"))+'" data-area="'+esc(COUNTY[c.county]&&c.county!=="metro"?COUNTY[c.county]:"")+'">🔔 Email me when sign-ups open</button></article>'}).join(""):'<p class="empty">No programs match. <button type="button" class="btn ghost" id="reset2">Clear filters</button></p>';
var r2=$("reset2");if(r2)r2.onclick=reset;
var aa=$("act-alert");if(aa){if(cat.value!=="all"&&LABELS[cat.value]){var lab=LABELS[cat.value];aa.hidden=false;aa.innerHTML='<p><strong>Want '+esc(lab)+' alerts?</strong> Get one email when '+esc(lab.toLowerCase())+' sign-ups open'+(l.length?'':' (we’ll add listings as camps announce)')+'.</p><button type="button" class="btn sm alert-open" data-activity="'+esc(lab)+'" data-cat="'+esc(cat.value)+'" data-area="'+esc(COUNTY[county]||"")+'">🔔 Email me when '+esc(lab)+' sign-ups open</button>'}else{aa.hidden=true;aa.innerHTML=""}}
document.querySelectorAll(".chip").forEach(function(ch){ch.setAttribute("aria-pressed",ch.getAttribute("data-cat")===cat.value?"true":"false")})}
function update(){render();syncUrl()}
function reset(){q.value="";cat.value="all";age.value="";if(area)area.value="all";sort.value="name";low.checked=false;update()}
q.addEventListener("input",update);[cat,age,sort,low,area].forEach(function(e){if(e)e.addEventListener("change",update)});$("reset").onclick=reset;document.querySelectorAll(".chip").forEach(function(ch){ch.onclick=function(){cat.value=ch.getAttribute("data-cat")===cat.value?"all":ch.getAttribute("data-cat");update()}});
document.querySelectorAll("a[data-interest]").forEach(function(a){a.addEventListener("click",function(ev){ev.preventDefault();cat.value=a.getAttribute("data-interest");update();if(sec&&sec.scrollIntoView)sec.scrollIntoView({behavior:"smooth"})})});
render()})();
