// ── DATA ──
const APP_VERSION = "v8.5.9f";

// ── SUPABASE CONFIG ──
const SB_URL = "https://merarvfkbevvdbtghhfs.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcmFydmZrYmV2dmRidGdoaGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzkzODYsImV4cCI6MjA5MzQxNTM4Nn0.owEXkpm43DFHMyEZ3bClu8l3gM9CVXEX3aBQ6Yg1sIY";
const SB_HEADERS = {"Content-Type":"application/json","apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY};

function dbTrace(msg, type="info"){
  try {
    if(localStorage.getItem("hpfleet_debug")==="1") dbg(msg,type);
  } catch(_){}
}
function dbResultSummary(data){
  if(Array.isArray(data)) return data.length+" row"+(data.length===1?"":"s");
  if(data && typeof data==="object") return "object";
  return "ok";
}

async function sbGet(table, params=""){
  const started=performance.now();
  const label="GET "+table+(params?"?"+params:"");
  dbTrace("DB → "+label,"info");
  const r=await fetch(SB_URL+"/rest/v1/"+table+"?"+params,{headers:{...SB_HEADERS,"Prefer":"return=representation"}});
  const elapsed=Math.round(performance.now()-started);
  if(!r.ok){
    const err=await r.text();
    dbTrace("DB ✕ "+label+" — "+r.status+" in "+elapsed+"ms — "+err,"err");
    throw new Error("DB read failed: "+err);
  }
  const data=await r.json();
  dbTrace("DB ✓ "+label+" — "+r.status+" in "+elapsed+"ms — "+dbResultSummary(data),"ok");
  return data;
}
async function sbPost(table, body){
  const started=performance.now();
  const count=Array.isArray(body)?body.length:1;
  const label="POST "+table+" ("+count+" row"+(count===1?"":"s")+")";
  dbTrace("DB → "+label,"info");
  const r=await fetch(SB_URL+"/rest/v1/"+table,{method:"POST",headers:{...SB_HEADERS,"Prefer":"return=representation"},body:JSON.stringify(body)});
  const elapsed=Math.round(performance.now()-started);
  if(!r.ok){
    const err=await r.text();
    dbTrace("DB ✕ "+label+" — "+r.status+" in "+elapsed+"ms — "+err,"err");
    throw new Error("DB write failed: "+err);
  }
  const data=await r.json();
  dbTrace("DB ✓ "+label+" — "+r.status+" in "+elapsed+"ms — "+dbResultSummary(data),"ok");
  return data;
}
async function sbPatch(table, filter, body){
  const started=performance.now();
  const label="PATCH "+table+"?"+filter;
  dbTrace("DB → "+label,"info");
  const r=await fetch(SB_URL+"/rest/v1/"+table+"?"+filter,{method:"PATCH",headers:{...SB_HEADERS,"Prefer":"return=representation"},body:JSON.stringify(body)});
  const elapsed=Math.round(performance.now()-started);
  if(!r.ok){
    const err=await r.text();
    dbTrace("DB ✕ "+label+" — "+r.status+" in "+elapsed+"ms — "+err,"err");
    throw new Error("DB update failed: "+err);
  }
  const data=await r.json();
  dbTrace("DB ✓ "+label+" — "+r.status+" in "+elapsed+"ms — "+dbResultSummary(data),"ok");
  return data;
}
async function sbDelete(table, filter){
  const started=performance.now();
  const label="DELETE "+table+"?"+filter;
  dbTrace("DB → "+label,"info");
  const r=await fetch(SB_URL+"/rest/v1/"+table+"?"+filter,{method:"DELETE",headers:SB_HEADERS});
  const elapsed=Math.round(performance.now()-started);
  if(!r.ok){
    const err=await r.text();
    dbTrace("DB ✕ "+label+" — "+r.status+" in "+elapsed+"ms — "+err,"err");
    throw new Error("DB delete failed: "+err);
  }
  dbTrace("DB ✓ "+label+" — "+r.status+" in "+elapsed+"ms","ok");
  return true;
}
// ── SUPABASE STORAGE — IMAGE UPLOAD ──
async function uploadImageToStorage(blob, filename){
  try {
    const path="batches/"+( currentBatchId||"unknown")+"/"+filename;
    const r=await fetch(SB_URL+"/storage/v1/object/bitacoras/"+path,{
      method:"POST",
      headers:{
        "apikey":SB_KEY,
        "Authorization":"Bearer "+SB_KEY,
        "Content-Type":"image/jpeg",
        "x-upsert":"true"
      },
      body:blob
    });
    if(!r.ok){const e=await r.text();dbg("Storage upload failed: "+e,"err");return null;}
    const publicUrl=SB_URL+"/storage/v1/object/public/bitacoras/"+path;
    dbg("Image uploaded: "+filename,"ok");
    return publicUrl;
  } catch(err){dbg("Storage upload error: "+err.message,"err");return null;}
}

// ── AIRCRAFT PHOTO UPLOAD ──
async function uploadAircraftPhoto(blob, registration){
  try {
    const filename="aircraft_"+registration.replace(/[^a-zA-Z0-9\-]/g,"_")+".jpg";
    const r=await fetch(SB_URL+"/storage/v1/object/aircraft_photos/"+filename,{
      method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"image/jpeg","x-upsert":"true"},
      body:blob
    });
    if(!r.ok){const e=await r.text();dbg("Aircraft photo upload failed: "+e,"err");return null;}
    const publicUrl=SB_URL+"/storage/v1/object/public/aircraft_photos/"+filename;
    dbg("Aircraft photo uploaded: "+filename,"ok");
    return publicUrl;
  } catch(err){dbg("Aircraft photo upload error: "+err.message,"err");return null;}
}

// ── IMAGE COMPRESSION ──
async function compressImage(blob, maxPx=800, quality=0.7){
  return new Promise((resolve)=>{
    const img=new Image();
    const url=URL.createObjectURL(blob);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let w=img.width, h=img.height;
      if(w>maxPx||h>maxPx){
        if(w>h){h=Math.round(h*maxPx/w);w=maxPx;}
        else{w=Math.round(w*maxPx/h);h=maxPx;}
      }
      const canvas=document.createElement("canvas");
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext("2d");
      ctx.drawImage(img,0,0,w,h);
      canvas.toBlob(resolve,"image/jpeg",quality);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve(blob);};
    img.src=url;
  });
}

// ── PDF.JS — RENDER PAGE TO IMAGE BLOB WITH ROTATION FIX ──
async function pdfPageToBlob(pdfDoc, pageNum){
  const page=await pdfDoc.getPage(pageNum);
  const rotation=page.rotate||0; // 0, 90, 180, 270
  const viewport=page.getViewport({scale:1.5, rotation:0}); // render without rotation first
  const canvas=document.createElement("canvas");
  // For 90/270 degree rotations, swap width/height
  const swap=rotation===90||rotation===270;
  canvas.width=swap?viewport.height:viewport.width;
  canvas.height=swap?viewport.width:viewport.height;
  const ctx=canvas.getContext("2d");
  // Apply rotation correction
  if(rotation!==0){
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.rotate(rotation*Math.PI/180);
    ctx.translate(-viewport.width/2,-viewport.height/2);
  }
  await page.render({canvasContext:ctx,viewport}).promise;
  return new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.85));
}

// ── EXIF ROTATION FIX ──
async function fixImageRotation(file){
  return new Promise((resolve)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      const view=new DataView(e.target.result);
      if(view.getUint16(0,false)!==0xFFD8){resolve(file);return;}
      let offset=2;
      while(offset<view.byteLength){
        const marker=view.getUint16(offset,false); offset+=2;
        if(marker===0xFFE1){
          if(view.getUint32(offset+2,false)!==0x45786966){resolve(file);return;}
          const little=view.getUint16(offset+8,false)===0x4949;
          const tags=view.getUint16(offset+14,little);
          for(let i=0;i<tags;i++){
            if(view.getUint16(offset+16+i*12,little)===0x0112){
              const orient=view.getUint16(offset+16+i*12+8,little);
              if(orient===1){resolve(file);return;}
              // Redraw with correct orientation
              const img=new Image();
              const url=URL.createObjectURL(file);
              img.onload=()=>{
                URL.revokeObjectURL(url);
                const canvas=document.createElement("canvas");
                const ctx=canvas.getContext("2d");
                const swap=orient>=5&&orient<=8;
                canvas.width=swap?img.height:img.width;
                canvas.height=swap?img.width:img.height;
                const t={1:[]};
                const transforms={
                  3:[Math.PI,canvas.width,canvas.height],
                  6:[Math.PI/2,canvas.width,0],
                  8:[-Math.PI/2,0,canvas.height]
                };
                const tr=transforms[orient]||[];
                if(tr.length){ctx.translate(tr[1],tr[2]);ctx.rotate(tr[0]);}
                ctx.drawImage(img,0,0);
                canvas.toBlob(b=>resolve(new File([b],file.name,{type:"image/jpeg"})),"image/jpeg",0.92);
              };
              img.src=url; return;
            }
          }
          resolve(file); return;
        }
        offset+=view.getUint16(offset,false);
      }
      resolve(file);
    };
    reader.readAsArrayBuffer(file.slice(0,65536));
  });
}
let COMPANIES = [
  {id:"c001",name:"Flightmax Advanced Training",code:"FM",multiplier:1.15,status:"active",notes:"Primary flight school client",
    billingRules:[{id:"br001",name:"Fuel Surcharge",amount:10.00,unit:"per Flight Hour",active:true},{id:"br002",name:"Landing Fee",amount:8.00,unit:"per Flight",active:false}]},
  {id:"c002",name:"MAG Flight Training",code:"MAG",multiplier:1.275,status:"active",notes:"Secondary operator",
    billingRules:[{id:"br003",name:"Fuel Surcharge",amount:10.00,unit:"per Flight Hour",active:true}]}
];
let AIRCRAFT = [
  {id:"ac001",matricula:"HP-1861",makeModel:"Piper PA-28",operador:"FM",
   multiplicador:1.275,tipo:"Single Engine",asientos:2,
   motorId:"Lycoming O-320",consumoGalHr:8.5,diffThreshold:0.2,
   owner:"Unidad Fragata, S.A.",ownerAddress:"Panama City, Panama",
   rates:[
     {operador:"FM",  multiplicador:1.275, tarifaHr:0},
     {operador:"MAG", multiplicador:1.275, tarifaHr:0}
   ]},
  {id:"ac002",matricula:"HP-1862FX",makeModel:"Piper PA-28",operador:"FM",
   multiplicador:1.15,tipo:"Single Engine",asientos:2,
   motorId:"Lycoming O-320",consumoGalHr:8.5,diffThreshold:0.2,
   owner:"GRANSOLUX S.A.",ownerAddress:"Panama City, Panama",
   rates:[
     {operador:"FM",  multiplicador:1.15,  tarifaHr:165},
     {operador:"MAG", multiplicador:1.275, tarifaHr:155}
   ]}
];
let USERS = [
  {id:"u001",name:"Marcelo C.",email:"marcelo@hp-fleet.com",pwd:"admin1234",role:"ADMIN",companies:["FM","MAG"],phone:"+50760000001",status:"active",created:"2025-01-15",lastLogin:null},
  {id:"u002",name:"Asistente FM",email:"asistente@flymax.com",pwd:"fm2025",role:"OPERATOR",companies:["FM"],phone:"+50760000002",status:"active",created:"2025-02-01",lastLogin:null},
  {id:"u003",name:"Revisor Fact.",email:"revisor@hp-fleet.com",pwd:"rev2025",role:"REVIEWER",companies:["FM","MAG"],phone:"+50760000003",status:"active",created:"2025-02-10",lastLogin:null},
  {id:"u004",name:"Vista MAG",email:"vista@mag.com",pwd:"mag2025",role:"READONLY",companies:["MAG"],phone:"",status:"inactive",created:"2025-03-01",lastLogin:null}
];

// ── ROLES ──
const ROLES = {
  ADMIN:    {icon:"🛡️",color:"var(--violet)",bannerClass:"rb-admin",chipClass:"rc-admin",avatarBg:"rgba(192,132,252,.15)",
    en:{label:"Administrator",desc:"Full system access. Manage users, companies, flight logs, and billing.",perms:["Load PDFs","Review & Edit","Submit & Approve","Manage Users","Manage Companies","Export"]},
    es:{label:"Administrador",desc:"Acceso total. Gestiona usuarios, compañías, flight logs y facturación.",perms:["Cargar PDFs","Revisar y Editar","Enviar y Aprobar","Gestionar Usuarios","Gestionar Compañías","Exportar"]}},
  OPERATOR: {icon:"✈️",color:"var(--cyan)",bannerClass:"rb-operator",chipClass:"rc-operator",avatarBg:"rgba(65,209,255,.15)",
    en:{label:"Operator",desc:"Load flight log files for your assigned companies, review extracted entries, correct inconsistencies, and submit for approval.",perms:["Load PDFs","Review Entries","Edit Entries","Submit for Review","Export"]},
    es:{label:"Operador",desc:"Carga archivos de bitácoras para tus compañías, revisa entradas extraídas, corrige inconsistencias y envía para aprobación.",perms:["Cargar PDFs","Revisar Entradas","Editar Entradas","Enviar a Revisión","Exportar"]}},
  REVIEWER: {icon:"✅",color:"var(--green)",bannerClass:"rb-reviewer",chipClass:"rc-reviewer",avatarBg:"rgba(61,220,132,.15)",
    en:{label:"Reviewer / Approver",desc:"Review submitted flight log batches for your assigned companies and approve them for invoicing.",perms:["View Entries","Approve for Invoicing","Request Changes","Export"]},
    es:{label:"Revisor / Aprobador",desc:"Revisa los lotes enviados de tus compañías y apruébalos para facturación.",perms:["Ver Entradas","Aprobar Facturación","Solicitar Cambios","Exportar"]}},
  READONLY: {icon:"👁️",color:"var(--dim2)",bannerClass:"rb-readonly",chipClass:"rc-readonly",avatarBg:"rgba(136,153,187,.15)",
    en:{label:"Read Only",desc:"View-only access for your assigned companies.",perms:["View Entries"]},
    es:{label:"Solo Lectura",desc:"Acceso de solo lectura para tus compañías asignadas.",perms:["Ver Entradas"]}}
};

// ── I18N ──
let I18N = {en:{}, es:{}};
const I18N_FILES = {
  en: "./assets/i18n/en.json?v=8.5.9f",
  es: "./assets/i18n/es.json?v=8.5.9f"
};

async function loadI18nDictionaries(){
  const loaded = await Promise.all(Object.entries(I18N_FILES).map(async ([code,url])=>{
    const res = await fetch(url,{cache:"no-store"});
    if(!res.ok) throw new Error("Unable to load language dictionary: "+code);
    return [code, await res.json()];
  }));
  I18N = Object.fromEntries(loaded);
}

// ── STATE ──
let lang="en", currentUser=null, auditLog=[], activeTab=null;

// ── PREFERENCE LAYER (v8.5.1) ──────────────────────────────────────────────
// Single source of truth for all user UI preferences.
// Flow: DB → localStorage → UI  (login)
//       UI → localStorage → DB  (usage, debounced)

const PREF_DEFAULTS = {
  sticky_headers:  true,
  sticky_tabs:     true,
  role_banner:     true,
  viewas_visible:  true,
  debug_mode:      false,
  tooltips_enabled:true,
  tooltip_text:    "#dce6f5",
  tooltip_bg:      "#1a2030",
  tooltip_border:  "#41d1ff",
  tooltip_offset_px: 8,
  tooltip_max_width_px: 280,
  tooltip_text_size_px: 11,
  toast_duration_sec: 5,
  sidepanel_width: 420,
  sidepanel_image_height: null,
  language:       "en",
  active_tab:      null   // resolved per-role at boot if null
};

// Maps preference key → localStorage key used in v8.5.0
const LS_MAP = {
  sticky_headers:  "hpfleet_stickyheaders",
  sticky_tabs:     "hpfleet_stickytabs",
  role_banner:     "hpfleet_rolebanner",
  viewas_visible:  "hpfleet_viewas_visible",
  debug_mode:      "hpfleet_debug",
  tooltips_enabled:"hpfleet_tooltips_enabled",
  tooltip_text:    "hpfleet_tooltip_text",
  tooltip_bg:      "hpfleet_tooltip_bg",
  tooltip_border:  "hpfleet_tooltip_border",
  tooltip_offset_px: "hpfleet_tooltip_offset_px",
  tooltip_max_width_px: "hpfleet_tooltip_max_width_px",
  tooltip_text_size_px: "hpfleet_tooltip_text_size_px",
  toast_duration_sec: "hpfleet_toast_duration_sec",
  sidepanel_width: "hpfleet_sp_width",
  sidepanel_image_height: "hpfleet_sp_img_h",
  language:       "hpfleet_lang",
  active_tab:      null   // no prior localStorage key for active tab
};

let _userPrefs = {};         // in-memory cache
let _prefSaveTimer = null;   // debounce handle
let _loginLanguageOverride = null;

// Read users.preferences from DB into cache; returns true if prefs existed
async function loadUserPreferences(){
  try {
    const rows = await sbGet("users","id=eq."+currentUser.id+"&select=preferences");
    const dbPrefs = (rows && rows[0] && rows[0].preferences) ? rows[0].preferences : null;
    const isEmpty = !dbPrefs || Object.keys(dbPrefs).length === 0;
    if(isEmpty){
      await migrateLocalPreferencesIfNeeded();
    } else {
      // DB is source of truth — overwrite localStorage
      _userPrefs = Object.assign({}, PREF_DEFAULTS, dbPrefs);
      Object.keys(LS_MAP).forEach(key=>{
        const lsKey = LS_MAP[key];
        if(!lsKey) return;
        const val = _userPrefs[key];
        if(typeof val === "boolean"){
          localStorage.setItem(lsKey, val ? "1" : "0");
        } else if(val !== null && val !== undefined){
          localStorage.setItem(lsKey, String(val));
        }
      });
      dbg("Preferences restored from DB", "info");
    }
  } catch(err){
    dbg("loadUserPreferences failed: "+err.message+". Using localStorage fallback.", "warn");
    // Populate cache from localStorage so the app still works
    _userPrefs = {};
    Object.keys(LS_MAP).forEach(key=>{
      const lsKey = LS_MAP[key];
      if(!lsKey){ _userPrefs[key] = PREF_DEFAULTS[key]; return; }
      const raw = localStorage.getItem(lsKey);
      if(raw === null){ _userPrefs[key] = PREF_DEFAULTS[key]; return; }
      if(PREF_DEFAULTS[key] === true || PREF_DEFAULTS[key] === false){
        _userPrefs[key] = raw === "1";
      } else {
        _userPrefs[key] = raw;
      }
    });
  }
}

// First-login migration: read existing localStorage → build object → PATCH DB
async function migrateLocalPreferencesIfNeeded(){
  _userPrefs = {};
  Object.keys(LS_MAP).forEach(key=>{
    const lsKey = LS_MAP[key];
    if(!lsKey){ _userPrefs[key] = PREF_DEFAULTS[key]; return; }
    const raw = localStorage.getItem(lsKey);
    if(raw === null){ _userPrefs[key] = PREF_DEFAULTS[key]; return; }
    if(PREF_DEFAULTS[key] === true || PREF_DEFAULTS[key] === false){
      _userPrefs[key] = raw === "1";
    } else {
      _userPrefs[key] = raw;
    }
  });
  dbg("First login — migrating localStorage to DB preferences", "info");
  try {
    await sbPatch("users","id=eq."+currentUser.id,{preferences: _userPrefs});
    dbg("Preferences migrated to DB", "info");
  } catch(err){
    dbg("Preference migration PATCH failed: "+err.message, "warn");
  }
}

// Apply cached preferences to all UI elements.
// Called once after load. Toggle inits will read from localStorage (now synced).
function applyUserPreferences(){
  if(_userPrefs.language==="en"||_userPrefs.language==="es"){
    lang=_userPrefs.language;
    localStorage.setItem("hpfleet_lang",lang);
    syncLanguageButtons();
  }
  // Side panel width — clamp to 50% viewport
  const spw = _userPrefs.sidepanel_width;
  if(spw){
    const maxW = Math.floor(window.innerWidth * 0.5);
    const clamped = Math.min(parseInt(spw) || 420, maxW);
    const clamped_str = clamped + "px";
    localStorage.setItem("hpfleet_sp_width", clamped_str);
    _userPrefs.sidepanel_width = clamped;
  }
  // viewas_visible — apply topbar widget early (mirrors bootApp inline logic)
  const vaw = el("viewAsWrap");
  if(vaw && currentUser && currentUser.role === "ADMIN"){
    vaw.style.display = _userPrefs.viewas_visible ? "flex" : "none";
  }
  // All other prefs are read by the existing init* functions from localStorage
  // No need to apply them here — localStorage is now synced from DB above
  applyTooltipPreferences();
  dbg("Preferences applied to UI", "info");
}

// Write-through: update cache → localStorage → debounced PATCH to DB
async function persistUserPreferencesNow(){
  if(!currentUser) return;
  if(_prefSaveTimer){
    clearTimeout(_prefSaveTimer);
    _prefSaveTimer = null;
  }
  try {
    await sbPatch("users","id=eq."+currentUser.id,{preferences: _userPrefs});
    dbg("Preferences saved to DB", "info");
  } catch(err){
    dbg("Preference PATCH failed: "+err.message, "warn");
  }
}
function saveUserPreference(key, value, immediate=false){
  if(!(key in PREF_DEFAULTS)) return;
  _userPrefs[key] = value;
  // Sync localStorage
  const lsKey = LS_MAP[key];
  if(lsKey){
    if(typeof value === "boolean"){
      localStorage.setItem(lsKey, value ? "1" : "0");
    } else if(value !== null && value !== undefined){
      localStorage.setItem(lsKey, String(value));
    }
  }
  // No PATCH if not logged in
  if(!currentUser) return;
  if(immediate){
    persistUserPreferencesNow();
    return;
  }
  // Debounced PATCH — 400ms window collapses rapid changes (e.g. panel drag)
  if(_prefSaveTimer) clearTimeout(_prefSaveTimer);
  _prefSaveTimer = setTimeout(async ()=>{
    try {
      await sbPatch("users","id=eq."+currentUser.id,{preferences: _userPrefs});
      dbg("Preferences saved to DB", "info");
    } catch(err){
      dbg("Preference PATCH failed: "+err.message, "warn");
    }
  }, 400);
}
// ── END PREFERENCE LAYER ────────────────────────────────────────────────────
let editingUserId=null, editingCoId=null, deletingId=null, deleteType=null;
let nextUserId=200, nextCoId=300, nextRuleId=400, tempRules=[], tempContacts=[];

function contactTypeOptions(selected){
  const types=[
    ["Admin","ctAdmin"],["Accounting","ctAccounting"],["Operations","ctOperations"],["Shop","ctShop"],["Other","ctOther"]
  ];
  return types.map(([value,key])=>'<option value="'+value+'"'+(selected===value?" selected":"")+'>'+t(key)+'</option>').join("");
}

function renderTempContacts(){
  const wrap=el("co_contacts_list"); if(!wrap) return;
  wrap.innerHTML="";
  const inp=s=>'<input type="text" '+s+' style="background:var(--s2);border:1px solid var(--border2);color:var(--text);font-size:12px;padding:6px 8px;border-radius:2px;outline:none;width:100%;box-sizing:border-box">';
  tempContacts.forEach((c,i)=>{
    const card=document.createElement("div");
    card.style.cssText="border:1px solid var(--border2);border-radius:4px;padding:8px 10px;margin-bottom:8px;position:relative";
    // Delete button — top right of card
    const delBtn=document.createElement("button");
    delBtn.textContent="✕";
    delBtn.style.cssText="position:absolute;top:6px;right:6px;background:none;border:1px solid var(--border2);color:var(--red);cursor:pointer;padding:2px 6px;border-radius:2px;font-size:11px;line-height:1";
    // Row 1: Type + Name + Invoice checkbox
    const row1=document.createElement("div");
    row1.style.cssText="display:grid;grid-template-columns:130px 1fr auto;gap:6px;margin-bottom:6px;padding-right:32px";
    const typeSel=document.createElement("select");
    typeSel.style.cssText="background:var(--s2);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);font-size:10px;padding:6px 8px;border-radius:2px;outline:none;width:100%";
    typeSel.innerHTML=contactTypeOptions(c.type);
    const nameInp=document.createElement("input");
    nameInp.type="text"; nameInp.value=c.name||""; nameInp.placeholder=t("coContactNamePh");
    nameInp.style.cssText="background:var(--s2);border:1px solid var(--border2);color:var(--text);font-size:12px;padding:6px 8px;border-radius:2px;outline:none;width:100%;box-sizing:border-box";
    // Invoice toggle
    const invLbl=document.createElement("label");
    invLbl.className="chk-item"+(c.inv_show!==false?" checked":"");
    invLbl.title=t("invOnInvoice");
    invLbl.style.cssText="padding:4px 7px;font-size:9px;white-space:nowrap;cursor:pointer";
    const invCb=document.createElement("input");
    invCb.type="checkbox"; invCb.checked=c.inv_show!==false;
    invCb.style.cssText="accent-color:var(--cyan);width:11px;height:11px;cursor:pointer";
    invLbl.appendChild(invCb);
    invLbl.appendChild(document.createTextNode(" "+t("invOnInvoice")));
    row1.appendChild(typeSel); row1.appendChild(nameInp); row1.appendChild(invLbl);
    // Row 2: Phone + Email
    const row2=document.createElement("div");
    row2.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding-right:32px";
    const phoneInp=document.createElement("input");
    phoneInp.type="text"; phoneInp.value=c.phone||""; phoneInp.placeholder=t("coContactPhonePh");
    phoneInp.style.cssText="background:var(--s2);border:1px solid var(--border2);color:var(--text);font-size:12px;padding:6px 8px;border-radius:2px;outline:none;width:100%;box-sizing:border-box";
    const emailInp=document.createElement("input");
    emailInp.type="text"; emailInp.value=c.email||""; emailInp.placeholder=t("coContactEmailPh");
    emailInp.style.cssText="background:var(--s2);border:1px solid var(--border2);color:var(--text);font-size:12px;padding:6px 8px;border-radius:2px;outline:none;width:100%;box-sizing:border-box";
    row2.appendChild(phoneInp); row2.appendChild(emailInp);
    // Wire events — use data-index attribute to avoid closure-over-loop-index
    card.dataset.contactIdx=i;
    typeSel.addEventListener("change",()=>{const idx=+card.dataset.contactIdx;tempContacts[idx].type=typeSel.value;});
    nameInp.addEventListener("input",()=>{const idx=+card.dataset.contactIdx;tempContacts[idx].name=nameInp.value;});
    invCb.addEventListener("change",()=>{const idx=+card.dataset.contactIdx;tempContacts[idx].inv_show=invCb.checked;invLbl.classList.toggle("checked",invCb.checked);});
    phoneInp.addEventListener("input",()=>{const idx=+card.dataset.contactIdx;tempContacts[idx].phone=phoneInp.value;});
    emailInp.addEventListener("input",()=>{const idx=+card.dataset.contactIdx;tempContacts[idx].email=emailInp.value;});
    delBtn.addEventListener("click",()=>{const idx=+card.dataset.contactIdx;tempContacts.splice(idx,1);renderTempContacts();});
    card.appendChild(delBtn); card.appendChild(row1); card.appendChild(row2);
    wrap.appendChild(card);
  });
}

function addContact(){
  if(tempContacts.length>=5){showToast(t("coMaxContactsToast"),"warn");return;}
  tempContacts.push({type:"Admin",name:"",phone:"",email:""});
  renderTempContacts();
}
// Flight log state
let flEntries=[], flAuditLog=[], fileQueue=[], editingEntryId=null;
let batchStatus="DRAFT", confirmCb=null, batchSourceFile=[], nextEntryId=1;
let currentBatchId=null;
let reviewCycle=1;

// ── REVIEW THREAD HELPERS ──
function addThreadComment(entry, role, text){
  if(!entry.reviewThread) entry.reviewThread=[];
  entry.reviewThread.push({
    cycle:reviewCycle,
    role,
    author:currentUser.name,
    text:text.trim(),
    ts:new Date().toISOString()
  });
  if(role==="REVIEWER") markEntryObserved(entry);
}

function getCurrentCycleComments(entry){
  if(!entry.reviewThread||!entry.reviewThread.length) return [];
  return entry.reviewThread.filter(c=>c.cycle===reviewCycle);
}

function getThreadForEntry(entry){
  return entryReviewThread(entry).filter(isVisibleReviewComment);
}

function renderSpThread(entry){
  const thread=getThreadForEntry(entry);
  const body=el("spThreadBody"); if(!body) return;
  body.innerHTML="";
  const role=effectiveRole();
  const isReviewer=role==="REVIEWER"||role==="ADMIN";
  const isOperator=role==="OPERATOR"||role==="ADMIN";

  // Group by cycle
  const cycles=[...new Set(thread.map(c=>c.cycle))].sort((a,b)=>a-b);
  const circled=["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];

  if(cycles.length===0){
    body.innerHTML="<div style='padding:10px 8px;font-size:10px;color:var(--dim2);text-align:center'>"+
      t("spThreadNoComments")+"</div>";
  } else {
    cycles.forEach(cyc=>{
      const reviewerComments=thread.filter(c=>c.cycle===cyc&&c.role==="REVIEWER");
      const operatorComments=thread.filter(c=>c.cycle===cyc&&c.role==="OPERATOR");
      const maxRows=Math.max(reviewerComments.length,operatorComments.length,1);
      const num=circled[cyc-1]||("#"+cyc);
      for(let i=0;i<maxRows;i++){
        const rc=reviewerComments[i];
        const oc=operatorComments[i];
        const row=document.createElement("div");
        row.style.cssText="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(255,255,255,0.04)";
        row.innerHTML=
          "<div style='padding:6px 8px;border-right:1px solid rgba(255,255,255,0.06)'>"+(rc?
            "<div style='font-size:8px;color:rgba(255,196,59,0.5);margin-bottom:2px'>"+num+" "+rc.author+"</div>"+
            "<div style='font-size:10px;color:var(--yellow)'>"+rc.text+"</div>":
            "<div style='font-size:10px;color:var(--dim2)'>—</div>")+
          "</div>"+
          "<div style='padding:6px 8px'>"+(oc?
            "<div style='font-size:8px;color:rgba(34,211,238,0.5);margin-bottom:2px'>"+num+" "+oc.author+"</div>"+
            "<div style='font-size:10px;color:var(--cyan)'>"+oc.text+"</div>":
            "<div style='font-size:10px;color:var(--dim2)'>—</div>")+
          "</div>";
        body.appendChild(row);
      }
    });
  }

  // Show meta
  if(el("spThreadMeta")) el("spThreadMeta").textContent=t("spThreadMeta").replace("{count}",thread.length);

  // Show/hide action buttons based on role and batch state
  const canReviewerComment=(isReviewer)&&batchStatus==="SUBMITTED";
  const canOperatorRespond=(isOperator)&&batchStatus==="DRAFT";
  if(el("spAddCommentBtn")) el("spAddCommentBtn").style.display=canReviewerComment?"":"none";
  if(el("spSaveResponseBtn")) el("spSaveResponseBtn").style.display=canOperatorRespond?"":"none";
}

function openSpThreadInput(role){
  const ta=el("spThreadTextarea"); if(!ta) return;
  ta.value="";
  // Style based on role
  if(role==="REVIEWER"){
    ta.style.borderColor="rgba(255,196,59,0.4)";
    ta.style.color="var(--yellow)";
    ta.placeholder=t("spThreadCommentPh");
    if(el("spThreadSaveBtn")){ el("spThreadSaveBtn").style.background="var(--yellow)"; el("spThreadSaveBtn").style.color="#000"; }
  } else {
    ta.style.borderColor="rgba(34,211,238,0.4)";
    ta.style.color="var(--cyan)";
    ta.placeholder=t("spThreadResponsePh");
    if(el("spThreadSaveBtn")){ el("spThreadSaveBtn").style.background="var(--cyan)"; el("spThreadSaveBtn").style.color="#000"; }
  }
  el("spThreadInput").dataset.role=role;
  el("spThreadInput").style.display="";
  ta.focus();
}

function closeSpThreadInput(){
  if(el("spThreadInput")) el("spThreadInput").style.display="none";
  if(el("spThreadTextarea")) el("spThreadTextarea").value="";
}

function saveSpThreadComment(){
  const ta=el("spThreadTextarea"); if(!ta) return;
  const text=ta.value.trim(); if(!text) return;
  const role=el("spThreadInput").dataset.role||effectiveRole();
  const entry=flEntries.find(e=>e.id===spEditingEntryId); if(!entry) return;
  addThreadComment(entry,role,text);
  // Sync flagNote for backwards compat — drives Notes column marker, RFR dialog, filter, WA message
  if(role==="REVIEWER"){
    entry.flagNote=text;
    entry.status="flagged";
  }
  closeSpThreadInput();
  renderSpThread(entry);
  renderFlTable();
  addFlAudit("💬",currentUser.name,"thread comment added","Entry "+(flEntries.indexOf(entry)+1)+" cycle "+reviewCycle);
}

function migrateFlagnoteToThread(entry){
  // Migrate legacy flagNote to review_thread as cycle 1 REVIEWER comment
  if(entry.flagNote&&entry.flagNote.trim()!==""&&
    (!entry.reviewThread||!entry.reviewThread.length)){
    entry.reviewThread=[{
      cycle:1,
      role:"REVIEWER",
      author:"Reviewer",
      text:entry.flagNote.trim(),
      ts:new Date().toISOString()
    }];
    if(entry.status!=="flagged") entry.flagNote=""; // keep active legacy observations active
    dbg("Migrated flagNote to reviewThread for entry "+(entry.id),"info");
  }
  backfillEntryObservedMarker(entry);
}

function entryReviewThread(entry){
  return Array.isArray(entry?.reviewThread)?entry.reviewThread:[];
}

function isVisibleReviewComment(comment){
  return comment&&
    (comment.role==="REVIEWER"||comment.role==="OPERATOR")&&
    String(comment.text||"").trim()!=="";
}

function entryHasObservedMarker(entry){
  return entry?.reviewObserved===true||
    entryReviewThread(entry).some(c=>c&&c.role==="META"&&c.type==="review_observed"&&c.observed===true);
}

function markEntryObserved(entry){
  if(!entry) return false;
  if(!Array.isArray(entry.reviewThread)) entry.reviewThread=[];
  entry.reviewObserved=true;
  const existing=entry.reviewThread.find(c=>c&&c.role==="META"&&c.type==="review_observed");
  if(existing){
    existing.observed=true;
    existing.cycle=existing.cycle||reviewCycle||1;
    existing.ts=existing.ts||new Date().toISOString();
    return false;
  }
  entry.reviewThread.push({
    role:"META",
    type:"review_observed",
    observed:true,
    cycle:reviewCycle||1,
    ts:new Date().toISOString()
  });
  return true;
}

function backfillEntryObservedMarker(entry){
  if(!entry||entryHasObservedMarker(entry)) return;
  const hasReviewerHistory=entryReviewerComments(entry).length>0||String(entry?.flagNote||"").trim()!=="";
  if(hasReviewerHistory) markEntryObserved(entry);
}

function entryReviewerComments(entry){
  return entryReviewThread(entry).filter(c=>c&&c.role==="REVIEWER"&&String(c.text||"").trim()!=="");
}

function latestReviewerComment(entry){
  const comments=entryReviewerComments(entry);
  if(comments.length) return String(comments[comments.length-1].text||"").trim();
  return String(entry?.flagNote||"").trim();
}

function escHtml(value){
  return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function entryEverObserved(entry){
  return entryHasObservedMarker(entry)||entryReviewerComments(entry).length>0||String(entry?.flagNote||"").trim()!=="";
}

function entryActiveObserved(entry){
  return entry?.status==="flagged"&&String(entry?.flagNote||"").trim()!=="";
}

function entryHasCurrentCycleOperatorResponse(entry){
  return entryReviewThread(entry).some(c=>
    c&&c.cycle===reviewCycle&&c.role==="OPERATOR"&&String(c.text||"").trim()!==""
  );
}

function entryAwaitingReviewerReview(entry){
  return batchStatus==="SUBMITTED"&&reviewCycle>1&&entryEverObserved(entry)&&entryHasCurrentCycleOperatorResponse(entry);
}

function getObservedRegisteredEntries(){
  return flEntries.filter(entryEverObserved);
}

function getObservedActiveEntries(){
  return flEntries.filter(entryActiveObserved);
}

function getReviewerCommentFilterEntries(){
  return flEntries.filter(entryEverObserved);
}

function getReturnForReviewCandidates(){
  return flEntries.filter(entryEverObserved);
}
let isExtracting=false;
let extractionAbort=null;
let viewRole=null;
let flaggingEntryId=null;
// Sort state
let userSortCol=null, userSortDir=1; // dir: 1=asc, -1=desc
let flSortCol=null, flSortDir=1;
const DEFAULT_MULT = {FM:1.15, MAG:1.275};
const LAST_HORO = {"HP-1862FX":1298.4,"HP-1861":1105.7};
const FL_LOAD_TS = new Date();
const MODEL = "claude-sonnet-4-6";

function _updateSpBottom(){
  const panel=el("sidePanel"); if(!panel) return;
  const debugOn=el("debugPanel")&&el("debugPanel").classList.contains("on")&&!el("debugBody").classList.contains("collapsed");
  panel.classList.toggle("debug-open",debugOn);
}

// ── DEBUG LOGGER ──
function dbg(msg, type="info"){
  const panel=el("debugPanel"); if(!panel) return;
  // Only show panel if debug is enabled in settings
  if(currentUser && localStorage.getItem("hpfleet_debug")==="1"){
    panel.classList.add("on");
    _updateSpBottom();
  }
  const body=el("debugBody");
  const line=document.createElement("div");
  line.className="debug-line "+(type||"info");
  const ts=new Date().toLocaleTimeString("en-US",{hour12:false});
  line.textContent="["+ts+"] "+msg;
  body.appendChild(line);
  body.scrollTop=body.scrollHeight;
}

function t(k){ return (I18N[lang]||{})[k] ?? (I18N.en||{})[k] ?? k; }
function el(id){ return document.getElementById(id); }
function initials(n){ return n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(); }
function roleColor(r){ return {ADMIN:"var(--violet)",OPERATOR:"var(--cyan)",REVIEWER:"var(--green)",READONLY:"var(--dim2)"}[r]||"var(--cyan)"; }
function coColor(code){
  const map = {FM:"var(--green)",MAG:"var(--yellow)"};
  if(map[code]) return map[code];
  const hues=[200,280,340,160,30,260];
  const idx = COMPANIES.findIndex(c=>c.code===code) % hues.length;
  return "hsl("+hues[Math.max(0,idx)]+",80%,65%)";
}
function openModal(id){ el(id).classList.add("open"); }
function closeModal(id){ el(id).classList.remove("open"); }
let _toastTimer=null;
function getToastDurationMs(){
  const raw=(_userPrefs && _userPrefs.toast_duration_sec !== undefined) ? _userPrefs.toast_duration_sec : localStorage.getItem("hpfleet_toast_duration_sec");
  const sec=parseInt(raw || PREF_DEFAULTS.toast_duration_sec,10);
  return Math.min(12,Math.max(2,Number.isFinite(sec)?sec:PREF_DEFAULTS.toast_duration_sec))*1000;
}
function showToast(msg,type=""){
  const t=el("toast"); t.textContent=msg;
  t.className="toast on"+(type?" "+type:"");
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.className="toast";_toastTimer=null;},getToastDurationMs());
}

// ── LANG ──
function syncLanguageButtons(){
  ["EN","ES"].forEach(x=>{
    const isActive=lang===x.toLowerCase();
    const b1=el("btn"+x); const b2=el("app"+x);
    if(b1) b1.className=isActive?"active":"";
    if(b2) b2.className=isActive?"active":"";
  });
}
function setLang(l){
  lang=l;
  _loginLanguageOverride=l;
  localStorage.setItem("hpfleet_lang",l);
  if(currentUser) saveUserPreference("language",l,true);
  syncLanguageButtons();
  applyI18n();
  if(currentUser){ renderAll(); }
}

function applyI18n(){
  document.documentElement.lang=lang;
  el("loginTitle").textContent=t("signIn");
  el("loginBtnTxt").textContent=t("signIn");
  el("lbl_user").textContent=t("emailLbl");
  el("lbl_pass").textContent=t("pwdLbl");
  if(el("brandSub")) el("brandSub").textContent=t("brandSub");
  if(el("lbl_remember")) el("lbl_remember").textContent=t("rememberUsername");
  if(el("li_pass_toggle")) el("li_pass_toggle").title=t("showHidePasswordTip");
  if(!currentUser) return;
  el("btnSignOut").textContent=t("signOut");
  const ids={
    ut_title:"utTitle",ut_export:"utExport",ut_add:"utAdd",ut_auditTitle:"utAudit",ut_clearLog:"utClear",
    th_user:"thUser",th_role:"thRole",th_companies:"thCompanies",th_status:"thStatus",
    th_created:"thCreated",th_last:"thLast",th_actions:"thActions",
    fo_allroles:"allRoles",fo_admin:"",fo_op:"",fo_rev:"",fo_ro:"",fo_allstatus:"allStatuses",
    fo_active:"activeOnly",fo_inactive:"inactiveOnly",fo_allco:"allCompanies",
    um_lbl_name:"umName",um_lbl_email:"umEmail",um_lbl_phone:"umPhone",um_lbl_status:"umStatus",
    um_lbl_role:"umRole",um_lbl_companies:"umCompanies",um_save:"umSave",um_cancel:"rfrCancel",
    um_status_active:"active",um_status_inactive:"inactive",um_roleRightsBtn:"viewRoleRights",
    ct_title:"ctTitle",ct_add:"ctAdd",
    co_lbl_name:"coName",co_lbl_code:"coCode",co_lbl_status:"coStatus",co_lbl_notes:"coNotes",
    co_lbl_address:"coAddress",co_lbl_phone:"coPhone",co_status_active:"active",co_status_inactive:"inactive",
    co_inv_title:"invHeader",co_inv_hint:"invHeaderHint",co_contactsTitle:"coContacts",co_contactsMax:"coContactsMax",
    co_addContact:"coAddContact",co_rulesTitle:"coBillingRules",co_addRule:"coAddBillingRule",
    co_cancel:"rfrCancel",co_save:"coSave",
    fl_title:"flTitle",fl_newBatch:"flNewBatch",
    apiWarnMsg:"apiWarnMsg",apiWarnLink:"apiWarnLink",
    sb_file:"sbFile",btn_addMoreFiles:"addMoreFiles",sb_documents:"sbDocuments",sb_inProcess:"sbInProcess",
    sb_workflowFlow:"sbWorkflowFlow",sb_workflowTurn:"sbWorkflowTurn",sb_observedRegistered:"sbObservedRegistered",
    sb_observedActive:"sbObservedActive",sb_batchHistory:"sbBatchHistory",
    sb_records:"sbRecords",sb_read:"sbRead",sb_notRead:"sbNotRead",
    sb_nonBill:"sbNonBill",sb_dups:"sbDups",sb_logBreaks:"sbLogBreaks",sb_seqAlerts:"sbSeqAlerts",
    sb_sentBack:"sbSentBack",sb_horo:"sbHoro",sb_csv:"sbCsv",sb_ts:"sbTs",sb_batch:"sbBatch",sb_dlcsv:"sbDlCsv",
    dlgSourcesTitle:"dlgSourcesTitle",dlgNotReadTitle:"dlgNotReadTitle",dlgDupsTitle:"dlgDupsTitle",dlgNonBillTitle:"dlgNonBillTitle",
    dlgLogBreaksTitle:"dlgLogBreaksTitle",dlgSeqAlertsTitle:"dlgSeqAlertsTitle",dlgSentBackTitle:"dlgSentBackTitle",
    al_horoTitle:"horoAlert",tb_entries:"tbEntries",
    fo_allop:"allOp",fo_problems:"needsReview",fo_hideNonBill:"hideNonBill",fo_showNonBill:"showNonBill",
    btn_approveAll:"approveAll",btn_resetAll:"resetAll",btn_newEntry:"newEntry",
    pt_entries:"ptEntries",pt_audit:"ptAudit",
    th_log:"thLog",th_date:"thDate",th_ac:"thAc",th_op:"thOp",th_pilot:"thPilot",th_instructor:"thInstructor",
    th_motor:"thMotor",th_flight:"thFlight",th_billing:"thBilling",
    th_mout:"thMout",th_min:"thMin",th_tm:"thTm",th_fout:"thFout",th_fin:"thFin",th_tf:"thTf",
    th_mult:"thMult",th_tbp:"thTbp",th_horo:"thHoro",th_obs:"thObs",th_status:"thStatus2",
    btn_csv:"btnCsv",btn_xlsx:"btnXlsx",btn_saveDraft:"btnDraft",
    btn_submit:"btnSubmit",btn_approve:"btnApprove",btn_reqChanges:"btnReqChanges",btn_returnForReview:"btnReturnForReview",btn_reopen:"btnReopen",
    spToggleLabel:"sourcePanel",
    fo_reviewerComments:"rfrColComment",
    confirm_cancel:"rfrCancel",confirm_ok:"confirmOk",exc_title:"excPendingTitle",exc_back:"excBack",exc_proceed:"excProceed",
    flag_title:"flagTitle",flag_note_label:"flagNoteLabel",flag_cancel:"rfrCancel",flag_save:"flagSave",
    wa_title:"waTitle",wa_skip:"waSkip",wa_send:"waSend",
    st_adminCcLabel:"stAdminCcLabel",st_adminCcHint:"stAdminCcHint",
    st_displayTitle:"stDisplayTitle",st_roleBannerLabel:"stRoleBannerLabel",st_roleBannerHint:"stRoleBannerHint",
    st_stickyTabsLabel:"stStickyTabsLabel",st_stickyTabsHint:"stStickyTabsHint",
    st_stickyHeadersLabel:"stStickyHeadersLabel",st_stickyHeadersHint:"stStickyHeadersHint",
    st_workflowTitle:"stWorkflowTitle",st_resetTestLabel:"stResetTestLabel",st_resetTestHint:"stResetTestHint",
    st_devTitle:"stDevTitle",st_resetTestButton:"stResetTestButton",st_debugLabel:"stDebugLabel",st_debugHint:"stDebugHint",
    st_dbTitle:"stDbTitle",st_dbHint:"stDbHint",st_deleteTestLabel:"stDeleteTestLabel",st_deleteTestHint:"stDeleteTestHint",
    st_deleteStatusLabel:"stDeleteStatusLabel",st_deleteStatusHint:"stDeleteStatusHint",st_clearAuditLabel:"stClearAuditLabel",st_clearAuditHint:"stClearAuditHint",
    st_tooltipsLabel:"stTooltipsLabel",st_tooltipsHint:"stTooltipsHint",
    st_tooltipTextColorLabel:"stTooltipTextColor",st_tooltipBoxColorLabel:"stTooltipBoxColor",st_tooltipBorderColorLabel:"stTooltipBorderColor",
    st_tooltipOffsetLabel:"stTooltipOffset",st_tooltipMaxWidthLabel:"stTooltipMaxWidth",st_tooltipTextSizeLabel:"stTooltipTextSize",st_tooltipResetLabel:"stTooltipReset",
    st_toastDurationLabel:"stToastDurationLabel",st_toastDurationHint:"stToastDurationHint",st_toastDurationUnit:"stToastDurationUnit",
    st_viewAsLabel:"stViewAsLabel",st_viewAsHint:"stViewAsHint",
    st_title:"stTitle",st_apiTitle:"stApiTitle",st_apiLabel:"stApiLabel",st_apiHint:"stApiHint",
    btn_saveApiKey:"saveKey",btn_clearApiKey:"clearKey",
    cs_billing:"csBilling",st_fleetTitle:"stFleetTitle",
    pi_title:"tabBilling",pi_load_cycle_btn:"piLoadCycle",cs_billing:"csBilling",
    pi_meta_billingNo:"piBillingNo",pi_meta_date:"piDate",pi_meta_aircraft:"piAircraft",
    pi_billToLabel:"piBillTo",pi_periodLabel:"piPeriod",pi_logsLabel:"piLogs",pi_rateLabel:"piRate",
    pi_th_log:"piLogNo",pi_th_date:"piDate",pi_th_pilot:"thPilot",pi_th_tbh:"thTbp",pi_th_amount:"piAmount",
    pi_subtotalLabel:"piSubtotal",pi_additionalChargesTitle:"piAdditionalCharges",
    pi_add_charge2:"piAddCharge",pi_totalAmountDueLabel:"piTotalAmountDue",pi_signoff_btn:"piSignOff",
    piLoad_historicDesc:"piHistoricDesc",piLoad_confirm:"piLoadSelected",
    nb_title:"nbTitle",nb_aircraftLabel:"thAc",nb_operatorLabel:"thOp",nb_periodFromLabel:"nbPeriodFrom",nb_periodToLabel:"nbPeriodTo",
    nb_logFromLabel:"nbLogFrom",nb_logToLabel:"nbLogTo",nb_uzTitle:"uzTitle",nb_uzSub:"uzSub",nb_cancel:"rfrCancel",nb_confirm:"nbStartExtract",
    af_title:"afTitle",af_contextTitle:"afContextTitle",af_aircraftLabel:"thAc",af_operatorLabel:"thOp",
    af_uzTitle:"uzTitle",af_uzSub:"uzSub",af_cancel:"rfrCancel",af_confirm:"afUploadLogs",
    uploadLog_title:"uploadLogTitle",uploadLog_save:"uploadLogSave",uploadLog_close:"close",
    extractSummary_title:"extractSummaryTitle",extractSummary_go:"extractSummaryGo",
    viewAsLabel:"viewAs",viewAsAdmin:"viewAsAdmin",viewAsOperator:"viewAsOperator",viewAsReviewer:"viewAsReviewer",viewAsReadonly:"viewAsReadonly",
    aircraftTitle:"aircraftTitle",btn_addAircraft2:"aircraftAdd",
  };
  const roleLabels={ADMIN:ROLES.ADMIN[lang].label,OPERATOR:ROLES.OPERATOR[lang].label,REVIEWER:ROLES.REVIEWER[lang].label,READONLY:ROLES.READONLY[lang].label};
  if(el("fo_admin")) el("fo_admin").textContent=roleLabels.ADMIN;
  if(el("fo_op")) el("fo_op").textContent=roleLabels.OPERATOR;
  if(el("fo_rev")) el("fo_rev").textContent=roleLabels.REVIEWER;
  if(el("fo_ro")) el("fo_ro").textContent=roleLabels.READONLY;
  if(el("um_role_admin")) el("um_role_admin").textContent=roleLabels.ADMIN;
  if(el("um_role_operator")) el("um_role_operator").textContent=roleLabels.OPERATOR;
  if(el("um_role_reviewer")) el("um_role_reviewer").textContent=roleLabels.REVIEWER;
  if(el("um_role_readonly")) el("um_role_readonly").textContent=roleLabels.READONLY;
  Object.entries(ids).forEach(([id,key])=>{ if(key && el(id)) el(id).textContent=t(key); });
  localizeUserUi();
  if(el("tooltipPreviewTip")){
    el("tooltipPreviewTip").dataset.tip=t("stTooltipsPreviewTip");
    el("tooltipPreviewTip").setAttribute("aria-label",t("stTooltipsPreviewTip"));
    orientTip(el("tooltipPreviewTip"));
  }
  if(el("co_rulesTip")){
    el("co_rulesTip").dataset.tip=t("coBillingRulesTip");
    el("co_rulesTip").setAttribute("aria-label",t("coBillingRulesTip"));
    orientTip(el("co_rulesTip"));
  }
  if(el("userRoleHelpTip")){
    el("userRoleHelpTip").dataset.tip=t("roleChipTip");
    el("userRoleHelpTip").setAttribute("aria-label",t("roleChipTip"));
    orientTip(el("userRoleHelpTip"));
  }
  refreshSettingsToggleLabels();
  localizeLogStatusTitles();
  localizeLogTooltips();
  localizeSidePanelUi();
  localizeCompanyUi();
  localizeAircraftUi();
  renderTabs();
  updateApiStatus();
}

function setText(id,key){ if(el(id)) el(id).textContent=t(key); }
function setPh(id,key){ if(el(id)) el(id).placeholder=t(key); }
function setTitle(id,key){ if(el(id)) el(id).title=t(key); }
function setAlt(id,key){ if(el(id)) el(id).alt=t(key); }
function clampPrefNumber(value,min,max,fallback){
  const parsed=parseFloat(value);
  const safe=Number.isFinite(parsed)?parsed:fallback;
  return Math.min(max,Math.max(min,safe));
}
function setHoverTip(id,key,level=""){
  const node=el(id);
  if(!node) return;
  node.querySelectorAll(".hpf-tip").forEach(tip=>tip.remove());
  node.removeAttribute("title");
  node.classList.add("hpf-hover-tip");
  node.dataset.tip=t(key);
  node.setAttribute("aria-label",t(key));
  if(level) node.dataset.tipLevel=level;
  else delete node.dataset.tipLevel;
  node.tabIndex=node.tabIndex>=0?node.tabIndex:0;
}
function localizeSidePanelUi(){
  [
    ["spFitText","spFit"],
    ["spOcrText","spOcr"],
    ["spSaveText","spSave"],
    ["spLblLog","thLog"],
    ["spLblDate","thDate"],
    ["spLblAircraft","thAc"],
    ["spLblOperator","thOp"],
    ["spLblHoroStart","spHoroStart"],
    ["spLblMultOverride","spMultOverride"],
    ["spLblPilot","thPilot"],
    ["spLblInstructor","thInstructor"],
    ["spLblMotorOut","spMotorOut"],
    ["spLblMotorIn","spMotorIn"],
    ["spLblTMotor","thTm"],
    ["spLblFlightOut","spFlightOut"],
    ["spLblFlightIn","spFlightIn"],
    ["spLblTFlight","thTf"],
    ["spLblNotes","thObs"],
    ["spThreadTitle","spThreadTitle"],
    ["spColReviewer","spThreadReviewer"],
    ["spColOperator","spThreadOperator"],
    ["spThreadCancelBtn","rfrCancel"],
    ["spThreadSaveBtn","flagSave"],
    ["spAddCommentBtn","spAddComment"],
    ["spSaveResponseBtn","spReply"],
    ["spCalcTMotor","thTm"],
    ["spCalcTFlight","thTf"],
    ["spCalcMultiplier","spMultiplier"],
    ["spCalcTbh","thTbp"],
    ["spCalcGap","spGap"],
    ["nonBill_title","nonBillTitle"],
    ["nonBill_reasonLabel","nonBillReasonLabel"],
    ["nonBill_reason_maintenance","nonBillReasonMaintenance"],
    ["nonBill_reason_aborted","nonBillReasonAborted"],
    ["nonBill_reason_equipment","nonBillReasonEquipment"],
    ["nonBill_reason_duplicate","nonBillReasonDuplicate"],
    ["nonBill_reason_other","nonBillReasonOther"],
    ["nonBill_optionalLabel","nonBillOptional"],
    ["nonBill_cancel","rfrCancel"],
    ["nonBill_confirm","confirmOk"]
  ].forEach(([id,key])=>setText(id,key));
  setLabelLeadingText("nonBill_commentLabel","nonBillCommentLabel");
  [
    ["sp_mult","spCustomValuePh"],
    ["sp_motorOut","spDecimalPh"],
    ["sp_motorIn","spDecimalPh"],
    ["sp_vueloOut","spDecimalPh"],
    ["sp_vueloIn","spDecimalPh"],
    ["spThreadTextarea","spThreadCommentPh"],
    ["nonBill_comment","nonBillCommentPh"]
  ].forEach(([id,key])=>setPh(id,key));
  [
    ["spCollapseBtn","spClosePanelTip"],
    ["sp_close","close"],
    ["spPrev","spPreviousTip"],
    ["spNext","spNextTip"],
    ["sp_fit","spFitTip"],
    ["sp_zoom_out","spZoomOutTip"],
    ["sp_zoom_in","spZoomInTip"],
    ["sp_rotate","spRotateTip"],
    ["sp_reextract","spOcrTip"],
    ["sp_save","spSaveTip"],
    ["sp_nonbill_toggle","spToggleNonBillTip"],
    ["sp_swap_motor","spSwapMotorTip"],
    ["sp_swap_vuelo","spSwapFlightTip"]
  ].forEach(([id,key])=>setHoverTip(id,key));
  setAlt("sp_img","spSourceAlt");
  const diffAlert=el("spDiffAlert");
  if(diffAlert&&diffAlert.firstChild) diffAlert.firstChild.nodeValue=t("spDiffAlert")+" ";
  const wm=el("sp_nonbill_watermark");
  if(el("sp_nonbill_wm_text")&&(!wm||wm.style.display==="none")) el("sp_nonbill_wm_text").textContent=t("spNonBillable");
  refreshSidePanelLocalizedEntryText();
  const resize=el("spVResize");
  if(resize){
    resize.removeAttribute("title");
    resize.removeAttribute("aria-label");
    resize.classList.remove("hpf-hover-tip");
    delete resize.dataset.tip;
    delete resize.dataset.tipLevel;
  }
  const active=el("sp_nonbill_toggle")&&el("sp_nonbill_toggle").classList.contains("active");
  spUpdateNonBillBtn(!!active);
}
function localizeLogStatusTitles(){
  ["srcFile","srcNotRead","srcNonBill","srcDups","srcLogBreaks","srcHoro","srcSentBack","srcObservedActive","srcEventBar"].forEach(id=>setTitle(id,"clickForDetails"));
}
function localizeLogTooltips(){
  [
    ["sb_file","logTipSourceFile"],
    ["sb_records","logTipRecords"],
    ["sb_read","logTipRead"],
    ["sb_notRead","logTipNotRead"],
    ["sb_nonBill","logTipNonBill"],
    ["sb_dups","logTipDuplicates"],
    ["sb_logBreaks","logTipLogBreaks"],
    ["sb_seqAlerts","logTipSeqAlerts"],
    ["sb_workflowTurn","logTipWorkflowTurn"],
    ["sb_observedRegistered","logTipObservedRegistered"],
    ["sb_observedActive","logTipObservedActive"],
    ["sb_batch","logTipBatchStatus"],
    ["tb_entries","logTipExtractedEntries"],
    ["pt_entries","logTipEntriesTab"],
    ["pt_audit","logTipAuditTab"],
    ["spToggleLabel","logTipSourcePanel",""],
    ["btn_approveAll","logTipApproveAll"],
    ["btn_resetAll","logTipResetAll"],
    ["btn_newEntry","logTipNewEntry"],
    ["btn_csv","logTipCsv"],
    ["btn_xlsx","logTipXlsx"],
    ["btn_saveDraft","logTipSaveDraft"],
    ["btn_submit","logTipSubmit"],
    ["btn_approve","logTipApprove"],
    ["btn_returnForReview","logTipReturnForReview"],
    ["btn_reqChanges","logTipRequestChanges"],
    ["btn_reopen","logTipReopen"],
    ["th_log","logTipThLog","fl-bottom"],
    ["th_date","logTipThDate","fl-bottom"],
    ["th_ac","logTipThAircraft","fl-bottom"],
    ["th_op","logTipThOperator","fl-bottom"],
    ["th_pilot","logTipThPilot","fl-bottom"],
    ["th_instructor","logTipThInstructor","fl-bottom"],
    ["th_motor","logTipThMotor","fl-top"],
    ["th_mout","logTipThMotorOut","fl-bottom"],
    ["th_min","logTipThMotorIn","fl-bottom"],
    ["th_tm","logTipThMotorTotal","fl-bottom"],
    ["th_flight","logTipThFlight","fl-top"],
    ["th_fout","logTipThFlightOut","fl-bottom"],
    ["th_fin","logTipThFlightIn","fl-bottom"],
    ["th_tf","logTipThFlightTotal","fl-bottom"],
    ["th_billing","logTipThBilling","fl-top"],
    ["th_mult","logTipThMultiplier","fl-bottom"],
    ["th_tbp","logTipThTbh","fl-bottom"],
    ["th_horo","logTipThHoro","fl-bottom"],
    ["th_obs","logTipThNotes","fl-bottom"],
    ["th_status","logTipThStatus","fl-bottom"]
  ].forEach(([id,key,level])=>setHoverTip(id,key,level));
}
function localizeUserUi(){
  setPh("userSearch","userSearchPh");
  setPh("um_name","umNamePh");
  setPh("um_email","umEmailPh");
  setPh("um_phone","umPhonePh");
  setPh("um_pwd","pwdShort");
  setText("um_pwd_hint","pwdShort");
  if(el("um_lbl_pwd")) el("um_lbl_pwd").textContent=editingUserId?t("umNewPassword"):t("umPassword");
  if(el("userMbd")&&el("userMbd").classList.contains("open")){
    const u=editingUserId?USERS.find(x=>x.id===editingUserId):null;
    if(el("umTitle")) el("umTitle").textContent=u?t("umEditTitlePrefix")+u.name:t("umNewTitle");
    updateRoleDesc();
  }
  if(el("pi_coming_msg") && batchStatus!=="APPROVED"){
    el("pi_coming_msg").textContent=batchStatus==="SUBMITTED"?t("piAwaitingApproval"):t("piApproveToUnlock");
  }
}
function localizeCompanyUi(){
  setPh("co_name","coNamePh"); setPh("co_code","coCodePh"); setPh("co_notes","coNotesPh");
  setPh("co_address","coAddressPh"); setPh("co_phone","coPhonePh");
  document.querySelectorAll("[data-i18n]").forEach(node=>{
    const key=node.dataset.i18n;
    if(key) node.textContent=t(key);
  });
}
function orientTip(tip){
  if(!tip) return;
  tip.classList.remove("tip-open-left","tip-open-right");
  const modal=tip.closest(".mbox");
  const bounds=modal?modal.getBoundingClientRect():{left:0,width:window.innerWidth};
  const center=bounds.left+bounds.width/2;
  const rect=tip.getBoundingClientRect();
  if(rect.left<center) tip.classList.add("tip-open-right");
  else tip.classList.add("tip-open-left");
}
let _tipPopover=null;
let _activeTip=null;
function initTooltipLayer(){
  document.body.classList.add("hpf-js-tooltips");
  if(!_tipPopover){
    _tipPopover=document.createElement("div");
    _tipPopover.className="hpf-tip-popover";
    _tipPopover.setAttribute("role","tooltip");
    document.body.appendChild(_tipPopover);
  }
  document.addEventListener("pointerover",e=>{
    const tip=e.target.closest(".hpf-tip,.hpf-hover-tip");
    if(tip) showTipPopover(tip);
  });
  document.addEventListener("focusin",e=>{
    const tip=e.target.closest(".hpf-tip,.hpf-hover-tip");
    if(tip) showTipPopover(tip);
  });
  document.addEventListener("pointerout",e=>{
    const tip=e.target.closest(".hpf-tip,.hpf-hover-tip");
    if(tip && !tip.contains(e.relatedTarget)) hideTipPopover(tip);
  });
  document.addEventListener("focusout",e=>{
    const tip=e.target.closest(".hpf-tip,.hpf-hover-tip");
    if(tip) hideTipPopover(tip);
  });
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") hideTipPopover(); });
  window.addEventListener("resize",()=>{ if(_activeTip) positionTipPopover(_activeTip); });
  document.addEventListener("scroll",()=>{ if(_activeTip) positionTipPopover(_activeTip); },true);
}
function showTipPopover(tip){
  if(!_tipPopover || !tip || document.body.classList.contains("hpf-tooltips-off")) return;
  const text=tip.dataset.tip||tip.getAttribute("aria-label")||"";
  if(!text) return;
  _activeTip=tip;
  _tipPopover.textContent=text;
  _tipPopover.classList.add("on");
  positionTipPopover(tip);
}
function hideTipPopover(tip=null){
  if(tip && _activeTip!==tip) return;
  _activeTip=null;
  if(_tipPopover) _tipPopover.classList.remove("on");
}
function positionTipPopover(tip){
  if(!_tipPopover || !tip) return;
  const margin=12;
  const gap=clampPrefNumber(getTooltipPref("tooltip_offset_px"),2,24,PREF_DEFAULTS.tooltip_offset_px);
  const maxWidth=clampPrefNumber(getTooltipPref("tooltip_max_width_px"),180,420,PREF_DEFAULTS.tooltip_max_width_px);
  const tipRect=tip.getBoundingClientRect();
  const vpW=window.innerWidth;
  const vpH=window.innerHeight;
  _tipPopover.style.maxWidth=Math.min(maxWidth,Math.max(180,vpW-(margin*2)))+"px";
  const popRect=_tipPopover.getBoundingClientRect();
  const tipCenter=tipRect.left+(tipRect.width/2);
  const openRight=tipCenter < vpW/2;
  let left=openRight ? tipRect.left : tipRect.right-popRect.width;
  left=Math.max(margin,Math.min(left,vpW-popRect.width-margin));
  let top=tipRect.top-popRect.height-gap;
  if(tip.dataset.tipLevel==="fl-top" || tip.dataset.tipLevel==="fl-bottom"){
    const thead=tip.closest("thead");
    const rows=thead?[...thead.querySelectorAll("tr")]:[];
    const anchor=tip.dataset.tipLevel==="fl-bottom" && rows[1] ? rows[1] : rows[0];
    if(anchor){
      const anchorRect=anchor.getBoundingClientRect();
      top=anchorRect.top-popRect.height-gap;
    }
  }
  if(top<margin) top=tipRect.bottom+gap;
  top=Math.max(margin,Math.min(top,vpH-popRect.height-margin));
  _tipPopover.style.left=left+"px";
  _tipPopover.style.top=top+"px";
}
function ensureTip(labelId,key,forceLeft=false){
  const label=el(labelId);
  if(!label) return;
  let tip=label.querySelector(".hpf-tip");
  if(!tip){
    tip=document.createElement("span");
    tip.className="hpf-tip";
    tip.tabIndex=0;
    tip.setAttribute("aria-label",t(key));
    tip.textContent="?";
    label.appendChild(tip);
  }
  tip.dataset.tip=t(key);
  tip.setAttribute("aria-label",t(key));
  tip.classList.remove("tip-open-left","tip-open-right");
  if(forceLeft) tip.classList.add("tip-open-left");
  else requestAnimationFrame(()=>orientTip(tip));
}
function setLabelLeadingText(id,key){
  const node=el(id);
  if(!node) return;
  const value=t(key)+" ";
  if(node.firstChild&&node.firstChild.nodeType===Node.TEXT_NODE) node.firstChild.nodeValue=value;
  else node.textContent=t(key);
}
function localizeAircraftUi(){
  setText("aircraftTitle","aircraftTitle");
  setText("btn_addAircraft2","aircraftAdd");
  setText("ac_lbl_matricula","aircraftRegistration"); setPh("ac_matricula","aircraftRegistrationPh");
  setText("ac_lbl_makeModel","aircraftMakeModel"); setPh("ac_makeModel","aircraftMakeModelPh");
  setText("ac_lbl_tipo","aircraftType"); setPh("ac_tipo","aircraftTypePh"); setTitle("ac_tipo","aircraftTypeTip");
  ensureTip("ac_lbl_tipo","aircraftTypeTip");
  setLabelLeadingText("ac_lbl_horoTolerance","aircraftTachTolerance"); setTitle("ac_horoTolerance","aircraftTachToleranceTip"); setTitle("ac_horoTolerance_dot","aircraftTachToleranceDotTip");
  ensureTip("ac_lbl_horoTolerance","aircraftTachToleranceTip");
  setLabelLeadingText("ac_lbl_diffWarn","aircraftDiffWarn"); setTitle("ac_diffWarn","aircraftDiffWarnTip"); setTitle("ac_diffWarn_dot","aircraftDiffWarnDotTip");
  ensureTip("ac_lbl_diffWarn","aircraftDiffWarnTip");
  setLabelLeadingText("ac_lbl_diffAlert","aircraftDiffAlert"); setTitle("ac_diffAlert","aircraftDiffAlertTip"); setTitle("ac_diffAlert_dot","aircraftDiffAlertDotTip");
  ensureTip("ac_lbl_diffAlert","aircraftDiffAlertTip",true);
  setText("ac_lbl_motorId","aircraftEngine"); setPh("ac_motorId","aircraftEnginePh");
  setText("ac_lbl_consumoGalHr","aircraftFuel"); setPh("ac_consumoGalHr","aircraftFuelPh");
  setText("ac_lbl_asientos","aircraftSeats"); setPh("ac_asientos","aircraftSeatsPh");
  setText("ac_lbl_photo","aircraftPhoto"); setTitle("ac_lbl_photo","aircraftPhotoTip");
  ensureTip("ac_lbl_photo","aircraftPhotoTip");
  setText("ac_photo_empty_text","aircraftNoPhoto"); setText("ac_photo_add","aircraftAddPhoto"); setText("ac_photo_replace","aircraftReplacePhoto");
  setText("ac_lbl_owner","aircraftOwner"); setPh("ac_owner","aircraftOwnerPh");
  setText("ac_lbl_ownerAddress","aircraftOwnerAddress"); setPh("ac_owner_address","aircraftOwnerAddressPh");
  setText("ac_lbl_rates","aircraftOperatorRates"); setText("btn_addRate","aircraftAddRate");
  setText("ac_save","aircraftSave"); setText("ac_cancel","rfrCancel");
  if(el("acPhotoTitle")) el("acPhotoTitle").textContent="✦ "+t("aircraftPhoto");
  setText("ac_photo_choose","aircraftChooseFile");
  setText("ac_photo_preview_empty","aircraftPreviewEmpty"); setText("ac_photo_hint","aircraftPhotoCompressionHint");
  setText("acPhoto_cancel","rfrCancel"); setText("acPhoto_ok","aircraftUsePhoto");
}

// ── AUTH ──
function restoreRememberedUsername(){
  const savedEmail=localStorage.getItem("hpfleet_remember_email");
  if(savedEmail){
    el("li_user").value=savedEmail;
    if(el("rememberMe")) el("rememberMe").checked=true;
  } else {
    el("li_user").value="";
    if(el("rememberMe")) el("rememberMe").checked=false;
  }
}

function doLogin(){
  const email=el("li_user").value.trim();
  const pwd=el("li_pass").value;
  const errEl=el("loginErr"); const btn=el("loginBtnTxt");
  errEl.classList.remove("on"); btn.textContent=t("signingIn");
  // Auth against DB users (USERS array loaded from DB at init)
  setTimeout(async ()=>{
    try {
      const _fresh=await sbGet("users","email=eq."+encodeURIComponent(email)+"&limit=1");
      if(_fresh&&_fresh.length){
        const freshUser=_fresh[0];
        const idx=USERS.findIndex(u=>u.id===freshUser.id);
        if(idx>=0) USERS[idx]=freshUser;
        else USERS.push(freshUser);
      }
      const user=USERS.find(u=>String(u.email||"").toLowerCase()===email.toLowerCase()&&u.pwd===pwd);
      if(!user||user.status!=="active"){
        errEl.textContent=!user?t("loginErr"):t("inactiveErr");
        errEl.classList.add("on"); btn.textContent=t("signIn"); return;
      }
      // Remember username
      if(el("rememberMe")&&el("rememberMe").checked){
        localStorage.setItem("hpfleet_remember_email",email);
      } else {
        localStorage.removeItem("hpfleet_remember_email");
      }
      user.lastLogin=new Date().toISOString();
      // Update last_login in DB silently
      sbPatch("users","id=eq."+user.id,{last_login:user.lastLogin}).catch(()=>{});
      currentUser=user;
      USERS.forEach(u=>{ delete u.pwd; });
      viewRole=null;
      if(el("viewAsRole")) el("viewAsRole").value=currentUser.role==="ADMIN"?"ADMIN":currentUser.role;
      addAudit("🔑",user.name,lang==="es"?"inició sesión":"logged in","—");
      await bootApp(_loginLanguageOverride);
    } catch(err){
      errEl.textContent="Login error: "+err.message;
      errEl.classList.add("on"); btn.textContent=t("signIn");
    }
  },400);
}

function doLogout(){
  closeSidePanel();
  addAudit("🚪",currentUser.name,lang==="es"?"cerró sesión":"logged out","—");
  currentUser=null;
  el("appShell").style.display="none";
  el("loginScreen").style.display="flex";
  el("li_pass").value="";
  restoreRememberedUsername();
  el("loginErr").classList.remove("on");
  el("loginBtnTxt").textContent=t("signIn");
}

async function bootApp(loginLanguageOverride=null){
  el("loginScreen").style.display="none";
  el("appShell").style.display="flex";
  await loadUserPreferences();
  if(loginLanguageOverride==="en"||loginLanguageOverride==="es"){
    _userPrefs.language=loginLanguageOverride;
    localStorage.setItem("hpfleet_lang",loginLanguageOverride);
    await persistUserPreferencesNow();
  }
  applyUserPreferences();
  const r=ROLES[currentUser.role];
  el("tbName").textContent=currentUser.name;
  el("tbRoleLabel").textContent=r[lang].label;
  el("tbCompanies").textContent=currentUser.companies.join(" · ");
  el("tbAvatar").textContent=initials(currentUser.name);
  el("tbAvatar").style.color=r.color;
  if(el("viewAsRole")) el("viewAsRole").value="ADMIN";
  viewRole=null;
  applyI18n();
  renderRoleBanner();
  renderTabs();
  renderAll();
  updateApiStatus();
  // Load API key from DB (centralized for all devices)
  await loadApiKeyFromDB();
  await loadAdminCcFromDB();
  // ── v8.5.1: preferences already loaded before shell render ──
  initDebugToggle();
  initAdminCcToggle();
  initViewAsToggle();
  initTooltipPreferences();
  initRoleBannerToggle();
  initStickyHeadersToggle();
  initStickyTabsToggle();
  // Restore active tab from preferences; fall back to role default
  const defaultTab=currentUser.role==="ADMIN"?"users":"flightlog";
  const TAB_IDS=TAB_CONFIG.filter(t=>t.roles.includes(effectiveRole())).map(t=>t.id);
  const savedTab=_userPrefs.active_tab;
  const restoredTab=(savedTab && TAB_IDS.includes(savedTab)) ? savedTab : defaultTab;
  switchTab(restoredTab);
  // Load billing cycle history
  await loadAllBatches();
  // Load batch from DB
  dbg("Loading batch from database…","info");
  const hasBatch=await loadBatchFromDB();
  if(hasBatch){
    if(el("srcBar")) el("srcBar").style.display="grid";
    if(el("reviewSection")) el("reviewSection").style.display="block";
    updateSrcBar();
    renderWfBar(); setupFlRoleUI(); renderFlTable(); renderFlAudit();
    showToast("Batch restored from database","info");
  }
}

// ── TABS ──
const TAB_CONFIG=[
  {id:"users",     icon:"👥",labelKey:"tabUsers",     roles:["ADMIN"]},
  {id:"companies", icon:"🏢",labelKey:"tabCompanies", roles:["ADMIN"]},
  {id:"aircraft",  icon:"✈️",labelKey:"tabAircraft",  roles:["ADMIN","OPERATOR"]},
  {id:"flightlog", icon:"📋",labelKey:"tabFlightLog", roles:["ADMIN","OPERATOR","REVIEWER","READONLY"]},
  {id:"preinvoice",icon:"💳",labelKey:"tabBilling",   roles:["ADMIN","REVIEWER","OPERATOR","READONLY"]},
  {id:"settings",  icon:"⚙️",labelKey:"tabSettings",  roles:["ADMIN","OPERATOR","REVIEWER","READONLY"]},
];

function renderTabs(){
  const nav=el("tabNav"); nav.innerHTML="";
  TAB_CONFIG.filter(tab=>tab.roles.includes(effectiveRole())).forEach(tab=>{
    const btn=document.createElement("button");
    btn.className="tab-btn"+(activeTab===tab.id?" active":"");
    btn.innerHTML='<span class="tab-icon">'+tab.icon+"</span>"+t(tab.labelKey);
    btn.addEventListener("click",()=>switchTab(tab.id));
    nav.appendChild(btn);
  });
}

function switchTab(id){
  if(id!=="flightlog" && el("sidePanel")&&el("sidePanel").classList.contains("open")){
    spGuardDirty(()=>{ closeSidePanel(); _doSwitchTab(id); });
    return;
  }
  _doSwitchTab(id);
}
function _doSwitchTab(id){
  activeTab=id;
  saveUserPreference("active_tab", id);
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
  const panel=el("panel-"+id);
  if(panel) panel.classList.add("active");
  renderTabs();
  // Refresh batch list when entering flight log or pre-invoice
  if(id==="flightlog"||id==="preinvoice") loadAllBatches();
}

// ── ROLE BANNER ──
function renderRoleBanner(){
  const r=ROLES[currentUser.role]; const rd=r[lang];
  const coNames=currentUser.companies.map(code=>{
    const co=COMPANIES.find(c=>c.code===code); return co?co.name:code;
  }).join(", ");
  const permsHtml=rd.perms.map(p=>'<span class="perm-tag">✓ '+p+"</span>").join("");
  el("roleBanner").innerHTML='<div class="role-banner '+r.bannerClass+'" style="margin:20px 24px 0">'+
    '<div class="rb-icon">'+r.icon+"</div>"+
    "<div>"+
    '<div class="rb-role">'+rd.label+"</div>"+
    '<div class="rb-name">'+currentUser.name+"</div>"+
    '<div class="rb-co">'+coNames+"</div>"+
    '<div class="rb-desc">'+rd.desc+"</div>"+
    '<div class="rb-perms">'+permsHtml+"</div>"+
    "</div></div>";
}

// ── SETTINGS / API KEY ──
let _cachedApiKey="";

async function loadApiKeyFromDB(){
  try {
    const rows=await sbGet("settings","key=eq.anthropic_api_key");
    if(rows&&rows.length&&rows[0].value){
      _cachedApiKey=rows[0].value;
      localStorage.setItem("hpfleet_apikey",_cachedApiKey);
      dbg("API key loaded from DB","ok");
    } else {
      // Fall back to localStorage
      _cachedApiKey=localStorage.getItem("hpfleet_apikey")||"";
      if(_cachedApiKey) dbg("API key loaded from localStorage","info");
    }
  } catch(err){
    _cachedApiKey=localStorage.getItem("hpfleet_apikey")||"";
    dbg("API key DB load failed, using localStorage: "+err.message,"warn");
  }
  updateApiStatus();
}

function getApiKey(){ return _cachedApiKey||localStorage.getItem("hpfleet_apikey")||""; }

async function loadAdminCcFromDB(){
  try{
    const rows=await sbGet("settings","key=eq.admin_cc_enabled");
    _adminCcEnabled=rows&&rows.length&&rows[0].value==="1";
  } catch(err){
    _adminCcEnabled=false;
    dbg("Admin CC setting load failed: "+err.message,"warn");
  }
  const chk=el("adminCcToggleCheck");
  const lbl=el("adminCcToggleLabel");
  if(chk) chk.checked=_adminCcEnabled;
  setToggleLabel(lbl,_adminCcEnabled);
}

async function saveAdminCcToDB(val){
  if(!currentUser||currentUser.role!=="ADMIN") return;
  try{
    const rows=await sbGet("settings","key=eq.admin_cc_enabled");
    if(rows&&rows.length){
      await sbPatch("settings","key=eq.admin_cc_enabled",{value:val?"1":"0"});
    } else {
      await sbPost("settings",{key:"admin_cc_enabled",value:val?"1":"0"});
    }
    dbg("Admin CC setting saved: "+val,"ok");
  } catch(err){
    dbg("Admin CC setting save failed: "+err.message,"warn");
  }
}

function updateApiStatus(){
  const key=getApiKey();
  const badge=el("apiStatusBadge");
  const isAdmin=currentUser&&(currentUser.role==="ADMIN");
  if(badge){
    badge.textContent=key?t("apiOk"):t("apiMissing");
    badge.className="api-status "+(key?"api-ok":"api-missing");
  }
  // Non-admin sees masked configured status only
  if(el("apiKeyInput")){
    if(!isAdmin){
      el("apiKeyInput").value=key?t("apiConfiguredByAdmin"):"";
      el("apiKeyInput").readOnly=true;
      el("apiKeyInput").style.color="var(--dim2)";
    } else {
      el("apiKeyInput").value=key?"••••••••••••••":"";
      el("apiKeyInput").readOnly=false;
      el("apiKeyInput").style.color="";
    }
  }
  if(el("btn_saveApiKey")) el("btn_saveApiKey").style.display=isAdmin?"":"none";
  if(el("btn_clearApiKey")) el("btn_clearApiKey").style.display=isAdmin?"":"none";
  const warn=el("apiWarn");
  if(warn){ if(!key) warn.classList.add("on"); else warn.classList.remove("on"); }
}

async function saveApiKey(){
  if(!currentUser||currentUser.role!=="ADMIN") return;
  const val=el("apiKeyInput").value.trim();
  if(!val||val.startsWith("•")){ showToast(t("enterValidApiKey"),"err"); return; }
  _cachedApiKey=val;
  localStorage.setItem("hpfleet_apikey",val);
  // Save to DB settings table
  try {
    await sbDelete("settings","key=eq.anthropic_api_key");
    await sbPost("settings",{key:"anthropic_api_key",value:val});
    dbg("API key saved to DB","ok");
  } catch(e){ dbg("API key DB save error: "+e.message,"err"); }
  el("apiKeyInput").value="••••••••••••••";
  updateApiStatus();
  showToast(t("keySaved"));
}

async function clearApiKey(){
  if(!currentUser||currentUser.role!=="ADMIN") return;
  _cachedApiKey="";
  localStorage.removeItem("hpfleet_apikey");
  try {
    await sbDelete("settings","key=eq.anthropic_api_key");
    dbg("API key cleared from DB","ok");
  } catch(e){ dbg("API key DB clear error: "+e.message,"err"); }
  if(el("apiKeyInput")) el("apiKeyInput").value="";
  updateApiStatus();
  showToast(t("keyCleared"),"warn");
}

// ── USER STATS ──
function renderUserStats(){
  const roles=["ADMIN","OPERATOR","REVIEWER","READONLY"];
  const cls={ADMIN:"sc-admin",OPERATOR:"sc-op",REVIEWER:"sc-rev",READONLY:"sc-ro"};
  const active=USERS.filter(u=>u.status==="active").length;
  let html='<div class="scard sc-tot"><div class="sc-l">Total</div><div class="sc-v">'+USERS.length+"</div>"+
    '<div class="sc-s">'+active+" "+t("active")+"</div></div>";
  roles.forEach(r=>{
    const cnt=USERS.filter(u=>u.role===r).length;
    const act=USERS.filter(u=>u.role===r&&u.status==="active").length;
    html+='<div class="scard '+cls[r]+'"><div class="sc-l">'+ROLES[r][lang].label+"</div>"+
      '<div class="sc-v">'+cnt+"</div>"+
      '<div class="sc-s">'+act+" "+t("active")+"</div></div>";
  });
  el("userStats").innerHTML=html;
}

function populateCompanyFilter(){
  const sel=el("filterCompany"); const cur=sel.value;
  sel.innerHTML='<option value="ALL">'+t("allCompanies")+"</option>";
  COMPANIES.forEach(co=>{
    const opt=document.createElement("option");
    opt.value=co.code; opt.textContent=co.code+" — "+co.name;
    sel.appendChild(opt);
  });
  sel.value=cur||"ALL";
}

function getFilteredUsers(){
  const q=el("userSearch").value.toLowerCase();
  const r=el("filterRole").value;
  const co=el("filterCompany").value;
  const s=el("filterStatus").value;
  return USERS.filter(u=>{
    const mq=!q||u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q);
    return mq&&(r==="ALL"||u.role===r)&&(co==="ALL"||(u.companies||[]).includes(co))&&(s==="ALL"||u.status===s);
  });
}

function renderUsers(){
  renderUserStats(); populateCompanyFilter();
  let list=getFilteredUsers();
  // Apply sort
  if(userSortCol){
    list=[...list].sort((a,b)=>{
      let av=a[userSortCol]||"", bv=b[userSortCol]||"";
      if(Array.isArray(av)) av=av.join(",");
      if(Array.isArray(bv)) bv=bv.join(",");
      return String(av).localeCompare(String(bv))*userSortDir;
    });
  }
  // Update header indicators
  document.querySelectorAll("[data-sort-user]").forEach(th=>{
    const col=th.dataset.sortUser;
    const base=th.textContent.replace(/ [▲▼]$/,"");
    th.textContent=base+(userSortCol===col?(userSortDir===1?" ▲":" ▼"):"");
  });
  el("userCount").textContent=t("showing")+" "+list.length+" "+t("of")+" "+USERS.length+" "+t("users");
  const tbody=el("userTbody"); tbody.innerHTML="";
  if(!list.length){
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:24px;font-family:var(--mono);font-size:11px;color:var(--dim)">'+t("noResults")+"</td></tr>"; return;
  }
  list.forEach(u=>{
    const r=ROLES[u.role]; const isSelf=currentUser&&u.id===currentUser.id;
    const tr=document.createElement("tr");
    tr.className=u.status==="inactive"?"row-inactive":"";
    const coTagsHtml=(u.companies||[]).map(code=>{
      const color=coColor(code);
      return '<span class="co-tag" style="color:'+color+';border-color:'+color+'40;background:'+color+'12">'+code+"</span>";
    }).join("");
    tr.innerHTML='<td><div class="u-cell">'+
      '<div class="u-av" style="background:'+r.avatarBg+';color:'+r.color+'">'+initials(u.name)+"</div>"+
      "<div>"+
      '<div class="u-name">'+u.name+(isSelf?' <span style="font-family:var(--mono);font-size:9px;color:var(--dim)">(me)</span>':"")+
      "</div>"+
      '<div class="u-email">'+u.email+"</div>"+
      '<div class="u-companies">'+coTagsHtml+"</div>"+
      "</div></div></td>"+
      '<td><button type="button" class="role-chip role-chip-btn '+r.chipClass+'" data-role-rights="'+u.role+'">'+r[lang].label+"</button></td>"+
      '<td><div style="display:flex;gap:4px;flex-wrap:wrap">'+coTagsHtml+"</div></td>"+
      '<td><button class="sp '+(u.status==="active"?"sp-on":"sp-off")+'" data-uid="'+u.id+'" '+(isSelf?"disabled":"")+'>'+
      (u.status==="active"?t("active"):t("inactive"))+"</button></td>"+
      '<td style="font-family:var(--mono);font-size:11px;color:var(--dim2)">'+
      (u.created||"—")+"</td>"+
      '<td style="font-family:var(--mono);font-size:11px;color:var(--dim2)">'+
      (u.lastLogin?new Date(u.lastLogin).toLocaleString(lang==="es"?"es-PA":"en-US"):t("never"))+"</td>"+
      '<td><div class="act-cell">'+
      '<button class="btn-sm" data-edit-user="'+u.id+'">'+t("edit")+"</button>"+
      '<button class="btn-sm del" data-del-user="'+u.id+'" '+(isSelf?"disabled":"")+'>'+t("del")+"</button>"+
      "</div></td>";
    tbody.appendChild(tr);
  });
}

function toggleUserStatus(id){
  const u=USERS.find(x=>x.id===id); if(!u) return;
  if(currentUser.id===id){showToast(t("cantDeactivateSelf"),"err");return;}
  u.status=u.status==="active"?"inactive":"active";
  sbPatch("users","id=eq."+u.id,{status:u.status})
    .then(()=>dbg("User status updated: "+u.name+" → "+u.status,"ok"))
    .catch(e=>dbg("User status error: "+e.message,"err"));
  addAudit("🔄",currentUser.name,(lang==="es"?"cambió estado":"toggled status"),u.name+" → "+t(u.status));
  renderUsers(); showToast(t("statusUpdated"));
}

// ── CREATE/EDIT USER ──
function openCreateUser(){
  editingUserId=null; clearUserErrors();
  el("umTitle").textContent=t("umNewTitle");
  el("um_name").value=""; el("um_email").value="";
  if(el("um_phone")) el("um_phone").value="";
  el("um_role").value="OPERATOR"; el("um_status").value="active"; el("um_pwd").value="";
  el("um_lbl_pwd").textContent=t("umPassword");
  el("um_pwd_hint").style.display="block";
  localizeUserUi();
  buildCompanyCheckboxes([]);
  updateRoleDesc();
  openModal("userMbd");
}

function openEditUser(id){
  const u=USERS.find(x=>x.id===id); if(!u) return;
  editingUserId=id; clearUserErrors();
  el("umTitle").textContent=t("umEditTitlePrefix")+u.name;
  el("um_name").value=u.name; el("um_email").value=u.email;
  if(el("um_phone")) el("um_phone").value=u.phone||"";
  el("um_role").value=u.role; el("um_status").value=u.status; el("um_pwd").value="";
  el("um_lbl_pwd").textContent=t("umNewPassword");
  el("um_pwd_hint").style.display="none";
  localizeUserUi();
  buildCompanyCheckboxes(u.companies||[]);
  updateRoleDesc();
  openModal("userMbd");
}

function buildCompanyCheckboxes(selected){
  const wrap=el("um_companies_chk"); wrap.innerHTML="";
  COMPANIES.filter(co=>co.status==="active").forEach(co=>{
    const isChecked=selected.includes(co.code);
    const label=document.createElement("label");
    label.className="chk-item"+(isChecked?" checked":"");
    label.innerHTML='<input type="checkbox" value="'+co.code+'"'+(isChecked?" checked":"")+'>'+co.code+" — "+co.name;
    label.querySelector("input").addEventListener("change",function(){
      label.classList.toggle("checked",this.checked);
    });
    wrap.appendChild(label);
  });
}

function getSelectedCompanies(){
  return Array.from(el("um_companies_chk").querySelectorAll("input[type=checkbox]:checked")).map(cb=>cb.value);
}

function updateRoleDesc(){
  const role=el("um_role").value;
  const descs={ADMIN:t("roleDescAdmin"),OPERATOR:t("roleDescOperator"),REVIEWER:t("roleDescReviewer"),READONLY:t("roleDescReadonly")};
  el("roleDesc").textContent=descs[role]||"";
}
function openRoleRights(role){
  const r=ROLES[role];
  if(!r) return;
  const rd=r[lang];
  if(el("rrTitle")) el("rrTitle").textContent=t("roleRightsTitle");
  if(el("rrSub")) el("rrSub").textContent=t("roleRightsIncluded");
  if(el("rr_done")) el("rr_done").textContent=t("close");
  if(el("rrIcon")) el("rrIcon").textContent=r.icon;
  if(el("rrRole")) el("rrRole").textContent=rd.label;
  if(el("rrDesc")) el("rrDesc").textContent=rd.desc;
  const list=el("rrList");
  if(list){
    list.innerHTML="";
    rd.perms.forEach(perm=>{
      const li=document.createElement("li");
      li.textContent=perm;
      list.appendChild(li);
    });
  }
  openModal("roleRightsMbd");
}

function saveUser(){
  clearUserErrors();
  const name=el("um_name").value.trim(), email=el("um_email").value.trim();
  const role=el("um_role").value, status=el("um_status").value, pwd=el("um_pwd").value;
  const phone=el("um_phone")?el("um_phone").value.trim():"";
  const companies=getSelectedCompanies();
  let ok=true;
  if(!name){setFerr("ume_name","um_name",t("required"));ok=false;}
  if(!email){setFerr("ume_email","um_email",t("required"));ok=false;}
  else if(USERS.find(u=>u.email===email&&u.id!==editingUserId)){setFerr("ume_email","um_email",t("emailExists"));ok=false;}
  if(!companies.length){const e=el("ume_companies");e.textContent=t("noCompanySelected");e.classList.add("on");ok=false;}
  if(!editingUserId&&pwd.length<6){setFerr("ume_pwd","um_pwd",t("pwdShort"));ok=false;}
  if(editingUserId&&pwd&&pwd.length<6){setFerr("ume_pwd","um_pwd",t("pwdShort"));ok=false;}
  if(!ok) return;
  if(editingUserId){
    const u=USERS.find(x=>x.id===editingUserId);
    const changes=[];
    if(u.name!==name) changes.push('name→"'+name+'"');
    if(u.role!==role) changes.push("role→"+ROLES[role][lang].label);
    if(u.status!==status) changes.push("status→"+t(status));
    if(JSON.stringify(u.companies)!==JSON.stringify(companies)) changes.push("companies→["+companies.join(",")+"]");
    if(pwd) changes.push("password updated");
    u.name=name; u.email=email; u.role=role; u.status=status; u.phone=phone; u.companies=companies;
    if(pwd) u.pwd=pwd;
    sbPatch("users","id=eq."+u.id,{
      name:u.name, email:u.email, role:u.role, status:u.status,
      phone:u.phone||"", companies:u.companies,
      ...(pwd?{pwd}:{})
    }).then(()=>dbg("User updated in DB: "+u.name,"ok"))
      .catch(e=>dbg("User update error: "+e.message,"err"));
    addAudit("✏️",currentUser.name,(lang==="es"?"editó usuario":"edited user"),u.name+(changes.length?" ("+changes.join(", ")+")":""));
    showToast(t("userUpdated"));
  } else {
    const nu={id:"u"+nextUserId++,name,email,pwd,role,status,phone,companies,created:new Date().toISOString().slice(0,10),lastLogin:null};
    USERS.push(nu);
    sbPost("users",{id:nu.id,name,email,pwd,role,status,phone:phone||"",companies,
      created:nu.created,last_login:null})
      .then(()=>dbg("User created in DB: "+name,"ok"))
      .catch(e=>dbg("User create error: "+e.message,"err"));
    addAudit("➕",currentUser.name,(lang==="es"?"creó usuario":"created user"),name+" ("+email+") — "+ROLES[role][lang].label+" ["+companies.join(",")+"]");
    showToast(t("userCreated"));
  }
  closeModal("userMbd"); renderUsers();
}

function openDeleteUser(id){
  const u=USERS.find(x=>x.id===id); if(!u) return;
  if(currentUser.id===id){showToast(t("cantDelSelf"),"err");return;}
  deletingId=id; deleteType="user";
  el("delWarn").innerHTML=t("delUserWarn")+" <strong>"+u.name+"</strong> ("+u.email+")"+t("delUserWarn2");
  el("del_confirm").textContent=t("deleteUser");
  openModal("delMbd");
}

function confirmDelete(){
  if(!currentUser||currentUser.role!=="ADMIN") return;
  if(deleteType==="user"){
    const u=USERS.find(x=>x.id===deletingId); if(!u) return;
    USERS.splice(USERS.indexOf(u),1);
    sbDelete("users","id=eq."+u.id).catch(e=>dbg("User delete error: "+e.message,"err"));
    addAudit("🗑️",currentUser.name,(lang==="es"?"eliminó usuario":"deleted user"),u.name+" ("+u.email+")");
    closeModal("delMbd"); renderUsers(); showToast(t("userDeleted"),"warn");
  } else if(deleteType==="company"){
    const co=COMPANIES.find(x=>x.id===deletingId); if(!co) return;
    COMPANIES.splice(COMPANIES.indexOf(co),1);
    sbDelete("companies","id=eq."+co.id).catch(e=>dbg("Company delete error: "+e.message,"err"));
    addAudit("🗑️",currentUser.name,(lang==="es"?"eliminó compañía":"deleted company"),co.name);
    closeModal("delMbd"); renderCompanies(); showToast(t("companyDeleted"),"warn");
  } else if(deleteType==="aircraft"){
    const ac=AIRCRAFT.find(x=>x.id===deletingId); if(!ac) return;
    AIRCRAFT.splice(AIRCRAFT.indexOf(ac),1);
    sbDelete("aircraft","id=eq."+ac.id).catch(e=>dbg("Aircraft delete error: "+e.message,"err"));
    closeModal("delMbd"); renderFleetSettings(); renderAircraftTab(); showToast(t("aircraftDeletedToast"),"warn");
    initBatchConstants();
  }
  deletingId=null; deleteType=null;
}

function clearUserErrors(){
  ["name","email","pwd","companies"].forEach(f=>{
    const e=el("ume_"+f); const i=el("um_"+f);
    if(e){e.textContent="";e.classList.remove("on");}
    if(i&&i.classList) i.classList.remove("err");
  });
}

function setFerr(errId,inputId,msg){
  const e=el(errId); if(!e) return;
  e.textContent=msg; e.classList.add("on");
  const inp=el(inputId); if(inp&&inp.classList) inp.classList.add("err");
}

// ── COMPANIES ──
function billingUnitLabel(unit){
  if(unit==="per Flight Hour"||unit==="/ TBH") return t("coUnitTbh");
  if(unit==="per Flight"||unit==="/ Flight") return t("coUnitFlight");
  if(unit==="flat") return t("coUnitFlat");
  return unit||"";
}
function renderCompanies(){
  const active=COMPANIES.filter(c=>c.status==="active").length;
  el("coStats").innerHTML='<div class="scard sc-tot"><div class="sc-l">'+t("coCardTotal")+'</div><div class="sc-v">'+COMPANIES.length+"</div>"+
    '<div class="sc-s">'+active+" "+t("coCardActive")+"</div></div>";
  el("coGrid").innerHTML="";
  COMPANIES.forEach(co=>{
    const color=coColor(co.code);
    const card=document.createElement("div");
    card.className="co-card"+(co.status==="inactive"?" co-inactive":"");
    const rulesHtml=co.billingRules&&co.billingRules.length
      ?co.billingRules.map(r=>'<div class="br-item"><span class="br-name">'+r.name+"</span>"+
        '<span class="br-val">'+(r.type==="discount"&&r.discountMode==="pct"?r.amount+"%":"$"+r.amount.toFixed(2))+"</span>"+
        '<span class="br-unit">'+(r.type==="discount"?t("coDiscount"):billingUnitLabel(r.unit))+"</span>"+
        '<span style="color:'+( r.active?"var(--green)":"var(--dim)")+';font-size:8px">●</span></div>').join("")
      :'<div class="br-empty">'+t("noRules")+"</div>";
    card.innerHTML='<div class="co-stripe" style="background:'+color+'"></div>'+
      '<div class="co-card-header">'+
      '<div class="co-card-name">'+co.name+"</div>"+
      '<span class="co-card-code" style="color:'+color+';border-color:'+color+'50;background:'+color+'15">'+co.code+"</span>"+
      "</div>"+
      '<div class="co-card-body">'+
      '<div class="co-row"><span class="co-row-label">'+t("coCardStatus")+'</span>'+
      '<span class="co-row-val">'+(co.status==="active"?t("active").toLowerCase():t("inactive").toLowerCase())+"</span></div>"+
      (co.address?'<div class="co-row"><span class="co-row-label">'+t("coCardAddress")+'</span><span class="co-row-val" style="color:var(--dim2);font-size:10px">'+co.address+"</span></div>":"")+
      (co.phone?'<div class="co-row"><span class="co-row-label">'+t("coCardPhone")+'</span><span class="co-row-val">'+co.phone+"</span></div>":"")+
      (co.adminContact?'<div class="co-row"><span class="co-row-label">'+t("coCardContact")+'</span><span class="co-row-val" style="color:var(--cyan);font-size:10px">'+co.adminContact+"</span></div>":"")+
      (co.notes?'<div class="co-row"><span class="co-row-label">'+t("coCardNotes")+"</span>"+
      '<span class="co-row-val" style="color:var(--dim2);font-size:10px">'+co.notes+"</span></div>":"")+
      '<div style="margin-top:10px">'+
      '<div class="co-row-label" style="margin-bottom:6px">'+t("coCardBillingRules")+"</div>"+
      '<div class="br-list">'+rulesHtml+"</div></div></div>"+
      '<div class="co-card-footer">'+
      '<button class="btn-sm" data-edit-co="'+co.id+'">'+t("edit")+"</button>"+
      '<button class="btn-sm" data-toggle-co="'+co.id+'">'+(co.status==="active"?t("coDeactivate"):t("coActivate"))+"</button>"+
      '<button class="btn-sm del" data-del-co="'+co.id+'">'+t("del")+"</button>"+
      "</div>";
    el("coGrid").appendChild(card);
  });
}

function toggleCompanyStatus(id){
  const co=COMPANIES.find(x=>x.id===id); if(!co) return;
  co.status=co.status==="active"?"inactive":"active";
  sbPatch("companies","id=eq."+co.id,{status:co.status}).catch(e=>dbg("Company status error: "+e.message,"err"));
  addAudit("🔄",currentUser.name,(lang==="es"?"cambió estado compañía":"toggled company"),co.name+" → "+co.status);
  renderCompanies(); showToast(t("statusUpdated"));
}

function openDeleteCompany(id){
  const co=COMPANIES.find(x=>x.id===id); if(!co) return;
  deletingId=id; deleteType="company";
  el("delWarn").innerHTML=t("delCoWarn")+" <strong>"+co.name+"</strong>"+t("delCoWarn2");
  el("del_confirm").textContent=t("deleteCompany");
  openModal("delMbd");
}

function _syncInvChkStyles(){
  ["co_inv_addr","co_inv_phone","co_inv_notes","co_inv_rate"].forEach(id=>{
    const cb=el(id); const lbl=el(id+"_lbl");
    if(cb&&lbl) lbl.classList.toggle("checked",cb.checked);
  });
}

function openCreateCompany(){
  editingCoId=null; tempRules=[]; clearCoErrors();
  el("coModalTitle").textContent=t("coNewTitle");
  el("co_name").value=""; el("co_code").value="";
  el("co_status").value="active"; el("co_notes").value="";
  if(el("co_address")) el("co_address").value="";
  if(el("co_phone")) el("co_phone").value="";
  if(el("co_inv_addr")) el("co_inv_addr").checked=true;
  if(el("co_inv_phone")) el("co_inv_phone").checked=true;
  if(el("co_inv_notes")) el("co_inv_notes").checked=false;
  if(el("co_inv_rate")) el("co_inv_rate").checked=true;
  _syncInvChkStyles();
  tempContacts=[]; renderTempContacts();
  renderTempRules(); openModal("coMbd");
}

function openEditCompany(id){
  const co=COMPANIES.find(x=>x.id===id); if(!co) return;
  editingCoId=id; tempRules=JSON.parse(JSON.stringify(co.billingRules||[])); clearCoErrors();
  el("coModalTitle").textContent=t("coEditTitle")+co.name;
  el("co_name").value=co.name; el("co_code").value=co.code;
  el("co_status").value=co.status; el("co_notes").value=co.notes||"";
  if(el("co_address")) el("co_address").value=co.address||"";
  if(el("co_phone")) el("co_phone").value=co.phone||"";
  if(el("co_inv_addr")) el("co_inv_addr").checked=co.inv_show_address!==false;
  if(el("co_inv_phone")) el("co_inv_phone").checked=co.inv_show_phone!==false;
  if(el("co_inv_notes")) el("co_inv_notes").checked=co.inv_show_notes===true;
  if(el("co_inv_rate")) el("co_inv_rate").checked=co.inv_show_rate!==false;
  _syncInvChkStyles();
  tempContacts=JSON.parse(JSON.stringify(co.contacts||[]));
  renderTempContacts(); renderTempRules(); openModal("coMbd");
}

function renderTempRules(){
  const wrap=el("co_rules_list");
  if(!tempRules.length){wrap.innerHTML='<div class="br-empty">'+t("noRules")+"</div>";return;}
  wrap.innerHTML="";
  const INP="background:var(--s2);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);border-radius:2px;outline:none";
  const SEL=INP+";font-size:10px;padding:4px 5px";
  const BTN="font-family:var(--mono);font-size:9px;padding:5px 8px;background:transparent;border-radius:2px;cursor:pointer";
  tempRules.forEach((r,i)=>{
    const isDisc=r.type==="discount";
    // ── Row 1 ─────────────────────────────────────────────────────────────
    const row=document.createElement("div");
    if(isDisc){
      // Discount Row 1: name(1fr) | amount(52px) | mode(46px) | base(64px) | type(60px)
      // ON/OFF and ✕ moved to Row 2 to free width for name input
      row.style.cssText="margin-bottom:2px;display:grid;grid-template-columns:1fr 52px 46px 64px 60px;gap:6px;align-items:center";
    } else {
      row.style.cssText="margin-bottom:8px;display:grid;grid-template-columns:1fr 80px auto auto auto;gap:8px;align-items:center";
    }
    const modeOpts=isDisc?'<option value="pct"'+(r.discountMode==="pct"?" selected":"")+'>%</option><option value="fixed"'+(r.discountMode==="fixed"?" selected":"")+'>$</option>':"";
    const baseOpts=isDisc?'<option value="subtotal"'+((!r.discountBase||r.discountBase==="subtotal")?" selected":"")+'>'+t("discOfSubtotal")+'</option><option value="total"'+(r.discountBase==="total"?" selected":"")+'>'+t("discOfTotal")+'</option>':"";
    row.innerHTML=
      '<input style="'+INP+';font-size:11px;padding:6px 8px;width:100%" value="'+r.name+'" placeholder="'+t("coRuleNamePh")+'">'+
      '<input type="number" style="'+INP+';font-size:11px;padding:4px 6px;width:'+(isDisc?"52":"80")+'px;text-align:right" value="'+r.amount+'" step="'+(isDisc?"1":"0.01")+'" min="0">'+
      (isDisc?'<select style="'+SEL+';color:var(--violet)">'+modeOpts+'</select>':"")+
      (isDisc?'<select style="'+SEL+';color:var(--dim2)">'+baseOpts+'</select>':"")+
      '<select style="'+SEL+';color:'+(isDisc?"var(--violet)":"var(--text)")+'">'+
        '<option value="per Flight Hour"'+((!r.type||r.type==="charge")&&(r.unit==="per Flight Hour"||r.unit==="/ TBH")?" selected":"")+'>'+t("coUnitTbh")+'</option>'+
        '<option value="per Flight"'+((!r.type||r.type==="charge")&&(r.unit==="per Flight"||r.unit==="/ Flight")?" selected":"")+'>'+t("coUnitFlight")+'</option>'+
        '<option value="flat"'+((!r.type||r.type==="charge")&&r.unit==="flat"?" selected":"")+'>'+t("coUnitFlat")+'</option>'+
        '<option value="discount"'+(isDisc?" selected":"")+'>'+t("coUnitDiscount")+'</option>'+
      '</select>'+
      // Charge rules keep ON/OFF and ✕ on Row 1
      (!isDisc?'<button style="'+BTN+';border:1px solid '+(r.active?"rgba(61,220,132,.4)":"var(--border2)")+';color:'+(r.active?"var(--green)":"var(--dim)")+'">'+(r.active?t("coRuleOn"):t("coRuleOff"))+'</button>':"")+
      (!isDisc?'<button style="'+BTN+';border:1px solid var(--border2);color:var(--red)">✕</button>':"");
    // ── Row 2 — discount only ─────────────────────────────────────────────
    if(isDisc){
      // Row 2: [☑ Show breakdown] [Validity days] [days#] [ON] [✕]
      const sub=document.createElement("div");
      sub.style.cssText="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;margin-bottom:8px;background:rgba(178,141,255,.05);border:1px solid rgba(178,141,255,.2);border-left:2px solid var(--violet);padding:5px 8px;border-radius:0 0 2px 2px";
      sub.innerHTML=
        '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-family:var(--mono);font-size:9px;color:var(--violet);white-space:nowrap;flex-shrink:0">'+
          '<input type="checkbox"'+(r.showDiscountLine?" checked":"")+' style="accent-color:var(--violet)"> '+t("showDiscLine")+
        '</label>'+
        '<span style="font-family:var(--mono);font-size:9px;color:var(--dim2);white-space:nowrap;flex-shrink:0">'+t("paymentDays")+'</span>'+
        '<input type="number" min="0" step="1" value="'+(r.paymentWindowDays||0)+'" style="'+INP+';font-size:10px;padding:3px 5px;width:44px;text-align:right;flex-shrink:0">'+
        '<span style="flex:1"></span>'+
        '<button style="'+BTN+';border:1px solid '+(r.active?"rgba(61,220,132,.4)":"var(--border2)")+';color:'+(r.active?"var(--green)":"var(--dim)")+';flex-shrink:0">'+(r.active?t("coRuleOn"):t("coRuleOff"))+'</button>'+
        '<button style="'+BTN+';border:1px solid var(--border2);color:var(--red);flex-shrink:0">✕</button>';
      sub.querySelector("input[type=checkbox]").addEventListener("change",function(){tempRules[i].showDiscountLine=this.checked;});
      sub.querySelector("input[type=number]").addEventListener("input",function(){tempRules[i].paymentWindowDays=parseInt(this.value)||0;});
      sub.querySelectorAll("button")[0].addEventListener("click",()=>{tempRules[i].active=!tempRules[i].active;renderTempRules();});
      sub.querySelectorAll("button")[1].addEventListener("click",()=>{tempRules.splice(i,1);renderTempRules();});
      wrap.appendChild(row);
      wrap.appendChild(sub);
    } else {
      wrap.appendChild(row);
    }
    // ── Event listeners ───────────────────────────────────────────────────
    row.querySelector("input:first-child").addEventListener("input",function(){tempRules[i].name=this.value;});
    row.querySelectorAll("input")[1].addEventListener("input",function(){tempRules[i].amount=parseFloat(this.value)||0;});
    const selects=row.querySelectorAll("select");
    const typeSelIdx=isDisc?2:0;
    if(isDisc){
      selects[0].addEventListener("change",function(){tempRules[i].discountMode=this.value;});
      selects[1].addEventListener("change",function(){tempRules[i].discountBase=this.value;});
    } else {
      // Charge rule ON/OFF and ✕ listeners
      const btns=row.querySelectorAll("button");
      btns[0].addEventListener("click",()=>{tempRules[i].active=!tempRules[i].active;renderTempRules();});
      btns[1].addEventListener("click",()=>{tempRules.splice(i,1);renderTempRules();});
    }
    selects[typeSelIdx].addEventListener("change",function(){
      if(this.value==="discount"){
        const alreadyHasDiscount=tempRules.some((r,j)=>j!==i&&r.type==="discount");
        if(alreadyHasDiscount){showToast(t("oneDiscountOnly"),"err");this.value=tempRules[i].unit||"per Flight Hour";return;}
        tempRules[i].type="discount";
        tempRules[i].discountMode=tempRules[i].discountMode||"pct";
        tempRules[i].discountBase=tempRules[i].discountBase||"subtotal";
        tempRules[i].showDiscountLine=tempRules[i].showDiscountLine??false;
        tempRules[i].paymentWindowDays=tempRules[i].paymentWindowDays??0;
        tempRules[i].footerText=tempRules[i].footerText||"";
      } else {
        tempRules[i].type="charge";
        tempRules[i].unit=this.value;
      }
      renderTempRules();
    });
  });
}
function addBillingRuleRow(){
  tempRules.push({id:"br"+nextRuleId++,name:"",amount:0,unit:"per Flight Hour",type:"charge",active:true});
  renderTempRules();
}

function saveCompany(){
  clearCoErrors();
  const name=el("co_name").value.trim(), code=el("co_code").value.trim().toUpperCase();
  const status=el("co_status").value, notes=el("co_notes").value.trim();
  const address=el("co_address")?el("co_address").value.trim():"";
  const phone=el("co_phone")?el("co_phone").value.trim():"";
  const inv_show_address=el("co_inv_addr")?el("co_inv_addr").checked:true;
  const inv_show_phone=el("co_inv_phone")?el("co_inv_phone").checked:true;
  const inv_show_notes=el("co_inv_notes")?el("co_inv_notes").checked:false;
  const inv_show_rate=el("co_inv_rate")?el("co_inv_rate").checked:true;
  let ok=true;
  if(!name){setFerr("coe_name","co_name",t("required"));ok=false;}
  if(!code){setFerr("coe_code","co_code",t("required"));ok=false;}
  else if(COMPANIES.find(c=>c.code===code&&c.id!==editingCoId)){setFerr("coe_code","co_code",t("codeExists"));ok=false;}
  if(!ok) return;
  const data={name,code,status,notes,address,phone,inv_show_address,inv_show_phone,inv_show_notes,inv_show_rate,contacts:tempContacts,billingRules:tempRules};
  if(editingCoId){
    const co=COMPANIES.find(x=>x.id===editingCoId); Object.assign(co,data);
    // Reset invoice seeding so next renderPreInvoice picks up updated billing rules
    piAdditionalCharges=piAdditionalCharges.filter(c=>!c._auto&&!c._discount);
    piRulesSeeded=false;
    sbPatch("companies","id=eq."+co.id,{name,code,status,notes,address,phone,inv_show_address,inv_show_phone,inv_show_notes,inv_show_rate,
      contacts:JSON.stringify(tempContacts),billing_rules:JSON.stringify(tempRules)})
      .then(()=>dbg("Company updated in DB: "+name,"ok"))
      .catch(e=>dbg("Company update error: "+e.message,"err"));
    addAudit("✏️",currentUser.name,(lang==="es"?"editó compañía":"edited company"),name);
  } else {
    const newCo={id:"c"+nextCoId++,...data};
    COMPANIES.push(newCo);
    sbPost("companies",{id:newCo.id,name,code,status,notes,address,phone,inv_show_address,inv_show_phone,inv_show_notes,inv_show_rate,
      contacts:JSON.stringify(tempContacts),billing_rules:JSON.stringify(tempRules)})
      .then(()=>dbg("Company created in DB: "+name,"ok"))
      .catch(e=>dbg("Company create error: "+e.message,"err"));
    addAudit("➕",currentUser.name,(lang==="es"?"creó compañía":"created company"),name+" ("+code+")");
  }
  closeModal("coMbd"); renderCompanies(); renderUsers(); showToast(t("companySaved"));
}

function clearCoErrors(){
  ["name","code","mult"].forEach(f=>{
    const e=el("coe_"+f); const i=el("co_"+f);
    if(e){e.textContent="";e.classList.remove("on");}
    if(i&&i.classList) i.classList.remove("err");
  });
}

function getTooltipPref(key){
  if(_userPrefs && _userPrefs[key] !== undefined && _userPrefs[key] !== null) return _userPrefs[key];
  const lsKey=LS_MAP[key];
  const raw=lsKey?localStorage.getItem(lsKey):null;
  if(raw===null) return PREF_DEFAULTS[key];
  if(typeof PREF_DEFAULTS[key]==="boolean") return raw==="1";
  if(typeof PREF_DEFAULTS[key]==="number") return parseFloat(raw);
  return raw;
}
function applyTooltipPreferences(){
  const enabled=getTooltipPref("tooltips_enabled");
  const text=getTooltipPref("tooltip_text")||PREF_DEFAULTS.tooltip_text;
  const bg=getTooltipPref("tooltip_bg")||PREF_DEFAULTS.tooltip_bg;
  const border=getTooltipPref("tooltip_border")||PREF_DEFAULTS.tooltip_border;
  const offset=clampPrefNumber(getTooltipPref("tooltip_offset_px"),2,24,PREF_DEFAULTS.tooltip_offset_px);
  const maxWidth=clampPrefNumber(getTooltipPref("tooltip_max_width_px"),180,420,PREF_DEFAULTS.tooltip_max_width_px);
  const textSize=clampPrefNumber(getTooltipPref("tooltip_text_size_px"),10,16,PREF_DEFAULTS.tooltip_text_size_px);
  document.documentElement.style.setProperty("--tip-text",text);
  document.documentElement.style.setProperty("--tip-bg",bg);
  document.documentElement.style.setProperty("--tip-border",border);
  document.documentElement.style.setProperty("--tip-offset",offset+"px");
  document.documentElement.style.setProperty("--tip-max-width",maxWidth+"px");
  document.documentElement.style.setProperty("--tip-font-size",textSize+"px");
  if(document.body) document.body.classList.toggle("hpf-tooltips-off",!enabled);
  if(!enabled) hideTipPopover();
  document.querySelectorAll(".hpf-tip").forEach(orientTip);
}
function setToggleLabel(label,on){
  if(!label) return;
  label.textContent=on?(lang==="es"?"Activo":"On"):(lang==="es"?"Inactivo":"Off");
  label.style.color=on?"var(--cyan)":"var(--dim2)";
}
function refreshSettingsToggleLabels(){
  [
    ["tooltipsToggleCheck","tooltipsToggleLabel"],
    ["viewAsToggleCheck","viewAsToggleLabel"],
    ["adminCcToggleCheck","adminCcToggleLabel"],
    ["debugToggleCheck","debugToggleLabel"],
    ["roleBannerToggleCheck","roleBannerToggleLabel"],
    ["stickyTabsToggleCheck","stickyTabsToggleLabel"],
    ["stickyHeadersToggleCheck","stickyHeadersToggleLabel"]
  ].forEach(([checkId,labelId])=>{
    const check=el(checkId);
    if(check) setToggleLabel(el(labelId),check.checked);
  });
}
function initTooltipPreferences(){
  const check=el("tooltipsToggleCheck");
  const label=el("tooltipsToggleLabel");
  const textInp=el("tooltipTextColor");
  const boxInp=el("tooltipBoxColor");
  const borderInp=el("tooltipBorderColor");
  const offsetInp=el("tooltipOffsetPx");
  const maxWidthInp=el("tooltipMaxWidthPx");
  const textSizeInp=el("tooltipTextSizePx");
  const resetBtn=el("tooltipResetBtn");
  const toastInp=el("toastDurationSec");
  if(!check) return;
  const enabled=getTooltipPref("tooltips_enabled");
  check.checked=enabled;
  setToggleLabel(label,enabled);
  if(textInp) textInp.value=getTooltipPref("tooltip_text")||PREF_DEFAULTS.tooltip_text;
  if(boxInp) boxInp.value=getTooltipPref("tooltip_bg")||PREF_DEFAULTS.tooltip_bg;
  if(borderInp) borderInp.value=getTooltipPref("tooltip_border")||PREF_DEFAULTS.tooltip_border;
  if(offsetInp) offsetInp.value=clampPrefNumber(getTooltipPref("tooltip_offset_px"),2,24,PREF_DEFAULTS.tooltip_offset_px);
  if(maxWidthInp) maxWidthInp.value=clampPrefNumber(getTooltipPref("tooltip_max_width_px"),180,420,PREF_DEFAULTS.tooltip_max_width_px);
  if(textSizeInp) textSizeInp.value=clampPrefNumber(getTooltipPref("tooltip_text_size_px"),10,16,PREF_DEFAULTS.tooltip_text_size_px);
  if(toastInp){
    const prefSec=parseInt(getTooltipPref("toast_duration_sec")||PREF_DEFAULTS.toast_duration_sec,10);
    toastInp.value=Math.min(12,Math.max(2,Number.isFinite(prefSec)?prefSec:PREF_DEFAULTS.toast_duration_sec));
  }
  applyTooltipPreferences();
  check.addEventListener("change",function(){
    saveUserPreference("tooltips_enabled",this.checked);
    setToggleLabel(label,this.checked);
    applyTooltipPreferences();
  });
  [[textInp,"tooltip_text"],[boxInp,"tooltip_bg"],[borderInp,"tooltip_border"]].forEach(([inp,key])=>{
    if(!inp) return;
    inp.addEventListener("input",function(){
      saveUserPreference(key,this.value);
      applyTooltipPreferences();
    });
  });
  [
    [offsetInp,"tooltip_offset_px",2,24],
    [maxWidthInp,"tooltip_max_width_px",180,420],
    [textSizeInp,"tooltip_text_size_px",10,16]
  ].forEach(([inp,key,min,max])=>{
    if(!inp) return;
    inp.addEventListener("change",function(){
      const value=clampPrefNumber(this.value,min,max,PREF_DEFAULTS[key]);
      this.value=value;
      saveUserPreference(key,value);
      applyTooltipPreferences();
    });
  });
  if(resetBtn){
    resetBtn.addEventListener("click",()=>{
      [
        "tooltip_text",
        "tooltip_bg",
        "tooltip_border",
        "tooltip_offset_px",
        "tooltip_max_width_px",
        "tooltip_text_size_px"
      ].forEach(key=>saveUserPreference(key,PREF_DEFAULTS[key]));
      if(textInp) textInp.value=PREF_DEFAULTS.tooltip_text;
      if(boxInp) boxInp.value=PREF_DEFAULTS.tooltip_bg;
      if(borderInp) borderInp.value=PREF_DEFAULTS.tooltip_border;
      if(offsetInp) offsetInp.value=PREF_DEFAULTS.tooltip_offset_px;
      if(maxWidthInp) maxWidthInp.value=PREF_DEFAULTS.tooltip_max_width_px;
      if(textSizeInp) textSizeInp.value=PREF_DEFAULTS.tooltip_text_size_px;
      applyTooltipPreferences();
      showToast(t("stTooltipResetToast"));
    });
  }
  if(toastInp){
    toastInp.addEventListener("change",function(){
      const parsed=parseInt(this.value||PREF_DEFAULTS.toast_duration_sec,10);
      const sec=Math.min(12,Math.max(2,Number.isFinite(parsed)?parsed:PREF_DEFAULTS.toast_duration_sec));
      this.value=sec;
      saveUserPreference("toast_duration_sec",sec);
    });
  }
}

function exportUsersJSON(){
  const safe=USERS.map(u=>({...u,pwd:"[REDACTED]"}));
  const blob=new Blob([JSON.stringify({users:safe,companies:COMPANIES},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="hp_fleet_data.json"; a.click();
  showToast("↓ hp_fleet_data.json exported");
}

// ── AUDIT LOG (shared) — persists to Supabase ──
function addAudit(icon,actor,action,detail){
  auditLog.unshift({icon,actor,action,detail,ts:new Date()});
  if(auditLog.length>300) auditLog=auditLog.slice(0,300);
  renderAudit();
  // Persist to DB silently — use return=minimal to avoid SELECT permission requirement on audit_log_app
  const started=performance.now();
  dbTrace("DB → POST audit_log_app (return=minimal)","info");
  fetch(SB_URL+"/rest/v1/audit_log_app",{method:"POST",headers:{...SB_HEADERS,"Prefer":"return=minimal"},body:JSON.stringify({icon,actor,action,detail,ts:new Date().toISOString()})})
    .then(async r=>{
      const elapsed=Math.round(performance.now()-started);
      if(r.ok) dbTrace("DB ✓ POST audit_log_app — "+r.status+" in "+elapsed+"ms","ok");
      else dbTrace("DB ✕ POST audit_log_app — "+r.status+" in "+elapsed+"ms — "+await r.text(),"err");
    })
    .catch(e=>dbTrace("DB ✕ POST audit_log_app — "+e.message,"err")); // never block UI for audit failures
}

// ── DEBUG TOGGLE ──
function initDebugToggle(){
  const check=el("debugToggleCheck");
  const label=el("debugToggleLabel");
  if(!check) return;
  const saved=localStorage.getItem("hpfleet_debug")==="1";
  check.checked=saved;
  setToggleLabel(label,saved);
  if(saved) el("debugPanel").classList.add("on");
  check.addEventListener("change",function(){
    const on=this.checked;
    saveUserPreference("debug_mode", on);
    setToggleLabel(label,on);
    if(on){ el("debugPanel").classList.add("on"); _updateSpBottom(); }
    else{ el("debugPanel").classList.remove("on"); _updateSpBottom(); }
  });
}

function initAdminCcToggle(){
  const check=el("adminCcToggleCheck");
  const label=el("adminCcToggleLabel");
  if(!check) return;
  check.checked=_adminCcEnabled;
  setToggleLabel(label,_adminCcEnabled);
  check.addEventListener("change",async function(){
    const on=this.checked;
    _adminCcEnabled=on;
    setToggleLabel(label,on);
    await saveAdminCcToDB(on);
  });
}

function initViewAsToggle(){
  const check=el("viewAsToggleCheck");
  const label=el("viewAsToggleLabel");
  if(!check) return;
  const saved=localStorage.getItem("hpfleet_viewas_visible");
  const on=saved===null?true:saved==="1";
  check.checked=on;
  setToggleLabel(label,on);
  const vaw=el("viewAsWrap");
  if(vaw&&currentUser&&currentUser.role==="ADMIN") vaw.style.display=on?"flex":"none";
  check.addEventListener("change",function(){
    const on=this.checked;
    saveUserPreference("viewas_visible", on);
    setToggleLabel(label,on);
    const vaw=el("viewAsWrap");
    if(vaw&&currentUser&&currentUser.role==="ADMIN") vaw.style.display=on?"flex":"none";
    if(!on){ viewRole=null; renderWfBar(); setupFlRoleUI(); renderFlTable(); renderTabs(); updateActionBar(); }
  });
}

function setupSettingsUI(){
  const isAdmin=effectiveRole()==="ADMIN";
  if(el("stSection_api")) el("stSection_api").style.display=isAdmin?"":"none";
  if(el("stSection_workflow")) el("stSection_workflow").style.display=isAdmin?"":"none";
  if(el("stSection_dev")) el("stSection_dev").style.display=isAdmin?"":"none";
  if(el("stSection_db")) el("stSection_db").style.display=isAdmin?"":"none";
}

// ── STICKY HEADERS TOGGLE ──
function initStickyHeadersToggle(){
  const check=el("stickyHeadersToggleCheck");
  const label=el("stickyHeadersToggleLabel");
  if(!check) return;
  const saved=localStorage.getItem("hpfleet_stickyheaders");
  const on=saved===null?true:saved==="1";
  check.checked=on;
  setToggleLabel(label,on);
  _applyStickyHeaders(on);
  check.addEventListener("change",function(){
    const isOn=this.checked;
    saveUserPreference("sticky_headers", isOn);
    setToggleLabel(label,isOn);
    _applyStickyHeaders(isOn);
  });
}
function _applyStickyHeaders(on){
  const tbl=document.querySelector("table.fl-tbl");
  const wrap=document.querySelector(".fl-tbl-wrap");
  if(tbl) tbl.classList.toggle("sticky-headers",on);
  if(wrap) wrap.classList.toggle("sticky-active",on);
}

function initStickyTabsToggle(){
  const check=el("stickyTabsToggleCheck");
  const label=el("stickyTabsToggleLabel");
  if(!check) return;
  const saved=localStorage.getItem("hpfleet_stickytabs");
  const on=saved===null?true:saved==="1";
  check.checked=on;
  setToggleLabel(label,on);
  _applyStickyTabs(on);
  check.addEventListener("change",function(){
    const isOn=this.checked;
    saveUserPreference("sticky_tabs", isOn);
    setToggleLabel(label,isOn);
    _applyStickyTabs(isOn);
  });
}

function _applyStickyTabs(on){
  const nav=el("tabNav");
  if(nav) nav.classList.toggle("sticky-tabs",on);
}
function initRoleBannerToggle(){
  const check=el("roleBannerToggleCheck");
  const label=el("roleBannerToggleLabel");
  if(!check) return;
  const saved=localStorage.getItem("hpfleet_rolebanner");
  const on=saved===null?true:saved==="1"; // default on
  check.checked=on;
  setToggleLabel(label,on);
  const banner=el("roleBanner");
  if(banner) banner.style.display=on?"":"none";
  check.addEventListener("change",function(){
    const isOn=this.checked;
    saveUserPreference("role_banner", isOn);
    setToggleLabel(label,isOn);
    const b=el("roleBanner");
    if(b) b.style.display=isOn?"":"none";
  });
}

function renderAudit(){
  const wrap=el("auditList"); if(!wrap) return;
  if(!auditLog.length){wrap.innerHTML='<div class="audit-empty">'+t("noAudit")+"</div>";return;}
  wrap.innerHTML=auditLog.map(e=>'<div class="ae">'+
    '<div class="ae-ts">'+e.ts.toLocaleTimeString(lang==="es"?"es-PA":"en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+"<br>"+
    e.ts.toLocaleDateString(lang==="es"?"es-PA":"en-US")+"</div>"+
    '<div style="font-size:14px;flex-shrink:0">'+e.icon+"</div>"+
    '<div class="ae-body">'+
    '<span class="ae-actor">'+e.actor+"</span>"+
    '<span class="ae-action"> '+e.action+"</span>"+
    (e.detail&&e.detail!=="—"?'<div class="ae-diff">'+e.detail+"</div>":"")+
    "</div></div>").join("");
}

function clearAudit(){auditLog=[];renderAudit();showToast(lang==="es"?"Log limpiado.":"Log cleared.");}

// ── FLIGHT LOG — UPLOAD ──
function initUploadZone(){ /* inline upload zone removed — handled by New Batch modal */ }

function addFilesToQueue(files){
  const allowed=["application/pdf","image/jpeg","image/jpg","image/png"];
  files.forEach(f=>{
    if(!allowed.includes(f.type)&&!f.name.match(/\.(pdf|jpg|jpeg|png)$/i)){
      showToast(f.name+": unsupported format","err"); return;
    }
    if(fileQueue.find(q=>q.name===sanitizeFilename(f.name)&&q.size===f.size)){
      if(!confirm("\""+f.name+"\" has already been loaded.\nIf you continue, you may duplicate records.\n\nContinue anyway?")) return;
    }
    fileQueue.push({file:f,name:sanitizeFilename(f.name),size:f.size,type:f.type,status:"waiting",progress:0,_preview:null});
  });
}

function removeFromQueue(idx){ fileQueue.splice(idx,1); }
function clearFileQueue(){ fileQueue=[]; }
function renderQueue(){ /* no-op — inline queue UI removed */ }

// ── FLIGHT LOG — EXTRACTION ──
function buildExtractionPrompt(){
  return "You are processing a Panamanian flight school bitacora (flight log) form.\n\n"+
    "FIELD MAPPING:\n"+
    "- motorOut = TACH SALIDA (departure tach, the SMALLER number)\n"+
    "- motorIn = TACH LLEGADA (arrival tach, the LARGER number)\n"+
    "- vueloOut = HOBBS ANTERIOR (previous hobbs, the SMALLER number)\n"+
    "- vueloIn = HOBBS HOY (current hobbs, the LARGER number)\n"+
    "- motorIn MUST be greater than motorOut. If reversed, swap them.\n"+
    "- vueloIn MUST be greater than vueloOut. If reversed, swap them.\n\n"+
    "HOBBS RANGE HINTS (to prevent decimal misreads):\n"+
    "- HP-1861 HOBBS values are typically between 6000 and 7000.\n"+
    "- HP-1862FX HOBBS values are typically between 1000 and 2000.\n"+
    "- If a HOBBS value seems too small (e.g. 65.3 instead of 6530), correct the decimal.\n\n"+
    "\nReturn ONLY a valid JSON array:\n"+
    '[{"bnum":"log number e.g. 00591","fecha":"DD/MM/YYYY","aeronave":"HP-XXXX","operador":"FM or MAG",'+
    '"piloto":"name","instructor":"name or empty","horoIn":number,'+
    '"motorOut":"SALIDA decimal","motorIn":"LLEGADA decimal",'+
    '"vueloOut":"ANTERIOR decimal","vueloIn":"HOY decimal","obs":"notes only"}]\n'+
    "Return [] if page has no bitacora data (blank, maintenance-only, cover page, etc).";
}

// ── MOTOR/VUELO DIFF CHECK ──
function checkDiff(entry){
  const ac = AIRCRAFT.find(a=>a.matricula===entry.aeronave);
  const threshold = ac ? ac.diffThreshold : 0.2;
  const tm = Math.abs(t2h(entry.motorIn) - t2h(entry.motorOut));
  const tv = Math.abs(t2h(entry.vueloIn) - t2h(entry.vueloOut));
  const diff = Math.abs(tm - tv);
  // Clear any existing diff flag first
  if(entry.obs) entry.obs=entry.obs.replace(/[|]?\s*[⚠△▲]\s*Dif\s*Motor\/Vuelo[^|]*/g,"").trim();
  if(diff > threshold){
    const flag = "⚠ Dif Motor/Vuelo="+diff.toFixed(1);
    entry.obs = (entry.obs ? entry.obs+" | " : "") + flag;
  }
  return entry;
}

async function extractAll(){
  if(isExtracting){ showToast(t("extractionAlreadyRunning"),"warn"); return; }
  const apiKey=getApiKey();
  if(!apiKey){showToast(t("noApiKey"),"err");switchTab("settings");return;}
  if(!fileQueue.length){showToast(t("noFiles"),"err");return;}
  isExtracting=true;
  extractionAbort=new AbortController();
  let allExtracted=[]; let hasErrors=false;
  const total=fileQueue.length;

  // Set PDF.js worker
  if(typeof pdfjsLib!=="undefined"){
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  for(let i=0;i<fileQueue.length;i++){
    const fq=fileQueue[i];
    const isPdf=fq.type==="application/pdf"||fq.name.endsWith(".pdf");
    fq.status="processing"; renderQueue();

    try {
      if(isPdf && typeof pdfjsLib!=="undefined"){
        // PDF: render each page → extract → store image
        dbg("Loading PDF: "+fq.name,"info");
        uploadLog(t("uploadLogLoadingPdf")+" "+fq.name);
        const arrayBuf=await fq.file.arrayBuffer();
        const pdfDoc=await pdfjsLib.getDocument({data:arrayBuf}).promise;
        const numPages=pdfDoc.numPages;
        dbg("PDF loaded — "+numPages+" pages","ok");
        uploadLog(t("uploadLogPdfLoaded").replace("{pages}",numPages));
        let pdfExtracted=[];
        for(let p=1;p<=numPages;p++){
          fq._label="[Page "+p+"/"+numPages+"] "+fq.name+" — "+t("extracting");
          fq.progress=Math.round((p/numPages)*100);
          renderQueue();
          try {
            const pageBlob=await pdfPageToBlob(pdfDoc,p);
            const pageFile=new File([pageBlob],"page_"+p+".jpg",{type:"image/jpeg"});
            const pageEntries=await extractImageFile(pageFile,apiKey);
            pageEntries.forEach(e=>checkDiff(e));
            const compressed=await compressImage(pageBlob);
            const filename="pg"+String(p).padStart(3,"0")+"_"+Date.now()+".jpg";
            const imageUrl=await uploadImageToStorage(compressed,filename);
            pageEntries.forEach(e=>{e._imageUrl=imageUrl;e._sourcePage=p;});
            pdfExtracted=[...pdfExtracted,...pageEntries];
            dbg("Page "+p+"/"+numPages+": "+pageEntries.length+" entries","ok");
            uploadLog(t("uploadLogPageExtracted").replace("{page}",p).replace("{pages}",numPages).replace("{entries}",pageEntries.length));
          } catch(pageErr){
            if(pageErr.name==="AbortError"){
              dbg("Extraction aborted at page "+p,"warn");
              uploadLog(t("uploadLogAbortedPage").replace("{page}",p));
              break;
            } else if(pageErr.message.startsWith("NO_BITACORA")){
              // Still upload image and create stub entry
              try {
                const pageBlob=await pdfPageToBlob(pdfDoc,p);
                const compressed=await compressImage(pageBlob);
                const filename="pg"+String(p).padStart(3,"0")+"_skip_"+Date.now()+".jpg";
                const imageUrl=await uploadImageToStorage(compressed,filename);
                pdfExtracted.push({
                  _imageUrl:imageUrl, _sourcePage:p, _isStub:true,
                  bnum:"", fecha:"", aeronave:"", operador:"",
                  piloto:"", instructor:"", horoIn:0,
                  motorOut:"", motorIn:"", vueloOut:"", vueloIn:"",
                  multOverride:null, obs:t("skippedNoLogDataOnPage").replace("{page}",p),
                  status:"skipped"
                });
                dbg("Page "+p+": skipped — image stored as stub","info");
                uploadLog(t("uploadLogPageNoData").replace("{page}",p));
              } catch(imgErr){
                dbg("Page "+p+": skipped — image upload failed","info");
                uploadLog(t("uploadLogImageUploadFailed").replace("{page}",p));
              }
            } else {
              dbg("Page "+p+" error: "+pageErr.message,"err"); hasErrors=true;
              uploadLog(t("uploadLogPageError").replace("{page}",p).replace("{error}",pageErr.message));
            }
          }
        }
        allExtracted=[...allExtracted,...pdfExtracted];
        fq.status="done"; fq._entryCount=pdfExtracted.length;
        uploadLog(t("uploadLogDone").replace("{entries}",pdfExtracted.length).replace("{pages}",numPages));
        addFlAudit("🤖",currentUser.name,"extracted PDF",pdfExtracted.length+" entries from "+numPages+" pages — "+fq.name);
      } else {
        // Image file: fix rotation, compress, extract, upload
        fq._label="["+(i+1)+"/"+total+"] "+fq.name+" — "+t("extracting");
        fq.progress=10; renderQueue();
        const fixedFile=await fixImageRotation(fq.file);
        // Compress BEFORE sending to Claude (fixes large/sideways image errors)
        const rawBlob=await fetch(URL.createObjectURL(fixedFile)).then(r=>r.blob());
        const compressedBlob=await compressImage(rawBlob,1200,0.85);
        const compressedFile=new File([compressedBlob],fixedFile.name,{type:"image/jpeg"});
        fq.progress=30; renderQueue();
        const extracted=await extractImageFile(compressedFile,apiKey);
        extracted.forEach(e=>checkDiff(e));
        fq.progress=70; renderQueue();
        // Further compress for storage (smaller for DB)
        const storageBlob=await compressImage(rawBlob,800,0.7);
        const filename="img_"+Date.now()+"_"+i+".jpg";
        const imageUrl=await uploadImageToStorage(storageBlob,filename);
        extracted.forEach(e=>{e._imageUrl=imageUrl;});
        fq._preview=URL.createObjectURL(storageBlob);
        allExtracted=[...allExtracted,...extracted];
        fq.status="done"; fq._entryCount=extracted.length; fq.progress=100;
        addFlAudit("🤖",currentUser.name,"extracted image",extracted.length+" from "+fq.name);
      }
    } catch(err){
      fq.status="error"; fq._error=translateFetchError(err.message); hasErrors=true;
      addFlAudit("⚠️",currentUser.name,"extraction error",fq.name+": "+err.message);
      dbg("Error on "+fq.name+": "+err.message,"err");
      uploadLog(t("uploadLogFileError").replace("{file}",fq.name).replace("{error}",err.message));
    }
    renderQueue();
  }

  isExtracting=false; extractionAbort=null;
  if(!allExtracted.length&&hasErrors){
    uploadLog(t("extractFailedNoEntries"));
    showResultBanner("err","✗ "+t("extractError"));return;
  }
  flEntries=[...flEntries,...allExtracted.map(e=>({
    id:nextEntryId++,status:"pending",multOverride:null,...e,
    reviewObserved:false,
    horoIn:parseFloat(e.horoIn)||0,
    imageUrl:e._imageUrl||null
  }))];
  batchSourceFile=fileQueue.map(f=>f.name);
  // Populate session bar
  updateSrcBar();
  const msg=hasErrors?"⚠ "+allExtracted.length+" "+t("extractPartial"):"✓ "+allExtracted.length+" "+t("extractSuccess")+" "+batchSourceFile.join(", ");
  uploadLog(msg);
  uploadLog(t("extractReadyReview"));
  showResultBanner(hasErrors?"warn":"ok",msg);
  el("srcBar").style.display="grid";
  el("reviewSection").style.display="block";
  await saveBatchToDB("initial extraction save");
  renderWfBar(); setupFlRoleUI(); renderFlTable();
}

// ── LOG # SEQUENCE CHECK ──
function logCheck(){
  const breaks=[];
  // Global sequence — Log # is shared across all aircraft in the batch
  const entries=flEntries
    .filter(e=>e.bnum&&e.status!=="skipped"&&e.status!=="void")
    .sort((a,b)=>parseInt(a.bnum)-parseInt(b.bnum));
  for(let i=1;i<entries.length;i++){
    const prev=parseInt(entries[i-1].bnum);
    const curr=parseInt(entries[i].bnum);
    if(curr-prev>1){
      const origIdx=flEntries.indexOf(entries[i]);
      breaks.push({
        idx:origIdx,
        entry:entries[i],
        prev, curr,
        msg:t("logGapMsg").replace("{prev}",String(prev).padStart(5,"0")).replace("{curr}",String(curr).padStart(5,"0")).replace("{missing}",curr-prev-1)
      });
    }
  }
  return breaks;
}

function horoCheck(entry,idx){
  // Skip void/skipped entries entirely — they don't count in the sequence
  if(!entry.motorOut||!entry.aeronave) return{ok:true};
  if(entry.status==="void"||entry.status==="skipped") return{ok:true};
  const prev=flEntries.slice(0,idx).filter(e=>
    e.aeronave===entry.aeronave&&
    e.status!=="skipped"&&e.status!=="void"&&
    e.motorIn&&e.motorIn!=="—"
  ).pop();
  if(!prev) return{ok:true};
  const ac=AIRCRAFT.find(a=>a.matricula===entry.aeronave);
  const tolerance=ac?.horoTolerance??0.01;
  const prevIn=parseFloat(prev.motorIn);
  const currOut=parseFloat(entry.motorOut);
  if(isNaN(prevIn)||isNaN(currOut)) return{ok:true};
  const diff=Math.abs(currOut-prevIn);
  return{
    ok:diff<=tolerance,
    prevIn:prevIn.toFixed(2),
    currOut:currOut.toFixed(2),
    diff:diff.toFixed(2),
    tolerance:tolerance
  };
}

// ── DUPLICATE LOG # CHECK ──
function duplicateCheck(){
  const seen={};
  const dups=[];
  flEntries.forEach((e,idx)=>{
    if(!e.bnum||e.status==="skipped"||e.status==="void") return;
    if(seen[e.bnum]===undefined){ seen[e.bnum]=idx; }
    else {
      // Flag both the first and current occurrence
      if(!dups.find(d=>d.idx===seen[e.bnum])){
        dups.push({idx:seen[e.bnum],entry:flEntries[seen[e.bnum]],bnum:e.bnum});
      }
      dups.push({idx,entry:e,bnum:e.bnum});
    }
  });
  return dups;
}

function workflowDisplayState(){
  const activeObserved=getObservedActiveEntries().length;
  if(batchStatus==="APPROVED") return {workflow:t("wfActive"), status:t("wfApproved"), turn:"—", event:t("wfEventApproved")};
  if(batchStatus==="SUBMITTED"&&reviewCycle>1) return {workflow:t("wfActive"), status:t("wfResubmitted"), turn:t("wfReviewer"), event:t("wfEventResubmitted")};
  if(batchStatus==="SUBMITTED") return {workflow:t("wfActive"), status:t("wfSubmitted"), turn:t("wfReviewer"), event:t("wfEventSubmitted")};
  if(batchStatus==="DRAFT"&&reviewCycle>1&&activeObserved>0) return {workflow:t("wfActive"), status:t("wfObserved"), turn:t("wfOperator"), event:t("wfEventObserved")};
  return {workflow:t("wfPaused"), status:t("wfDraft"), turn:t("wfOperator"), event:t("wfEventDraft")};
}

function updateSrcBar(){
  const total=flEntries.length;
  const read=flEntries.filter(e=>e.status!=="skipped"&&e.status!=="void"&&e.aeronave&&e.fecha).length;
  const notRead=total-read;
  const nonBill=flEntries.filter(e=>e.status==="nonbillable").length;
  const logBreaks=logCheck();
  const dups=duplicateCheck();
  const seqAlerts=flEntries.filter((e,idx)=>{ const h=horoCheck(e,idx); return h&&!h.ok; });
  const sentBack=getReviewerCommentFilterEntries();

  if(el("srcFile")){
    const files=Array.isArray(batchSourceFile)?batchSourceFile:(batchSourceFile||"—").split(/,\s*/);
    const cleanFiles=files.filter(Boolean);
    el("srcFile").textContent=cleanFiles.length||"—";
    el("srcFile").title=cleanFiles.length?cleanFiles.join("\n"):t("noItems");
    el("srcFile").style.color=cleanFiles.length?"var(--text)":"var(--dim2)";
    el("srcFile").style.pointerEvents=cleanFiles.length?"auto":"none";
  }
  if(el("srcTotalRecords")) el("srcTotalRecords").textContent=total||"—";
  if(el("srcRead")){ el("srcRead").textContent=read; el("srcRead").style.color=read>0?"var(--green)":"var(--dim2)"; }
  if(el("srcNotRead")){ el("srcNotRead").textContent=notRead||"—"; el("srcNotRead").style.color=notRead>0?"var(--yellow)":"var(--dim2)"; el("srcNotRead").style.pointerEvents=notRead>0?"auto":"none"; }

  // Non-Billable
  if(el("srcNonBill")){
    el("srcNonBill").textContent=nonBill||"—";
    el("srcNonBill").style.color=nonBill>0?"var(--red)":"var(--dim2)";
    el("srcNonBill").style.pointerEvents=nonBill>0?"auto":"none";
  }
  // Duplicates
  if(el("srcDups")){
    el("srcDups").textContent=dups.length||"—";
    el("srcDups").style.color=dups.length>0?"orange":"var(--dim2)";
    el("srcDups").style.pointerEvents=dups.length>0?"auto":"none";
  }
  // Log Breaks
  if(el("srcLogBreaks")){
    el("srcLogBreaks").textContent=logBreaks.length||"—";
    el("srcLogBreaks").style.color=logBreaks.length>0?"var(--red)":"var(--dim2)";
    el("srcLogBreaks").style.pointerEvents=logBreaks.length>0?"auto":"none";
    el("srcLogBreaks")._data=logBreaks;
  }
  // Seq Alerts
  if(el("srcHoro")){
    el("srcHoro").textContent=seqAlerts.length||"—";
    el("srcHoro").style.color=seqAlerts.length>0?"var(--yellow)":"var(--dim2)";
    el("srcHoro").style.pointerEvents=seqAlerts.length>0?"auto":"none";
    el("srcHoro")._data=seqAlerts;
  }
  // Sent Back
  if(el("srcSentBack")){
    const registered=getObservedRegisteredEntries().length;
    el("srcSentBack").textContent=registered||"—";
    el("srcSentBack").style.color=registered>0?"var(--yellow)":"var(--dim2)";
    el("srcSentBack").style.pointerEvents=registered>0?"auto":"none";
    el("srcSentBack")._data=sentBack;
  }
  const wf=workflowDisplayState();
  if(el("srcWorkflowState")){ el("srcWorkflowState").textContent=wf.workflow; el("srcWorkflowState").style.color=batchStatus==="DRAFT"&&reviewCycle===1?"var(--text)":"var(--green)"; }
  if(el("srcStatus")) el("srcStatus").textContent=wf.status;
  if(el("srcWorkflowTurn")){
    el("srcWorkflowTurn").textContent=wf.turn;
    el("srcWorkflowTurn").style.color=wf.turn===t("wfReviewer")?"var(--yellow)":wf.turn===t("wfOperator")?"var(--green)":"var(--dim2)";
  }
  if(el("srcObservedActive")){
    const activeObserved=getObservedActiveEntries().length;
    el("srcObservedActive").textContent=activeObserved||"—";
    el("srcObservedActive").style.color=activeObserved>0?"var(--yellow)":"var(--dim2)";
    el("srcObservedActive").style.pointerEvents=activeObserved>0?"auto":"none";
  }
  if(el("srcEventText")) el("srcEventText").textContent=t("wfEvents")+": "+wf.event;
  renderWorkflowWidget();

  // Update row markers on table
  if(el("flTbody")){
    const breakIdxs=new Set(logBreaks.map(b=>b.idx));
    const dupIdxs=new Set(dups.map(d=>d.idx));
    el("flTbody").querySelectorAll("tr[data-entry-id]").forEach(row=>{
      const entryIdx=flEntries.findIndex(e=>e.id===parseInt(row.dataset.entryId));
      const bnumCell=row.querySelector("td:nth-child(2)");
      if(bnumCell){
        bnumCell.classList.toggle("log-seq-gap",breakIdxs.has(entryIdx)&&!dupIdxs.has(entryIdx));
        bnumCell.classList.toggle("log-dup-gap",dupIdxs.has(entryIdx));
      }
    });
  }
}

function translateFetchError(msg){
  if(msg==="Failed to fetch") return "Network error — check connection or API key";
  if(msg.includes("image exceeds")) return "Image too large — max 5MB per image";
  if(msg.includes("HTTP 401")) return "Invalid API key";
  if(msg.includes("HTTP 429")) return "Rate limit — wait a moment and retry";
  return msg;
}

async function extractImageFile(file, apiKey){
  const base64=await fileToBase64(file);
  const mediaType=file.type||"image/jpeg";
  const response=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    signal:extractionAbort?.signal,
    headers:{
      "Content-Type":"application/json",
      "x-api-key":apiKey,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true"
    },
    body:JSON.stringify({
      model:MODEL,max_tokens:4096,
      messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:mediaType,data:base64}},
        {type:"text",text:buildExtractionPrompt()}
      ]}]
    })
  });
  if(!response.ok){
    const err=await response.json().catch(()=>({}));
    const msg=err.error?.message||"HTTP "+response.status;
    if(response.status===429) throw new Error("RATE_LIMIT: System busy — wait and retry");
    if(response.status===401) throw new Error("API_ERROR: Invalid API key");
    throw new Error("API_ERROR: "+msg);
  }
  const data=await response.json();
  const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("")||"[]";
  const cleaned=text.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
  // Extract JSON array from anywhere in the response — handles preamble text
  const jsonMatch=cleaned.match(/\[[\s\S]*\]/);
  if(!jsonMatch){
    dbg("Re-extract raw response: "+cleaned.substring(0,200),"warn");
    throw new Error("NO_BITACORA: No log data found on this page");
  }
  try {
    const parsed=JSON.parse(jsonMatch[0]);
    if(!Array.isArray(parsed)||parsed.length===0) throw new Error("empty");
    return parsed;
  } catch(e){
    throw new Error("NO_BITACORA: No log data found on this page");
  }
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(",")[1]);
    reader.onerror=()=>reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function showResultBanner(type,msg){
  const wrap=el("resultBanner"); if(!wrap) return;
  const icons={ok:"✅",warn:"⚠️",err:"❌"};
  const cls={ok:"rb-ok",warn:"rb-warn",err:"rb-err"};
  wrap.style.display="block";
  wrap.innerHTML='<div class="result-banner '+cls[type]+'">'+
    '<div style="font-size:18px;flex-shrink:0">'+icons[type]+"</div>"+
    '<div class="rb-msg">'+msg+"</div></div>";
}

// ── FLIGHT LOG — CALCULATIONS ──
function t2h(s){
  s=String(s||"").trim();
  if(!s) return 0;
  if(s.includes(":")){
    const[h,m]=s.split(":").map(Number);
    return (isNaN(h)||isNaN(m))?0:h+m/60;
  }
  const n=parseFloat(s);
  return isNaN(n)?0:n;
}
function getAircraftMult(aeronave, operador){
  if(!aeronave) return DEFAULT_MULT[operador]||1; // stub entry — silent
  const ac=AIRCRAFT.find(a=>a.matricula===aeronave);
  if(!ac){ dbg("getAircraftMult: aircraft not found: "+aeronave,"warn"); return DEFAULT_MULT[operador]||1; }
  const rates=ac.rates;
  if(rates&&Array.isArray(rates)&&rates.length){
    const rate=rates.find(r=>r.operador===operador);
    if(rate){ return parseFloat(rate.multiplicador)||1; }
    dbg("getAircraftMult: no rate for "+aeronave+"/"+operador+" in rates: "+JSON.stringify(rates),"warn");
    return parseFloat(rates[0].multiplicador)||1;
  }
  dbg("getAircraftMult: no rates array on "+aeronave+", using multiplicador: "+ac.multiplicador,"warn");
  if(ac.multiplicador) return parseFloat(ac.multiplicador)||1;
  return DEFAULT_MULT[operador]||1;
}

function calcEntry(e){
  if(!e.aeronave||e.status==="skipped"||e.status==="void") return{tm:0,tv:0,mult:1,tbp:0};
  const tm=e._directTm>0?e._directTm:Math.max(0,t2h(e.motorIn)-t2h(e.motorOut));
  const tv=e._directTv>0?e._directTv:Math.max(0,t2h(e.vueloIn)-t2h(e.vueloOut));
  const mult=e.multOverride||getAircraftMult(e.aeronave,e.operador);
  return{tm,tv,mult,tbp:parseFloat((tm*mult).toFixed(3))};
}
function sanitizeFilename(name){
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"") // strip accents
    .replace(/[^\w.\-]/g,"_")                        // replace special chars with _
    .replace(/_+/g,"_")                              // collapse multiple _
    .replace(/^_|_$/g,"");                           // trim leading/trailing _
}


function fmt(n){return isNaN(n)||n===0?"—":n.toFixed(1);}
function fmtCurrency(n){
  return "$ "+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");
}
const NON_BILL_REASON_KEYS={
  "Maintenance":"nonBillReasonMaintenance",
  "Aborted Flight":"nonBillReasonAborted",
  "Equipment Failure":"nonBillReasonEquipment",
  "Duplicate":"nonBillReasonDuplicate",
  "Other":"nonBillReasonOther"
};
function nonBillReasonLabel(reason){
  return NON_BILL_REASON_KEYS[reason]?t(NON_BILL_REASON_KEYS[reason]):reason;
}
function formatNonBillReason(raw, includeComment=true){
  if(!raw) return "";
  const parts=String(raw).split(" — ");
  const reason=parts.shift();
  const label=nonBillReasonLabel(reason);
  const comment=parts.join(" — ");
  return includeComment&&comment?label+" — "+comment:label;
}

// ── FLIGHT LOG — HOROMETER ──
function runHoroChecks(){ updateSrcBar(); } // delegated to updateSrcBar

// ── FLIGHT LOG — WORKFLOW BAR ──
function deriveWorkflowWidgetState(){
  const st=batchStatus;
  const cycle=reviewCycle||1;
  const registered=getObservedRegisteredEntries().length;
  const active=getObservedActiveEntries().length;
  let workflowState="PAUSED", batchDisplayState="DRAFT", workflowTurn="OPERATOR";

  if(st==="APPROVED"){
    workflowState="ACTIVE"; batchDisplayState="APPROVED"; workflowTurn="NONE";
  } else if(st==="SUBMITTED"&&cycle>1){
    workflowState="ACTIVE"; batchDisplayState="RESUBMITTED"; workflowTurn="REVIEWER";
  } else if(st==="SUBMITTED"){
    workflowState="ACTIVE"; batchDisplayState="SUBMITTED"; workflowTurn="REVIEWER";
  } else if(st==="DRAFT"&&cycle>1&&active>0){
    workflowState="ACTIVE"; batchDisplayState="OBSERVED"; workflowTurn="OPERATOR";
  }

  return {
    workflowState,
    batchDisplayState,
    workflowTurn,
    observedRegisteredCount:registered,
    observedActiveCount:active,
    workflowEvents:deriveWorkflowEvents(batchDisplayState,cycle,registered,active),
    hasBatch:!!currentBatchId&&flEntries.length>0
  };
}

function deriveWorkflowEvents(displayState,cycle,registered,active){
  if(!currentBatchId&&!flEntries.length) return [];
  const chronological=[...flAuditLog].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  const findAction=pattern=>chronological.find(a=>String(a.action||"").toLowerCase().includes(pattern));
  const events=[];
  events.push({
    type:"DRAFT",actorRole:"OPERATOR",actorName:currentUser?.name||"PENDING",
    timestamp:findAction("batch loaded")?.ts||FL_LOAD_TS||"PENDING",
    note:t("wwEvDraft")
  });
  if(displayState!=="DRAFT"){
    const submitted=findAction("submitted batch");
    events.push({
      type:"SUBMITTED",actorRole:"OPERATOR",actorName:submitted?.actor||"PENDING",
      timestamp:submitted?.ts||"PENDING",note:t("wwEvSubmitted")
    });
    events.push({
      type:"REVIEW_STARTED",actorRole:"REVIEWER",actorName:"PENDING",
      timestamp:"PENDING",note:t("wwEvReview")
    });
  }
  const returned=chronological.filter(a=>String(a.action||"").toLowerCase().includes("returned"));
  returned.forEach((a,i)=>{
    events.push({
      type:"OBSERVED",actorRole:"REVIEWER",actorName:a.actor||"PENDING",
      timestamp:a.ts||"PENDING",cycle:i+1,note:t("wwEvObserved")
    });
    if(i+1<cycle||displayState==="RESUBMITTED"||displayState==="APPROVED"){
      events.push({
        type:"RESUBMITTED",actorRole:"OPERATOR",actorName:"PENDING",
        timestamp:"PENDING",cycle:i+2,note:t("wwEvResubmitted")
      });
    }
  });
  if(displayState==="APPROVED"){
    const approved=findAction("approved");
    events.push({
      type:"APPROVED",actorRole:"REVIEWER",actorName:approved?.actor||piSignedBy||"PENDING",
      timestamp:approved?.ts||piSignedAt||"PENDING",note:t("wwEvApproved")
    });
  }
  if(displayState==="APPROVED"&&registered>0&&active===0){
    events[events.length-1].note=t("wwEvApproved")+" "+t("wwObsClear");
  }
  return events;
}

function wfWidgetTimestamp(ts){
  if(!ts||ts==="PENDING") return "—";
  const d=ts instanceof Date?ts:new Date(ts);
  if(isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang==="es"?"es-PA":"en-US",{month:"2-digit",day:"2-digit"})+" "+
    d.toLocaleTimeString(lang==="es"?"es-PA":"en-US",{hour:"2-digit",minute:"2-digit"});
}

function workflowEventText(data){
  if(!data.hasBatch) return t("wwNoActiveBatch");
  const turn=data.workflowTurn==="OPERATOR"?t("wwRole_OPERATOR"):data.workflowTurn==="REVIEWER"?t("wwRole_REVIEWER"):"";
  if(data.batchDisplayState==="DRAFT") return t("wwEvDraft");
  if(data.batchDisplayState==="SUBMITTED") return turn+" — "+t("wwEvSubmitted");
  if(data.batchDisplayState==="OBSERVED") return turn+" — "+t("wwEvObserved")+" ("+data.observedActiveCount+")";
  if(data.batchDisplayState==="RESUBMITTED") return turn+" — "+t("wwEvResubmitted");
  if(data.batchDisplayState==="APPROVED") return t("wwEvApproved");
  return t("wwNoActiveBatch");
}

function renderWorkflowWidget(){
  const wrap=el("workflowWidget");
  if(!wrap) return;
  if(!currentBatchId||!flEntries.length){
    wrap.innerHTML='<div class="src-history-title" id="sb_batchHistory">'+t("sbBatchHistory")+'</div>'+
      '<div class="ww-empty">'+t("wwNoActiveBatch")+'</div>';
    return;
  }
  const data=deriveWorkflowWidgetState();
  const st=batchStatus, cycle=reviewCycle||1;
  const nodes=[
    {id:"draft",lane:"op",pct:.05,label:t("wwBatch_DRAFT"),color:"green",active:true,current:st==="DRAFT"&&cycle===1},
    {id:"submitted",lane:"op",pct:.24,label:t("wwBatch_SUBMITTED"),color:"green",active:st==="SUBMITTED"||st==="APPROVED"||cycle>1,current:st==="SUBMITTED"&&cycle===1},
    {id:"review",lane:"re",pct:.42,label:t("wwEvReview"),color:"yellow",active:st==="SUBMITTED"||st==="APPROVED"||cycle>1,current:st==="SUBMITTED"&&cycle===1}
  ];
  if(cycle>1){
    nodes.push({id:"observed",lane:"re",pct:.58,label:t("wwBatch_OBSERVED"),color:"yellow",active:true,current:st==="DRAFT"});
    nodes.push({id:"resubmitted",lane:"op",pct:.72,label:t("wwBatch_RESUBMITTED"),color:"green",active:st==="SUBMITTED"||st==="APPROVED",current:st==="SUBMITTED"&&cycle>1});
  }
  nodes.push(
    {id:"approved",lane:"re",pct:.88,label:t("wwBatch_APPROVED"),color:"yellow",active:st==="APPROVED",current:false},
    {id:"preinvoice",lane:"op",pct:.97,label:t("wwBatch_PREINVOICE"),color:"cyan",active:st==="APPROVED",current:st==="APPROVED"}
  );

  const laneHtml=lane=>nodes.filter(n=>n.lane===lane).map(n=>{
    const dot=n.active?"ww-dot ww-dot-"+n.color:"ww-dot ww-ring-"+n.color;
    const showLabel=n.active&&(n.current||n.id==="draft"||n.id==="submitted"||n.id==="approved"||n.id==="preinvoice");
    return '<span class="ww-node '+(n.active?"active ":"")+(n.current?"current":"")+'" style="left:'+(n.pct*100)+'%" data-color="'+n.color+'">'+
      '<i class="'+dot+'"></i><b class="'+(showLabel?n.color:"hidden")+'">'+escHtml(showLabel?n.label:"")+'</b></span>';
  }).join("");
  const flowConnectors=()=>{
    const path=nodes.filter(n=>n.active).sort((a,b)=>a.pct-b.pct);
    return path.slice(0,-1).map((n,i)=>{
      const next=path[i+1];
      const y1=n.lane==="op"?24:52;
      const y2=next.lane==="op"?24:52;
      const x1=n.pct*100;
      const x2=next.pct*100;
      return '<line class="ww-flow '+next.color+'" x1="'+x1+'%" y1="'+y1+'" x2="'+x2+'%" y2="'+y2+'"></line>';
    }).join("");
  };
  const history=data.workflowEvents.slice(-2).reverse().map(ev=>{
    const role=ev.actorRole==="OPERATOR"?"op":ev.actorRole==="REVIEWER"?"re":"sys";
    const who=ev.actorName&&ev.actorName!=="PENDING"?ev.actorName:"—";
    return '<div class="ww-history-row '+role+'"><span>'+wfWidgetTimestamp(ev.timestamp)+'</span><strong>'+escHtml(who)+'</strong><em>'+escHtml(ev.note||ev.type)+'</em></div>';
  }).join("")||'<div class="ww-history-row"><em>'+t("wwNoBatchHistory")+'</em></div>';

  wrap.innerHTML='<div class="ww-timeline" aria-label="'+escHtml(t("sbBatchHistory"))+'">'+
      '<svg class="ww-flow-svg" aria-hidden="true" preserveAspectRatio="none">'+flowConnectors()+'</svg>'+
      '<div class="ww-lane ww-lane-op"><span>OP</span><div class="ww-track">'+laneHtml("op")+'</div></div>'+
      '<div class="ww-lane ww-lane-re"><span>RE</span><div class="ww-track">'+laneHtml("re")+'</div></div>'+
    '</div>'+
    '<div class="ww-history-panel">'+history+'</div>';
  if(el("srcEventText")) el("srcEventText").textContent=t("wfEvents")+": "+workflowEventText(data);
}

function renderWfBar(){
  const hasEntries=flEntries.length>0;
  const st=batchStatus;
  const inCycle=reviewCycle>1; // batch has been through at least one review cycle
  const workflowOn=st==="SUBMITTED"||st==="APPROVED"||(st==="DRAFT"&&inCycle);
  const steps=[
    {key:"wfUpload",  state:"done"},
    {key:"wfExtract", state:hasEntries?"done":"pending"},
    {key:"wfCleanup", state:workflowOn||st==="APPROVED"?"done":hasEntries?"active":"pending"},
    {key:"wfActivated", state:st==="APPROVED"?"done":workflowOn?"active":"pending"},
    {key:"wfApproved",state:st==="APPROVED"?"done":"pending"},
    {key:"piGoTo",state:st==="APPROVED"?"active":"locked",cta:true}
  ];
  const bar=el("wfBar"); if(!bar) return;
  let html=steps.map((s,i)=>{
    const arrow=i<steps.length-1?'<span class="wf-arrow">›</span>':"";
    return '<div class="wf-step '+s.state+(s.cta?" wf-cta-step":"")+'"><div class="wf-dot"></div>'+t(s.key)+"</div>"+arrow;
  }).join("");
  bar.innerHTML=html;
  const ctaStep=bar.querySelector(".wf-cta-step.active");
  if(ctaStep) ctaStep.addEventListener("click",()=>{
    if(currentBatchId&&batchStatus==="APPROVED") renderPreInvoice();
    switchTab("preinvoice");
  });
  if(el("srcStatus")){
    el("srcStatus").textContent=workflowDisplayState().status;
  }
  renderWorkflowWidget();
}

// ── EFFECTIVE ROLE (View As override for Admin) ──
function effectiveRole(){ return viewRole || (currentUser ? currentUser.role : "READONLY"); }

// ── FLIGHT LOG — ROLE UI ──
function setupFlRoleUI(){
  const role=effectiveRole();
  const isReview=batchStatus==="SUBMITTED"&&role==="REVIEWER";
  const canEdit=(role==="ADMIN"||role==="OPERATOR")&&batchStatus==="DRAFT";
  const canSubmit=(role==="ADMIN"||role==="OPERATOR")&&batchStatus==="DRAFT";
  const canApprove=(role==="ADMIN"||role==="REVIEWER")&&batchStatus==="SUBMITTED";
  const canFlag=(role==="ADMIN"||role==="REVIEWER")&&batchStatus==="SUBMITTED";
  // Standard buttons
  if(el("btn_newEntry")) el("btn_newEntry").style.display=(canEdit&&!isReview)?"":"none";
  if(el("btn_approveAll")) el("btn_approveAll").style.display=(canEdit&&!isReview)?"":"none";
  if(el("btn_resetAll")) el("btn_resetAll").style.display=(canEdit&&!isReview)?"":"none";
  if(el("btn_saveDraft")) el("btn_saveDraft").style.display=(canSubmit&&!isReview)?"":"none";
  if(el("btn_submit")) el("btn_submit").style.display=(canSubmit&&!isReview)?"":"none";
  if(el("btn_approve")) el("btn_approve").style.display=canApprove?"flex":"none";
  if(el("btn_reqChanges")) el("btn_reqChanges").style.display="none";
  // REVIEW mode — hide upload area, batch constants, new batch, add more files
  const isReviewer=role==="REVIEWER"||role==="READONLY";
  if(el("fl_newBatch")) el("fl_newBatch").style.display=isReviewer?"none":"";
  if(el("btn_addMoreFiles")) el("btn_addMoreFiles").style.display=isReviewer?"none":"";
  // OCR and non-billable toggle hidden in REVIEW mode (side panel)
  if(el("sp_reextract")) el("sp_reextract").style.display=isReviewer?"none":"";
  if(el("sp_nonbill_toggle")) el("sp_nonbill_toggle").style.display=isReviewer?"none":"";
  // Return for Review button — only in REVIEW mode
  if(el("btn_returnForReview")) el("btn_returnForReview").style.display=isReview?"flex":"none";
  const canReopen=role==="ADMIN"&&batchStatus!=="DRAFT"&&batchStatus!=="CLOSED";
  if(el("btn_reopen")) el("btn_reopen").style.display=canReopen?"":"none";
  if(role==="REVIEWER"||role==="READONLY"){
    const us=el("uploadSection"); if(us) us.style.display="none";
    const bc=el("batchConstants"); if(bc) bc.style.display="none";
  } else {
    const us=el("uploadSection"); if(us) us.style.display="";
    const bc=el("batchConstants"); if(bc) bc.style.display="";
  }
}

// ── FLIGHT LOG — TABLE ──
function getFilteredEntries(){
  const f=el("filterOp") ? el("filterOp").value : "ALL";
  if(f==="ALL") return flEntries;
  if(f==="FM"||f==="MAG") return flEntries.filter(e=>e.operador===f);
  if(f==="problems") return flEntries.filter(e=>
    e.status==="skipped"||e.status==="void"||e.status==="flagged"||
    !e.aeronave||!e.fecha||!e.piloto||!e.motorOut||!e.motorIn
  );
  if(f==="hide_nonbill") return flEntries.filter(e=>e.status!=="nonbillable"&&e.status!=="void");
  if(f==="show_nonbill") return flEntries.filter(e=>e.status==="nonbillable");
  if(f==="reviewer_comments") return getReviewerCommentFilterEntries();
  return flEntries.filter(e=>e.status===f);
}

function renderFlTable(){
  const tbody=el("flTbody"); if(!tbody) return;
  let visible=getFilteredEntries();
  // Apply sort
  if(flSortCol){
    visible=[...visible].sort((a,b)=>{
      let av, bv;
      if(flSortCol==="mult"){ av=getAircraftMult(a.aeronave,a.operador); bv=getAircraftMult(b.aeronave,b.operador); }
      else if(flSortCol==="tbp"){ av=calcEntry(a).tbp; bv=calcEntry(b).tbp; }
      else { av=a[flSortCol]||""; bv=b[flSortCol]||""; }
      if(typeof av==="number") return (av-bv)*flSortDir;
      return String(av).localeCompare(String(bv))*flSortDir;
    });
  }
  // Update header indicators
  document.querySelectorAll("[data-sort-fl]").forEach(th=>{
    const col=th.dataset.sortFl;
    const base=th.textContent.replace(/ [▲▼]$/,"");
    th.textContent=base+(flSortCol===col?(flSortDir===1?" ▲":" ▼"):"");
  });
  const role=effectiveRole();
  const canEdit=(role==="ADMIN"||role==="OPERATOR")&&batchStatus==="DRAFT";
  tbody.innerHTML="";
  if(!visible.length){
    tbody.innerHTML='<tr><td colspan="18" class="audit-empty" style="text-align:center;padding:18px">'+t("flNoEntries")+"</td></tr>";
  }
  visible.forEach((e,rowIdx)=>{
    const gi=flEntries.indexOf(e);
    const{tm,tv,mult,tbp}=calcEntry(e);
    const h=horoCheck(e,gi);
    const hasDiffGap=e.obs&&e.obs.includes("Dif Motor/Vuelo");
    const isOverride=e.multOverride&&e.multOverride!==getAircraftMult(e.aeronave,e.operador);
    const tr=document.createElement("tr");
    const activeObserved=entryActiveObserved(e);
    const everObserved=entryEverObserved(e);
    const awaitingReviewer=entryAwaitingReviewerReview(e);
    tr.className=e.status==="approved"?"r-ok":e.status==="rejected"?"r-rej":e.status==="flagged"?"r-flagged":e.status==="skipped"?"r-skipped":e.status==="nonbillable"?"r-nonbillable":e.status==="void"?"r-void":"";
    if(everObserved) tr.classList.add("r-observed-history");
    if(activeObserved) tr.classList.add("r-observed-active");
    if(awaitingReviewer) tr.classList.add("r-observed-reviewing");
    tr.style.cursor="pointer";
    tr.dataset.entryId=e.id;
    // Notes — show flag note or obs, plus red triangle if diff gap
    const diffTriangle=hasDiffGap?'<span style="color:var(--red);margin-left:4px" title="'+t("flDiffThresholdTip")+'">▲</span>':"";
    const reviewComment=latestReviewerComment(e);
    const reviewCommentHtml=escHtml(reviewComment);
    const reviewedMarker=everObserved?'<span style="color:var(--yellow);margin-left:4px;font-size:10px" title="'+escHtml(t("flReviewerCommentTip")+": "+reviewComment)+'">△</span>':"";
    const notesDisplay=activeObserved
      ?'<span style="color:var(--yellow);font-size:10px" title="'+escHtml(t("flReviewerCommentTip")+": "+reviewComment)+'">⚠ '+reviewCommentHtml+"</span>"
      :escHtml(e.obs||"—");
    const motorOutCell='<td class="cb'+((!h.ok)?' horo-seq-gap':'')+'">'+(e.motorOut||"—")+"</td>";
    tr.innerHTML=
      '<td class="cd" style="font-family:var(--mono);font-size:10px;color:var(--dim2);text-align:center">'+String(rowIdx+1).padStart(2,"0")+"</td>"+
      '<td class="bnum-cell">'+(e.bnum||"—")+"</td>"+
      "<td>"+(e.fecha||"—")+"</td>"+
      "<td>"+(e.aeronave||"—")+"</td>"+
      '<td><span style="color:'+(e.operador==="FM"?"var(--green)":"var(--yellow)")+'">'+( e.operador||"—")+"</span></td>"+
      "<td>"+(e.piloto||"—")+"</td>"+
      '<td style="color:var(--dim2);font-size:12px">'+(e.instructor||"—")+"</td>"+
      motorOutCell+
      '<td class="cb">'+(e.motorIn||"—")+"</td>"+
      '<td class="cb">'+fmt(tm)+"</td>"+
      "<td>"+(e.vueloOut||"—")+"</td>"+
      "<td>"+(e.vueloIn||"—")+"</td>"+
      '<td class="cx">'+fmt(tv)+"</td>"+
      '<td class="cd" style="'+(isOverride?"color:var(--yellow)":"")+'">'+mult+(isOverride?" ⚠":"")+"</td>"+
      '<td class="cg">'+fmt(tbp)+"</td>"+
      '<td class="cd">'+(e.horoIn?.toFixed(1)||"—")+"</td>"+
      '<td class="cd" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+notesDisplay+diffTriangle+reviewedMarker+"</td>"+
      "<td>"+mkFlToggle(e,canEdit)+"</td>";
    tbody.appendChild(tr);
  });
  if(el("ptab_count")) el("ptab_count").textContent=flEntries.length;
  updateFlSummary(); runHoroChecks();
  // Re-apply sticky headers preference after re-render
  const _sh=localStorage.getItem("hpfleet_stickyheaders");
  _applyStickyHeaders(_sh===null?true:_sh==="1");
  updateApproveAllBtn();
}

function mkFlToggle(e,canEdit){
  const isLocked=e.status==="nonbillable"||e.status==="void";
  const dis=(canEdit&&!isLocked)?"":"disabled";
  const pc=e.status==="pending"?"tp":"", oc=e.status==="approved"?"tok":"", rc=e.status==="rejected"?"tr":"";
  return '<div class="t3">'+
    '<button class="'+pc+'" data-st-entry="'+e.id+'" data-st="pending" '+dis+' title="'+t("pending")+'">?</button>'+
    '<button class="'+oc+'" data-st-entry="'+e.id+'" data-st="approved" '+dis+' title="'+t("approved2")+'">✓</button>'+
    '<button class="'+rc+'" data-st-entry="'+e.id+'" data-st="rejected" '+dis+' title="'+t("rejected")+'">✗</button>'+
    "</div>";
}

function setEntrySt(id,st){
  const e=flEntries.find(x=>x.id===id); if(!e) return;
  const old=e.status;
  const oldReason=e.nonBillReason;
  e.status=st;
  addFlAudit("🔄",currentUser.name,"entry "+(flEntries.indexOf(e)+1)+" status",old+"→"+st);
  recordStatusChange(id,old,oldReason);
  renderFlTable();
}

function setAllFlStatus(st){
  const targets=getFilteredEntries().filter(e=>e.status!=="nonbillable"&&e.status!=="void");
  targets.forEach(e=>e.status=st);
  addFlAudit("🔄",currentUser.name,"all visible entries→"+st,targets.length+" entries");
  renderFlTable();
}

function approveReviewedEntries(){
  const targets=getObservedActiveEntries();
  targets.forEach(e=>e.status="approved");
  addFlAudit("✅",currentUser.name,"approve reviewed entries",targets.length+" entries approved");
  renderFlTable(); updateApproveAllBtn();
}

function updateApproveAllBtn(){
  const btn=el("btn_approveAll"); if(!btn) return;
  const hasReviewed=getObservedActiveEntries().length>0;
  btn.textContent=hasReviewed?t("approveReviewed"):t("approveAll");
  btn.onclick=hasReviewed?approveReviewedEntries:()=>setAllFlStatus("approved");
}

// ── FLIGHT LOG — SUMMARY ──
function updateFlSummary(){
  let fmM=0,fmT=0,magM=0,magT=0,totV=0,approved=0;
  flEntries.filter(e=>e.status==="approved").forEach(e=>{
    approved++;
    const{tm,tv,tbp}=calcEntry(e); totV+=tv;
    if(e.operador==="FM"){fmM+=tm;fmT+=tbp;}else{magM+=tm;magT+=tbp;}
  });
  const sg=el("sumGrid"); if(!sg) return;
  sg.innerHTML=
    '<div class="scard sc-fm"><div class="sc-l">'+t("fmMotor")+"</div><div class=\"sc-v\">"+fmt(fmM)+"</div><div class=\"sc-s\">"+t("thTbp")+": "+fmt(fmT)+" "+t("hrs")+"</div></div>"+
    '<div class="scard sc-mag"><div class="sc-l">'+t("magMotor")+"</div><div class=\"sc-v\">"+fmt(magM)+"</div><div class=\"sc-s\">"+t("thTbp")+": "+fmt(magT)+" "+t("hrs")+"</div></div>"+
    '<div class="scard sc-tot"><div class="sc-l">'+t("totMotor")+"</div><div class=\"sc-v\">"+fmt(fmM+magM)+"</div><div class=\"sc-s\">"+t("tFlight")+": "+fmt(totV)+" "+t("hrs")+"</div></div>"+
    '<div class="scard sc-tbp"><div class="sc-l">'+t("totTbp")+"</div><div class=\"sc-v\">"+fmt(fmT+magT)+"</div><div class=\"sc-s\">"+t("tbpHours")+"</div></div>"+
    '<div class="scard sc-ent"><div class="sc-l">'+t("approved2")+"</div><div class=\"sc-v\">"+approved+"</div><div class=\"sc-s\">"+t("showing")+" "+getFilteredEntries().length+" "+t("of")+" "+flEntries.length+"</div></div>";
  updateActionBar();
}

function updateActionBar(){
  const pending=flEntries.filter(e=>e.status==="pending").length;
  const approved=flEntries.filter(e=>e.status==="approved").length;
  const rejected=flEntries.filter(e=>e.status==="rejected").length;
  const canSubmit=(effectiveRole()==="ADMIN"||effectiveRole()==="OPERATOR")&&batchStatus==="DRAFT";
  if(canSubmit&&el("btn_submit")){
    el("btn_submit").disabled=approved===0;
    el("actionNote").textContent=t("flActionCounts")
      .replace("{pending}",pending)
      .replace("{approved}",approved)
      .replace("{rejected}",rejected);
  }
}

// ── FLIGHT LOG AUDIT ──
function addFlAudit(icon,actor,action,detail){
  flAuditLog.unshift({icon,actor,action,detail,ts:new Date()});
  if(flAuditLog.length>300) flAuditLog=flAuditLog.slice(0,300);
  renderFlAudit();
}

function renderFlAudit(){
  const wrap=el("flAuditList"); if(!wrap) return;
  if(el("ptab_audit_count")) el("ptab_audit_count").textContent=flAuditLog.length;
  if(!flAuditLog.length){wrap.innerHTML='<div class="audit-empty">'+t("noAudit")+"</div>";return;}
  wrap.innerHTML=flAuditLog.map(e=>'<div class="ae">'+
    '<div class="ae-ts">'+e.ts.toLocaleTimeString(lang==="es"?"es-PA":"en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+"<br>"+
    e.ts.toLocaleDateString(lang==="es"?"es-PA":"en-US")+"</div>"+
    '<div style="font-size:14px;flex-shrink:0">'+e.icon+"</div>"+
    '<div class="ae-body"><span class="ae-actor">'+e.actor+"</span><span class=\"ae-action\"> "+e.action+"</span>"+
    (e.detail&&e.detail!=="—"?'<div class="ae-diff">'+e.detail+"</div>":"")+
    "</div></div>").join("");
}

function switchFlPanel(id){
  document.querySelectorAll(".ppanel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".ptab").forEach(b=>b.classList.remove("active"));
  const panel=el("ppanel_"+id); if(panel) panel.classList.add("active");
  const tab=el("ptab_"+id); if(tab) tab.classList.add("active");
}

// ── FLIGHT LOG — EDIT ENTRY MODAL ──
function openEditEntry(id){
  const canEdit=(effectiveRole()==="ADMIN"||effectiveRole()==="OPERATOR")&&batchStatus==="DRAFT";
  if(!canEdit){showToast(t("cantEdit"),"err");return;}
  editingEntryId=id;
  clearEntryErrors();
  // Populate aircraft dropdown from AIRCRAFT data
  const acSel=el("f_aeronave");
  acSel.innerHTML=AIRCRAFT.map(a=>'<option value="'+a.matricula+'">'+a.matricula+"</option>").join("");
  const e=id===null?null:flEntries.find(x=>x.id===id);
  el("flEditTitle").textContent=e?t("editEntry")+" #"+(flEntries.indexOf(e)+1):"New Manual Entry";
  if(el("f_bnum")) el("f_bnum").value=e?.bnum||"";
  el("f_fecha").value=e?.fecha||"";
  el("f_aeronave").value=e?.aeronave||"HP-1862FX";
  el("f_operador").value=e?.operador||"FM";
  el("f_piloto").value=e?.piloto||"";
  if(el("f_instructor")) el("f_instructor").value=e?.instructor||"";
  // Show diff alert if entry has a motor/vuelo gap flag
  const diffEl=el("diffAlert"); const diffMsg=el("diffAlertMsg");
  if(diffEl&&diffMsg){
    const ac=AIRCRAFT.find(a=>a.matricula===(e?.aeronave||""));
    const threshold=ac?ac.diffThreshold:0.2;
    const tm2=Math.abs(t2h(e?.motorIn)-t2h(e?.motorOut));
    const tv2=Math.abs(t2h(e?.vueloIn)-t2h(e?.vueloOut));
    const diff=Math.abs(tm2-tv2);
    if(e&&diff>threshold){
      diffMsg.textContent="T.Motor="+fmt(tm2)+" hrs vs T.Flight="+fmt(tv2)+" hrs — gap: "+diff.toFixed(2)+" hrs (threshold: "+threshold+" hrs)";
      diffEl.classList.add("on");
    } else {
      diffEl.classList.remove("on");
    }
  }
  el("f_horoIn").value=e?.horoIn||"";
  el("f_motorOut").value=e?.motorOut||"";
  el("f_motorIn").value=e?.motorIn||"";
  el("f_vueloOut").value=e?.vueloOut||"";
  el("f_vueloIn").value=e?.vueloIn||"";
  // For new entry: auto-populate mult from aircraft+operator; for edit: use saved override
  if(e){
    el("f_mult").value=e.multOverride||"";
  } else {
    const defMult=getAircraftMult(el("f_aeronave").value,el("f_operador").value);
    el("f_mult").value=defMult&&defMult!==1?defMult:"";
  }
  el("f_obs").value=e?.obs||"";
  liveCalcEntry();
  openModal("flMbd"); el("flMbd").style.display="flex";
}

function liveCalcEntry(){
  const mOut=el("f_motorOut").value.trim(); const mIn=el("f_motorIn").value.trim();
  const vOut=el("f_vueloOut").value.trim(); const vIn=el("f_vueloIn").value.trim();
  const tmField=el("f_tmotor"); const tvField=el("f_tvuelo");
  const tmLbl=el("lbl_tmotor"); const tvLbl=el("lbl_tvuelo");

  // T.Motor: free-entry when Out+In both empty, calculated otherwise
  const tmFree=!mOut&&!mIn;
  if(tmFree){
    tmField.removeAttribute("readonly"); tmField.style.background="";
    if(tmLbl) tmLbl.textContent="T.Motor";
  } else {
    tmField.setAttribute("readonly",""); tmField.style.background="var(--s2)";
    if(tmLbl) tmLbl.textContent="T.Motor (calc.)";
  }
  // T.Flight: free-entry when Out+In both empty, calculated otherwise
  const tvFree=!vOut&&!vIn;
  if(tvFree){
    tvField.removeAttribute("readonly"); tvField.style.background="";
    if(tvLbl) tvLbl.textContent="T.Flight";
  } else {
    tvField.setAttribute("readonly",""); tvField.style.background="var(--s2)";
    if(tvLbl) tvLbl.textContent="T.Flight (calc.)";
  }

  const fake={
    aeronave:el("f_aeronave").value,
    operador:el("f_operador").value,
    motorOut:mOut, motorIn:mIn,
    vueloOut:vOut, vueloIn:vIn,
    multOverride:parseFloat(el("f_mult").value)||null
  };
  const{tm:calcTm,tv:calcTv,mult}=calcEntry(fake);

  // Use calculated value if available, else use direct entry
  const tm=calcTm>0?calcTm:(tmFree?parseFloat(tmField.value)||0:0);
  const tv=calcTv>0?calcTv:(tvFree?parseFloat(tvField.value)||0:0);

  if(!tmFree) tmField.value=calcTm>0?calcTm.toFixed(2):"";
  if(!tvFree) tvField.value=calcTv>0?calcTv.toFixed(2):"";

  const tbp=tm>0?+(tm*mult).toFixed(2):0;
  el("pv_tm").textContent=tm>0?fmt(tm)+" hrs":"—";
  el("pv_tf").textContent=tv>0?fmt(tv)+" hrs":"—";
  el("pv_mult").textContent=mult+"×";
  el("pv_tbp").textContent=tm>0?fmt(tbp)+" hrs":"—";
}

const TIMERE=/^([01]?\d|2[0-3]):[0-5]\d$/;
const DATERE=/^\d{2}\/\d{2}\/\d{4}$/;

function validateEntryForm(){
  clearEntryErrors(); let ok=true; let softWarnings=[];
  const fecha=el("f_fecha").value.trim(), piloto=el("f_piloto").value.trim();
  const horoIn=parseFloat(el("f_horoIn").value);
  const mOut=el("f_motorOut").value.trim(), mIn=el("f_motorIn").value.trim();
  const vOut=el("f_vueloOut").value.trim(), vIn=el("f_vueloIn").value.trim();
  // Hard: date required and format
  if(!fecha){setFerr("fe_fecha","f_fecha",t("required"));ok=false;}
  else if(!DATERE.test(fecha)){setFerr("fe_fecha","f_fecha",lang==="es"?"Formato: DD/MM/AAAA":"Format: DD/MM/YYYY");ok=false;}
  // Soft: pilot and horo start
  if(!piloto) softWarnings.push("Pilot name");
  if(isNaN(horoIn)||horoIn<=0) softWarnings.push("Horo. Start");
  // Hard: motor values
  const tmDirect=parseFloat(el("f_tmotor").value)||0;
  const tvDirect=parseFloat(el("f_tvuelo").value)||0;
  if(mOut||mIn){
    if(!mOut){setFerr("fe_motorOut","f_motorOut",t("required"));ok=false;}
    else if(isNaN(t2h(mOut))){setFerr("fe_motorOut","f_motorOut",lang==="es"?"Valor inválido":"Invalid value");ok=false;}
    if(!mIn){setFerr("fe_motorIn","f_motorIn",t("required"));ok=false;}
    else if(isNaN(t2h(mIn))){setFerr("fe_motorIn","f_motorIn",lang==="es"?"Valor inválido":"Invalid value");ok=false;}
    else if(mOut&&t2h(mIn)<=t2h(mOut)){setFerr("fe_motorIn","f_motorIn",lang==="es"?"Motor In debe ser posterior":"Motor In must be after Motor Out");ok=false;}
  } else if(!tmDirect){
    setFerr("fe_motorOut","f_motorOut",lang==="es"?"Ingrese Motor Out/In o T.Motor":"Enter Motor Out/In or T.Motor directly");ok=false;
  }
  // Hard: flight values
  if(vOut||vIn){
    if(!vOut){setFerr("fe_vueloOut","f_vueloOut",t("required"));ok=false;}
    else if(isNaN(t2h(vOut))){setFerr("fe_vueloOut","f_vueloOut",lang==="es"?"Valor inválido":"Invalid value");ok=false;}
    if(!vIn){setFerr("fe_vueloIn","f_vueloIn",t("required"));ok=false;}
    else if(isNaN(t2h(vIn))){setFerr("fe_vueloIn","f_vueloIn",lang==="es"?"Valor inválido":"Invalid value");ok=false;}
    else if(vOut&&t2h(vIn)<=t2h(vOut)){setFerr("fe_vueloIn","f_vueloIn",lang==="es"?"Vuelo In debe ser posterior":"Flight In must be after Flight Out");ok=false;}
  } else if(!tvDirect){
    softWarnings.push("T.Flight");
  }
  if(!ok) return false;
  // Soft warning — show inline banner if critical fields missing
  if(softWarnings.length){
    const warn=el("fl_soft_warn"); const msg=el("fl_soft_warn_msg");
    if(warn&&msg){
      msg.textContent="⚠ Missing: "+softWarnings.join(", ")+". Save anyway?";
      warn.style.display="block";
    }
    return false; // block save — user must click "Save Anyway"
  }
  return true;
}

function saveEntryForm(){
  if(el("fl_soft_warn")) el("fl_soft_warn").style.display="none";
  if(!validateEntryForm()) return;
  proceedSaveEntry();
}

function proceedSaveEntry(){
  const multRaw=parseFloat(el("f_mult").value);
  const multOverride=isNaN(multRaw)||!el("f_mult").value.trim()?null:multRaw;
  const data={
    fecha:el("f_fecha").value.trim(), aeronave:el("f_aeronave").value,
    operador:el("f_operador").value, piloto:el("f_piloto").value.trim(),
    bnum:el("f_bnum")?el("f_bnum").value.trim():"",
    instructor:el("f_instructor")?el("f_instructor").value.trim():"",
    horoIn:parseFloat(el("f_horoIn").value),
    motorOut:el("f_motorOut").value.trim(), motorIn:el("f_motorIn").value.trim(),
    vueloOut:el("f_vueloOut").value.trim(), vueloIn:el("f_vueloIn").value.trim(),
    _directTm:(!el("f_motorOut").value.trim()&&!el("f_motorIn").value.trim())?parseFloat(el("f_tmotor").value)||null:null,
    _directTv:(!el("f_vueloOut").value.trim()&&!el("f_vueloIn").value.trim())?parseFloat(el("f_tvuelo").value)||null:null,
    obs:el("f_obs").value.trim(), multOverride
  };
  checkDiff(data);
  if(editingEntryId!==null){
    const e=flEntries.find(x=>x.id===editingEntryId);
    if(e){
      const changes=[];
      Object.entries(data).forEach(([k,v])=>{if(JSON.stringify(e[k])!==JSON.stringify(v)) changes.push(k+": '"+e[k]+"'→'"+v+"'");});
      if(multOverride&&multOverride!==DEFAULT_MULT[data.operador]) changes.push("⚠ "+t("multOverride")+": "+DEFAULT_MULT[data.operador]+"→"+multOverride);
      Object.assign(e,data);
      addFlAudit("✏️",currentUser.name,"edited entry "+(flEntries.indexOf(e)+1),changes.join(", ")||"no changes");
    }
    showToast(lang==="es"?"Entrada actualizada.":"Entry updated.");
  } else {
    flEntries.push({id:nextEntryId++,status:"pending",reviewObserved:false,...data});
    addFlAudit("➕",currentUser.name,"added entry",data.fecha+"|"+data.aeronave+"|"+data.piloto);
    showToast(lang==="es"?"Nueva entrada agregada.":"New entry added.");
  }
  closeModal("flMbd"); el("flMbd").style.display="none"; renderFlTable();
}

function clearEntryErrors(){
  ["fecha","piloto","horoIn","motorOut","motorIn","vueloOut","vueloIn"].forEach(f=>{
    const e=el("fe_"+f); const i=el("f_"+f);
    if(e){e.textContent="";e.classList.remove("on");}
    if(i) i.classList.remove("err");
  });
}

// ── FLIGHT LOG — WORKFLOW ACTIONS ──
function handleSubmit(){
  const reviewed=getObservedActiveEntries();
  const pending=flEntries.filter(e=>e.status==="pending");
  const approved=flEntries.filter(e=>e.status==="approved");
  if(!approved.length){
    showResultBanner("err",t("submitNeedsApproved"));
    return;
  }
  if(reviewed.length){
    // Contextual message for reviewed entries
    el("excWarn").textContent=t("submitReviewedWarn").replace("{count}",reviewed.length);
    el("excDetail").innerHTML=reviewed.map(e=>"• "+t("entryShort")+" "+(flEntries.indexOf(e)+1)+": "+e.fecha+" | "+e.aeronave+" | "+e.piloto+(latestReviewerComment(e)?" — "+latestReviewerComment(e):"")).join("<br>");
    if(el("exc_title")) el("exc_title").textContent=t("excReviewedTitle");
    if(el("exc_proceed")) el("exc_proceed").textContent=t("resend");
    if(el("exc_back")) el("exc_back").textContent=t("rfrCancel");
    confirmCb=()=>{
      // Mark corrected observations as returned to the reviewer, then submit.
      reviewed.forEach(e=>{
        if(!entryHasCurrentCycleOperatorResponse(e)){
          addThreadComment(e,"OPERATOR",t("reviewCorrectionSubmitted"));
        }
        e.status="approved";
      });
      closeModal("excMbd");
      doSubmit();
    };
    openModal("excMbd");
  } else if(pending.length){
    el("excWarn").textContent=t("submitPendingWarn").replace("{count}",pending.length);
    el("excDetail").innerHTML=pending.map(e=>"• "+t("entryShort")+" "+(flEntries.indexOf(e)+1)+": "+e.fecha+" | "+e.aeronave+" | "+e.piloto).join("<br>");
    if(el("exc_title")) el("exc_title").textContent=t("excPendingTitle");
    if(el("exc_proceed")) el("exc_proceed").textContent=t("excProceed");
    if(el("exc_back")) el("exc_back").textContent=t("excBack");
    confirmCb=()=>{closeModal("excMbd");doSubmit();};
    openModal("excMbd");
  } else {
    showFlConfirm(t("confirmSubmit"),t("confirmSubmitBody"),approved,()=>doSubmit());
  }
}

async function doSubmit(){
  batchStatus="SUBMITTED";
  if(el("resultBanner")) el("resultBanner").style.display="none";
  await saveBatchToDB("submit batch");
  addFlAudit("📤",currentUser.name,"submitted batch",flEntries.filter(e=>e.status==="approved").length+" approved entries");
  const flagged=flEntries.filter(e=>e.status==="flagged").length;
  const approved=flEntries.filter(e=>e.status==="approved").length;
  renderWfBar(); setupFlRoleUI();
  showToast(t("submitted"));
  notifyWhatsApp("REVIEWER",
    t("waSubmitMsg")
      .replace("{user}",currentUser.name)
      .replace("{approved}",approved)
      .replace("{flaggedPart}",flagged?t("waFlaggedPart").replace("{flagged}",flagged):"")
      .replace("{source}",batchSourceFile),
    true
  );
}

function handleApprove(){
  const approved=flEntries.filter(e=>e.status==="approved");
  showFlConfirm(t("confirmApprove"),t("confirmApproveBody"),approved,()=>doApprove());
}

// ── PRE-INVOICE RENDER ──
let piAdditionalCharges=[];
let piSignedBy=null, piSignedAt=null, piInvNum=null;
let piRulesSeeded=false;
let piSortCol="bnum", piSortDir="asc";

function generateInvNum(){
  const now=new Date();
  return "INV-"+now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(Math.floor(Math.random()*900)+100);
}

async function openPiLoadModal(){
  await loadAllBatches();
  // Update i18n labels
  if(el("piLoadTitle")) el("piLoadTitle").textContent=t("piLoadTitle");
  if(el("piLoad_currentLabel")) el("piLoad_currentLabel").textContent=t("piCurrent");
  if(el("piLoad_historicLabel")) el("piLoad_historicLabel").textContent=t("piHistoric");
  // Describe current batch
  const desc=el("piLoad_currentDesc");
  if(desc){
    if(batchStatus==="APPROVED"){
      const approved=flEntries.filter(e=>e.status==="approved");
      desc.textContent=approved.length+" "+t("piApprovedEntries")+" · "+batchStatus;
      desc.style.color="var(--green)";
    } else {
      desc.textContent=t("piCurrentStatus")+": "+batchStatus;
      desc.style.color="var(--dim2)";
    }
  }
  // Populate historic selector — APPROVED batches only, using shared function
  populateBatchSelect(el("piLoad_batchSel"), true);
  // Reset historic section
  const historicSel=el("piLoad_historicSel");
  if(historicSel) historicSel.style.display="none";
  openModal("piLoadMbd");
}

function renderPreInvoice(){
  const ready=el("piDraftState");
  const soon=el("piComingSoon");
  if(!ready||!soon) return;
  if(batchStatus==="APPROVED"){
    ready.style.display="block"; soon.style.display="none";
    if(!piInvNum) piInvNum=generateInvNum();
    const approved=flEntries.filter(e=>e.status==="approved");
    const aircraft=approved.length?AIRCRAFT.find(a=>a.matricula===approved[0].aeronave):null;
    const operatorCode=approved.length?approved[0].operador:"";
    const company=COMPANIES.find(c=>c.code===operatorCode);
    const rate=aircraft?.rates?.find(r=>r.operador===operatorCode);
    const tarifaHr=rate?rate.tarifaHr:0;
    // Auto-seed billing rules from company if not yet seeded for this invoice
    if(!piRulesSeeded && company?.billingRules?.length){
      const totalTbh=approved.reduce((s,e)=>s+calcEntry(e).tbp,0);
      const totalEntries=approved.length;
      company.billingRules.filter(r=>r.active&&r.type!=="discount").forEach(r=>{
        let amt=0, formula="";
        if(r.unit==="per Flight Hour"||r.unit==="/ TBH"){
          amt=parseFloat((r.amount*totalTbh).toFixed(2));
          formula="$"+r.amount.toFixed(2)+" × "+totalTbh.toFixed(2)+" TBH";
        } else if(r.unit==="per Flight"||r.unit==="/ Flight"){
          amt=parseFloat((r.amount*totalEntries).toFixed(2));
          formula="$"+r.amount.toFixed(2)+" × "+totalEntries+" flights";
        } else {
          amt=r.amount;
          formula="$"+r.amount.toFixed(2)+" (flat)";
        }
        piAdditionalCharges.push({desc:r.name,amount:amt,_auto:true,_formula:formula});
      });
      // Seed discount rules — amount computed later in renderPiCharges against live subtotal/total
      company.billingRules.filter(r=>r.active&&r.type==="discount").forEach(r=>{
        piAdditionalCharges.push({desc:r.name,amount:r.amount,_discount:true,_discountMode:r.discountMode||"pct",_discountBase:r.discountBase||"subtotal",_showDiscountLine:r.showDiscountLine??false,_paymentWindowDays:r.paymentWindowDays??0,_footerText:r.footerText||""});
      });
      piRulesSeeded=true;
    }
    if(el("pi_owner_name")) el("pi_owner_name").textContent=aircraft?.owner||"—";
    if(el("pi_owner_detail")) el("pi_owner_detail").textContent=aircraft?.ownerAddress||"";
    if(el("pi_inv_num")) el("pi_inv_num").textContent=piInvNum;
    if(el("pi_inv_date")) el("pi_inv_date").textContent=new Date().toLocaleDateString("es-PA");
    if(el("pi_inv_aircraft")) el("pi_inv_aircraft").textContent=aircraft?.matricula||"—";
    if(el("pi_bill_name")) el("pi_bill_name").textContent=company?.name||"—";
    if(el("pi_bill_detail")){
      const parts=[];
      if(company?.inv_show_address!==false && company?.address) parts.push(company.address);
      if(company?.inv_show_phone!==false && company?.phone) parts.push(company.phone);
      if(company?.inv_show_notes===true && company?.notes) parts.push(company.notes);
      // Contacts flagged for invoice
      if(company?.contacts&&company.contacts.length){
        company.contacts.forEach(c=>{
          if(c.inv_show===false) return;
          let line=c.type+": "+c.name;
          if(c.phone) line+=" · "+c.phone;
          if(c.email) line+=" · "+c.email;
          parts.push(line);
        });
      } else {
        // Fallback to legacy fields
        if(company?.adminContact) parts.push("Attn: "+company.adminContact);
        if(company?.acctContact) parts.push("Acctg: "+company.acctContact);
      }
      el("pi_bill_detail").innerHTML=parts.join("<br>");
    }
    const dates=approved.map(e=>e.fecha).filter(Boolean).sort();
    const bnums=approved.map(e=>e.bnum).filter(Boolean).sort();
    if(el("pi_period")) el("pi_period").textContent=dates.length?(dates[0]+" — "+dates[dates.length-1]):"—";
    if(el("pi_log_range")) el("pi_log_range").textContent=bnums.length?("#"+bnums[0]+" — #"+bnums[bnums.length-1]):"—";
    if(el("pi_rate_display")) el("pi_rate_display").textContent=tarifaHr>0?"$"+tarifaHr.toFixed(2)+"/hr":"—";
    if(el("pi_rate_wrap")) el("pi_rate_wrap").style.display=company?.inv_show_rate!==false?"":"none";
    // Sort approved entries
    const sortedApproved=[...approved].sort((a,b)=>{
      let av,bv;
      if(piSortCol==="bnum"){
        av=a.bnum||""; bv=b.bnum||"";
        return piSortDir==="asc"?av.localeCompare(bv):bv.localeCompare(av);
      } else {
        // fecha is DD/MM/YYYY — convert to YYYYMMDD for correct comparison
        const toYMD=s=>{ if(!s) return ""; const p=s.split("/"); return p.length===3?p[2]+p[1]+p[0]:""; };
        av=toYMD(a.fecha); bv=toYMD(b.fecha);
        return piSortDir==="asc"?av.localeCompare(bv):bv.localeCompare(av);
      }
    });
    // Update sort arrow indicators
    if(el("pi_sort_bnum")) el("pi_sort_bnum").textContent=piSortCol==="bnum"?(piSortDir==="asc"?"↑":"↓"):"";
    if(el("pi_sort_fecha")) el("pi_sort_fecha").textContent=piSortCol==="fecha"?(piSortDir==="asc"?"↑":"↓"):"";
    if(el("pi_th_bnum")) el("pi_th_bnum").style.color=piSortCol==="bnum"?"var(--cyan)":"";
    if(el("pi_th_fecha")) el("pi_th_fecha").style.color=piSortCol==="fecha"?"var(--cyan)":"";
    let totalTbp=0, totalAmt=0;
    const tbody=el("pi_line_items");
    const lastRowTbl=el("pi_last_row");
    if(tbody){
      tbody.innerHTML="";
      if(lastRowTbl) lastRowTbl.innerHTML="";
      sortedApproved.forEach((e,i)=>{
        const{tm,tbp}=calcEntry(e);
        const amt=tarifaHr>0?parseFloat((tbp*tarifaHr).toFixed(2)):0;
        totalTbp+=tbp; totalAmt+=amt;
        const tr=document.createElement("tr");
        tr.innerHTML="<td>"+(i+1)+"</td><td>"+(e.bnum||"—")+"</td><td>"+(e.fecha||"—")+"</td><td>"+(e.piloto||"—")+"</td><td>"+fmt(tbp)+" hrs</td><td class='pi-amt"+(amt===0?" pi-zero":"")+"'>"+fmtCurrency(amt)+"</td>";
        // Last row goes into the summary block, rest into main tbody
        if(i===sortedApproved.length-1 && lastRowTbl){
          lastRowTbl.appendChild(tr);
        } else {
          tbody.appendChild(tr);
        }
      });
    }
    if(el("pi_sub_hrs")) el("pi_sub_hrs").textContent=fmt(totalTbp)+" hrs";
    if(el("pi_sub_amt")) el("pi_sub_amt").textContent=fmtCurrency(totalAmt);
    renderPiCharges(totalAmt);
    if(piSignedBy&&el("pi_signed_badge")){
      el("pi_signed_badge").style.display="flex";
      el("pi_signed_badge").textContent="✓ Approved by "+piSignedBy+" on "+piSignedAt;
      if(el("pi_signoff_btn")) el("pi_signoff_btn").style.display="none";
    }
  } else {
    ready.style.display="none"; soon.style.display="block";
    const msg=el("pi_coming_msg");
    if(msg) msg.textContent=batchStatus==="SUBMITTED"?t("piAwaitingApproval"):t("piApproveToUnlock");
  }
}

function renderPiCharges(subtotal){
  const wrap=el("pi_charges_list"); if(!wrap) return;
  wrap.innerHTML="";
  let chargesTotal=0;
  const charges=piAdditionalCharges.filter(c=>!c._discount);
  const discounts=piAdditionalCharges.filter(c=>c._discount);
  // Render as a table matching pi-tbl 6-column structure: #, Log#, Date, Pilot, TBH, Amount
  const tbl=document.createElement("table");
  tbl.className="pi-tbl"; tbl.style.marginBottom="0";
  const tbody=document.createElement("tbody");
  charges.forEach((c,i)=>{
    const origIdx=piAdditionalCharges.indexOf(c);
    chargesTotal+=c.amount;
    const tr=document.createElement("tr");
    if(c._auto){
      tr.innerHTML=
        '<td colspan="4" style="font-family:var(--mono);font-size:11px;color:var(--text);vertical-align:middle">'+
          c.desc+
          (c._formula?'<div style="font-size:10px;color:var(--dim2);margin-top:2px">'+c._formula+'</div>':'')+
        '</td>'+
        '<td style="vertical-align:middle;text-align:right">'+
          '<input type="number" value="'+c.amount+'" step="0.01" style="background:var(--s3);border:1px solid var(--border2);color:var(--text);padding:4px 6px;font-size:11px;border-radius:2px;width:80px;text-align:right;font-family:var(--mono);box-sizing:border-box" data-ci="'+origIdx+'" data-cf="amt">'+
        '</td>'+
        '<td class="pi-amt" style="text-align:right;vertical-align:middle">'+fmtCurrency(c.amount)+
          ' <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 0 0 6px;vertical-align:middle" data-del-charge="'+origIdx+'">✕</button>'+
        '</td>';
    } else {
      tr.innerHTML=
        '<td colspan="4" style="vertical-align:middle">'+
          '<span class="pi-desc-print" style="font-family:var(--mono);font-size:11px;color:var(--text)">'+c.desc+'</span>'+
          '<input type="text" value="'+c.desc+'" placeholder="Description" style="background:var(--s3);border:1px solid var(--border2);color:var(--text);padding:4px 8px;font-size:11px;border-radius:2px;width:100%;font-family:var(--mono);box-sizing:border-box" data-ci="'+origIdx+'" data-cf="desc">'+
        '</td>'+
        '<td style="vertical-align:middle;text-align:right">'+
          '<input type="number" value="'+c.amount+'" step="0.01" placeholder="0.00" style="background:var(--s3);border:1px solid var(--border2);color:var(--text);padding:4px 6px;font-size:11px;border-radius:2px;width:80px;text-align:right;font-family:var(--mono);box-sizing:border-box" data-ci="'+origIdx+'" data-cf="amt">'+
        '</td>'+
        '<td class="pi-amt" style="text-align:right;vertical-align:middle">'+fmtCurrency(c.amount)+
          ' <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 0 0 6px;vertical-align:middle" data-del-charge="'+origIdx+'">✕</button>'+
        '</td>';
    }
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  const grandTotal=subtotal+chargesTotal;
  if(el("pi_total_amt")) el("pi_total_amt").textContent=fmtCurrency(grandTotal);
  // Render discount breakdown and pronto pago block
  const discWrap=el("pi_discount_block");
  const prontoWrap=el("pi_pronto_block");
  const totalAmtEl=el("pi_total_amt");
  const totalLblEl=totalAmtEl?totalAmtEl.previousElementSibling:null;
  if(discWrap) discWrap.innerHTML="";
  if(prontoWrap){ prontoWrap.innerHTML=""; prontoWrap.style.display="none"; }
  if(discounts.length){
    // De-emphasize TOTAL AMOUNT DUE when pronto pago exists
    if(totalAmtEl) totalAmtEl.classList.add("has-pronto");
    if(totalLblEl) totalLblEl.classList.add("has-pronto");
    // Compute stacked net total across all discounts
    let totalDiscAmt=0;
    discounts.forEach(d=>{
      const base=d._discountBase==="total"?grandTotal:subtotal;
      totalDiscAmt+=d._discountMode==="pct"?parseFloat((base*(d.amount/100)).toFixed(2)):d.amount;
    });
    totalDiscAmt=parseFloat(totalDiscAmt.toFixed(2));
    const netTotal=parseFloat((grandTotal-totalDiscAmt).toFixed(2));
    // Render optional per-discount breakdown lines (showDiscountLine=true only)
    if(discWrap){
      discounts.forEach(d=>{
        if(!(d._showDiscountLine??false)) return;
        const base=d._discountBase==="total"?grandTotal:subtotal;
        const dAmt=d._discountMode==="pct"?parseFloat((base*(d.amount/100)).toFixed(2)):d.amount;
        const dRow=document.createElement("div");
        dRow.style.cssText="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px dashed var(--border2);font-family:var(--mono);font-size:11px";
        dRow.innerHTML='<span style="color:var(--dim2)">'+d.desc+
          ' <span style="color:var(--dim);font-size:9px">('+
          (d._discountMode==="pct"?d.amount+"% "+t(d._discountBase==="total"?"discOfTotal":"discOfSubtotal"):"$"+dAmt.toFixed(2)+" off")+
          ')</span></span><span style="color:var(--red)">− '+fmtCurrency(dAmt)+'</span>';
        discWrap.appendChild(dRow);
      });
    }
    // Render pronto pago — larger amt (24px), more breathing room (margin-bottom:20px)
    if(prontoWrap){
      prontoWrap.style.cssText="margin-top:8px;margin-bottom:20px;padding:12px 16px;background:rgba(26,153,85,.07);border:1px solid rgba(26,153,85,.3);border-left:3px solid var(--green);border-radius:2px;display:block";
      const d=discounts[0];
      const footerDays=d._paymentWindowDays??0;
      const footerCustom=d._footerText||"";
      const footerLine=footerCustom||(footerDays>0?(t("validoPor")+" "+footerDays+" "+t("diasHabiles")):"");
      prontoWrap.innerHTML=
        '<div style="display:flex;justify-content:space-between;align-items:baseline;font-family:var(--mono)">'+
          '<span class="pi-pronto-label" style="font-size:13px;font-weight:700;letter-spacing:1px;color:var(--green)">'+t("prontoPago")+'</span>'+
          '<span class="pi-pronto-amt" style="font-size:24px;font-weight:700;color:var(--green);letter-spacing:1px;font-family:var(--display)">'+fmtCurrency(netTotal)+'</span>'+
        '</div>'+
        (footerLine?'<div class="pi-pronto-footer" style="font-family:var(--mono);font-size:9px;color:var(--dim2);margin-top:4px">'+footerLine+'</div>':"");
    }
  } else {
    // No discount: restore full emphasis on TOTAL AMOUNT DUE
    if(totalAmtEl) totalAmtEl.classList.remove("has-pronto");
    if(totalLblEl) totalLblEl.classList.remove("has-pronto");
  }
  wrap.querySelectorAll("input").forEach(inp=>{
    inp.addEventListener("change",()=>{
      const i=parseInt(inp.dataset.ci);
      if(inp.dataset.cf==="desc") piAdditionalCharges[i].desc=inp.value;
      else{ piAdditionalCharges[i].amount=parseFloat(inp.value)||0; }
      renderPiCharges(subtotal);
    });
  });
  wrap.querySelectorAll("[data-del-charge]").forEach(btn=>{
    btn.addEventListener("click",()=>{piAdditionalCharges.splice(parseInt(btn.dataset.delCharge),1);renderPiCharges(subtotal);});
  });
}

async function reopenBatch(){
  const reason=el("reopen_reason")?el("reopen_reason").value.trim():"";
  if(!reason){showToast(t("reopenReasonRequired"),"err");return;}
  const prevStatus=batchStatus;
  batchStatus="DRAFT";
  await saveBatchToDB("manual reopen batch");
  addFlAudit("↩",currentUser.name,"batch reopened","From: "+prevStatus+" — Reason: "+reason);
  addAudit("↩",currentUser.name,"batch reopened",currentBatchId+" from "+prevStatus+" — "+reason);
  closeModal("reopenMbd");
  if(el("reopen_reason")) el("reopen_reason").value="";
  renderWfBar(); setupFlRoleUI(); renderFlTable();
  showToast(t("reopenDone"),"warn");
}

async function doApprove(){
  batchStatus="APPROVED";
  if(el("resultBanner")) el("resultBanner").style.display="none";
  await saveBatchToDB("approve for invoicing");
  exportFlCSV();
  addFlAudit("✅",currentUser.name,"approved for invoicing",flEntries.filter(e=>e.status==="approved").length+" entries");
  renderWfBar(); setupFlRoleUI(); renderPreInvoice();
  showToast(t("approvedMsg"));
  notifyWhatsApp("OPERATOR",
    t("waApproveMsg")
      .replace("{user}",currentUser.name)
      .replace("{approved}",flEntries.filter(e=>e.status==="approved").length)
      .replace("{source}",batchSourceFile),
    true
  );
}

// ── RETURN FOR REVIEW ──
function openRfr(){
  const flagged=getReturnForReviewCandidates();
  const tbody=el("rfr_tbody"); if(tbody) tbody.innerHTML="";
  const noFlags=el("rfr_noFlags");
  if(flagged.length===0){
    if(noFlags){ noFlags.style.display=""; noFlags.textContent=t("rfrNoFlags"); }
  } else {
    if(noFlags) noFlags.style.display="none";
    flagged.forEach(e=>{
      const gi=flEntries.indexOf(e)+1;
      const checked=entryActiveObserved(e)?" checked":"";
      const comment=latestReviewerComment(e);
      const tr=document.createElement("tr");
      tr.style.borderBottom="1px solid var(--border)";
      tr.innerHTML=`<td style="padding:6px 8px;text-align:center"><input class="rfr-include" type="checkbox" data-rfr-entry="${e.id}"${checked} aria-label="${t("rfrIncludeTip")}"></td>`+
        `<td style="padding:6px 8px;color:var(--text)">${gi}</td>`+
        `<td style="padding:6px 8px;color:var(--cyan)">${e.bnum||"—"}</td>`+
        `<td style="padding:6px 8px;color:var(--yellow)">${escHtml(comment)}</td>`;
      tbody.appendChild(tr);
    });
  }
  // i18n labels
  if(el("rfr_title")) el("rfr_title").textContent=t("rfrTitle");
  if(el("rfr_subtitle")) el("rfr_subtitle").textContent=t("rfrSubtitle").replace("{count}",flagged.length);
  if(el("rfr_colInclude")) el("rfr_colInclude").textContent=t("rfrColInclude");
  if(el("rfr_colEntry")) el("rfr_colEntry").textContent=t("rfrColEntry");
  if(el("rfr_colLog")) el("rfr_colLog").textContent=t("rfrColLog");
  if(el("rfr_colComment")) el("rfr_colComment").textContent=t("rfrColComment");
  if(el("rfr_batchNoteLabel")) el("rfr_batchNoteLabel").textContent=t("rfrBatchNote");
  if(el("rfr_batchNote")) el("rfr_batchNote").placeholder=t("rfrBatchNotePh");
  if(el("rfr_cancel")) el("rfr_cancel").textContent=t("rfrCancel");
  if(el("rfr_continue")) el("rfr_continue").textContent=t("rfrContinue");
  // Admin CC notice
  const notice=el("rfr_adminNotice");
  if(notice) notice.style.display=_adminCcEnabled?"":"none";
  if(el("rfr_adminNoticeText")) el("rfr_adminNoticeText").textContent=t("rfrAdminNotice");
  // Show dialog
  const dlg=el("rfrDialog"); if(dlg){ dlg.style.display="flex"; }
  el("rfrMbd").style.display="flex";
  makeDraggable("rfrDialog","rfrDialogHdr");
}

function closeRfr(){
  if(el("rfrDialog")) el("rfrDialog").style.display="none";
  if(el("rfrMbd")) el("rfrMbd").style.display="none";
  if(el("rfr_batchNote")) el("rfr_batchNote").value="";
}

async function doReturnForReview(){
  const batchNote=el("rfr_batchNote")?el("rfr_batchNote").value.trim():"";
  const checkedIds=[...document.querySelectorAll(".rfr-include:checked")].map(cb=>parseInt(cb.dataset.rfrEntry,10));
  const checkedSet=new Set(checkedIds);
  const candidates=getReturnForReviewCandidates();
  const flagged=candidates.filter(e=>checkedSet.has(e.id));
  if(!flagged.length){ showToast(t("rfrSelectOne"),"err"); return; }
  const logNums=flagged.map(e=>e.bnum||(  "#"+(flEntries.indexOf(e)+1))).join(", ");
  // Selected entries remain active observations; excluded entries keep history only.
  candidates.forEach(e=>{
    if(e.status==="nonbillable"||e.status==="void") return;
    if(checkedSet.has(e.id)){
      e.flagNote=latestReviewerComment(e);
      e.status="flagged";
    } else if(e.status==="flagged"){
      e.status="approved";
    }
  });
  closeRfr();
  // Revert batch to DRAFT, increment cycle
  batchStatus="DRAFT";
  reviewCycle++;
  if(el("resultBanner")) el("resultBanner").style.display="none";
  await saveBatchToDB("return for review");
  addFlAudit("↩",currentUser.name,t("auditReturnedBatch"),flagged.length+" "+t("rfrWaFlagged"));
  renderWfBar(); setupFlRoleUI(); renderFlTable();
  // Pre-activate reviewer_comments filter for operator
  if(el("filterOp")){ el("filterOp").value="reviewer_comments"; renderFlTable(); }
  showToast(t("returnedMsg"));
  // Build bilingual WA message
  const msg = lang==="es"
    ? t("rfrWaMsg")+" "+currentUser.name+".\n"+
      flagged.length+" "+t("rfrWaFlagged")+".\n"+
      t("rfrWaLogs")+" "+logNums+
      (batchNote?"\n"+t("noteLabel")+": "+batchNote:"")+"\n"+
      t("rfrWaLogin")
    : t("rfrWaMsg")+" "+currentUser.name+".\n"+
      flagged.length+" "+t("rfrWaFlagged")+".\n"+
      t("rfrWaLogs")+" "+logNums+
      (batchNote?"\n"+t("noteLabel")+": "+batchNote:"")+"\n"+
      t("rfrWaLogin");
  notifyWhatsApp("OPERATOR", msg, true);
}

async function saveDraft(){
  await saveBatchToDB("save draft");
  addFlAudit("💾",currentUser.name,"saved draft",flEntries.length+" entries");
  showToast(t("draftSaved"));
}

function proceedAnyway(){ closeModal("excMbd"); if(confirmCb){confirmCb();confirmCb=null;} }

function showFlConfirm(title,body,approvedEntries,cb){
  el("confirm_title").textContent=title; el("confirm_body").textContent=body;
  let fmM=0,fmT=0,magM=0,magT=0;
  approvedEntries.forEach(e=>{ const{tm,tbp}=calcEntry(e); if(e.operador==="FM"){fmM+=tm;fmT+=tbp;}else{magM+=tm;magT+=tbp;} });
  el("confirmStats").innerHTML=
    '<div class="cs-ok">FM — '+t("thTm")+": "+fmt(fmM)+" "+t("hrs")+" | "+t("thTbp")+": "+fmt(fmT)+" "+t("hrs")+"</div>"+
    '<div class="cs-w">MAG — '+t("thTm")+": "+fmt(magM)+" "+t("hrs")+" | "+t("thTbp")+": "+fmt(magT)+" "+t("hrs")+"</div>"+
    '<div class="cs-c" style="margin-top:4px">'+t("totalApproved")+": "+approvedEntries.length+"</div>"+
    '<div class="cs-c">'+t("totalTbh")+": "+fmt(fmT+magT)+" "+t("hrs")+"</div>"+
    '<div class="cs-d">'+t("csvNote")+"</div>";
  confirmCb=cb; openModal("confirmMbd");
}

function executeConfirm(){ closeModal("confirmMbd"); if(confirmCb){confirmCb();confirmCb=null;} }

// ── EXPORTS ──
function exportFlCSV(){
  const hdrs=flExportHeaders();
  const rows=flEntries.map((e,i)=>{
    const{tm,tv,tbp}=calcEntry(e);
    return [i+1,e.bnum||"",e.fecha,e.aeronave,e.operador,e.piloto,e.instructor||"",e.horoIn,
      e.motorOut,e.motorIn,tm.toFixed(2),e.vueloOut,e.vueloIn,tv.toFixed(2),
      DEFAULT_MULT[e.operador]||"",e.multOverride||"",tbp.toFixed(2),
      e.obs||"",e.flagNote||"",e.status,batchStatus,currentUser.name,batchSourceFile.join(", "),FL_LOAD_TS.toISOString()]
      .map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(",");
  });
  const ts=FL_LOAD_TS.toISOString().slice(0,16).replace(/[T:]/g,"-");
  dlFile("flightlog_audit_"+ts+".csv",[hdrs.join(","),...rows].join("\n"),"text/csv");
  if(el("srcCsv")) el("srcCsv").textContent=t("srcCsvDone")+" "+new Date().toLocaleTimeString();
  showToast(t("csvDl"));
}

function exportFlXLSX(){
  if(typeof XLSX==="undefined"){showToast(t("xlsxLibMissing"),"err");return;}
  const headers=flExportHeaders();
  const data=[headers,...flEntries.map((e,i)=>{
    const{tm,tv,tbp}=calcEntry(e);
    return [i+1,e.bnum||"",e.fecha,e.aeronave,e.operador,e.piloto,e.instructor||"",e.horoIn,
      e.motorOut,e.motorIn,parseFloat(tm.toFixed(2)),
      e.vueloOut,e.vueloIn,parseFloat(tv.toFixed(2)),
      DEFAULT_MULT[e.operador]||"",e.multOverride||"",parseFloat(tbp.toFixed(2)),
      e.obs||"",e.flagNote||"",e.status,batchStatus,currentUser.name,batchSourceFile.join(", "),FL_LOAD_TS.toISOString()];
  })];
  const ws=XLSX.utils.aoa_to_sheet(data);
  ws["!cols"]=[4,12,12,10,18,18,11,10,10,9,10,10,9,9,10,10,20,10,12,16,22,22].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Flight Log");
  let fmM=0,fmT=0,magM=0,magT=0;
  flEntries.filter(e=>e.status==="approved").forEach(e=>{const{tm,tbp}=calcEntry(e);if(e.operador==="FM"){fmM+=tm;fmT+=tbp;}else{magM+=tm;magT+=tbp;}});
  const sumData=[
    ["HP Fleet — Flight Log Summary",""],
    ["Generated",new Date().toLocaleString()],
    ["Source File",batchSourceFile.join(", ")],["Batch Status",batchStatus],["Loaded By",currentUser.name],["",""],
    ["Operator","T.Motor (hrs)","Total TBH (hrs)"],
    ["FM",parseFloat(fmM.toFixed(2)),parseFloat(fmT.toFixed(2))],
    ["MAG",parseFloat(magM.toFixed(2)),parseFloat(magT.toFixed(2))],
    ["TOTAL",parseFloat((fmM+magM).toFixed(2)),parseFloat((fmT+magT).toFixed(2))]
  ];
  const wsSum=XLSX.utils.aoa_to_sheet(sumData);
  wsSum["!cols"]=[{wch:18},{wch:14},{wch:16}];
  XLSX.utils.book_append_sheet(wb,wsSum,"Summary");
  const ts=FL_LOAD_TS.toISOString().slice(0,16).replace(/[T:]/g,"-");
  XLSX.writeFile(wb,"flightlog_"+ts+".xlsx");
  showToast(t("xlsxDl"));
}

function flExportHeaders(){
  return [
    "#",t("thLog"),t("thDate"),t("thAc"),t("thOp"),t("thPilot"),t("thInstructor"),t("horoStart"),
    t("motorOut"),t("motorIn"),t("thTm"),t("flightOut"),t("flightIn"),t("thTf"),t("defaultMult"),
    t("overrideMult"),t("totalTbh"),t("thObs"),t("reviewComment"),t("thStatus2"),t("batchStatus"),
    t("loadedBy"),t("sourceFile"),t("timestamp")
  ];
}

function dlFile(name,content,type){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([content],{type}));
  a.download=name; a.click();
}



// ── FLAG ENTRY (Reviewer) ──
function openFlagEntry(id){
  const e=flEntries.find(x=>x.id===id); if(!e) return;
  flaggingEntryId=id;
  if(el("flag_title")) el("flag_title").textContent=t("flagTitle");
  if(el("flag_note_label")) el("flag_note_label").textContent=t("flagNoteLabel");
  if(el("flag_comment")) el("flag_comment").placeholder=t("flagNotePh");
  if(el("flag_cancel")) el("flag_cancel").textContent=t("rfrCancel");
  if(el("flag_save")) el("flag_save").textContent=t("flagSave");
  el("flagEntryLabel").textContent=t("entryShort")+" #"+(flEntries.indexOf(e)+1)+" — "+e.fecha+" | "+e.piloto;
  el("flag_comment").value=e.flagNote||"";
  openModal("flagMbd");
}

async function saveFlagEntry(){
  const comment=el("flag_comment").value.trim();
  if(!comment){showToast(t("flagIssueRequired"),"err");return;}
  const e=flEntries.find(x=>x.id===flaggingEntryId); if(!e) return;
  addThreadComment(e,"REVIEWER",comment);
  e.status="flagged";
  e.flagNote=comment;
  addFlAudit("🚩",currentUser.name,"flagged entry #"+(flEntries.indexOf(e)+1),comment);
  closeModal("flagMbd");
  await saveBatchToDB("flag entry");
  renderFlTable();
  showToast(t("entryFlagged"));
}

// ── WHATSAPP NOTIFY — with confirmation dialog ──
let _waPendingUrl=null;
let _adminCcEnabled=false;
let _waCcMessage=null;

function notifyWhatsApp(toRole, message, ccAdmin=false){
  const recipient=USERS.find(u=>u.role===toRole&&u.status==="active"&&u.phone);
  if(!recipient||!recipient.phone){ dbg("No WhatsApp number for "+toRole,"warn"); return; }
  const phone=recipient.phone.replace(/[^0-9]/g,"");
  _waPendingUrl="https://wa.me/"+phone+"?text="+encodeURIComponent(message);
  _waCcMessage=(_adminCcEnabled&&ccAdmin)?message:null;
  // Show confirmation dialog
  if(el("wa_msg_preview")) el("wa_msg_preview").textContent=message.split("\n")[0];
  if(el("wa_recipient")) el("wa_recipient").textContent=recipient.name+" · "+recipient.phone;
  const showCc=_adminCcEnabled&&ccAdmin;
  if(el("wa_adminNotice")) el("wa_adminNotice").style.display=showCc?"":"none";
  if(el("wa_adminNoticeText")) el("wa_adminNoticeText").textContent=t("rfrAdminNotice");
  if(el("wa_title")) el("wa_title").textContent=t("waTitle");
  if(el("wa_skip")) el("wa_skip").textContent=t("waSkip");
  if(el("wa_send")) el("wa_send").textContent=t("waSend");
  openModal("waMbd");
}

function sendWhatsApp(){
  closeModal("waMbd");
  if(_waPendingUrl){window.open(_waPendingUrl,"_blank");_waPendingUrl=null;}
  if(_waCcMessage){
    // Silent email CC to admin
    const admin=USERS.find(u=>u.role==="ADMIN"&&u.status==="active"&&u.email);
    if(admin&&admin.email){
      const subject=encodeURIComponent(t("waEmailSubject"));
      const body=encodeURIComponent(_waCcMessage);
      const a=document.createElement("a");
      a.href="mailto:"+admin.email+"?subject="+subject+"&body="+body;
      a.click();
    }
    _waCcMessage=null;
  }
}
function skipWhatsApp(){ closeModal("waMbd"); _waPendingUrl=null; _waCcMessage=null; }

// ── SIDE PANEL IMAGE ZOOM & ROTATE ──
let spZoom=1, spRotation=0, spPanX=0, spPanY=0, spPanMode=false;

async function resetTestData(){
  if(!currentBatchId){showToast(lang==="es"?"No hay lote activo":"No active batch","err");return;}
  flEntries.forEach(e=>{
    e.flagNote="";
    e.reviewThread=[];
    e.reviewObserved=false;
    e.status="pending";
  });
  await saveBatchToDB("reset test data");
  renderFlTable(); updateSrcBar(); renderWfBar();
  addFlAudit("🗑",currentUser.name,"reset test data","All entry flag_note, review_thread cleared, status → pending");
  showToast(lang==="es"?"Datos de prueba reiniciados":"Test data reset","warn");
}

function _scaleNonBillWatermark(){
  const wrap=el("sp_img_wrap");
  const txt=el("sp_nonbill_wm_text");
  if(!wrap||!txt) return;
  const h=wrap.offsetHeight||300;
  txt.style.fontSize=Math.max(18,Math.floor(h*0.12))+"px";
}

function refreshSidePanelLocalizedEntryText(){
  if(!spEditingEntryId) return;
  const entry=flEntries.find(e=>e.id===spEditingEntryId);
  if(!entry) return;
  const wm=el("sp_nonbill_watermark");
  const wmTxt=el("sp_nonbill_wm_text");
  if(wm&&wmTxt){
    if(entry.status==="nonbillable"){
      wmTxt.textContent=formatNonBillReason(entry.nonBillReason,false)||t("spNonBillable");
      wm.style.display="flex";
      _scaleNonBillWatermark();
    } else {
      wm.style.display="none";
    }
  }
  const obs=el("sp_obs");
  if(obs&&entry.status==="nonbillable"&&entry.nonBillReason&&obs.value.trim().startsWith("⊘")){
    obs.value="⊘ "+formatNonBillReason(entry.nonBillReason);
  }
}

function syncSidePanelReviewZone(){
  const zone=el("spReviewZone");
  const row=el("spCommentRow");
  const resize=el("spReviewResize");
  const toggle=el("spReviewToggle");
  if(!zone||!row) return;
  const hidden=row.style.display==="none";
  zone.classList.toggle("is-hidden", hidden);
  if(resize) resize.classList.toggle("is-hidden", hidden);
  if(toggle) toggle.textContent=zone.classList.contains("is-collapsed")?"▴":"▾";
}

function spApplyTransform(){
  const img=el("sp_img"); if(!img) return;
  img.style.transform=`rotate(${spRotation}deg) scale(${spZoom}) translate(${spPanX}px,${spPanY}px)`;
  // Update zoom level indicator
  if(el("sp_zoom_level")) el("sp_zoom_level").textContent=Math.round(spZoom*100)+"%";
  // Update pan button active state
  const panBtn=el("sp_pan_toggle");
  if(panBtn) panBtn.classList.toggle("active", spPanMode);
  // Update wrap cursor
  const wrap=el("sp_img_wrap");
  if(wrap) wrap.classList.toggle("panning", spPanMode);
}

function spFitToWindow(){
  spZoom=1; spPanX=0; spPanY=0; spPanMode=false; spApplyTransform();
}

function spZoomIn(){ spZoom=Math.min(4,+(spZoom+0.25).toFixed(2)); spApplyTransform(); }
function spZoomOut(){ spZoom=Math.max(0.25,+(spZoom-0.25).toFixed(2)); if(spZoom===1){spPanX=0;spPanY=0;} spApplyTransform(); }
function spZoomReset(){ spZoom=1; spPanX=0; spPanY=0; spApplyTransform(); }
function spTogglePan(){ spPanMode=!spPanMode; spApplyTransform(); }

function spRotateImg(){
  spRotation=(spRotation+90)%360;
  // Persist rotation on the entry so it survives panel reloads
  if(spEditingEntryId){
    const entry=flEntries.find(e=>e.id===spEditingEntryId);
    if(entry) entry._rotation=spRotation;
  }
  spApplyTransform();
}

function spResetTransform(){ spZoom=1; spRotation=0; spPanX=0; spPanY=0; spPanMode=false; spApplyTransform(); }

// ── UNDO LAST STATUS CHANGE ──
let _lastStatusChange=null; // {entryId, prevStatus, prevNonBillReason}
let _undoTimer=null;

function recordStatusChange(entryId, prevStatus, prevNonBillReason){
  _lastStatusChange={entryId, prevStatus, prevNonBillReason};
  showUndoBtn();
}

function showUndoBtn(){
  let btn=el("undoBtn");
  if(!btn){
    btn=document.createElement("button");
    btn.id="undoBtn";
    btn.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--s2);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);font-size:11px;padding:8px 20px;border-radius:20px;cursor:pointer;z-index:300;box-shadow:0 4px 12px rgba(0,0,0,.4);transition:opacity .3s";
    btn.textContent="↩ Undo";
    btn.addEventListener("click",undoStatusChange);
    document.body.appendChild(btn);
  }
  btn.style.opacity="1";
  btn.style.display="block";
  if(_undoTimer) clearTimeout(_undoTimer);
  _undoTimer=setTimeout(()=>{
    if(btn){ btn.style.opacity="0"; setTimeout(()=>{btn.style.display="none";},300); }
  },5000);
}

function undoStatusChange(){
  if(!_lastStatusChange) return;
  const {entryId,prevStatus,prevNonBillReason}=_lastStatusChange;
  const entry=flEntries.find(e=>e.id===entryId); if(!entry) return;
  entry.status=prevStatus;
  entry.nonBillReason=prevNonBillReason||null;
  spUpdateNonBillBtn(entry.status==="nonbillable");
  _lastStatusChange=null;
  renderFlTable(); updateSrcBar();
  const btn=el("undoBtn");
  if(btn){btn.style.display="none";}
  showToast("Undone","info");
}

let spReextracting=false;
let spDirty=false;

function spUpdateNonBillBtn(isNonBill){
  const btn=el("sp_nonbill_toggle"); if(!btn) return;
  if(isNonBill){
    btn.textContent="● "+t("spNonBillable");
    btn.classList.add("active");
  } else {
    btn.textContent="○ "+t("spNonBillable");
    btn.classList.remove("active");
    const wm=el("sp_nonbill_watermark"); if(wm) wm.style.display="none";
  }
} // tracks unsaved changes in side panel

// Mark panel dirty when any field changes
function spMarkDirty(){
  spDirty=true;
  const saveBtn=el("sp_save");
  if(saveBtn){ saveBtn.disabled=false; saveBtn.style.cursor="pointer"; saveBtn.style.opacity="1"; saveBtn.style.background="rgba(65,209,255,.12)"; saveBtn.style.borderColor="var(--cyan)"; saveBtn.style.color="var(--cyan)"; }
}
function spClearDirty(){
  spDirty=false;
  const saveBtn=el("sp_save");
  if(saveBtn){ saveBtn.disabled=true; saveBtn.style.cursor="not-allowed"; saveBtn.style.opacity="0.4"; saveBtn.style.background="rgba(65,209,255,.04)"; saveBtn.style.borderColor="var(--dim2)"; saveBtn.style.color="var(--dim2)"; }
}

// Aircraft cascade — filters operators and multiplier to valid values for selected aircraft
function spCascadeAircraftDropdowns(matricula){
  const opSel=el("sp_operador");
  const multSel=el("sp_mult_sel");
  const multInp=el("sp_mult");
  if(!opSel) return;
  const ac=AIRCRAFT.find(a=>a.matricula===matricula);
  const currentOp=opSel.value;
  opSel.innerHTML="";
  if(ac&&ac.rates&&ac.rates.length){
    ac.rates.forEach(r=>{
      const opt=document.createElement("option");
      opt.value=r.operador; opt.textContent=r.operador;
      opSel.appendChild(opt);
    });
    if(ac.rates.find(r=>r.operador===currentOp)) opSel.value=currentOp;
    else opSel.value=ac.rates[0].operador;
  } else {
    ["FM","MAG"].forEach(op=>{
      const opt=document.createElement("option");
      opt.value=op; opt.textContent=op;
      opSel.appendChild(opt);
    });
  }
  // Populate mult dropdown with all rates for this aircraft + Custom
  if(multSel&&ac&&ac.rates){
    multSel.innerHTML="";
    ac.rates.forEach(r=>{
      const opt=document.createElement("option");
      opt.value=r.multiplicador;
      opt.textContent=r.operador+" — "+r.multiplicador.toFixed(3);
      multSel.appendChild(opt);
    });
    const customOpt=document.createElement("option");
    customOpt.value="custom"; customOpt.textContent=t("spCustomOption");
    multSel.appendChild(customOpt);
    multSel.value=ac.rates.find(r=>r.operador===opSel.value)?.multiplicador||ac.rates[0].multiplicador;
    if(multInp) multInp.style.display="none";
  }
  spLiveCalc();
}

// Unsaved changes guard — call before navigating away from current entry
async function spGuardDirty(proceedFn){
  if(!spDirty){ proceedFn(); return; }
  const confirmed=confirm(t("spSaveChangesConfirm"));
  if(confirmed) await saveSpEntry();
  spDirty=false;
  proceedFn();
}

function getSavedSpImageHeight(panel, fixedH=0){
  const raw=localStorage.getItem("hpfleet_sp_img_h");
  const saved=parseInt(raw||"",10);
  if(!saved) return null;
  const maxH=Math.max(150,(panel?panel.offsetHeight:window.innerHeight)-fixedH-220);
  return Math.max(150,Math.min(saved,maxH));
}

async function spReextract(){
  if(!spEditingEntryId) return;
  if(spReextracting){showToast("Re-extraction already in progress","warn");return;}
  if(isExtracting){showToast("Batch extraction in progress — please wait","warn");return;}
  const apiKey=getApiKey();
  if(!apiKey){showToast("API key not configured","err");return;}
  const entry=flEntries.find(e=>e.id===spEditingEntryId); if(!entry||!entry.imageUrl) return;

  // Guard + spinner
  spReextracting=true;
  const reBtn=el("sp_reextract");
  if(reBtn){reBtn.disabled=true;reBtn.textContent="↺ Extracting…";}
  const wrap=el("sp_img_wrap");
  const spinner=document.createElement("div");
  spinner.id="sp_spinner";
  spinner.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:10;border-radius:2px";
  spinner.innerHTML='<div style="width:36px;height:36px;border:3px solid var(--border2);border-top-color:var(--cyan);border-radius:50%;animation:spin 0.7s linear infinite"></div>';
  if(wrap) wrap.appendChild(spinner);

  try {
    const resp=await fetch(entry.imageUrl);
    const blob=await resp.blob();
    const img=new Image();
    await new Promise(r=>{img.onload=r;img.src=URL.createObjectURL(blob);});
    const natW=img.naturalWidth||img.width;
    const natH=img.naturalHeight||img.height;
    const canvas=document.createElement("canvas");
    const swap=spRotation===90||spRotation===270;
    canvas.width=swap?natH:natW;
    canvas.height=swap?natW:natH;
    const ctx=canvas.getContext("2d");
    ctx.save();
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.rotate(spRotation*Math.PI/180);
    ctx.drawImage(img,-natW/2,-natH/2,natW,natH);
    ctx.restore();
    const rotatedBlob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",0.9));
    const rotatedFile=new File([rotatedBlob],"reextract.jpg",{type:"image/jpeg"});
    const results=await extractImageFile(rotatedFile,apiKey);
    if(!results||!results.length){showToast("No log data found on this page","warn");return;}
    const r=results[0];
    // Populate side panel fields
    if(el("sp_bnum")) el("sp_bnum").value=r.bnum||"";
    if(el("sp_fecha")) el("sp_fecha").value=r.fecha||"";
    if(el("sp_piloto")) el("sp_piloto").value=r.piloto||"";
    if(el("sp_instructor")) el("sp_instructor").value=r.instructor||"";
    if(el("sp_motorOut")) el("sp_motorOut").value=r.motorOut||"";
    if(el("sp_motorIn")) el("sp_motorIn").value=r.motorIn||"";
    if(el("sp_vueloOut")) el("sp_vueloOut").value=r.vueloOut||"";
    if(el("sp_vueloIn")) el("sp_vueloIn").value=r.vueloIn||"";
    if(el("sp_obs")) el("sp_obs").value=r.obs||"";
    spLiveCalc();
    showToast("Re-extraction complete — review and save");
    // Upload corrected image — update src BEFORE resetting rotation so no spin-back
    const compressed=await compressImage(rotatedBlob,800,0.7);
    const newUrl=await uploadImageToStorage(compressed,"reextract_"+Date.now()+".jpg");
    if(newUrl){
      entry.imageUrl=newUrl;
      entry._rotation=0;
      spRotation=0;
      // Set new src first, reset transform only after image loads
      const imgEl=el("sp_img");
      if(imgEl){
        imgEl.onload=()=>{ spApplyTransform(); imgEl.onload=null; };
        imgEl.src=newUrl;
      } else { spApplyTransform(); }
    }
    // Reset entry status to pending so row color updates
    entry.status="pending";
    renderFlTable();
  } catch(err){
    showToast("Re-extract error: "+err.message,"err");
    dbg("Re-extract error: "+err.message,"err");
  } finally {
    spReextracting=false;
    if(reBtn){
      reBtn.disabled=false;
      reBtn.innerHTML='<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg> OCR';
    }
    const sp=document.getElementById("sp_spinner");
    if(sp) sp.remove();
  }
}
let _namePropData=null; // {field, oldVal, newVal, matches, currentEntryId}

function checkNamePropagation(entryId, field, oldVal, newVal, onConfirm){
  if(!oldVal||!newVal||oldVal===newVal) { onConfirm([]); return; }
  const matches=flEntries.filter(e=>
    e.id!==entryId &&
    String(e[field]||"").trim().toLowerCase()===oldVal.trim().toLowerCase()
  );
  if(!matches.length){ onConfirm([]); return; }
  // Show propagation dialog
  _namePropData={field,oldVal,newVal,matches,currentEntryId:entryId,onConfirm};
  el("namePropTitle").textContent=field==="piloto"?"Pilot Name Correction":"Instructor Name Correction";
  el("namePropMsg").textContent=
    '"'+oldVal+'" → "'+newVal+'" — This name appears in '+matches.length+' other entr'+(matches.length===1?"y":"ies")+'. Apply correction?';
  const list=el("namePropList");
  list.innerHTML=matches.map((e,i)=>
    '<label style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--s3);border-radius:2px;cursor:pointer">'+
    '<input type="checkbox" checked data-prop-idx="'+i+'" style="accent-color:var(--cyan)">'+
    '<span style="font-family:var(--mono);font-size:10px">Entry #'+(flEntries.indexOf(e)+1)+" — "+e.fecha+" | "+e.aeronave+"</span>"+
    "</label>"
  ).join("");
  openModal("namePropMbd");
}

function applyNameProp(mode){
  if(!_namePropData) return;
  const{field,newVal,matches,onConfirm}=_namePropData;
  let toUpdate=[];
  if(mode==="all") toUpdate=matches;
  else if(mode==="selected"){
    const checks=el("namePropList").querySelectorAll("input[type=checkbox]");
    toUpdate=matches.filter((_,i)=>checks[i]&&checks[i].checked);
  }
  toUpdate.forEach(e=>{ e[field]=newVal; });
  if(toUpdate.length){
    addFlAudit("✏️",currentUser.name,"name correction: "+field,
      '"'+_namePropData.oldVal+'" → "'+newVal+'" applied to '+toUpdate.length+" entries");
  }
  closeModal("namePropMbd");
  onConfirm(toUpdate);
  _namePropData=null;
  renderFlTable();
}
async function saveBatchToDB(reason="unspecified"){
  const saveStarted=performance.now();
  dbg("Batch save started — reason: "+reason+" — status: "+batchStatus+" — entries: "+flEntries.length+" — audit rows: "+flAuditLog.length,"info");
  try {
    const meta=window._pendingBatchMeta||{};
    const logNums=flEntries.map(e=>e.bnum).filter(Boolean).sort();
    const batchData={
      source_file:JSON.stringify(Array.isArray(batchSourceFile)?batchSourceFile:[batchSourceFile]),
      status:batchStatus,
      submitted_by:currentUser.name,
      aircraft:meta.aircraft||"",
      operador:meta.operador||"",
      period_from:meta.periodFrom||null,
      period_to:meta.periodTo||null,
      log_from:meta.logFrom||logNums[0]||null,
      log_to:meta.logTo||logNums[logNums.length-1]||null
    };
    if(!currentBatchId){
      // Create new batch
      const rows=await sbPost("batches",batchData);
      currentBatchId=rows[0].id;
      dbg("Batch created in DB — id: "+currentBatchId,"ok");
    } else {
      // Update existing batch
      const _batchPatch={
        status:batchStatus,
        cycle:reviewCycle,
        submitted_by:currentUser.name,
        submitted_at:batchStatus==="SUBMITTED"?new Date().toISOString():undefined
      };
      if(batchStatus==="APPROVED"){
        _batchPatch.approved_by=currentUser.name;
        _batchPatch.approved_at=new Date().toISOString();
      }
      await sbPatch("batches","id=eq."+currentBatchId,_batchPatch);
      dbg("Batch updated in DB — status: "+batchStatus,"ok");
    }
    // Save entries
    await sbDelete("entries","batch_id=eq."+currentBatchId);
    if(flEntries.length){
      const entryRows=flEntries.map((e,i)=>({
        batch_id:currentBatchId,
        bnum:e.bnum||null,
        fecha:e.fecha, aeronave:e.aeronave, operador:e.operador,
        piloto:e.piloto, instructor:e.instructor||"",
        horo_in:e.horoIn||0,
        motor_out:String(e.motorOut||""), motor_in:String(e.motorIn||""),
        vuelo_out:String(e.vueloOut||""), vuelo_in:String(e.vueloIn||""),
        direct_tm:e._directTm||null, direct_tv:e._directTv||null,
        mult_override:e.multOverride||null,
        obs:e.obs||"", flag_note:e.flagNote||"",
        review_thread:JSON.stringify(e.reviewThread||[]),
        status:e.status||"pending", sort_order:i,
        image_url:e.imageUrl||null,
        non_bill_reason:e.nonBillReason||null
      }));
      await sbPost("entries",entryRows);
      dbg("Entries saved to DB — "+entryRows.length+" rows","ok");
    }
    // Save audit log
    await sbDelete("audit_log","batch_id=eq."+currentBatchId);
    if(flAuditLog.length){
      const auditRows=flAuditLog.map(a=>({
        batch_id:currentBatchId,
        icon:a.icon, actor:a.actor, action:a.action,
        detail:a.detail, ts:a.ts instanceof Date?a.ts.toISOString():a.ts
      }));
      await sbPost("audit_log",auditRows);
    }
    dbg("Batch save completed — reason: "+reason+" — "+Math.round(performance.now()-saveStarted)+"ms","ok");
  } catch(err){ dbg("DB save error: "+err.message,"err"); showToast("DB save error: "+err.message,"err"); }
}

async function clearBatchFromDB(){
  // Never delete batches — just clear the local reference
  // Batches are permanent records (billing cycle history)
  currentBatchId=null;
  dbg("Batch deselected — record preserved in DB","info");
}

// ── SUPABASE SEED (first-run) ──
async function seedIfEmpty(){
  try {
    const users=await sbGet("users","limit=1");
    if(users&&users.length){ dbg("DB already seeded","info"); return; }
    dbg("Seeding database with defaults…","info");
    await sbPost("users",USERS.map(u=>({
      id:u.id, name:u.name, email:u.email, pwd:u.pwd,
      role:u.role, phone:u.phone||"", companies:u.companies,
      status:u.status, created:u.created, last_login:null
    })));
    await sbPost("companies",COMPANIES.map(c=>({
      id:c.id, name:c.name, code:c.code, multiplier:c.multiplier,
      status:c.status, notes:c.notes||"", billing_rules:JSON.stringify(c.billingRules||[])
    })));
    await sbPost("aircraft",AIRCRAFT.map(a=>({
      id:a.id, matricula:a.matricula, make_model:a.makeModel,
      operador:a.operador, multiplicador:a.multiplicador, tipo:a.tipo,
      asientos:a.asientos, motor_id:a.motorId,
      consumo_gal_hr:a.consumoGalHr, diff_threshold:a.diffThreshold
    })));
    dbg("Seed complete","ok");
  } catch(err){ dbg("Seed error: "+err.message,"err"); }
}

// ── LOAD MASTER DATA FROM DB ──
async function loadMasterData(){
  try {
    const [users,companies,aircraft]=await Promise.all([
      sbGet("users"),
      sbGet("companies"),
      sbGet("aircraft")
    ]);
    if(users&&users.length) USERS.splice(0,USERS.length,...users);
    if(companies&&companies.length) COMPANIES.splice(0,COMPANIES.length,...companies.map(c=>({
      ...c,
      address:c.address||"",
      phone:c.phone||"",
      inv_show_address:c.inv_show_address!==false,
      inv_show_phone:c.inv_show_phone!==false,
      inv_show_notes:c.inv_show_notes===true,
      inv_show_rate:c.inv_show_rate!==false,
      adminContact:c.admin_contact||c.adminContact||"",
      acctContact:c.acct_contact||c.acctContact||"",
      contacts:typeof c.contacts==="string"?JSON.parse(c.contacts):c.contacts||[],
      billingRules:typeof c.billing_rules==="string"?JSON.parse(c.billing_rules):c.billing_rules||[]
    })));
    if(aircraft&&aircraft.length) AIRCRAFT.splice(0,AIRCRAFT.length,...aircraft.map(a=>({
      id:a.id, matricula:a.matricula, makeModel:a.make_model||"",
      operador:a.operador, multiplicador:parseFloat(a.multiplicador)||1, tipo:a.tipo||"",
      asientos:a.asientos||2, motorId:a.motor_id||"",
      consumoGalHr:a.consumo_gal_hr||0, diffThreshold:parseFloat(a.diff_threshold)||0.2,
      diffWarn:parseFloat(a.diff_warn)||0.3, diffAlert:parseFloat(a.diff_alert)||0.4,
      owner:a.owner||"", ownerAddress:a.owner_address||"",
      photoUrl:a.photo_url||null,
      rates:Array.isArray(a.rates)?a.rates.map(r=>({operador:r.operador,multiplicador:parseFloat(r.multiplicador)||1,tarifaHr:parseFloat(r.tarifaHr||r.tarifa_hr)||0})):(typeof a.rates==="string"&&a.rates?JSON.parse(a.rates).map(r=>({operador:r.operador,multiplicador:parseFloat(r.multiplicador)||1,tarifaHr:parseFloat(r.tarifaHr||r.tarifa_hr)||0})):[])
    })));
    AIRCRAFT.forEach(ac=>dbg("Aircraft loaded: "+ac.matricula+" rates: "+JSON.stringify(ac.rates),"info"));
    dbg("Master data loaded — "+USERS.length+" users, "+COMPANIES.length+" companies, "+AIRCRAFT.length+" aircraft","ok");
  } catch(err){ dbg("Master data load error: "+err.message,"err"); }
}
// ── SOURCE IMAGE SIDE PANEL ──
let spEditingEntryId=null;
let spCurrentIndex=-1; // index in flEntries for navigation

function openSidePanel(entryIdOrFileIdx, isEntryId=false){
  const panel=el("sidePanel");
  const editSection=el("spEditSection");
  const navBar=el("spNav");
  if(isEntryId){
    const entry=flEntries.find(e=>e.id===entryIdOrFileIdx);
    if(!entry) return;
    spEditingEntryId=entry.id;
    spCurrentIndex=flEntries.indexOf(entry);
    _loadSpEntry(entry);
    if(navBar) navBar.style.display="flex";
    _updateSpNav();
    if(editSection) editSection.style.display="flex";
  } else {
    const f=fileQueue[entryIdOrFileIdx];
    if(!f||!f._preview) return;
    spEditingEntryId=null; spCurrentIndex=-1;
    el("sp_img").src=f._preview;
    el("sp_title").textContent=t("spSourceTitle").replace("{name}",f.name);
    el("sp_meta").textContent=f.name+" · "+(f.size/1024).toFixed(1)+" KB · "+
      t("spExtractedMeta").replace("{count}",f._entryCount||0);
    if(navBar) navBar.style.display="none";
    if(editSection) editSection.style.display="none";
  }
  panel.classList.add("open");
  el("spOverlay").classList.add("open");
  
  // Sync toggle button label
  if(el("spToggleLabel")) el("spToggleLabel").textContent=t("panelOpen");
  if(el("spTableToggle")) el("spTableToggle").style.color="var(--cyan)";
  // Push page content left by padding appShell — panel is fixed, this yields the space
  const savedW=localStorage.getItem("hpfleet_sp_width");
  const maxW=Math.floor(window.innerWidth*0.5);
  if(savedW){
    const clamped=Math.min(parseInt(savedW),maxW);
    panel.style.width=clamped+"px";
  }
  const panelW=panel.offsetWidth||420;
  const shell=el("appShell");
  if(shell) shell.style.paddingRight=panelW+"px";
  // Highlight active row — clear all first, then set one and scroll into view
  if(isEntryId){
    const rows=el("flTbody")?el("flTbody").querySelectorAll("tr[data-entry-id]"):[];
    let activeRow=null;
    rows.forEach(r=>{
      r.classList.remove("sp-active-row","sp-dim-row");
      if(parseInt(r.dataset.entryId)===entryIdOrFileIdx){
        r.classList.add("sp-active-row");
        activeRow=r;
      }
    });
    if(activeRow) activeRow.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
}

function _loadSpEntry(entry){
  spZoom=1; spPanX=0; spPanY=0; spPanMode=false;
  spRotation=entry._rotation||0;
  spClearDirty();
  spApplyTransform();
  // Clear/load reviewer comment field
  if(el("sp_comment")) el("sp_comment").value=entry.flagNote||"";
  renderSpThread(entry);
  spUpdateNonBillBtn(entry.status==="nonbillable");
  // Non-billable watermark
  const wm=el("sp_nonbill_watermark"); const wmTxt=el("sp_nonbill_wm_text");
  if(wm&&wmTxt){
    if(entry.status==="nonbillable"){
      wmTxt.textContent=formatNonBillReason(entry.nonBillReason,false)||t("spNonBillable");
      wm.style.display="flex";
    } else { wm.style.display="none"; }
  }
  const imgEl=el("sp_img");
  if(entry.imageUrl){ imgEl.src=entry.imageUrl; }
  else { imgEl.src=""; imgEl.alt=t("spNoSourceAlt"); }
  el("sp_title").textContent=t("spLogEntryTitle").replace("{num}",flEntries.indexOf(entry)+1);
  el("sp_meta").textContent=(entry.fecha||"—")+" | "+(entry.bnum?t("spLogPrefix")+entry.bnum+" | ":"")+(entry.piloto||"—")+" | "+(entry.aeronave||"—");
  populateSpEditFields(entry);
  // Cascade aircraft dropdowns
  if(entry.aeronave){
    spCascadeAircraftDropdowns(entry.aeronave);
    if(el("sp_operador")&&entry.operador) el("sp_operador").value=entry.operador;
  }
  // Auto-size: set image area height so data section fits fully on screen
  requestAnimationFrame(()=>{
    const panel=el("sidePanel");
    const imgWrap=el("sp_img_wrap");
    const editSec=el("spEditSection");
    const toolbar=el("sp_img_toolbar");
    const vresize=el("spVResize");
    const header=document.querySelector(".sp-header");
    const nav=el("spNav");
    const meta=el("sp_meta");
    if(!panel||!imgWrap||!editSec) return;
    // Measure fixed-height elements
    const fixedH=(header?header.offsetHeight:0)+
                 (nav&&nav.style.display!=="none"?nav.offsetHeight:0)+
                 (meta?meta.offsetHeight:0)+
                 (toolbar?toolbar.offsetHeight:0)+
                 (vresize?vresize.offsetHeight:6);
    const savedImgH=getSavedSpImageHeight(panel,fixedH);
    if(savedImgH){
      imgWrap.style.height=savedImgH+"px";
      _scaleNonBillWatermark();
      return;
    }
    // Measure data section natural height
    editSec.style.flex="0 0 auto";
    editSec.style.height="auto";
    const dataH=editSec.scrollHeight;
    // Image area gets the remainder, minimum 150px
    const availH=panel.offsetHeight-fixedH-dataH;
    imgWrap.style.height=Math.max(150,availH)+"px";
    _scaleNonBillWatermark();
    // Restore flex on edit section
    editSec.style.flex="1";
    editSec.style.height="";
  });
  // Role-aware mode
  const role=effectiveRole();
  const isReviewer=role==="REVIEWER";
  const isReadOnly=role==="READONLY";
  const editTitle=el("spEditTitle");
  const commentRow=el("spCommentRow");
  const saveBtn=el("sp_save");
  // Make fields readonly for non-editors
  ["sp_bnum","sp_fecha","sp_piloto","sp_instructor","sp_horoIn",
   "sp_motorOut","sp_motorIn","sp_vueloOut","sp_vueloIn","sp_mult","sp_obs"].forEach(id=>{
    const f=el(id); if(!f) return;
    f.readOnly=isReviewer||isReadOnly;
    f.style.opacity=(isReviewer||isReadOnly)?"0.7":"1";
  });
  ["sp_aeronave","sp_operador"].forEach(id=>{
    const f=el(id); if(!f) return;
    f.disabled=isReviewer||isReadOnly;
  });
  if(isReviewer){
    if(editTitle) editTitle.textContent=t("spReviewEntryTitle");
    if(commentRow) commentRow.style.display="block";
    if(saveBtn) saveBtn.style.display="none";
  } else if(isReadOnly){
    if(editTitle) editTitle.textContent=t("spViewEntryTitle");
    // Show thread panel if entry has history, hide otherwise
    if(commentRow) commentRow.style.display=(entry.reviewThread&&entry.reviewThread.length)?"block":"none";
    if(saveBtn) saveBtn.style.display="none";
  } else {
    if(editTitle) editTitle.textContent=t("spDataEntryTitle");
    // Show thread panel if entry has history (operator needs to see + respond)
    if(commentRow) commentRow.style.display=(entry.reviewThread&&entry.reviewThread.length)?"block":"none";
    if(saveBtn){ saveBtn.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg> <span id="spSaveText">'+t("spSave")+'</span>'; saveBtn.style.display=""; saveBtn.style.background="rgba(65,209,255,.04)"; saveBtn.style.borderColor="var(--dim2)"; saveBtn.style.color="var(--dim2)"; saveBtn.disabled=true; saveBtn.style.cursor="not-allowed"; saveBtn.style.opacity="0.4"; }
  }
  if(commentRow&&commentRow.style.display!=="none"&&el("spReviewZone")) el("spReviewZone").classList.remove("is-collapsed");
  syncSidePanelReviewZone();
}

function _updateSpNav(){
  const pos=el("spNavPos");
  if(pos) pos.textContent=t("spNavPos").replace("{current}",spCurrentIndex+1).replace("{total}",flEntries.length);
}

function spNavigate(dir, afterNav){
  spGuardDirty(()=>{
    const moved=_spNavigate(dir);
    if(moved&&afterNav) afterNav();
  });
}
function _spNavigate(dir){
  const newIdx=spCurrentIndex+dir;
  if(newIdx<0||newIdx>=flEntries.length) return false;
  spCurrentIndex=newIdx;
  const entry=flEntries[newIdx];
  spEditingEntryId=entry.id;
  _loadSpEntry(entry);
  _updateSpNav();
  // Update row highlight — clear all first, then set one and scroll into view
  const rows=el("flTbody")?el("flTbody").querySelectorAll("tr[data-entry-id]"):[];
  let activeRow=null;
  rows.forEach(r=>{
    r.classList.remove("sp-active-row","sp-dim-row");
    if(parseInt(r.dataset.entryId)===entry.id){
      r.classList.add("sp-active-row");
      activeRow=r;
    }
  });
  if(activeRow) activeRow.scrollIntoView({block:"nearest",behavior:"smooth"});
  return true;
}

function showSpSwipeCue(dir){
  const cue=el("spSwipeCue");
  if(!cue) return;
  cue.textContent=dir>0?"›":"‹";
  cue.className="sp-swipe-cue "+(dir>0?"next":"prev");
  void cue.offsetWidth;
  cue.classList.add("show");
}

function populateSpEditFields(e){
  if(!e) return;
  const acSel=el("sp_aeronave");
  if(acSel) acSel.innerHTML=AIRCRAFT.map(a=>'<option value="'+a.matricula+'"'+(a.matricula===e.aeronave?" selected":"")+'>'+a.matricula+"</option>").join("");
  if(el("sp_operador")) el("sp_operador").value=e.operador||"FM";
  if(el("sp_bnum")) el("sp_bnum").value=e.bnum||"";
  if(el("sp_fecha")) el("sp_fecha").value=e.fecha||"";
  if(el("sp_piloto")) el("sp_piloto").value=e.piloto||"";
  if(el("sp_instructor")) el("sp_instructor").value=e.instructor||"";
  if(el("sp_horoIn")) el("sp_horoIn").value=e.horoIn||"";
  if(el("sp_motorOut")) el("sp_motorOut").value=e.motorOut||"";
  if(el("sp_motorIn")) el("sp_motorIn").value=e.motorIn||"";
  if(el("sp_vueloOut")) el("sp_vueloOut").value=e.vueloOut||"";
  if(el("sp_vueloIn")) el("sp_vueloIn").value=e.vueloIn||"";
  if(el("sp_mult_sel")&&el("sp_mult")){
    const acRate=AIRCRAFT.find(a=>a.matricula===e.aeronave)?.rates?.find(r=>r.operador===(e.operador||"FM"));
    const defaultRate=acRate?acRate.multiplicador:null;
    if(e.multOverride&&(!defaultRate||Math.abs(e.multOverride-defaultRate)>0.001)){
      // Custom override — show custom input
      el("sp_mult_sel").value="custom";
      el("sp_mult").style.display="";
      el("sp_mult").value=e.multOverride;
    } else {
      // Use default rate from dropdown
      const rateVal=e.multOverride||defaultRate;
      if(rateVal) el("sp_mult_sel").value=rateVal;
      el("sp_mult").style.display="none";
      el("sp_mult").value="";
    }
  }
  if(el("sp_obs")) el("sp_obs").value=(e.status==="nonbillable"&&e.nonBillReason)?"⊘ "+formatNonBillReason(e.nonBillReason):e.obs||"";
  spLiveCalc();
  // Diff alert
  const ac=AIRCRAFT.find(a=>a.matricula===e.aeronave);
  const threshold=ac?ac.diffThreshold:0.2;
  const tm=Math.abs(t2h(e.motorIn)-t2h(e.motorOut));
  const tv=Math.abs(t2h(e.vueloIn)-t2h(e.vueloOut));
  const diff=Math.abs(tm-tv);
  const da=el("spDiffAlert");
  if(da){
    if(e.motorOut&&e.motorIn&&diff>threshold){
      if(el("spDiffMsg")) el("spDiffMsg").textContent=t("spDiffMsg").replace("{tm}",fmt(tm)).replace("{tf}",fmt(tv)).replace("{gap}",diff.toFixed(2));
      da.classList.add("on");
    } else da.classList.remove("on");
  }
}

function spLiveCalc(){
  const fake={
    aeronave:el("sp_aeronave")?el("sp_aeronave").value:"",
    operador:el("sp_operador")?el("sp_operador").value:"",
    motorOut:el("sp_motorOut")?el("sp_motorOut").value:"",
    motorIn:el("sp_motorIn")?el("sp_motorIn").value:"",
    vueloOut:el("sp_vueloOut")?el("sp_vueloOut").value:"",
    vueloIn:el("sp_vueloIn")?el("sp_vueloIn").value:"",
    multOverride:parseFloat(el("sp_mult")?el("sp_mult").value:"")||null
  };
  const{tm,tv,mult,tbp}=calcEntry(fake);
  if(el("sp_tmotor")) el("sp_tmotor").value=tm>0?tm.toFixed(2):"";
  if(el("sp_tvuelo")) el("sp_tvuelo").value=tv>0?tv.toFixed(2):"";
  if(el("sp_pv_tm")) el("sp_pv_tm").textContent=tm>0?fmt(tm)+" hrs":"—";
  if(el("sp_pv_tf")) el("sp_pv_tf").textContent=tv>0?fmt(tv)+" hrs":"—";
  if(el("sp_pv_mult")) el("sp_pv_mult").textContent=mult+"×";
  if(el("sp_pv_tbp")) el("sp_pv_tbp").textContent=tm>0?fmt(tbp)+" hrs":"—";
  // Gap indicator
  if(el("sp_pv_gap")&&tm>0&&tv>0){
    const gap=Math.abs(tm-tv);
    const ac=AIRCRAFT.find(a=>a.matricula===fake.aeronave);
    const thr=ac?ac.diffThreshold:0.2;
    const warn=ac?ac.diffWarn:0.3;
    const alert=ac?ac.diffAlert:0.4;
    let col="var(--green)", tri="";
    if(gap>warn){col="var(--red)";tri=" ▲";}
    else if(gap>thr){col="var(--yellow)";}
    el("sp_pv_gap").textContent=t("spGapValue").replace("{gap}",gap.toFixed(2))+tri;
    el("sp_pv_gap").style.color=col;
  }
}

async function saveSpEntry(){
  if(!spEditingEntryId) return;
  const e=flEntries.find(x=>x.id===spEditingEntryId); if(!e) return;
  const role=effectiveRole();
  // APPROVED lock — intercept and confirm reopen before first write
  if(batchStatus==="APPROVED" && role!=="REVIEWER"){
    const msg=lang==="es"
      ?"Este lote está APROBADO. ¿Reabrir a BORRADOR para editar?"
      :"This batch is APPROVED. Reopen to DRAFT to allow edits?";
    if(!confirm(msg)) return;
    batchStatus="DRAFT";
    await saveBatchToDB("auto-reopen before entry edit");
    addFlAudit("↩",currentUser.name,"batch reopened via edit","Auto-reopened to DRAFT on entry edit");
    addAudit("↩",currentUser.name,"batch auto-reopened",currentBatchId);
    renderWfBar(); setupFlRoleUI();
    showToast("Batch reopened to DRAFT","warn");
  }
  if(role==="REVIEWER"){
    // Save review comment to thread
    const ta=el("spThreadTextarea");
    const comment=ta&&ta.value.trim()?ta.value.trim():"";
    if(!comment){showToast(lang==="es"?"Ingrese un comentario":"Please enter a review comment","err");return;}
    addThreadComment(e,"REVIEWER",comment);
    e.flagNote=comment; // keep flagNote in sync for backwards compat
    e.status="flagged";
    closeSpThreadInput();
    renderSpThread(e);
    addFlAudit("🚩",currentUser.name,"review comment on entry #"+(flEntries.indexOf(e)+1),comment);
  } else {
    // Full edit — check name propagation
    const multSel=el("sp_mult_sel");
    const multInp=el("sp_mult");
    let multRaw=null;
    if(multSel&&multSel.value==="custom"&&multInp&&multInp.value.trim()){
      multRaw=parseFloat(multInp.value);
    } else if(multSel&&multSel.value!=="custom"){
      multRaw=parseFloat(multSel.value);
    }
    const defaultRate=getAircraftMult(el("sp_aeronave").value,el("sp_operador").value);
    const isDefaultVal=multRaw!==null&&Math.abs(multRaw-defaultRate)<0.001;
    const multOverrideVal=(multRaw===null||isNaN(multRaw)||isDefaultVal)?null:multRaw;
    const oldPiloto=e.piloto, oldInstructor=e.instructor;
    const newPiloto=el("sp_piloto").value.trim();
    const newInstructor=el("sp_instructor").value.trim();
    Object.assign(e,{
      bnum:el("sp_bnum")?el("sp_bnum").value.trim():"",
      fecha:el("sp_fecha").value.trim(),
      aeronave:el("sp_aeronave").value,
      operador:el("sp_operador").value,
      piloto:newPiloto,
      instructor:newInstructor,
      horoIn:parseFloat(el("sp_horoIn").value)||0,
      motorOut:el("sp_motorOut").value.trim(),
      motorIn:el("sp_motorIn").value.trim(),
      vueloOut:el("sp_vueloOut").value.trim(),
      vueloIn:el("sp_vueloIn").value.trim(),
      multOverride:multOverrideVal,
      obs:el("sp_obs").value.trim()
    });
    // Auto-promote skipped/void → pending when real data is now present
    if((e.status==="skipped"||e.status==="void")&&e.aeronave&&e.fecha&&e.motorOut&&e.motorIn){
      e.status="pending";
      addFlAudit("↑",currentUser.name,"entry promoted from "+e.status+" to pending","#"+(flEntries.indexOf(e)+1));
    }
    checkDiff(e);
    // Clear stale diff flag from obs before rechecking
    if(e.obs) e.obs=e.obs.replace(/△\s*Dif\s*Motor\/Vuelo[^|]*/g,"").replace(/\|\s*△\s*$/,"").trim();
    addFlAudit("✏️",currentUser.name,"edited entry via panel","#"+(flEntries.indexOf(e)+1));
    await saveBatchToDB("side panel entry edit");
    renderFlTable();
    showToast("Entry updated");
    spClearDirty();
    // Refresh meta only — do NOT call _loadSpEntry which resets transform
    if(el("sp_title")) el("sp_title").textContent=t("spLogEntryTitle").replace("{num}",flEntries.indexOf(e)+1);
    if(el("sp_meta")) el("sp_meta").textContent=(e.fecha||"—")+" | "+(e.bnum?t("spLogPrefix")+e.bnum+" | ":"")+(e.piloto||"—")+" | "+(e.aeronave||"—");
    // Check name propagation
    if(newPiloto!==oldPiloto){
      checkNamePropagation(e.id,"piloto",oldPiloto,newPiloto,async(updated)=>{
        if(updated.length) await saveBatchToDB("propagate pilot name");
      });
    } else if(newInstructor!==oldInstructor){
      checkNamePropagation(e.id,"instructor",oldInstructor,newInstructor,async(updated)=>{
        if(updated.length) await saveBatchToDB("propagate instructor name");
      });
    }
    return; // already saved above
  }
  // Reviewer comment path
  await saveBatchToDB("reviewer comment");
  renderFlTable();
  showToast(role==="REVIEWER"?"Comment saved":"Entry updated");
  if(el("sp_title")) el("sp_title").textContent=t("spLogEntryTitle").replace("{num}",flEntries.indexOf(e)+1);
  if(el("sp_meta")) el("sp_meta").textContent=(e.fecha||"—")+" | "+(e.bnum?t("spLogPrefix")+e.bnum+" | ":"")+(e.piloto||"—")+" | "+(e.aeronave||"—");
}

function closeSidePanel(){
  const panel=el("sidePanel");
  panel.classList.remove("open");
  el("spOverlay").classList.remove("open");
  
  // Clear padding after panel slide-out completes (300ms matches CSS transition)
  setTimeout(()=>{ el("appShell").style.paddingRight=""; }, 320);
  const tabContent=document.querySelector(".tab-content");
  if(tabContent){ tabContent.classList.remove("sp-open-shift"); tabContent.style.maxWidth=""; }
  if(el("spTableToggle")) el("spTableToggle").style.color="var(--dim2)";
  if(el("spToggleLabel")) el("spToggleLabel").textContent=t("sourcePanel");
  if(el("flTbody")) el("flTbody").querySelectorAll("tr").forEach(r=>{
    r.classList.remove("sp-active-row");
    r.style.outline="";
  });
}
async function resetBatch(){
  // Archive current batch — DO NOT delete
  flEntries=[]; flAuditLog=[]; fileQueue=[]; batchStatus="DRAFT";
  batchSourceFile=[]; editingEntryId=null; nextEntryId=1;
  currentBatchId=null; // deselect, preserve in DB
  piAdditionalCharges=[]; piSignedBy=null; piSignedAt=null; piInvNum=null; piRulesSeeded=false;
  if(el("pi_signed_badge")){ el("pi_signed_badge").style.display="none"; el("pi_signed_badge").textContent=""; }
  if(el("pi_signoff_btn")) el("pi_signoff_btn").style.display="";
  el("srcBar").style.display="none";
  el("reviewSection").style.display="none";
  if(el("resultBanner")) el("resultBanner").style.display="none";
  el("horoAlert").classList.remove("on");
  renderQueue(); renderWfBar(); setupFlRoleUI(); renderPreInvoice();
  await loadAllBatches(); // refresh selector
  dbg("New billing cycle started — previous batch preserved","ok");
}

// ── NEW BATCH MODAL ──
function openNewBatchModal(){
  // Populate aircraft dropdown
  const acSel=el("nb_aircraft");
  if(acSel){
    acSel.innerHTML='<option value="">'+t("autoDetect")+"</option>"+AIRCRAFT.map(a=>'<option value="'+a.matricula+'">'+a.matricula+"</option>").join("");
    acSel.dispatchEvent(new Event("change"));
  }
  // Set default period to current month
  const now=new Date();
  const firstDay=new Date(now.getFullYear(),now.getMonth(),1).toISOString().split("T")[0];
  const lastDay=new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().split("T")[0];
  if(el("nb_period_from")) el("nb_period_from").value=firstDay;
  if(el("nb_period_to")) el("nb_period_to").value=lastDay;
  if(el("nb_log_from")) el("nb_log_from").value="";
  if(el("nb_log_to")) el("nb_log_to").value="";
  // Show previous batch label if one exists
  const prevLabel=el("nb_prev_label");
  if(prevLabel){
    if(currentBatchId&&flEntries.length){
      const prev=allBatches.find(b=>b.id===currentBatchId);
      const label=prev?batchLabel(prev):t("currentBatchLower");
      prevLabel.style.display="block";
      prevLabel.textContent=t("nbPrevBatchPrefix")+" "+label;
    } else {
      prevLabel.style.display="none";
    }
  }
  openModal("newBatchMbd");
}

async function confirmNewBatch(){
  const aircraft=el("nb_aircraft")?el("nb_aircraft").value:"";
  const operador=el("nb_operator")?el("nb_operator").value:"";
  const periodFrom=el("nb_period_from")?el("nb_period_from").value:"";
  const periodTo=el("nb_period_to")?el("nb_period_to").value:"";
  const logFrom=el("nb_log_from")?el("nb_log_from").value.trim():"";
  const logTo=el("nb_log_to")?el("nb_log_to").value.trim():"";
  if(!nbFiles.length){showToast(t("pleaseAddFile"),"warn");return;}
  closeModal("newBatchMbd");
  await resetBatch();
  window._pendingBatchMeta={aircraft,operador,periodFrom,periodTo,logFrom,logTo};
  addAudit("🆕",currentUser.name,"new billing cycle",aircraft+" / "+operador+" / "+periodFrom+" → "+periodTo);
  // Add files to main queue and trigger extraction
  nbFiles.forEach(f=>fileQueue.push({file:f,name:sanitizeFilename(f.name),size:f.size,type:f.type,status:"waiting",progress:0,_preview:null}));
  nbFiles=[];
  openUploadStatusWindow();
  extractAll();
}

// ── ADD MORE FILES ──
let afFiles=[];

function openAddFilesDialog(){
  afFiles=[];
  afRenderQueue();
  const acSel=el("af_aircraft"); const opSel=el("af_operator");
  if(acSel){
    acSel.innerHTML='<option value="">'+t("autoDetect")+'</option>'+AIRCRAFT.map(a=>'<option value="'+a.matricula+'">'+a.matricula+'</option>').join("");
  }
  if(opSel){
    opSel.innerHTML='<option value="">'+t("autoDetect")+'</option>'+COMPANIES.map(c=>'<option value="'+c.code+'">'+c.code+'</option>').join("");
  }
  const dlg=el("addFilesMbd"); if(dlg) dlg.style.display="flex";
}

function closeAddFilesDialog(){
  const dlg=el("addFilesMbd"); if(dlg) dlg.style.display="none";
  afFiles=[];
}

function afRenderQueue(){
  const wrap=el("af_fileQueue"); if(!wrap) return;
  const confirmBtn=el("af_confirm");
  wrap.innerHTML=afFiles.map((f,i)=>
    '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--s2);border:1px solid var(--border2);padding:6px 10px;border-radius:2px;font-family:var(--mono);font-size:10px;color:var(--dim2)">'+
    '<span>'+f.name+' <span style="color:var(--dim)">('+( f.size/1024).toFixed(1)+' KB)</span></span>'+
    '<button data-af-del="'+i+'" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 4px">✕</button>'+
    '</div>'
  ).join("");
  wrap.querySelectorAll("[data-af-del]").forEach(btn=>{
    btn.addEventListener("click",()=>{afFiles.splice(+btn.dataset.afDel,1);afRenderQueue();});
  });
  if(confirmBtn) confirmBtn.disabled=afFiles.length===0;
}

function initAfDropZone(){
  const zone=el("af_uploadZone");
  const input=el("af_fileInput");
  if(!zone||!input) return;
  zone.addEventListener("click",()=>input.click());
  zone.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("dragover");});
  zone.addEventListener("dragleave",()=>zone.classList.remove("dragover"));
  zone.addEventListener("drop",e=>{
    e.preventDefault(); zone.classList.remove("dragover");
    const files=Array.from(e.dataTransfer.files).filter(f=>/\.(pdf|jpg|jpeg|png)$/i.test(f.name));
    files.forEach(f=>{
      if(afFiles.find(q=>q.name===f.name&&q.size===f.size)){
        if(!confirm(t("duplicateFileConfirm").replace("{file}",f.name))) return;
      }
      afFiles.push(f);
    });
    afRenderQueue();
  });
  input.addEventListener("change",()=>{
    Array.from(input.files).forEach(f=>{
      if(afFiles.find(q=>q.name===f.name&&q.size===f.size)){
        if(!confirm(t("duplicateFileConfirm").replace("{file}",f.name))) return;
      }
      afFiles.push(f);
    });
    input.value=""; afRenderQueue();
  });
}

async function confirmAddFiles(){
  if(!afFiles.length){showToast(t("pleaseAddFile"),"warn");return;}
  const apiKey=getApiKey();
  if(!apiKey){showToast(t("noApiKey"),"err");return;}
  const aircraft=el("af_aircraft")?el("af_aircraft").value:"";
  const operador=el("af_operator")?el("af_operator").value:"";
  // Build isolated queue — bypasses fileQueue duplicate check entirely
  const afQueue=afFiles.map(f=>({
    file:f, name:sanitizeFilename(f.name), size:f.size, type:f.type,
    status:"waiting", progress:0, _preview:null,
    _afContext:{aircraft, operador}
  }));
  afFiles=[];
  closeAddFilesDialog();
  await saveBatchToDB("preserve batch before append");
  openUploadStatusWindow(true);
  await extractAllAppend(afQueue);
}

async function extractAllAppend(appendQueue){
  // Append mode — uses isolated queue, does NOT touch fileQueue, does NOT reset flEntries
  if(isExtracting){ showToast(t("extractionAlreadyRunning"),"warn"); return; }
  const apiKey=getApiKey();
  if(!apiKey) return;
  if(!appendQueue||!appendQueue.length){ uploadLog(t("uploadLogNoFiles")); return; }
  isExtracting=true;
  extractionAbort=new AbortController();
  let allExtracted=[]; let hasErrors=false;
  const total=appendQueue.length;

  if(typeof pdfjsLib!=="undefined"){
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  for(let i=0;i<appendQueue.length;i++){
    const fq=appendQueue[i];
    const isPdf=fq.type==="application/pdf"||fq.name.endsWith(".pdf");
    fq.status="processing";

    try {
      if(isPdf && typeof pdfjsLib!=="undefined"){
        uploadLog(t("uploadLogLoadingPdf")+" "+fq.name);
        const arrayBuf=await fq.file.arrayBuffer();
        const pdfDoc=await pdfjsLib.getDocument({data:arrayBuf}).promise;
        const numPages=pdfDoc.numPages;
        uploadLog(t("uploadLogPdfLoaded").replace("{pages}",numPages));
        let pdfExtracted=[];
        for(let p=1;p<=numPages;p++){
          fq._label="[Page "+p+"/"+numPages+"] "+fq.name+" — "+t("extracting");
          fq.progress=Math.round((p/numPages)*100);
          try {
            const pageBlob=await pdfPageToBlob(pdfDoc,p);
            const pageFile=new File([pageBlob],"page_"+p+".jpg",{type:"image/jpeg"});
            const pageEntries=await extractImageFile(pageFile,apiKey);
            pageEntries.forEach(e=>checkDiff(e));
            const compressed=await compressImage(pageBlob);
            const filename="pg"+String(p).padStart(3,"0")+"_"+Date.now()+".jpg";
            const imageUrl=await uploadImageToStorage(compressed,filename);
            pageEntries.forEach(e=>{e._imageUrl=imageUrl;e._sourcePage=p;});
            pdfExtracted=[...pdfExtracted,...pageEntries];
            uploadLog(t("uploadLogPageExtracted").replace("{page}",p).replace("{pages}",numPages).replace("{entries}",pageEntries.length));
          } catch(pageErr){
            if(pageErr.name==="AbortError"){ uploadLog(t("uploadLogAbortedPage").replace("{page}",p)); break; }
            else if(pageErr.message.startsWith("NO_BITACORA")){
              try {
                const pageBlob=await pdfPageToBlob(pdfDoc,p);
                const compressed=await compressImage(pageBlob);
                const filename="pg"+String(p).padStart(3,"0")+"_skip_"+Date.now()+".jpg";
                const imageUrl=await uploadImageToStorage(compressed,filename);
                pdfExtracted.push({_imageUrl:imageUrl,_sourcePage:p,_isStub:true,
                  bnum:"",fecha:"",aeronave:"",operador:"",piloto:"",instructor:"",horoIn:0,
                  motorOut:"",motorIn:"",vueloOut:"",vueloIn:"",multOverride:null,
                  obs:t("skippedNoLogDataOnPage").replace("{page}",p),status:"skipped"});
                uploadLog(t("uploadLogPageNoData").replace("{page}",p));
              } catch(e){ uploadLog(t("uploadLogImageUploadFailed").replace("{page}",p)); }
            } else { uploadLog(t("uploadLogPageError").replace("{page}",p).replace("{error}",pageErr.message)); hasErrors=true; }
          }
        }
        allExtracted=[...allExtracted,...pdfExtracted];
        fq.status="done"; fq._entryCount=pdfExtracted.length;
        uploadLog(t("uploadLogDone").replace("{entries}",pdfExtracted.length).replace("{pages}",numPages));
        addFlAudit("🤖",currentUser.name,"appended PDF",pdfExtracted.length+" entries from "+fq.name);
      } else {
        fq._label="["+(i+1)+"/"+total+"] "+fq.name+" — "+t("extracting");
        fq.progress=10;
        const fixedFile=await fixImageRotation(fq.file);
        const rawBlob=await fetch(URL.createObjectURL(fixedFile)).then(r=>r.blob());
        const compressedBlob=await compressImage(rawBlob,1200,0.85);
        const compressedFile=new File([compressedBlob],fixedFile.name,{type:"image/jpeg"});
        fq.progress=30;
        const extracted=await extractImageFile(compressedFile,apiKey);
        extracted.forEach(e=>checkDiff(e));
        fq.progress=70;
        const storageBlob=await compressImage(rawBlob,800,0.7);
        const filename="img_"+Date.now()+"_"+i+".jpg";
        const imageUrl=await uploadImageToStorage(storageBlob,filename);
        extracted.forEach(e=>{e._imageUrl=imageUrl;});
        fq._preview=URL.createObjectURL(storageBlob);
        allExtracted=[...allExtracted,...extracted];
        fq.status="done"; fq._entryCount=extracted.length; fq.progress=100;
        addFlAudit("🤖",currentUser.name,"appended image",extracted.length+" from "+fq.name);
      }
    } catch(err){
      fq.status="error"; fq._error=translateFetchError(err.message); hasErrors=true;
      uploadLog(t("uploadLogFileError").replace("{file}",fq.name).replace("{error}",err.message));
    }
  }

  isExtracting=false; extractionAbort=null;

  // APPEND to existing flEntries — do not reset
  const newEntries=allExtracted.map(e=>({
    id:nextEntryId++,status:"pending",multOverride:null,...e,
    reviewObserved:false,
    horoIn:parseFloat(e.horoIn)||0,
    imageUrl:e._imageUrl||null
  }));
  flEntries=[...flEntries,...newEntries];

  // Update source file array — append new file names
  const newNames=appendQueue.map(f=>f.name);
  batchSourceFile=[...batchSourceFile,...newNames];

  const msg=hasErrors?t("appendWithErrors").replace("{entries}",newEntries.length):t("appendCompleteMsg").replace("{entries}",newEntries.length).replace("{files}",newNames.join(", "));
  uploadLog(msg);
  uploadLog(t("appendReadyReview"));

  updateSrcBar();
  await saveBatchToDB("append extracted files");
  renderWfBar(); setupFlRoleUI(); renderFlTable();
}

// ── NB MODAL FILE QUEUE ──
let nbFiles=[];
function nbRenderQueue(){
  const wrap=el("nb_fileQueue"); if(!wrap) return;
  const confirmBtn=el("nb_confirm");
  wrap.innerHTML=nbFiles.map((f,i)=>
    '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--s2);border:1px solid var(--border2);padding:6px 10px;border-radius:2px;font-family:var(--mono);font-size:10px;color:var(--dim2)">'+
    '<span>'+f.name+' <span style="color:var(--dim)">('+( f.size/1024).toFixed(1)+' KB)</span></span>'+
    '<button data-nb-del="'+i+'" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 4px">✕</button>'+
    '</div>'
  ).join("");
  wrap.querySelectorAll("[data-nb-del]").forEach(btn=>{
    btn.addEventListener("click",()=>{nbFiles.splice(+btn.dataset.nbDel,1);nbRenderQueue();});
  });
  if(confirmBtn) confirmBtn.disabled=nbFiles.length===0;
}

function initNbDropZone(){
  const zone=el("nb_uploadZone");
  const input=el("nb_fileInput");
  if(!zone||!input) return;
  zone.addEventListener("click",()=>input.click());
  zone.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("dragover");});
  zone.addEventListener("dragleave",()=>zone.classList.remove("dragover"));
  zone.addEventListener("drop",e=>{
    e.preventDefault(); zone.classList.remove("dragover");
    const files=Array.from(e.dataTransfer.files).filter(f=>/\.(pdf|jpg|jpeg|png)$/i.test(f.name));
    files.forEach(f=>nbFiles.push(f)); nbRenderQueue();
  });
  input.addEventListener("change",()=>{
    Array.from(input.files).forEach(f=>nbFiles.push(f));
    input.value=""; nbRenderQueue();
  });
}

// ── UPLOAD STATUS WINDOW ──
let uploadLogLines=[];
let _isAppendMode=false;
function openUploadStatusWindow(appendMode){
  _isAppendMode=!!appendMode;
  uploadLogLines=[];
  const body=el("uploadLogBody"); if(body) body.innerHTML="";
  const mbd=el("uploadStatusMbd"); if(mbd) mbd.style.display="flex";
}
function uploadLog(msg){
  const ts=new Date().toLocaleTimeString("en-US",{hour12:false});
  const line="["+ts+"] "+msg;
  uploadLogLines.push(line);
  const body=el("uploadLogBody");
  if(body){
    const div=document.createElement("div");
    div.textContent=line;
    body.appendChild(div);
    body.scrollTop=body.scrollHeight;
  }
}
function closeUploadStatusWindow(){
  const mbd=el("uploadStatusMbd"); if(mbd) mbd.style.display="none";
  if(!_isAppendMode) showExtractionSummary();
  _isAppendMode=false;
}
function saveUploadLog(){
  const txt=uploadLogLines.join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain"}));
  const srcName=Array.isArray(batchSourceFile)?batchSourceFile[0]:(batchSourceFile||"extraction");
  const baseName=srcName.trim().replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9_\-]/g,"_");
  a.download=baseName+"_log.txt";
  a.click();
}

// ── EXTRACTION SUMMARY MODAL ──
function showExtractionSummary(){
  const total=flEntries.length;
  const read=flEntries.filter(e=>e.status!=="skipped"&&e.status!=="void"&&e.aeronave&&e.fecha).length;
  const notRead=total-read;
  const seqAlerts=flEntries.filter(e=>{
    const idx=flEntries.indexOf(e);
    return horoCheck(e,idx)&&!horoCheck(e,idx).ok;
  }).length;
  const threshAlerts=flEntries.filter(e=>e.status==="flagged").length;
  const sourceFile=el("srcFile")?el("srcFile").textContent:"—";
  const rows=[
    {label:t("fileSource"),val:sourceFile,color:"var(--text)"},
    {label:t("totalRecords"),val:total,color:"var(--cyan)"},
    {label:t("sbRead"),val:read,color:"var(--green)"},
    {label:t("sbNotRead"),val:notRead,color:notRead>0?"var(--yellow)":"var(--dim2)"},
    {label:t("sequenceAlerts"),val:seqAlerts,color:seqAlerts>0?"var(--yellow)":"var(--dim2)"},
    {label:t("thresholdAlerts"),val:threshAlerts,color:threshAlerts>0?"var(--red)":"var(--dim2)"},
  ];
  const wrap=el("extractSummaryRows");
  if(wrap) wrap.innerHTML=rows.map(r=>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2)">'+
    '<span style="font-family:var(--mono);font-size:11px;color:var(--dim2);letter-spacing:.5px">'+r.label.toUpperCase()+'</span>'+
    '<span style="font-family:var(--mono);font-size:13px;font-weight:700;color:'+r.color+'">'+r.val+'</span>'+
    '</div>'
  ).join("");
  openModal("extractSummaryMbd");
}

// ── BILLING CYCLE HISTORY SELECTOR ──
let allBatches=[];
async function loadAllBatches(){
  try {
    const batches=await sbGet("batches","order=created_at.desc&limit=50");
    allBatches=batches||[];
    renderBatchSelector();
  } catch(e){ dbg("Batch history load error: "+e.message,"err"); }
}

// ── DB MAINTENANCE ──
async function deleteTestBatches(){
  if(!confirm("Delete all batches with no aircraft/operator metadata? This cannot be undone.")) return;
  try {
    const batches=await sbGet("batches","aircraft=is.null&operador=is.null");
    if(!batches||!batches.length){showToast("No test batches found","info");return;}
    for(const b of batches){
      await sbDelete("entries","batch_id=eq."+b.id);
      await sbDelete("audit_log","batch_id=eq."+b.id);
      await sbDelete("batches","id=eq."+b.id);
    }
    addAudit("🗑",currentUser.name,"deleted test batches",batches.length+" batches removed");
    await loadAllBatches();
    showToast(batches.length+" test batch(es) deleted","warn");
    dbg("Deleted "+batches.length+" test batches","ok");
  } catch(err){ showToast("Error: "+err.message,"err"); dbg("Delete test batches error: "+err.message,"err"); }
}

async function deleteBatchesByStatus(status){
  if(!confirm("Delete ALL "+status+" batches? This cannot be undone.")) return;
  try {
    const batches=await sbGet("batches","status=eq."+status);
    if(!batches||!batches.length){showToast("No "+status+" batches found","info");return;}
    for(const b of batches){
      await sbDelete("entries","batch_id=eq."+b.id);
      await sbDelete("audit_log","batch_id=eq."+b.id);
      await sbDelete("batches","id=eq."+b.id);
    }
    addAudit("🗑",currentUser.name,"deleted batches by status",batches.length+" "+status+" batches removed");
    await loadAllBatches();
    showToast(batches.length+" "+status+" batch(es) deleted","warn");
    dbg("Deleted "+batches.length+" "+status+" batches","ok");
  } catch(err){ showToast("Error: "+err.message,"err"); dbg("Delete by status error: "+err.message,"err"); }
}

async function clearAuditLogDB(){
  if(!confirm("Clear all app audit log entries? This cannot be undone.")) return;
  try {
    await sbDelete("audit_log_app","id=gt.0");
    auditLog=[];
    renderAudit();
    showToast("Audit log cleared","warn");
    dbg("Audit log cleared from DB","ok");
  } catch(err){ showToast("Error: "+err.message,"err"); dbg("Clear audit error: "+err.message,"err"); }
}


function batchLabel(b){
  const hasData=b.aircraft||b.operador||b.period_from;
  if(!hasData){
    const created=b.created_at?b.created_at.slice(0,10):"—";
    return created+" · "+b.status+" · (no metadata)";
  }
  const ac=b.aircraft||"?";
  const op=b.operador||"?";
  const pf=b.period_from?b.period_from.slice(0,7):"";
  const lf=b.log_from?"#"+b.log_from:"";
  const lt=b.log_to?"–#"+b.log_to:"";
  return ac+" · "+op+(pf?" · "+pf:"")+(lf?" · "+lf+lt:"")+" · "+b.status;
}

function populateBatchSelect(selEl, approvedOnly=false){
  if(!selEl) return;
  selEl.innerHTML='<option value="">— '+(lang==="es"?"Seleccionar ciclo":"Select Billing Cycle")+' —</option>';
  const list=approvedOnly?allBatches.filter(b=>b.status==="APPROVED"):allBatches;
  list.forEach(b=>{
    const opt=document.createElement("option");
    opt.value=b.id;
    opt.textContent=batchLabel(b);
    if(b.id===currentBatchId) opt.selected=true;
    selEl.appendChild(opt);
  });
}

function renderBatchSelector(){
  populateBatchSelect(el("batchSelector"), false);
}

async function loadBatchFromDB(id){
  try {
    let batch=null;
    if(id){
      // Load specific batch by ID
      const rows=await sbGet("batches","id=eq."+id);
      if(rows&&rows.length) batch=rows[0];
    }
    if(!batch){
      // On login: prefer most recent non-CLOSED batch
      let rows=await sbGet("batches","status=neq.CLOSED&order=created_at.desc&limit=1");
      if(!rows||!rows.length) rows=await sbGet("batches","order=created_at.desc&limit=1");
      if(rows&&rows.length) batch=rows[0];
    }
    if(!batch){ dbg("No batch found in DB","info"); return false; }
    currentBatchId=batch.id;
    batchStatus=batch.status;
    try{ batchSourceFile=JSON.parse(batch.source_file||"[]"); }
    catch(e){ batchSourceFile=batch.source_file?batch.source_file.split(/,\s*/).filter(Boolean):[]; }
    reviewCycle=batch.cycle||1;
    // Restore billing sign-off state
    if(batch.approved_by){
      piSignedBy=batch.approved_by;
      piSignedAt=batch.approved_at?new Date(batch.approved_at).toLocaleString("es-PA"):null;
    } else {
      piSignedBy=null; piSignedAt=null;
    }
    dbg("Batch loaded — id: "+currentBatchId+" status: "+batchStatus+" cycle: "+reviewCycle,"ok");
    const entries=await sbGet("entries","batch_id=eq."+currentBatchId+"&order=sort_order.asc");
    flEntries=(entries||[]).map((e,i)=>{
      let reviewThread=[];
      try{ reviewThread=JSON.parse(e.review_thread||"[]"); }
      catch(err){ reviewThread=[]; }
      const entry={
        id:i+1, bnum:e.bnum||"", fecha:e.fecha, aeronave:e.aeronave, operador:e.operador,
        piloto:e.piloto, instructor:e.instructor||"",
        horoIn:e.horo_in||0,
        motorOut:e.motor_out, motorIn:e.motor_in,
        vueloOut:e.vuelo_out, vueloIn:e.vuelo_in,
        _directTm:e.direct_tm||null, _directTv:e.direct_tv||null,
        multOverride:e.mult_override||null,
        obs:e.obs||"", flagNote:e.flag_note||"",
        reviewThread,
        reviewObserved:false,
        status:e.status||"pending",
        imageUrl:e.image_url||null,
        nonBillReason:e.non_bill_reason||null
      };
      migrateFlagnoteToThread(entry);
      return entry;
    });
    nextEntryId=flEntries.length+1;
    const audit=await sbGet("audit_log","batch_id=eq."+currentBatchId+"&order=ts.desc");
    flAuditLog=(audit||[]).map(a=>({...a,ts:new Date(a.ts)}));
    dbg("Loaded "+flEntries.length+" entries, "+flAuditLog.length+" audit rows","ok");
    return true;
  } catch(err){ dbg("DB load error: "+err.message,"err"); return false; }
}

async function switchToBatch(batchId){
  if(!batchId) return;
  if(batchId===currentBatchId) return;
  if(currentBatchId&&flEntries.length) await saveBatchToDB("before switching batch");
  await loadBatchFromDB(batchId);
  renderBatchSelector();
  if(el("srcBar")) el("srcBar").style.display="grid";
  if(el("reviewSection")) el("reviewSection").style.display="block";
  updateSrcBar();
  renderWfBar(); setupFlRoleUI(); renderFlTable(); renderFlAudit();
  piAdditionalCharges=[]; piSignedBy=null; piSignedAt=null; piInvNum=null; piRulesSeeded=false;
  if(el("pi_signed_badge")){ el("pi_signed_badge").style.display="none"; el("pi_signed_badge").textContent=""; }
  if(el("pi_signoff_btn")) el("pi_signoff_btn").style.display="";
  renderPreInvoice();
  showToast("Billing cycle loaded","info");
}

// ── RENDER ALL ──
function renderAll(){
  renderUsers(); renderCompanies(); renderAudit();
  renderWfBar(); setupFlRoleUI(); setupSettingsUI();
  if(flEntries.length) renderFlTable();
  renderFlAudit();
  updateApiStatus();
  renderFleetSettings();
  renderAircraftTab();
  renderPreInvoice();
}

// ── XLSX IMPORTER ──
async function importFromXLSX(file){
  if(typeof XLSX==="undefined"){showToast(t("xlsxLibMissing"),"err");return;}
  dbg("Starting XLSX import: "+file.name,"info");
  const reader=new FileReader();
  reader.onload=async function(e){
    try {
      const wb=XLSX.read(e.target.result,{type:"array"});
      dbg("Workbook loaded — sheets: "+wb.SheetNames.join(", "),"info");
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
      dbg("Total rows in sheet: "+rows.length,"info");
      // Find header row
      let hdrIdx=-1;
      for(let i=0;i<rows.length;i++){
        if(rows[i].some(c=>String(c||"").includes("Nº Bit."))){hdrIdx=i;break;}
      }
      if(hdrIdx===-1){dbg("Header row not found — expected 'Nº Bit.' in any cell","err");showToast("Header row not found in Excel file","err");return;}
      dbg("Header row found at row "+(hdrIdx+1),"ok");
      const dataRows=rows.slice(hdrIdx+1);
      dbg("Data rows to process: "+dataRows.length,"info");
      let imported=0, skipped=0;
      dataRows.forEach((row,ri)=>{
        if(!row||row[0]==="TOTALES"||row[1]===null||row[1]===undefined){skipped++;return;}
        const piloto=String(row[3]||"").trim();
        if(piloto==="—"||piloto===""){skipped++;return;}
        const obsRaw=String(row[14]||"").trim();
        const flagRaw=String(row[16]||"").trim();
        const obs=obsRaw+(flagRaw?(obsRaw?" | ":"")+flagRaw:"");
        const acVal=(window._pendingBatchMeta?.aircraft)||"HP-1861";
        const opVal=(window._pendingBatchMeta?.operador)||"FM";
        const entry={
          fecha:String(row[2]||"").trim(),
          aeronave:acVal, operador:opVal,
          piloto:piloto,
          instructor:String(row[4]||"").trim(),
          horoIn:parseFloat(row[13])||0,
          motorOut:String(row[5]||"").trim(),
          motorIn:String(row[6]||"").trim(),
          vueloOut:String(row[8]||"").trim(),
          vueloIn:String(row[9]||"").trim(),
          multOverride:parseFloat(row[11])||null,
          obs:obs, status:"pending"
        };
        if(!flagRaw.includes("Dif Motor/Vuelo")) checkDiff(entry);
        flEntries.push({id:nextEntryId++,reviewObserved:false,...entry});
        imported++;
      });
      dbg("Import complete — "+imported+" imported, "+skipped+" skipped","ok");
      if(!imported){showToast("No valid entries found in Excel","err");return;}
      batchSourceFile=[file.name];
      if(el("srcFile")){ el("srcFile").textContent="1"; el("srcFile").title=file.name; }
      if(el("srcTs")) el("srcTs").textContent=new Date().toLocaleString(lang==="es"?"es-PA":"en-US");
      el("srcBar").style.display="grid";
      el("reviewSection").style.display="block";
      batchStatus="DRAFT";
      await saveBatchToDB("Excel import");
      addFlAudit("📊",currentUser.name,"imported from Excel",imported+" entries from "+file.name);
      renderWfBar(); setupFlRoleUI(); renderFlTable();
      showToast("✓ "+imported+" "+t("xlsxImported"));
      showResultBanner("ok","✓ "+imported+" "+t("xlsxImported")+" — "+file.name);
    } catch(err){
      dbg("XLSX parse error: "+err.message,"err");
      showToast("Excel import error: "+err.message,"err");
      showResultBanner("err","✗ Excel import failed: "+err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── AIRCRAFT TAB RENDER ──
function renderAircraftTab(){
  const grid=el("aircraftTabGrid"); if(!grid) return;
  grid.innerHTML="";
  AIRCRAFT.forEach(ac=>{
    const card=document.createElement("div");
    card.style.cssText="background:var(--s2);border:1px solid var(--border2);border-top:3px solid var(--cyan);padding:18px;";
    const ratesHtml=(ac.rates||[]).map(r=>
      '<div style="display:grid;grid-template-columns:60px 80px 80px 1fr;align-items:center;gap:6px;padding:6px 10px;background:var(--s3);border-radius:2px;margin-bottom:4px">'+
      '<span style="color:var(--green);font-weight:600;font-family:var(--mono);font-size:11px">'+r.operador+'</span>'+
      '<span style="color:var(--dim2);font-family:var(--mono);font-size:11px;text-align:center">×'+r.multiplicador.toFixed(3)+'</span>'+
      '<span style="color:var(--yellow);font-family:var(--mono);font-size:11px;text-align:center">$'+(r.tarifaHr||0).toFixed(2)+'/hr</span>'+
      '<span style="color:var(--cyan);font-size:10px;font-family:var(--mono);text-align:right">TBH: $'+((r.tarifaHr||0)*r.multiplicador).toFixed(2)+'/hr</span>'+
      '</div>'
    ).join("");
    card.innerHTML=
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'+
      '<div style="font-family:var(--display);font-weight:700;font-size:20px;color:var(--cyan)">'+ac.matricula+'</div>'+
      '<div style="display:flex;gap:6px">'+
      '<button class="btn-sm" data-edit-ac="'+ac.id+'">'+t("edit")+'</button>'+
      '<button class="btn-sm del" data-del-ac="'+ac.id+'">'+t("del")+'</button>'+
      '</div></div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-family:var(--mono);font-size:10px;margin-bottom:14px">'+
      '<div><span style="color:var(--dim)">'+t("aircraftCardMakeModel")+'</span><br><span>'+( ac.makeModel||"—")+'</span></div>'+
      '<div><span style="color:var(--dim)">'+t("aircraftCardEngine")+'</span><br><span>'+(ac.motorId||"—")+'</span></div>'+
      '<div><span style="color:var(--dim)">'+t("aircraftCardFuel")+'</span><br><span>'+(ac.consumoGalHr||"—")+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-end">'+
        '<div><span style="color:var(--dim)">'+t("aircraftCardDiffThreshold")+'</span><br><span style="color:'+(ac.diffThreshold<=0.2?"var(--green)":"var(--yellow)")+'">'+ac.diffThreshold.toFixed(1)+' hrs</span></div>'+
        (ac.photoUrl?'<img src="'+ac.photoUrl+'" alt="'+ac.matricula+'" style="width:90px;height:62px;object-fit:cover;border-radius:2px;border:1px solid var(--border2);flex-shrink:0">':"")+
      '</div>'+
      '</div>'+
      '<div style="font-family:var(--mono);font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">'+t("aircraftOperatorRates")+'</div>'+
      (ratesHtml||'<div style="color:var(--dim);font-size:10px;font-family:var(--mono)">'+t("aircraftNoRates")+'</div>');
    grid.appendChild(card);
  });
  grid.querySelectorAll("[data-edit-ac]").forEach(btn=>btn.addEventListener("click",()=>openEditAircraft(btn.dataset.editAc)));
  grid.querySelectorAll("[data-del-ac]").forEach(btn=>btn.addEventListener("click",()=>openDeleteAircraft(btn.dataset.delAc)));
}

// ── FLEET SETTINGS — FULL CRUD ──
let tempRates=[];
let _stagedAcPhoto=null; // blob staged before aircraft save — cleared on modal open

function renderAcRates(){
  const wrap=el("acRatesList"); if(!wrap) return;
  wrap.innerHTML="";
  tempRates.forEach((r,i)=>{
    const row=document.createElement("div");
    row.style.cssText="display:grid;grid-template-columns:80px 110px 110px 32px;gap:6px;align-items:center";
    row.innerHTML=
      '<select style="background:var(--s3);border:1px solid var(--border2);color:var(--text);padding:6px;font-family:var(--mono);font-size:11px;border-radius:2px">'+
        COMPANIES.map(c=>'<option value="'+c.code+'"'+(c.code===r.operador?" selected":"")+'>'+c.code+'</option>').join("")+
      '</select>'+
      '<input type="number" step="0.001" placeholder="'+t("aircraftRateMultiplierPh")+'" value="'+(r.multiplicador||"")+'" style="background:var(--s3);border:1px solid var(--border2);color:var(--text);padding:6px;font-size:11px;border-radius:2px;width:100%">'+
      '<input type="number" step="0.01" placeholder="'+t("aircraftRateHourlyPh")+'" value="'+(r.tarifaHr||"")+'" style="background:var(--s3);border:1px solid var(--border2);color:var(--text);padding:6px;font-size:11px;border-radius:2px;width:100%">'+
      '<button style="background:none;border:1px solid var(--border2);color:var(--red);cursor:pointer;padding:4px 6px;border-radius:2px">✕</button>';
    const [opSel,multInp,tarifaInp,delBtn]=row.children;
    opSel.addEventListener("change",()=>{tempRates[i].operador=opSel.value;});
    multInp.addEventListener("input",()=>{tempRates[i].multiplicador=parseFloat(multInp.value)||0;});
    tarifaInp.addEventListener("input",()=>{tempRates[i].tarifaHr=parseFloat(tarifaInp.value)||0;});
    delBtn.addEventListener("click",()=>{tempRates.splice(i,1);renderAcRates();});
    wrap.appendChild(row);
  });
}

function addAcRate(){
  tempRates.push({operador:COMPANIES[0]?.code||"FM",multiplicador:1.275,tarifaHr:0});
  renderAcRates();
}

function renderFleetSettings(){
  const grid=el("fleetGrid"); if(!grid) return;
  grid.innerHTML="";
  AIRCRAFT.forEach(ac=>{
    const card=document.createElement("div");
    card.style.cssText="background:var(--s2);border:1px solid var(--border2);border-top:3px solid var(--cyan);padding:14px;";
    card.innerHTML=
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'+
      '<div style="font-family:var(--display);font-weight:700;font-size:16px;color:var(--cyan)">'+ac.matricula+"</div>"+
      '<div style="display:flex;gap:6px">'+
      '<button class="btn-sm" data-edit-ac="'+ac.id+'">'+t("edit")+'</button>'+
      '<button class="btn-sm del" data-del-ac="'+ac.id+'">'+t("del")+'</button>'+
      "</div></div>"+
      '<div style="display:grid;gap:5px;font-family:var(--mono);font-size:10px">'+
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--dim)">'+t("aircraftCardMakeModel")+'</span><span>'+ac.makeModel+"</span></div>"+
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--dim)">'+t("thOp")+'</span><span style="color:var(--green)">'+ac.operador+"</span></div>"+
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--dim)">'+t("thMult")+'</span><span style="color:var(--yellow)">'+ac.multiplicador.toFixed(3)+"×</span></div>"+
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--dim)">'+t("aircraftCardEngine")+'</span><span>'+ac.motorId+"</span></div>"+
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--dim)">'+t("aircraftCardFuel")+'</span><span>'+ac.consumoGalHr+"</span></div>"+
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">'+
      '<div><span style="color:var(--dim)">'+t("aircraftCardDiffThreshold")+'</span><br><span style="color:'+(ac.diffThreshold<=0.2?"var(--green)":"var(--yellow)")+'">'+ac.diffThreshold.toFixed(1)+" hrs</span></div>"+
      (ac.photoUrl?'<img src="'+ac.photoUrl+'" alt="'+ac.matricula+'" style="width:90px;height:62px;object-fit:cover;border-radius:2px;border:1px solid var(--border2);flex-shrink:0">':"")+
      "</div>"+
      "</div>";
    grid.appendChild(card);
  });
  // Wire edit/delete buttons
  grid.querySelectorAll("[data-edit-ac]").forEach(btn=>btn.addEventListener("click",()=>openEditAircraft(btn.dataset.editAc)));
  grid.querySelectorAll("[data-del-ac]").forEach(btn=>btn.addEventListener("click",()=>openDeleteAircraft(btn.dataset.delAc)));
}

// ── AIRCRAFT PHOTO UI HELPERS ──
function _resetAcPhotoUI(){
  _stagedAcPhoto=null;
  const empty=el("ac_photo_empty"); const present=el("ac_photo_present");
  if(empty) empty.style.display="flex";
  if(present) present.style.display="none";
}
function _showAcPhotoThumb(src, label){
  const empty=el("ac_photo_empty"); const present=el("ac_photo_present");
  const thumb=el("ac_photo_thumb"); const fname=el("ac_photo_filename");
  if(empty) empty.style.display="none";
  if(present) present.style.display="flex";
  if(thumb) thumb.src=src;
  if(fname) fname.textContent=label||"";
}
function openAcPhotoModal(){
  // Reset photo modal state
  const inp=el("ac_photo_input"); const nameSpan=el("ac_photo_input_name");
  const previewImg=el("ac_photo_preview_img"); const previewEmpty=el("ac_photo_preview_empty");
  if(inp) inp.value="";
  if(nameSpan) nameSpan.textContent=t("aircraftNoFileChosen");
  if(previewImg){previewImg.style.display="none"; previewImg.src="";}
  if(previewEmpty) previewEmpty.style.display="block";
  openModal("acPhotoMbd");
}

function openCreateAircraft(){
  editingAcId=null;
  el("acModalTitle").textContent=t("aircraftNewTitle");
  el("ac_matricula").value=""; el("ac_makeModel").value="";
  el("ac_tipo").value="Single Engine";
  if(el("ac_horoTolerance")) el("ac_horoTolerance").value="0.01";
  if(el("ac_diffThreshold")) el("ac_diffThreshold").value="0.2";
  if(el("ac_diffWarn")) el("ac_diffWarn").value="0.3";
  if(el("ac_diffAlert")) el("ac_diffAlert").value="0.4";
  el("ac_motorId").value=""; el("ac_consumoGalHr").value="";
  el("ac_asientos").value="2";
  if(el("ac_owner")) el("ac_owner").value="";
  if(el("ac_owner_address")) el("ac_owner_address").value="";
  _resetAcPhotoUI();
  tempRates=[]; renderAcRates();
  localizeAircraftUi();
  openModal("acMbd");
}

function openEditAircraft(id){
  const ac=AIRCRAFT.find(a=>a.id===id); if(!ac) return;
  editingAcId=id;
  el("acModalTitle").textContent=t("aircraftEditTitle")+ac.matricula;
  el("ac_matricula").value=ac.matricula;
  el("ac_makeModel").value=ac.makeModel||"";
  el("ac_tipo").value=ac.tipo||"";
  if(el("ac_horoTolerance")) el("ac_horoTolerance").value=ac.horoTolerance||0.01;
  if(el("ac_diffThreshold")) el("ac_diffThreshold").value=ac.diffThreshold||0.2;
  if(el("ac_diffWarn")) el("ac_diffWarn").value=ac.diffWarn||0.3;
  if(el("ac_diffAlert")) el("ac_diffAlert").value=ac.diffAlert||0.4;
  el("ac_motorId").value=ac.motorId||"";
  el("ac_consumoGalHr").value=ac.consumoGalHr||"";
  el("ac_asientos").value=ac.asientos||"";
  if(el("ac_owner")) el("ac_owner").value=ac.owner||"";
  if(el("ac_owner_address")) el("ac_owner_address").value=ac.ownerAddress||"";
  _stagedAcPhoto=null; // always reset staged on edit open
  if(ac.photoUrl){ _showAcPhotoThumb(ac.photoUrl, ac.matricula+".jpg"); }
  else { _resetAcPhotoUI(); }
  tempRates=JSON.parse(JSON.stringify(ac.rates||[]));
  renderAcRates();
  localizeAircraftUi();
  openModal("acMbd");
}

function openDeleteAircraft(id){
  const ac=AIRCRAFT.find(a=>a.id===id); if(!ac) return;
  deletingId=id; deleteType="aircraft";
  el("delWarn").innerHTML=t("aircraftDeleteConfirm")+' <strong>'+ac.matricula+"</strong>"+t("aircraftDeleteConfirmSuffix");
  el("del_confirm").textContent=t("aircraftDelete");
  openModal("delMbd");
}

async function saveAircraft(){
  const matricula=el("ac_matricula").value.trim().toUpperCase();
  if(!matricula){showToast(t("aircraftRegistrationRequiredToast"),"err");return;}
  if(!tempRates.length){showToast(t("aircraftRatesRequiredToast"),"err");return;}
  const data={
    matricula, makeModel:el("ac_makeModel").value.trim(),
    tipo:el("ac_tipo").value.trim(),
    horoTolerance:parseFloat(el("ac_horoTolerance")?el("ac_horoTolerance").value:0.01)||0.01,
    // Use first rate's multiplier as the aircraft-level fallback
    multiplicador:tempRates[0]?parseFloat(tempRates[0].multiplicador)||1:1,
    diffThreshold:parseFloat(el("ac_diffThreshold")?el("ac_diffThreshold").value:0.2)||0.2,
    diffWarn:parseFloat(el("ac_diffWarn")?el("ac_diffWarn").value:0.3)||0.3,
    diffAlert:parseFloat(el("ac_diffAlert")?el("ac_diffAlert").value:0.4)||0.4,
    motorId:el("ac_motorId").value.trim(),
    consumoGalHr:parseFloat(el("ac_consumoGalHr").value)||0,
    asientos:parseInt(el("ac_asientos").value)||2,
    owner:el("ac_owner")?el("ac_owner").value.trim():"",
    ownerAddress:el("ac_owner_address")?el("ac_owner_address").value.trim():"",
    rates:tempRates
  };
  // Upload staged photo if present — failure does NOT block save
  let photoUrl=editingAcId?(AIRCRAFT.find(a=>a.id===editingAcId)?.photoUrl||null):null;
  if(_stagedAcPhoto){
    const compressed=await compressImage(_stagedAcPhoto,800,0.78);
    const url=await uploadAircraftPhoto(compressed,data.matricula);
    if(url) photoUrl=url;
    else dbg("Photo upload failed — aircraft saves without new photo","warn");
  }
  data.photoUrl=photoUrl;
  if(editingAcId){
    const ac=AIRCRAFT.find(a=>a.id===editingAcId); Object.assign(ac,data);
    sbPatch("aircraft","id=eq."+editingAcId,{
      matricula:data.matricula, make_model:data.makeModel||"",
      tipo:data.tipo||"", multiplicador:data.multiplicador,
      diff_threshold:data.diffThreshold, diff_warn:data.diffWarn, diff_alert:data.diffAlert,
      motor_id:data.motorId||"", consumo_gal_hr:data.consumoGalHr||0,
      asientos:data.asientos||2, rates:data.rates,
      owner:data.owner||"", owner_address:data.ownerAddress||"",
      photo_url:photoUrl
    }).then(()=>dbg("Aircraft updated in DB: "+data.matricula,"ok"))
      .catch(e=>dbg("Aircraft update error: "+e.message,"err"));
    showToast(t("aircraftUpdatedToast"));
  } else {
    const newAc={id:"ac"+Date.now(),...data};
    AIRCRAFT.push(newAc);
    sbPost("aircraft",{
      id:newAc.id, matricula:data.matricula, make_model:data.makeModel||"",
      tipo:data.tipo||"", multiplicador:data.multiplicador,
      diff_threshold:data.diffThreshold, diff_warn:data.diffWarn, diff_alert:data.diffAlert,
      motor_id:data.motorId||"", consumo_gal_hr:data.consumoGalHr||0,
      asientos:data.asientos||2, rates:data.rates,
      owner:data.owner||"", owner_address:data.ownerAddress||"",
      photo_url:photoUrl
    }).then(()=>dbg("Aircraft created in DB: "+data.matricula,"ok"))
      .catch(e=>dbg("Aircraft create error: "+e.message,"err"));
    showToast(t("aircraftAddedToast"));
  }
  _stagedAcPhoto=null;
  closeModal("acMbd");
  renderFleetSettings();
  renderAircraftTab();
  initBatchConstants(); // refresh dropdowns
}

// ── EVENT WIRING (all addEventListener, no inline handlers) ──
function wireEvents(){
  initTooltipLayer();
  // Login
  el("btnEN").addEventListener("click",()=>setLang("en"));
  el("btnES").addEventListener("click",()=>setLang("es"));
  el("appEN").addEventListener("click",()=>setLang("en"));
  el("appES").addEventListener("click",()=>setLang("es"));
  // Login — remember username
  restoreRememberedUsername();
  el("loginBtn").addEventListener("click",doLogin);
  el("li_pass").addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
  if(el("li_pass_toggle")) el("li_pass_toggle").addEventListener("click",()=>{
    const inp=el("li_pass");
    const isHidden=inp.type==="password";
    inp.type=isHidden?"text":"password";
    if(el("li_eye_open")) el("li_eye_open").style.display=isHidden?"none":"";
    if(el("li_eye_shut")) el("li_eye_shut").style.display=isHidden?"":"none";
  });
  el("btnSignOut").addEventListener("click",doLogout);

  // Users tab
  el("ut_add").addEventListener("click",openCreateUser);
  el("ut_export").addEventListener("click",exportUsersJSON);
  el("ut_clearLog").addEventListener("click",clearAudit);
  el("userSearch").addEventListener("input",renderUsers);
  el("filterRole").addEventListener("change",renderUsers);
  el("filterCompany").addEventListener("change",renderUsers);
  el("filterStatus").addEventListener("change",renderUsers);
  // User table sort
  document.querySelectorAll("[data-sort-user]").forEach(th=>{
    th.addEventListener("click",()=>{
      const col=th.dataset.sortUser;
      if(userSortCol===col){ userSortDir*=-1; } else { userSortCol=col; userSortDir=1; }
      renderUsers();
    });
  });

  // User modal
  el("um_close").addEventListener("click",()=>closeModal("userMbd"));
  el("um_cancel").addEventListener("click",()=>closeModal("userMbd"));
  el("um_save").addEventListener("click",saveUser);
  el("um_role").addEventListener("change",updateRoleDesc);
  if(el("um_roleRightsBtn")) el("um_roleRightsBtn").addEventListener("click",()=>openRoleRights(el("um_role").value));
  if(el("rr_close")) el("rr_close").addEventListener("click",()=>closeModal("roleRightsMbd"));
  if(el("rr_done")) el("rr_done").addEventListener("click",()=>closeModal("roleRightsMbd"));
  if(el("roleRightsMbd")) el("roleRightsMbd").addEventListener("click",e=>{ if(e.target===el("roleRightsMbd")) closeModal("roleRightsMbd"); });
  // userMbd: backdrop click disabled — prevents accidental loss of unsaved user data

  // User table delegation
  el("userTbody").addEventListener("click",function(e){
    const roleBtn=e.target.closest("[data-role-rights]");
    const editBtn=e.target.closest("[data-edit-user]");
    const delBtn=e.target.closest("[data-del-user]");
    const stBtn=e.target.closest("[data-uid]");
    if(roleBtn) openRoleRights(roleBtn.dataset.roleRights);
    else if(editBtn) openEditUser(editBtn.dataset.editUser);
    else if(delBtn) openDeleteUser(delBtn.dataset.delUser);
    else if(stBtn) toggleUserStatus(stBtn.dataset.uid);
  });

  // Companies tab
  el("ct_add").addEventListener("click",openCreateCompany);

  // Company modal
  if(el("co_addContact")) el("co_addContact").addEventListener("click",addContact);
  el("co_close").addEventListener("click",()=>closeModal("coMbd"));
  el("co_cancel").addEventListener("click",()=>closeModal("coMbd"));
  el("co_save").addEventListener("click",saveCompany);
  ["co_inv_addr","co_inv_phone","co_inv_notes","co_inv_rate"].forEach(id=>{
    if(el(id)) el(id).addEventListener("change",_syncInvChkStyles);
  });
  el("co_addRule").addEventListener("click",addBillingRuleRow);
  // coMbd: backdrop click disabled — prevents accidental loss of unsaved company/billing rule data

  // Company grid delegation
  el("coGrid").addEventListener("click",function(e){
    const editBtn=e.target.closest("[data-edit-co]");
    const toggleBtn=e.target.closest("[data-toggle-co]");
    const delBtn=e.target.closest("[data-del-co]");
    if(editBtn) openEditCompany(editBtn.dataset.editCo);
    else if(toggleBtn) toggleCompanyStatus(toggleBtn.dataset.toggleCo);
    else if(delBtn) openDeleteCompany(delBtn.dataset.delCo);
  });

  // Delete modal
  el("del_close").addEventListener("click",()=>closeModal("delMbd"));
  el("del_cancel").addEventListener("click",()=>closeModal("delMbd"));
  el("del_confirm").addEventListener("click",confirmDelete);
  el("delMbd").addEventListener("click",e=>{ if(e.target===el("delMbd")) closeModal("delMbd"); });

  // Flight Log tab
  el("apiWarnLink").addEventListener("click",()=>switchTab("settings"));
  if(el("sb_dlcsv")) el("sb_dlcsv").addEventListener("click",exportFlCSV);
  el("btn_approveAll").addEventListener("click",()=>setAllFlStatus("approved"));
  el("btn_resetAll").addEventListener("click",()=>setAllFlStatus("pending"));
  el("btn_newEntry").addEventListener("click",()=>openEditEntry(null));
  el("filterOp").addEventListener("change",renderFlTable);
  el("ptab_entries").addEventListener("click",()=>switchFlPanel("entries"));
  el("ptab_audit").addEventListener("click",()=>switchFlPanel("audit"));
  el("btn_csv").addEventListener("click",exportFlCSV);
  el("btn_xlsx").addEventListener("click",exportFlXLSX);
  el("btn_saveDraft").addEventListener("click",saveDraft);
  el("btn_submit").addEventListener("click",handleSubmit);
  el("btn_approve").addEventListener("click",handleApprove);
  if(el("btn_returnForReview")) el("btn_returnForReview").addEventListener("click",openRfr);
  if(el("rfrMbd")) el("rfrMbd").addEventListener("click",e=>{ if(e.target===el("rfrMbd")) closeRfr(); });
  // btn_reqChanges removed — replaced by per-row flag system

  // FL entry modal
  el("fl_close").addEventListener("click",()=>{ closeModal("flMbd"); el("flMbd").style.display="none"; });
  el("fl_cancel").addEventListener("click",()=>{ closeModal("flMbd"); el("flMbd").style.display="none"; });
  el("fl_save").addEventListener("click",()=>{ if(el("fl_soft_warn")) el("fl_soft_warn").style.display="none"; saveEntryForm(); });
  if(el("fl_soft_proceed")) el("fl_soft_proceed").addEventListener("click",()=>{
    el("fl_soft_warn").style.display="none";
    proceedSaveEntry();
  });
  if(el("fl_soft_cancel")) el("fl_soft_cancel").addEventListener("click",()=>{
    el("fl_soft_warn").style.display="none";
  });
  // flMbd is now floating — no overlay click to close
  // Make flMbd draggable
  (()=>{
    const dlg=el("flMbd"); const hdr=dlg?dlg.querySelector(".float-dialog-hdr"):null;
    if(!dlg||!hdr) return;
    let ox=0,oy=0,startX=0,startY=0,dragging=false;
    hdr.addEventListener("mousedown",e=>{dragging=true;startX=e.clientX;startY=e.clientY;
      const r=dlg.getBoundingClientRect();ox=r.left;oy=r.top;e.preventDefault();});
    document.addEventListener("mousemove",e=>{if(!dragging)return;
      dlg.style.left=(ox+e.clientX-startX)+"px";dlg.style.top=(oy+e.clientY-startY)+"px";
      dlg.style.transform="none";});
    document.addEventListener("mouseup",()=>{dragging=false;});
  })();
  // Auto-set default mult when aircraft/operator changes in entry modal
  function updateEntryMult(){
    const aeronave=el("f_aeronave").value;
    const operador=el("f_operador").value;
    const mult=getAircraftMult(aeronave,operador);
    if(mult&&mult!==1) el("f_mult").value=mult;
    liveCalcEntry();
  }
  el("f_aeronave").addEventListener("change",function(){
    const ac=AIRCRAFT.find(a=>a.matricula===this.value);
    if(ac) el("f_operador").value=ac.operador;
    updateEntryMult();
  });
  el("f_operador").addEventListener("change",updateEntryMult);
  ["f_motorOut","f_motorIn","f_vueloOut","f_vueloIn","f_mult","f_tmotor","f_tvuelo"].forEach(id=>{
    el(id).addEventListener("input",liveCalcEntry);
    el(id).addEventListener("change",liveCalcEntry);
  });

  // Confirm modal
  el("confirm_close").addEventListener("click",()=>closeModal("confirmMbd"));
  el("confirm_cancel").addEventListener("click",()=>closeModal("confirmMbd"));
  el("confirm_ok").addEventListener("click",executeConfirm);
  el("confirmMbd").addEventListener("click",e=>{ if(e.target===el("confirmMbd")) closeModal("confirmMbd"); });

  // Exception modal
  el("exc_close").addEventListener("click",()=>closeModal("excMbd"));
  el("exc_back").addEventListener("click",()=>closeModal("excMbd"));
  el("exc_proceed").addEventListener("click",proceedAnyway);
  el("excMbd").addEventListener("click",e=>{ if(e.target===el("excMbd")) closeModal("excMbd"); });

  // Req changes modal
  // req changes removed — replaced by per-row flag system (flagMbd)

  // Settings
  el("btn_saveApiKey").addEventListener("click",saveApiKey);
  el("btn_clearApiKey").addEventListener("click",clearApiKey);
  if(el("btn_delTestBatches")) el("btn_delTestBatches").addEventListener("click",deleteTestBatches);
  if(el("btn_delByStatus")) el("btn_delByStatus").addEventListener("click",()=>{
    const status=el("del_batch_status").value;
    deleteBatchesByStatus(status);
  });
  if(el("btn_clearAuditDB")) el("btn_clearAuditDB").addEventListener("click",clearAuditLogDB);

  // View As toggle (Admin only)
  if(el("viewAsRole")) el("viewAsRole").addEventListener("change",function(){
    viewRole=this.value==="ADMIN"?null:this.value;
    renderWfBar(); setupFlRoleUI(); setupSettingsUI(); renderFlTable(); renderTabs(); updateActionBar();
    showToast("View As: "+(viewRole||"Admin"));
  });

  // Side panel image toolbar
  if(el("sp_zoom_in")) el("sp_zoom_in").addEventListener("click",spZoomIn);
  if(el("sp_zoom_out")) el("sp_zoom_out").addEventListener("click",spZoomOut);
  if(el("sp_fit")) el("sp_fit").addEventListener("click",spFitToWindow);
  // pan toggle removed — drag is always on
  if(el("sp_rotate")) el("sp_rotate").addEventListener("click",spRotateImg);
  if(el("sp_reextract")) el("sp_reextract").addEventListener("click",spReextract);

  // Non-Billable toggle
  if(el("sp_nonbill_toggle")) el("sp_nonbill_toggle").addEventListener("click",e=>{
    e.stopPropagation();
    if(!spEditingEntryId) return;
    const entry=flEntries.find(e=>e.id===spEditingEntryId); if(!entry) return;
    if(entry.status==="nonbillable"){
      entry.status="pending";
      entry.nonBillReason=null;
      spUpdateNonBillBtn(false);
      spMarkDirty();
      renderFlTable();
      updateSrcBar();
    } else {
      if(el("nonBill_reason")) el("nonBill_reason").value="Maintenance";
      if(el("nonBill_comment")) el("nonBill_comment").value="";
      // Position near the moved Non-Billable control.
      const btn=el("sp_nonbill_toggle");
      const rect=btn?btn.getBoundingClientRect():{bottom:300,left:920};
      const dlg=el("nonBillMbd");
      if(dlg){
        dlg.style.top=(rect.bottom+8)+"px";
        dlg.style.left=rect.left+"px";
        dlg.classList.add("open");
      }
    }
  });
  makeDraggable("nonBillMbd","nonBillMbdHdr");
  if(el("nonBill_close")) el("nonBill_close").addEventListener("click",()=>el("nonBillMbd").classList.remove("open"));
  if(el("nonBill_cancel")) el("nonBill_cancel").addEventListener("click",()=>el("nonBillMbd").classList.remove("open"));
  if(el("nonBill_confirm")) el("nonBill_confirm").addEventListener("click",()=>{
    const entry=flEntries.find(e=>e.id===spEditingEntryId); if(!entry) return;
    const prevStatus=entry.status;
    const prevNonBillReason=entry.nonBillReason;
    const reason=el("nonBill_reason").value;
    const comment=el("nonBill_comment").value.trim();
    entry.nonBillReason=reason+(comment?" — "+comment:"");
    entry.status="nonbillable";
    if(el("sp_obs")) el("sp_obs").value="⊘ "+formatNonBillReason(entry.nonBillReason);
    spUpdateNonBillBtn(true);
    spMarkDirty();
    recordStatusChange(entry.id,prevStatus,prevNonBillReason);
    renderFlTable();
    updateSrcBar();
    el("nonBillMbd").classList.remove("open");
  });

  // Floating dialog wiring — srcBar clickable links
  function getFloatViewport(){
    const vv=window.visualViewport;
    return vv
      ? {left:vv.offsetLeft, top:vv.offsetTop, width:vv.width, height:vv.height}
      : {left:0, top:0, width:window.innerWidth, height:window.innerHeight};
  }
  function clampFloatDialog(dlg,left,top){
    const vp=getFloatViewport();
    const margin=12;
    const maxLeft=vp.left+Math.max(margin,vp.width-dlg.offsetWidth-margin);
    const maxTop=vp.top+Math.max(margin,vp.height-dlg.offsetHeight-margin);
    return {
      left:Math.min(Math.max(left,vp.left+margin),maxLeft),
      top:Math.min(Math.max(top,vp.top+margin),maxTop)
    };
  }
  function clampFloatDialogSize(dlg,width,height){
    const vp=getFloatViewport();
    const margin=24;
    const minW=Math.min(300,Math.max(220,vp.width-margin*2));
    const minH=150;
    const maxW=Math.max(minW,vp.width-margin*2);
    const maxH=Math.max(minH,vp.height-margin*2);
    return {
      width:Math.min(Math.max(width,minW),maxW),
      height:Math.min(Math.max(height,minH),maxH)
    };
  }
  function centerFloatDialog(dlg){
    const vp=getFloatViewport();
    dlg.style.transform="none";
    const left=vp.left+(vp.width-dlg.offsetWidth)/2;
    const top=vp.top+(vp.height-dlg.offsetHeight)/2;
    const pos=clampFloatDialog(dlg,left,top);
    dlg.style.left=pos.left+"px";
    dlg.style.top=pos.top+"px";
  }
  function addFloatResizeHandle(dlg){
    if(dlg.querySelector(".float-dialog-resize")) return;
    const handle=document.createElement("div");
    handle.className="float-dialog-resize";
    handle.title="Resize";
    dlg.appendChild(handle);
  }
  function openFloatDialog(dlgId,title,lines,color,entryIds){
    const dlg=el(dlgId); if(!dlg) return;
    addFloatResizeHandle(dlg);
    const body=dlg.querySelector(".float-dialog-body");
    if(body){
      if(!lines.length){
        body.innerHTML="<div style='color:var(--dim)'>No items.</div>";
      } else {
        body.innerHTML=lines.map((l,i)=>{
          const eid=entryIds?entryIds[i]:null;
          if(eid!=null){
            return '<div style="padding:3px 0;border-bottom:1px solid var(--border2)">'+
              '<a href="#" data-open-entry="'+eid+'" style="color:var(--cyan);text-decoration:none;font-weight:600;margin-right:6px">→</a>'+
              '<span>'+l+'</span></div>';
          }
          return '<div style="padding:3px 0;border-bottom:1px solid var(--border2)">'+l+"</div>";
        }).join("");
        // Wire entry links
        body.querySelectorAll("[data-open-entry]").forEach(a=>{
          a.addEventListener("click",ev=>{
            ev.preventDefault();
            const eid=parseInt(a.dataset.openEntry);
            openSidePanel(eid,true);
          });
        });
      }
    }
    const bar=el("srcBar");
    const hdr=dlg.querySelector(".float-dialog-hdr");
    if(hdr) hdr.style.background=color||"var(--cyan)";
    const titleEl=dlg.querySelector(".float-dialog-title");
    if(titleEl){
      titleEl.textContent=title;
      titleEl.style.color="#000";
    }
    dlg.style.border="1.5px solid "+(color||"var(--border2)");
    dlg.classList.add("open");
    centerFloatDialog(dlg);
  }
  function makeDraggable(dlgId,hdrId){
    const dlg=el(dlgId); const hdr=el(hdrId); if(!dlg||!hdr) return;
    let ox,oy,sx,sy,dragging=false,pointerId=null;
    addFloatResizeHandle(dlg);
    hdr.addEventListener("pointerdown",e=>{
      if(e.target.closest(".float-dialog-close")) return;
      dragging=true; pointerId=e.pointerId; sx=e.clientX; sy=e.clientY;
      const rect=dlg.getBoundingClientRect();
      dlg.style.transform="none";
      ox=rect.left; oy=rect.top;
      hdr.classList.add("dragging");
      if(hdr.setPointerCapture) hdr.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    document.addEventListener("pointermove",e=>{
      if(!dragging) return;
      const pos=clampFloatDialog(dlg,ox+(e.clientX-sx),oy+(e.clientY-sy));
      dlg.style.left=pos.left+"px";
      dlg.style.top=pos.top+"px";
      e.preventDefault();
    });
    function stopDrag(e){
      if(pointerId!==null&&e&&e.pointerId!==pointerId) return;
      dragging=false; pointerId=null; hdr.classList.remove("dragging");
    }
    document.addEventListener("pointerup",stopDrag);
    document.addEventListener("pointercancel",stopDrag);

    const resizeHandle=dlg.querySelector(".float-dialog-resize");
    if(resizeHandle){
      let resizing=false,rsx=0,rsy=0,startW=0,startH=0,resizePointerId=null;
      resizeHandle.addEventListener("pointerdown",e=>{
        resizing=true; resizePointerId=e.pointerId; rsx=e.clientX; rsy=e.clientY;
        const rect=dlg.getBoundingClientRect();
        startW=rect.width; startH=rect.height;
        dlg.style.transform="none";
        resizeHandle.classList.add("dragging");
        if(resizeHandle.setPointerCapture) resizeHandle.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      document.addEventListener("pointermove",e=>{
        if(!resizing) return;
        const size=clampFloatDialogSize(dlg,startW+(e.clientX-rsx),startH+(e.clientY-rsy));
        dlg.style.width=size.width+"px";
        dlg.style.height=size.height+"px";
        const pos=clampFloatDialog(dlg,dlg.offsetLeft,dlg.offsetTop);
        dlg.style.left=pos.left+"px";
        dlg.style.top=pos.top+"px";
        e.preventDefault();
      });
      function stopResize(e){
        if(resizePointerId!==null&&e&&e.pointerId!==resizePointerId) return;
        resizing=false; resizePointerId=null; resizeHandle.classList.remove("dragging");
      }
      document.addEventListener("pointerup",stopResize);
      document.addEventListener("pointercancel",stopResize);
    }
  }
  makeDraggable("dlgDups","dlgDupsHdr");
  makeDraggable("dlgNotRead","dlgNotReadHdr");
  makeDraggable("dlgNonBill","dlgNonBillHdr");
  makeDraggable("dlgLogBreaks","dlgLogBreaksHdr");
  makeDraggable("dlgSeqAlerts","dlgSeqAlertsHdr");
  makeDraggable("dlgSources","dlgSourcesHdr");

  if(el("dlgSourcesClose")) el("dlgSourcesClose").addEventListener("click",()=>el("dlgSources").classList.remove("open"));
  if(el("dlgDupsClose")) el("dlgDupsClose").addEventListener("click",()=>el("dlgDups").classList.remove("open"));
  if(el("dlgNotReadClose")) el("dlgNotReadClose").addEventListener("click",()=>el("dlgNotRead").classList.remove("open"));
  if(el("dlgNonBillClose")) el("dlgNonBillClose").addEventListener("click",()=>el("dlgNonBill").classList.remove("open"));
  if(el("dlgLogBreaksClose")) el("dlgLogBreaksClose").addEventListener("click",()=>el("dlgLogBreaks").classList.remove("open"));
  if(el("dlgSeqAlertsClose")) el("dlgSeqAlertsClose").addEventListener("click",()=>el("dlgSeqAlerts").classList.remove("open"));

  if(el("srcFile")) el("srcFile").addEventListener("click",()=>{
    const files=(Array.isArray(batchSourceFile)?batchSourceFile:(batchSourceFile||"").split(/,\s*/)).filter(Boolean);
    const lines=files.map((f,i)=>(i+1)+". "+f);
    openFloatDialog("dlgSources",t("sourceFiles"),lines,"var(--cyan)",null);
  });

  if(el("srcEventBar")) el("srcEventBar").addEventListener("click",()=>{
    const events=deriveWorkflowWidgetState().workflowEvents.slice(-8).reverse();
    const rows=events.map(ev=>{
      const who=ev.actorName&&ev.actorName!=="PENDING"?ev.actorName:ev.actorRole;
      const role=ev.actorRole==="OPERATOR"?"op":ev.actorRole==="REVIEWER"?"re":"sys";
      const time=wfWidgetTimestamp(ev.timestamp);
      return '<div class="wf-event-row '+role+'">'+
        '<div class="wf-event-meta"><span>'+escHtml(time)+"</span><strong>"+escHtml(ev.actorRole||"—")+"</strong><b>"+escHtml(who)+"</b></div>"+
        '<div class="wf-event-note">'+escHtml(ev.note||ev.type)+'</div>'+
      '</div>';
    });
    openFloatDialog("dlgSources",t("workflowEvents"),rows,"var(--cyan)",null);
  });

  if(el("srcNotRead")) el("srcNotRead").addEventListener("click",()=>{
    const entries=flEntries.filter(e=>e.status==="skipped"||e.status==="void"||!e.aeronave||!e.fecha);
    const lines=entries.map(e=>{
      const idx=flEntries.indexOf(e)+1;
      const reason=e.status==="skipped"?t("reasonSkipped"):e.status==="void"?t("reasonVoid"):!e.aeronave?t("reasonNoAircraft"):!e.fecha?t("reasonNoDate"):t("reasonUnknown");
      return t("entryShort")+" #"+idx+" | "+t("thLog")+" "+(e.bnum||"—")+" | "+reason;
    });
    openFloatDialog("dlgNotRead",t("notReadEntries"),lines,"var(--yellow)",entries.map(e=>e.id));
  });
  if(el("srcNonBill")) el("srcNonBill").addEventListener("click",()=>{
    const entries=flEntries.filter(e=>e.status==="nonbillable");
    const lines=entries.map(e=>{
      const idx=flEntries.indexOf(e)+1;
      return t("entryShort")+" #"+idx+" | "+t("thLog")+" "+(e.bnum||"—")+" | "+(e.fecha||"—")+" | "+(formatNonBillReason(e.nonBillReason)||t("noReasonGiven"));
    });
    openFloatDialog("dlgNonBill",t("nonBillableEntries"),lines,"var(--red)",entries.map(e=>e.id));
  });
  if(el("srcDups")) el("srcDups").addEventListener("click",()=>{
    const dups=duplicateCheck();
    const lines=dups.map(d=>t("entryShort")+" #"+(d.idx+1)+" | "+t("thLog")+" "+d.bnum+" | "+(d.entry.fecha||"—")+" | "+d.entry.aeronave);
    openFloatDialog("dlgDups",t("duplicateLogEntries"),lines,"orange",dups.map(d=>d.entry.id));
  });
  if(el("srcLogBreaks")) el("srcLogBreaks").addEventListener("click",()=>{
    const breaks=logCheck();
    const lines=breaks.map(b=>t("entryShort")+" #"+(b.idx+1)+" | "+b.msg);
    openFloatDialog("dlgLogBreaks",t("logBreaks"),lines,"var(--red)",breaks.map(b=>b.entry.id));
  });
  if(el("srcHoro")) el("srcHoro").addEventListener("click",()=>{
    const alerts=flEntries.filter((e,idx)=>{ const h=horoCheck(e,idx); return h&&!h.ok; });
    const lines=alerts.map(e=>{
      const idx=flEntries.indexOf(e);
      const h=horoCheck(e,idx);
      return t("entryShort")+" #"+(idx+1)+" | "+t("thLog")+" "+(e.bnum||"—")+" | "+e.aeronave+" | "+t("prevIn")+" "+h.prevIn+" → "+t("currOut")+" "+h.currOut+" (Δ"+h.diff+")";
    });
    openFloatDialog("dlgSeqAlerts",t("sequenceAlerts"),lines,"var(--yellow)",alerts.map(e=>e.id));
  });
  if(el("dlgSentBackClose")) el("dlgSentBackClose").addEventListener("click",()=>el("dlgSentBack").classList.remove("open"));
  if(el("srcSentBack")) el("srcSentBack").addEventListener("click",()=>{
    const flagged=getReviewerCommentFilterEntries();
    const lines=flagged.map(e=>{
      const idx=flEntries.indexOf(e);
      return t("entryShort")+" #"+(idx+1)+" | "+t("thLog")+" "+(e.bnum||"—")+" | "+e.aeronave+" | "+latestReviewerComment(e);
    });
    openFloatDialog("dlgSentBack",t("sentBackForReview"),lines,"var(--yellow)",flagged.map(e=>e.id));
  });
  if(el("srcObservedActive")) el("srcObservedActive").addEventListener("click",()=>{
    const active=getObservedActiveEntries();
    const lines=active.map(e=>{
      const idx=flEntries.indexOf(e);
      return t("entryShort")+" #"+(idx+1)+" | "+t("thLog")+" "+(e.bnum||"—")+" | "+e.aeronave+" | "+latestReviewerComment(e);
    });
    openFloatDialog("dlgSentBack",t("activeObservedEntries"),lines,"var(--yellow)",active.map(e=>e.id));
  });
  if(el("dlgSentBackHdr")) makeDraggable("dlgSentBack","dlgSentBackHdr");
  // Pan/drag — always on (left click + drag), double click = zoom in
  const spImgWrap=el("sp_img_wrap");
  if(spImgWrap){
    let isDragging=false, dragStartX=0, dragStartY=0, panStartX=0, panStartY=0, didDrag=false;
    let swipeStartX=0, swipeStartY=0, swipeStartT=0, swipeTracking=false, swipeHorizontal=false;
    spImgWrap.addEventListener("mousedown",e=>{
      if(e.button!==0) return;
      isDragging=true; didDrag=false;
      dragStartX=e.clientX; dragStartY=e.clientY;
      panStartX=spPanX; panStartY=spPanY;
      spImgWrap.style.cursor="grabbing";
      e.preventDefault();
    });
    spImgWrap.addEventListener("mousemove",e=>{
      if(!isDragging) return;
      const dx=e.clientX-dragStartX; const dy=e.clientY-dragStartY;
      if(Math.abs(dx)>3||Math.abs(dy)>3) didDrag=true;
      spPanX=panStartX+dx/spZoom;
      spPanY=panStartY+dy/spZoom;
      spApplyTransform();
    });
    spImgWrap.addEventListener("mouseleave",()=>{
      if(!isDragging) return;
      isDragging=false; spImgWrap.style.cursor="";
    });
    spImgWrap.addEventListener("mouseup",()=>{
      if(!isDragging) return;
      isDragging=false; spImgWrap.style.cursor="";
    });
    spImgWrap.addEventListener("dblclick",e=>{
      e.preventDefault();
      spZoomIn();
    });
    spImgWrap.addEventListener("touchstart",e=>{
      if(e.touches.length!==1||!spEditingEntryId||spZoom!==1||spPanMode) return;
      const t=e.touches[0];
      swipeStartX=t.clientX;
      swipeStartY=t.clientY;
      swipeStartT=Date.now();
      swipeTracking=true;
      swipeHorizontal=false;
    },{passive:true});
    spImgWrap.addEventListener("touchmove",e=>{
      if(!swipeTracking||e.touches.length!==1) return;
      const t=e.touches[0];
      const dx=t.clientX-swipeStartX;
      const dy=t.clientY-swipeStartY;
      if(Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.35){
        swipeHorizontal=true;
        e.preventDefault();
      }
    },{passive:false});
    spImgWrap.addEventListener("touchend",e=>{
      if(!swipeTracking) return;
      swipeTracking=false;
      const t=e.changedTouches[0];
      if(!t) return;
      const dx=t.clientX-swipeStartX;
      const dy=t.clientY-swipeStartY;
      const elapsed=Date.now()-swipeStartT;
      if(swipeHorizontal&&elapsed<900&&Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.35){
        e.preventDefault();
        const dir=dx<0?1:-1;
        spNavigate(dir,()=>showSpSwipeCue(dir));
      }
    },{passive:false});
    spImgWrap.addEventListener("touchcancel",()=>{
      swipeTracking=false;
    },{passive:true});
    // Scroll wheel zoom — throttled to prevent over-sensitivity on trackpad
    let _wheelThrottle=null;
    spImgWrap.addEventListener("wheel",e=>{
      if(!el("sidePanel").classList.contains("open")) return;
      e.preventDefault();
      if(_wheelThrottle) return;
      _wheelThrottle=setTimeout(()=>{ _wheelThrottle=null; },150);
      if(e.deltaY<0) spZoomIn(); else spZoomOut();
    },{passive:false});
  }

  // Pre-invoice add charge and sign-off
  const addCharge=()=>{piAdditionalCharges.push({desc:t("piAdditionalChargeDefault"),amount:0});renderPreInvoice();};
  if(el("pi_add_charge2")) el("pi_add_charge2").addEventListener("click",addCharge);
  if(el("pi_signoff_btn")) el("pi_signoff_btn").addEventListener("click",async()=>{
    piSignedBy=currentUser.name;
    piSignedAt=new Date().toLocaleString("es-PA");
    addFlAudit("✍️",currentUser.name,"signed off billing",piInvNum);
    renderPreInvoice();
    await saveBatchToDB("billing signoff");
    showToast(t("piBillingSigned"));
  });
  // Sort headers
  if(el("pi_th_bnum")) el("pi_th_bnum").addEventListener("click",()=>{
    if(piSortCol==="bnum") piSortDir=piSortDir==="asc"?"desc":"asc";
    else{ piSortCol="bnum"; piSortDir="asc"; }
    renderPreInvoice();
  });
  if(el("pi_th_fecha")) el("pi_th_fecha").addEventListener("click",()=>{
    if(piSortCol==="fecha") piSortDir=piSortDir==="asc"?"desc":"asc";
    else{ piSortCol="fecha"; piSortDir="asc"; }
    renderPreInvoice();
  });
  // Export PDF
  if(el("pi_export_pdf")) el("pi_export_pdf").addEventListener("click",()=>window.print());

  if(el("btn_resetTestData")) el("btn_resetTestData").addEventListener("click",()=>{
    if(confirm(t("resetReviewConfirm"))) resetTestData();
  });
  if(el("btn_reopen")) el("btn_reopen").addEventListener("click",()=>{
    if(el("reopen_reason")) el("reopen_reason").value="";
    if(el("reopen_title")) el("reopen_title").textContent=t("reopenTitle");
    if(el("reopen_subtitle")) el("reopen_subtitle").textContent=t("reopenSubtitle");
    if(el("reopen_reason_label")) el("reopen_reason_label").textContent=t("reopenReasonLabel");
    if(el("reopen_reason")) el("reopen_reason").placeholder=t("reopenReasonPh");
    if(el("reopen_confirm")) el("reopen_confirm").textContent=t("reopenConfirm");
    if(el("reopen_cancel")) el("reopen_cancel").textContent=t("rfrCancel");
    openModal("reopenMbd");
  });
  if(el("reopen_close")) el("reopen_close").addEventListener("click",()=>closeModal("reopenMbd"));
  if(el("reopen_cancel")) el("reopen_cancel").addEventListener("click",()=>closeModal("reopenMbd"));
  if(el("reopen_confirm")) el("reopen_confirm").addEventListener("click",reopenBatch);
  if(el("reopenMbd")) el("reopenMbd").addEventListener("click",e=>{ if(e.target===el("reopenMbd")) closeModal("reopenMbd"); });
  if(el("pi_load_cycle_btn")) el("pi_load_cycle_btn").addEventListener("click",openPiLoadModal);
  if(el("piLoad_close")) el("piLoad_close").addEventListener("click",()=>closeModal("piLoadMbd"));
  if(el("piLoad_cancel")) el("piLoad_cancel").addEventListener("click",()=>closeModal("piLoadMbd"));
  if(el("piLoadMbd")) el("piLoadMbd").addEventListener("click",e=>{ if(e.target===el("piLoadMbd")) closeModal("piLoadMbd"); });
  if(el("piLoad_current")) el("piLoad_current").addEventListener("click",()=>{
    if(batchStatus!=="APPROVED"){
      showToast(t("piNoApproved"),"warn");
      closeModal("piLoadMbd"); return;
    }
    closeModal("piLoadMbd");
    renderPreInvoice();
    showToast(t("piCurrentLoaded"),"info");
  });
  if(el("piLoad_historic")) el("piLoad_historic").addEventListener("click",()=>{
    const sel=el("piLoad_historicSel");
    if(sel) sel.style.display=sel.style.display==="none"?"block":"none";
  });
  if(el("piLoad_confirm")) el("piLoad_confirm").addEventListener("click",async()=>{
    const batchId=el("piLoad_batchSel").value;
    if(!batchId){showToast(t("piSelectCycle"),"warn");return;}
    closeModal("piLoadMbd");
    await switchToBatch(batchId);
    if(batchStatus!=="APPROVED"){
      showToast(t("piSelectedNotApproved"),"warn"); return;
    }
    renderPreInvoice();
    switchTab("preinvoice");
  });

  // Debug panel toggle — update sp bottom
  if(el("debugToggle")) el("debugToggle").addEventListener("click",()=>{
    const body=el("debugBody"); const btn=el("debugToggle");
    body.classList.toggle("collapsed");
    btn.textContent=body.classList.contains("collapsed")?"▲":"▼";
    _updateSpBottom();
  });
  if(el("debugClose")) el("debugClose").addEventListener("click",()=>{
    el("debugPanel").classList.remove("on");
    _updateSpBottom();
  });
  if(el("debugCopy")) el("debugCopy").addEventListener("click",()=>{
    const lines=Array.from(el("debugBody").querySelectorAll(".debug-line")).map(l=>l.textContent).join("\n");
    navigator.clipboard.writeText(lines).then(()=>showToast("Debug log copied"));
  });

  // Horo alert toggle
  if(el("horoAlertHdr")) el("horoAlertHdr").addEventListener("click",()=>{
    const body=el("horoAlertBody"); const btn=el("horoToggle");
    body.classList.toggle("collapsed");
    btn.textContent=body.classList.contains("collapsed")?"▼":"▲";
  });

  // New Batch modal
  if(el("fl_newBatch")) el("fl_newBatch").addEventListener("click",openNewBatchModal);
  if(el("nb_close")) el("nb_close").addEventListener("click",()=>{ closeModal("newBatchMbd"); nbFiles=[]; nbRenderQueue(); });
  if(el("nb_cancel")) el("nb_cancel").addEventListener("click",()=>{ closeModal("newBatchMbd"); nbFiles=[]; nbRenderQueue(); });
  if(el("nb_confirm")) el("nb_confirm").addEventListener("click",confirmNewBatch);
  // newBatchMbd: backdrop click disabled — prevents accidental loss of queued file uploads
  if(el("newBatchMbd")) el("newBatchMbd").addEventListener("click",e=>{ e.stopPropagation(); });
  initNbDropZone();
  // Add More Files dialog
  if(el("btn_addMoreFiles")) el("btn_addMoreFiles").addEventListener("click",openAddFilesDialog);
  if(el("af_close")) el("af_close").addEventListener("click",closeAddFilesDialog);
  if(el("af_cancel")) el("af_cancel").addEventListener("click",closeAddFilesDialog);
  if(el("af_confirm")) el("af_confirm").addEventListener("click",confirmAddFiles);
  if(el("af_aircraft")) el("af_aircraft").addEventListener("change",function(){
    const ac=AIRCRAFT.find(a=>a.matricula===this.value);
    const opSel=el("af_operator"); if(!opSel) return;
    opSel.innerHTML='<option value="">Auto-detect</option>';
    if(ac&&ac.rates) ac.rates.forEach(r=>{
      const opt=document.createElement("option");
      opt.value=r.operador; opt.textContent=r.operador;
      opSel.appendChild(opt);
    });
  });
  initAfDropZone();
  // Make addFilesMbd draggable
  (()=>{
    const dlg=el("addFilesMbd"); const hdr=dlg?dlg.querySelector(".float-dialog-hdr"):null;
    if(!dlg||!hdr) return;
    let ox=0,oy=0,startX=0,startY=0,dragging=false;
    hdr.addEventListener("mousedown",e=>{dragging=true;startX=e.clientX;startY=e.clientY;
      const r=dlg.getBoundingClientRect();ox=r.left;oy=r.top;e.preventDefault();});
    document.addEventListener("mousemove",e=>{if(!dragging)return;
      dlg.style.left=(ox+e.clientX-startX)+"px";dlg.style.top=(oy+e.clientY-startY)+"px";dlg.style.right="auto";});
    document.addEventListener("mouseup",()=>{dragging=false;});
  })();
  // Upload status window
  if(el("uploadLog_close")) el("uploadLog_close").addEventListener("click",closeUploadStatusWindow);
  if(el("uploadLog_save")) el("uploadLog_save").addEventListener("click",saveUploadLog);
  // Make Extraction Log draggable
  (()=>{
    const dlg=el("uploadStatusMbd");
    const hdr=dlg?dlg.querySelector("[data-drag-hdr]"):null;
    if(!dlg||!hdr) return;
    let ox=0,oy=0,startX=0,startY=0,dragging=false;
    hdr.addEventListener("mousedown",e=>{dragging=true;startX=e.clientX;startY=e.clientY;
      const r=dlg.getBoundingClientRect();ox=r.left;oy=r.top;e.preventDefault();});
    document.addEventListener("mousemove",e=>{if(!dragging)return;
      dlg.style.left=(ox+e.clientX-startX)+"px";dlg.style.top=(oy+e.clientY-startY)+"px";
      dlg.style.transform="none";});
    document.addEventListener("mouseup",()=>{dragging=false;});
  })();
  // Extraction summary modal — Go to Review applies Needs Review filter
  if(el("extractSummary_go")) el("extractSummary_go").addEventListener("click",()=>{
    closeModal("extractSummaryMbd");
    if(el("filterOp")) el("filterOp").value="problems";
    renderFlTable();
  });
  // nb_aircraft cascade to nb_operator
  if(el("nb_aircraft")) el("nb_aircraft").addEventListener("change",function(){
    const ac=AIRCRAFT.find(a=>a.matricula===this.value);
    const opSel=el("nb_operator");
    if(!opSel) return;
    opSel.innerHTML='<option value="">Auto-detect</option>';
    if(ac&&ac.rates) ac.rates.forEach(r=>{
      const opt=document.createElement("option");
      opt.value=r.operador; opt.textContent=r.operador;
      opSel.appendChild(opt);
    });
  });

  // Batch selector
  if(el("batchSelector")) el("batchSelector").addEventListener("change",async function(){
    const newId=this.value; if(!newId||newId===currentBatchId) return;
    if(flEntries.length){
      if(confirm(t("batchSwitchSaveConfirm"))) await saveBatchToDB("batch selector switch");
    }
    await switchToBatch(newId);
  });

  // Swap buttons in side panel
  if(el("sp_swap_motor")) el("sp_swap_motor").addEventListener("click",()=>{
    const a=el("sp_motorOut").value, b=el("sp_motorIn").value;
    el("sp_motorOut").value=b; el("sp_motorIn").value=a; spLiveCalc();
  });
  if(el("sp_swap_vuelo")) el("sp_swap_vuelo").addEventListener("click",()=>{
    const a=el("sp_vueloOut").value, b=el("sp_vueloIn").value;
    el("sp_vueloOut").value=b; el("sp_vueloIn").value=a; spLiveCalc();
  });
  if(el("nameProp_close")) el("nameProp_close").addEventListener("click",()=>{closeModal("namePropMbd");if(_namePropData){_namePropData.onConfirm([]);_namePropData=null;}});
  if(el("nameProp_this")) el("nameProp_this").addEventListener("click",()=>{closeModal("namePropMbd");if(_namePropData){_namePropData.onConfirm([]);_namePropData=null;}});
  if(el("nameProp_selected")) el("nameProp_selected").addEventListener("click",()=>applyNameProp("selected"));
  if(el("nameProp_all")) el("nameProp_all").addEventListener("click",()=>applyNameProp("all"));

  // WhatsApp confirmation modal
  if(el("wa_close")) el("wa_close").addEventListener("click",skipWhatsApp);
  if(el("wa_skip")) el("wa_skip").addEventListener("click",skipWhatsApp);
  if(el("wa_send")) el("wa_send").addEventListener("click",sendWhatsApp);
  if(el("waMbd")) el("waMbd").addEventListener("click",e=>{ if(e.target===el("waMbd")) skipWhatsApp(); });

  // Side panel — next/prev navigation
  if(el("spPrev")) el("spPrev").addEventListener("click",()=>spNavigate(-1));
  if(el("spNext")) el("spNext").addEventListener("click",()=>spNavigate(1));
  // Keyboard navigation when panel open
  document.addEventListener("keydown",e=>{
    const panel=el("sidePanel");
    if(!panel||!panel.classList.contains("open")) return;
    // Don't intercept arrow keys when user is typing in a field
    const tag=document.activeElement?.tagName;
    if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return;
    if(e.key==="ArrowLeft") spNavigate(-1);
    else if(e.key==="ArrowRight") spNavigate(1);
    else if(e.key==="Escape") closeSidePanel();
    else if((e.ctrlKey||e.metaKey)&&e.key==="z"){ e.preventDefault(); undoStatusChange(); }
  });

  // Global Ctrl+Z / Cmd+Z — works from anywhere, not just side panel
  document.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==="z"){
      const tag=document.activeElement?.tagName;
      if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return; // let browser handle native undo in fields
      e.preventDefault();
      undoStatusChange();
    }
  });

  // Side panel collapse button
  if(el("spCollapseBtn")) el("spCollapseBtn").addEventListener("click",closeSidePanel);

  // Table sidebar toggle button — always reads live panel state, no memory
  if(el("spTableToggle")) el("spTableToggle").addEventListener("click",()=>{
    const panel=el("sidePanel");
    const isOpen=panel.classList.contains("open");
    if(isOpen){
      closeSidePanel();
    } else {
      // Open to last active entry, or first entry as fallback
      const activeEntry=flEntries.find(e=>e.id===spEditingEntryId)||flEntries[0];
      if(activeEntry) openSidePanel(activeEntry.id, true);
    }
  });

  // Side panel resize handle — dynamically updates table width
  const handle=el("spResizeHandle");
  const panel=el("sidePanel");
  function spSyncTableWidth(){
    const shell=el("appShell");
    if(!shell||!panel.classList.contains("open")) return;
    shell.style.paddingRight=panel.offsetWidth+"px";
  }
  if(handle&&panel){
    let startX, startW;
    handle.addEventListener("pointerdown",e=>{
      startX=e.clientX; startW=panel.offsetWidth;
      handle.classList.add("dragging");
      if(handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
      document.addEventListener("pointermove",onResize);
      document.addEventListener("pointerup",stopResize);
      document.addEventListener("pointercancel",stopResize);
      e.preventDefault();
    });
    function onResize(e){
      const newW=Math.max(340,Math.min(Math.floor(window.innerWidth*0.5),startW-(e.clientX-startX)));
      panel.style.width=newW+"px";
      spSyncTableWidth();
    }
    function stopResize(){
      const w=Math.min(parseInt(panel.style.width)||420,Math.floor(window.innerWidth*0.5));
      handle.classList.remove("dragging");
      saveUserPreference("sidepanel_width", w);
      document.removeEventListener("pointermove",onResize);
      document.removeEventListener("pointerup",stopResize);
      document.removeEventListener("pointercancel",stopResize);
    }
  }

  // spEditHdr — collapse only on toggle button, not full header
  if(el("spEditToggle")) el("spEditToggle").addEventListener("click",e=>{
    e.stopPropagation();
    const body=el("spEditBody"); const btn=el("spEditToggle");
    body.classList.toggle("collapsed");
    btn.textContent=body.classList.contains("collapsed")?"▼":"▲";
  });
  if(el("spEditHdr")) el("spEditHdr").onclick=null;
  if(el("sp_save")) el("sp_save").addEventListener("click",saveSpEntry);
  // sp_cancel removed — close panel via X button

  const reviewToggle=el("spReviewToggle");
  if(reviewToggle) reviewToggle.addEventListener("click",e=>{
    e.stopPropagation();
    const zone=el("spReviewZone");
    if(!zone) return;
    zone.classList.toggle("is-collapsed");
    syncSidePanelReviewZone();
  });

  const reviewHandle=el("spReviewResize");
  if(reviewHandle){
    let rvStartY=0, rvStartH=0;
    reviewHandle.addEventListener("pointerdown",e=>{
      if(e.target&&e.target.closest&&e.target.closest("#spReviewToggle")) return;
      const zone=el("spReviewZone");
      if(!zone||zone.classList.contains("is-hidden")) return;
      zone.classList.remove("is-collapsed");
      syncSidePanelReviewZone();
      rvStartY=e.clientY;
      rvStartH=zone.offsetHeight||180;
      reviewHandle.classList.add("dragging");
      if(reviewHandle.setPointerCapture) reviewHandle.setPointerCapture(e.pointerId);
      document.addEventListener("pointermove",onReviewResize);
      document.addEventListener("pointerup",stopReviewResize);
      document.addEventListener("pointercancel",stopReviewResize);
      document.body.classList.add("sp-resizing");
      e.preventDefault();
    });
    function onReviewResize(e){
      const zone=el("spReviewZone");
      const body=el("spEditBody");
      if(!zone||!body) return;
      const delta=e.clientY-rvStartY;
      const maxH=Math.max(120,Math.floor(body.offsetHeight*0.45));
      const newH=Math.max(82,Math.min(maxH,rvStartH-delta));
      zone.style.height=newH+"px";
    }
    function stopReviewResize(){
      const zone=el("spReviewZone");
      reviewHandle.classList.remove("dragging");
      document.body.classList.remove("sp-resizing");
      document.removeEventListener("pointermove",onReviewResize);
      document.removeEventListener("pointerup",stopReviewResize);
      document.removeEventListener("pointercancel",stopReviewResize);
      syncSidePanelReviewZone();
    }
  }

  // Vertical resize handle — image/data divider
  const vHandle=el("spVResize");
  if(vHandle){
    let vStartY, vStartH;
    vHandle.addEventListener("pointerdown",e=>{
      vStartY=e.clientY;
      vStartH=el("sp_img_wrap").offsetHeight;
      vHandle.classList.add("dragging");
      if(vHandle.setPointerCapture) vHandle.setPointerCapture(e.pointerId);
      document.addEventListener("pointermove",onVResize);
      document.addEventListener("pointerup",stopVResize);
      document.addEventListener("pointercancel",stopVResize);
      vHandle.addEventListener("pointermove",onVResize);
      vHandle.addEventListener("pointerup",stopVResize);
      vHandle.addEventListener("pointercancel",stopVResize);
      document.body.classList.add("sp-resizing");
      e.preventDefault();
    });
    function onVResize(e){
      const panel=el("sidePanel");
      const minImgH=150;
      // Min data height: enough to show all fields (~360px)
      const minDataH=360;
      const maxImgH=panel.offsetHeight-minDataH-vHandle.offsetHeight;
      const newH=Math.max(minImgH,Math.min(maxImgH,vStartH+(e.clientY-vStartY)));
      el("sp_img_wrap").style.height=newH+"px";
      _scaleNonBillWatermark();
    }
    function stopVResize(){
      vHandle.classList.remove("dragging");
      document.body.classList.remove("sp-resizing");
      const imgWrap=el("sp_img_wrap");
      if(imgWrap) saveUserPreference("sidepanel_image_height", imgWrap.offsetHeight);
      document.removeEventListener("pointermove",onVResize);
      document.removeEventListener("pointerup",stopVResize);
      document.removeEventListener("pointercancel",stopVResize);
      vHandle.removeEventListener("pointermove",onVResize);
      vHandle.removeEventListener("pointerup",stopVResize);
      vHandle.removeEventListener("pointercancel",stopVResize);
    }
  }

  // Aircraft cascade in side panel
  if(el("sp_aeronave")) el("sp_aeronave").addEventListener("change",function(){
    spCascadeAircraftDropdowns(this.value);
  });
  // Mult dropdown custom option toggle
  if(el("sp_mult_sel")) el("sp_mult_sel").addEventListener("change",function(){
    const multInp=el("sp_mult");
    if(this.value==="custom"){
      if(multInp){ multInp.style.display=""; multInp.focus(); }
    } else {
      if(multInp){ multInp.style.display="none"; multInp.value=""; }
      spLiveCalc();
    }
  });

  ["sp_motorOut","sp_motorIn","sp_vueloOut","sp_vueloIn","sp_mult","sp_operador"].forEach(id=>{
    if(el(id)) el(id).addEventListener("input",spLiveCalc);
  });
  // Dirty tracking — any field change marks panel dirty
  ["sp_bnum","sp_fecha","sp_piloto","sp_instructor","sp_horoIn",
   "sp_motorOut","sp_motorIn","sp_vueloOut","sp_vueloIn","sp_mult","sp_mult_sel","sp_obs",
   "sp_aeronave","sp_operador"].forEach(id=>{
    if(el(id)) el(id).addEventListener("input",spMarkDirty);
    if(el(id)) el(id).addEventListener("change",spMarkDirty);
  });

  // Aircraft modal (both buttons)
  if(el("btn_addAircraft")) el("btn_addAircraft").addEventListener("click",openCreateAircraft);
  if(el("btn_addAircraft2")) el("btn_addAircraft2").addEventListener("click",openCreateAircraft);
  if(el("btn_addRate")) el("btn_addRate").addEventListener("click",addAcRate);
  if(el("ac_close")) el("ac_close").addEventListener("click",()=>closeModal("acMbd"));
  if(el("ac_cancel")) el("ac_cancel").addEventListener("click",()=>closeModal("acMbd"));
  if(el("ac_save")) el("ac_save").addEventListener("click",saveAircraft);
  // acMbd: backdrop click disabled — prevents accidental loss of unsaved aircraft data
  // Aircraft photo modal
  if(el("ac_photo_add")) el("ac_photo_add").addEventListener("click",openAcPhotoModal);
  if(el("ac_photo_replace")) el("ac_photo_replace").addEventListener("click",openAcPhotoModal);
  if(el("acPhoto_close")) el("acPhoto_close").addEventListener("click",()=>closeModal("acPhotoMbd"));
  if(el("acPhoto_cancel")) el("acPhoto_cancel").addEventListener("click",()=>closeModal("acPhotoMbd"));
  if(el("ac_photo_input")) el("ac_photo_input").addEventListener("change",function(){
    const file=this.files[0]; if(!file) return;
    const nameSpan=el("ac_photo_input_name");
    const previewImg=el("ac_photo_preview_img");
    const previewEmpty=el("ac_photo_preview_empty");
    if(nameSpan) nameSpan.textContent=file.name;
    const url=URL.createObjectURL(file);
    if(previewImg){previewImg.src=url; previewImg.style.display="block"; previewImg.onload=()=>URL.revokeObjectURL(url);}
    if(previewEmpty) previewEmpty.style.display="none";
  });
  if(el("acPhoto_ok")) el("acPhoto_ok").addEventListener("click",async function(){
    const inp=el("ac_photo_input"); if(!inp||!inp.files[0]) return;
    const file=inp.files[0];
    const compressed=await compressImage(file,800,0.78);
    _stagedAcPhoto=compressed;
    const thumbUrl=URL.createObjectURL(compressed);
    _showAcPhotoThumb(thumbUrl, file.name);
    closeModal("acPhotoMbd");
  });

  // Flag modal
  el("flag_close").addEventListener("click",()=>closeModal("flagMbd"));
  el("flag_cancel").addEventListener("click",()=>closeModal("flagMbd"));
  el("flag_save").addEventListener("click",saveFlagEntry);
  el("flagMbd").addEventListener("click",e=>{ if(e.target===el("flagMbd")) closeModal("flagMbd"); });

  // Side panel
  el("sp_close").addEventListener("click", closeSidePanel);
  el("spOverlay").addEventListener("click", closeSidePanel);

  // Entry table click for side panel (click row # to view source)
  el("flTbody").addEventListener("click", function(e){
    const editBtn=e.target.closest("[data-edit-entry]");
    const stBtn=e.target.closest("[data-st-entry]");
    const tr=e.target.closest("tr[data-entry-id]");
    if(editBtn) openEditEntry(parseInt(editBtn.dataset.editEntry));
    else if(stBtn) setEntrySt(parseInt(stBtn.dataset.stEntry),stBtn.dataset.st);
    else if(tr){
      const entryId=parseInt(tr.dataset.entryId);
      openSidePanel(entryId,true);
    }
  });
  // Flight log table sort
  document.querySelectorAll("[data-sort-fl]").forEach(th=>{
    th.addEventListener("click",()=>{
      const col=th.dataset.sortFl;
      if(flSortCol===col){ flSortDir*=-1; } else { flSortCol=col; flSortDir=1; }
      renderFlTable();
    });
  });
}

// ── BOOT ──
async function init(){
  const savedLang=localStorage.getItem("hpfleet_lang");
  if(savedLang==="en"||savedLang==="es"){
    lang=savedLang;
    _loginLanguageOverride=savedLang;
  }
  syncLanguageButtons();
  await loadI18nDictionaries();
  applyI18n();
  wireEvents();
  dbg("HP Fleet "+APP_VERSION+" — initializing…","info");
  document.title="HP Fleet "+APP_VERSION;
  if(el("versionBadge")) el("versionBadge").textContent=APP_VERSION;
  if(el("versionBadgeNav")) el("versionBadgeNav").textContent=APP_VERSION;
  // Sanitize stale panel width — clamp to 50% viewport on load
  const _savedPW=localStorage.getItem("hpfleet_sp_width");
  if(_savedPW){
    const _maxPW=Math.floor(window.innerWidth*0.5);
    const _clamped=Math.min(parseInt(_savedPW)||420,_maxPW);
    if(_clamped!==parseInt(_savedPW)) localStorage.setItem("hpfleet_sp_width",_clamped+"px");
  }
  await seedIfEmpty();
  await loadMasterData();
  if(el("viewAsRole")) el("viewAsRole").value="ADMIN";
}

init();
