/* Summer Planner 2027 — runs entirely in the browser. Plan is kept in localStorage (key akc_planner_v1);
   nothing is sent anywhere unless the parent submits the separate alert sign-up form. */
(function(){"use strict";
var C=(window.CAMPS||[]).filter(function(c){return c.summer});
var KEY="akc_planner_v1";
var INT=[["outdoor","Outdoor & adventure"],["nature","Nature"],["farm","Farm & animals"],["horse","Horses"],["survival","Survival skills"],["tennis","Tennis"],["swim","Swim"],["sports","Sports"],["gym","Gymnastics"],["art","Art"],["theatre","Theatre & film"],["dance","Dance"],["stem","STEM / LEGO"],["unusual","Unusual & offbeat"],["day","Classic day camp"]];
var CAT={stem:"STEM / LEGO / coding",art:"Arts and theatre",theatre:"Arts and theatre",dance:"Arts and theatre",sports:"Sports and outdoors",tennis:"Sports and outdoors",horse:"Sports and outdoors",swim:"Sports and outdoors",gym:"Sports and outdoors",nature:"Sports and outdoors",farm:"Sports and outdoors",survival:"Sports and outdoors",outdoor:"Sports and outdoors",unusual:"Sports and outdoors",day:"Day camps"};
var COUNTY={cobb:"Cobb","north-fulton":"North Fulton",atlanta:"Atlanta / DeKalb",gwinnett:"Gwinnett",metro:"Metro-wide","day-trip":"Outside metro (day trip)"};
var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]})}
function D(s){return new Date(s+"T00:00:00Z")}
function iso(d){return d.toISOString().slice(0,10)}
function add(d,n){return new Date(d.getTime()+n*864e5)}
function fmt(d){return MON[d.getUTCMonth()]+" "+d.getUTCDate()}
function range(a,b){return a.getUTCMonth()===b.getUTCMonth()?fmt(a)+"–"+b.getUTCDate():fmt(a)+"–"+fmt(b)}
function t12(t){if(!t)return"";var h=+t.slice(0,2),m=t.slice(3);return (h%12||12)+(m!=="00"?":"+m:"")+(h<12?"am":"pm")}
var WEEKS=[];for(var w=D("2027-05-31");w<=D("2027-08-09");w=add(w,7))WEEKS.push({mon:w,fri:add(w,4)});
var DEF={v:1,needs:{age:"",area:"all",drop:"",pick:"",overnight:false,far:false,interests:[],max:"",free:false},covered:[]};
var st=JSON.parse(JSON.stringify(DEF));
function b64e(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function b64d(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return JSON.parse(decodeURIComponent(escape(atob(s))))}
function clean(o){var n=JSON.parse(JSON.stringify(DEF));if(!o||typeof o!=="object")return n;var k;for(k in n.needs)if(o.needs&&o.needs[k]!=null)n.needs[k]=o.needs[k];
  n.needs.interests=(n.needs.interests||[]).filter(function(x){return typeof x==="string"}).slice(0,20);
  n.covered=(o.covered||[]).filter(function(c){return c&&/^\d{4}-\d\d-\d\d$/.test(c.start)&&/^\d{4}-\d\d-\d\d$/.test(c.end)}).slice(0,40).map(function(c,i){return{id:String(c.id||i+"-"+Date.now()),label:String(c.label||"Covered").slice(0,60),start:c.start,end:c.end<c.start?c.start:c.end}});return n}
function save(){try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}}
try{if(/^#plan=/.test(location.hash)){st=clean(b64d(location.hash.slice(6)));save();history.replaceState(null,"",location.pathname+location.search)}else{var raw=localStorage.getItem(KEY);if(raw)st=clean(JSON.parse(raw))}}catch(e){st=clean(null)}

/* ---- form wiring ---- */
var ageSel=$("p-age");for(var a=3;a<=17;a++){var o=document.createElement("option");o.value=String(a);o.textContent=a;ageSel.appendChild(o)}
var areaSel=$("p-area");var dt=areaSel.querySelector('option[value="day-trip"]');if(dt)dt.remove();
var farLab=document.createElement("label");farLab.className="pl-chk";farLab.innerHTML='<input type="checkbox" id="p-far"> Include day-trip camps outside metro Atlanta';$("p-overnight").parentNode.insertAdjacentElement("afterend",farLab);
$("p-interests").innerHTML=INT.map(function(x){return '<label><input type="checkbox" value="'+x[0]+'"> '+esc(x[1])+'</label>'}).join("");
function toForm(){var n=st.needs;ageSel.value=n.age;areaSel.value=n.area||"all";$("p-drop").value=n.drop;$("p-pick").value=n.pick;$("p-overnight").checked=!!n.overnight;$("p-far").checked=!!n.far;$("p-max").value=n.max;$("p-free").checked=!!n.free;
  [].forEach.call($("p-interests").querySelectorAll("input"),function(b){b.checked=n.interests.indexOf(b.value)>-1})}
function fromForm(){var n=st.needs;n.age=ageSel.value;n.area=areaSel.value;n.drop=$("p-drop").value;n.pick=$("p-pick").value;n.overnight=$("p-overnight").checked;n.far=$("p-far").checked;n.max=$("p-max").value;n.free=$("p-free").checked;
  n.interests=[].filter.call($("p-interests").querySelectorAll("input"),function(b){return b.checked}).map(function(b){return b.value});save();render()}
$("needs").addEventListener("change",fromForm);$("needs").addEventListener("input",function(e){if(e.target.id==="p-max")fromForm()});
$("covform").addEventListener("submit",function(e){e.preventDefault();var s=$("c-start").value,en=$("c-end").value||s,l=$("c-label").value.trim()||"Covered";
  if(!s){$("c-err").textContent="Pick a start date.";return}if(en<s){$("c-err").textContent="End date is before the start date.";return}$("c-err").textContent="";
  st.covered.push({id:Date.now()+"",label:l,start:s,end:en});$("c-label").value="";$("c-start").value="";$("c-end").value="";save();render()});

/* ---- coverage + matching ---- */
function wkDays(wk){var r=[];for(var i=0;i<5;i++)r.push(iso(add(wk.mon,i)));return r}
function coverage(wk){var days=wkDays(wk),labs=[],n=0;days.forEach(function(d){var hit=st.covered.filter(function(c){return c.start<=d&&c.end>=d});if(hit.length)n++;hit.forEach(function(h){if(labs.indexOf(h.label)<0)labs.push(h.label)})});return{n:n,labels:labs}}
function overlaps(s,wk){return s.start<=iso(wk.fri)&&s.end>=iso(wk.mon)}
function ageTxt(c){return c.age_min!=null&&c.age_max!=null?"ages "+c.age_min+"–"+c.age_max:"ages "+c.ages}
function evaluate(c,wk){var n=st.needs,why=[],unk=[];
  if(c.overnight===true&&!n.overnight)return null;
  if(c.county==="day-trip"&&!n.far)return null;
  if(n.area&&n.area!=="all"&&c.county!=="day-trip"&&c.county!==n.area&&c.county!=="metro")return null;
  if(n.interests.length&&!(c.interests||[]).some(function(i){return n.interests.indexOf(i)>-1}))return null;
  if(n.free&&!(c.free_low_cost||c.price_low===0))return null;
  var sess=null;
  if(c.sessions&&c.sessions.length){sess=c.sessions.filter(function(s){return overlaps(s,wk)})[0];if(!sess)return null}else unk.push("2027 dates not announced");
  if(n.age!==""){var ag=+n.age;if(c.age_min!=null&&c.age_max!=null){if(ag<c.age_min||ag>c.age_max)return null;why.push(ageTxt(c))}else unk.push("ages not listed as a range ("+c.ages+")")}else why.push(ageTxt(c));
  if(c.overnight===true)why.push("overnight camp");
  else{var e1=c.before_care||c.hours_start,l1=c.after_care||c.hours_end;
    var hrs=c.hours_start?t12(c.hours_start)+"–"+t12(c.hours_end)+((c.before_care||c.after_care)?" (care "+t12(e1)+"–"+t12(l1)+")":""):"";
    if(n.drop||n.pick){if(!c.hours_start)unk.push("hours not published");
      else{var fits=(!n.drop||n.drop>=e1)&&(!n.pick||n.pick<=l1);
        if(c.hours_year&&c.hours_year<2027){unk.push("2027 hours not announced ("+c.hours_year+": "+hrs+(fits?"":", wouldn’t fit")+")");}
        else{if(!fits){if(!(c.before_care&&c.after_care)&&/extended care|early care|after ?care|before ?care/i.test((c.dates||"")+" "+(c.price_note||"")))unk.push("hours "+hrs+"; extended care offered but times not published");else return null}else why.push(hrs)}}}
    else if(hrs)why.push(hrs+(c.hours_year&&c.hours_year<2027?" in "+c.hours_year:""))}
  why.push(COUNTY[c.county]||c.area);
  if(sess)why.push("2027 session "+range(D(sess.start),D(sess.end)));
  if(n.max!==""){if(c.price_low==null)unk.push("price not listed");else if(c.price_low>+n.max)return null;else why.push("from $"+c.price_low)}
  return{c:c,why:why,unk:unk,ok:!unk.length}}
function li(r){return '<li><a href="'+esc(r.c.source_url)+'" target="_blank" rel="noopener">'+esc(r.c.name)+'</a><span class="why'+(r.ok?"":" maybe")+'">'+(r.ok?"matches: ":"possible: ")+esc(r.why.join(", "))+(r.unk.length?" · "+esc(r.unk.join("; ")):"")+'</span></li>'}
var lastGaps=[];
function render(){var html="",gaps=0,covd=0,withMatch=0;lastGaps=[];
  WEEKS.forEach(function(wk,i){var cv=coverage(wk),cls=cv.n===5?"cov":cv.n>0?"part gap":"gap",lab=range(wk.mon,wk.fri);
    if(cv.n===5)covd++;else{gaps++;lastGaps.push({wk:wk,lab:lab})}
    var exact=st.covered.filter(function(c){return c.start===iso(wk.mon)&&c.end===iso(wk.fri)});
    html+='<article class="week '+cls+'" data-week="'+iso(wk.mon)+'"><div class="wk-head"><h3>Week of '+esc(lab)+(iso(wk.mon)==="2027-07-05"?' <span class="small">(July 5 holiday)</span>':'')+'</h3><span class="wk-status">'+(cv.n===5?"Covered":cv.n?"Partly covered ("+cv.n+"/5 days)":"Gap week")+'</span></div>';
    if(cv.labels.length)html+='<p class="wk-cov">'+esc(cv.labels.join(" · "))+'</p>';
    html+='<div class="wk-btns">'+(exact.length?'<button type="button" class="btn ghost xs wk-un" data-i="'+i+'">Unmark</button>':cv.n<5?'<button type="button" class="btn ghost xs wk-mark" data-i="'+i+'">Mark covered</button>':'')+'</div>';
    if(cv.n<5){var res=C.map(function(c){return evaluate(c,wk)}).filter(Boolean),ok=res.filter(function(r){return r.ok}),mb=res.filter(function(r){return !r.ok});
      ok.sort(function(a,b){return a.c.name.localeCompare(b.c.name)});mb.sort(function(a,b){return a.c.name.localeCompare(b.c.name)});
      if(ok.length)withMatch++;lastGaps[lastGaps.length-1].top=ok.slice(0,5).map(function(r){return r.c.name});
      html+=ok.length?'<p class="small" style="margin:.5em 0 0"><strong>'+ok.length+' camp'+(ok.length>1?"s":"")+' with published 2027 dates that fit</strong></p><ul class="matches">'+ok.map(li).join("")+'</ul>':'<p class="small" style="margin:.5em 0 0">No camp has published 2027 dates for this week that fit yet.</p>';
      if(mb.length)html+='<details class="maybe-group"><summary>'+mb.length+' possible — dates/hours not announced yet</summary><ul class="matches">'+mb.map(li).join("")+'</ul></details>'}
    html+='</article>'});
  $("weeks").innerHTML=html;
  $("summary").textContent=covd+" of "+WEEKS.length+" weeks covered · "+gaps+" gap week"+(gaps===1?"":"s")+(gaps?" · "+withMatch+" with at least one matching camp":"");
  $("covlist").innerHTML=st.covered.slice().sort(function(a,b){return a.start<b.start?-1:1}).map(function(c){return '<li><span><strong>'+esc(c.label)+'</strong> · '+esc(range(D(c.start),D(c.end)))+'</span><button type="button" class="btn ghost xs cov-del" data-id="'+esc(c.id)+'" aria-label="Remove '+esc(c.label)+'">Remove</button></li>'}).join("")}
document.addEventListener("click",function(e){var t=e.target;if(!t.closest)return;
  var m=t.closest(".wk-mark");if(m){var wk=WEEKS[+m.getAttribute("data-i")];st.covered.push({id:Date.now()+"",label:$("c-label").value.trim()||"Covered",start:iso(wk.mon),end:iso(wk.fri)});save();render();return}
  var u=t.closest(".wk-un");if(u){var w2=WEEKS[+u.getAttribute("data-i")];st.covered=st.covered.filter(function(c){return !(c.start===iso(w2.mon)&&c.end===iso(w2.fri))});save();render();return}
  var d=t.closest(".cov-del");if(d){var id=d.getAttribute("data-id");st.covered=st.covered.filter(function(c){return c.id!==id});save();render()}});
$("share").onclick=function(){var url=location.origin+location.pathname+"#plan="+b64e(st);var msg=$("share-msg");
  function shown(){msg.innerHTML='Share link: <input type="text" readonly value="'+esc(url)+'" style="width:100%;font-size:14px" onfocus="this.select()">'}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){msg.textContent="Link copied. Anyone with it sees this plan (it’s stored in the link itself, not on our server)."},shown);else shown()};
function icsEsc(s){return String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n")}
function icsDate(s){return s.replace(/-/g,"")}
$("ics").onclick=function(){var now=new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z",L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Atlanta Kids Camps//Summer Planner//EN","CALSCALE:GREGORIAN","X-WR-CALNAME:Summer 2027 plan"];
  st.covered.forEach(function(c,i){L.push("BEGIN:VEVENT","UID:cov-"+i+"-"+c.start+"@atlantakidscamps.com","DTSTAMP:"+now,"DTSTART;VALUE=DATE:"+icsDate(c.start),"DTEND;VALUE=DATE:"+icsDate(iso(add(D(c.end),1))),"SUMMARY:"+icsEsc(c.label),"END:VEVENT")});
  lastGaps.forEach(function(g){L.push("BEGIN:VEVENT","UID:gap-"+iso(g.wk.mon)+"@atlantakidscamps.com","DTSTAMP:"+now,"DTSTART;VALUE=DATE:"+icsDate(iso(g.wk.mon)),"DTEND;VALUE=DATE:"+icsDate(iso(add(g.wk.fri,1))),"SUMMARY:"+icsEsc("Gap week: need camp"),"DESCRIPTION:"+icsEsc((g.top&&g.top.length?"Camps with published 2027 dates that fit: "+g.top.join("; ")+". ":"")+"Confirm with each camp. https://atlantakidscamps.com/planner/"),"END:VEVENT")});
  L.push("END:VCALENDAR");var blob=new Blob([L.join("\r\n")+"\r\n"],{type:"text/calendar"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="summer-2027-plan.ics";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);$("share-msg").textContent="Calendar file downloaded (covered dates + gap weeks)."};
$("clear").onclick=function(){if(!confirm("Clear your plan from this browser?"))return;st=clean(null);save();toForm();render()};
$("gap-alert").onclick=function(){var cats=[];st.needs.interests.forEach(function(k){if(CAT[k]&&cats.indexOf(CAT[k])<0)cats.push(CAT[k])});if(!cats.length)cats=["Day camps"];
  var g=lastGaps.map(function(x){return x.lab}).slice(0,6).join(", ");
  if(window.openCampAlert)window.openCampAlert({activity:"summer 2027 camp"+(g?" (gap weeks: "+g+")":""),categories:cats,seasons:["Summer"],area:COUNTY[st.needs.area]&&st.needs.area!=="metro"?COUNTY[st.needs.area]:""});
  else location.href="../#alerts"};
toForm();render();
})();
