'use strict';
/** 黑鹰安卓远程 Web V5.3: real device management on top of consent-based enrollment. */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const {createClient} = require('@supabase/supabase-js');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render reverse proxy
app.use(express.json({limit:'24kb'}));
app.use((req,res,next)=>{
  res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');
  res.set('Referrer-Policy','no-referrer');
  res.set('Cache-Control','no-store');
  res.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  next();
});
const username=process.env.ADMIN_USERNAME||'admin';
const password=process.env.ADMIN_PASSWORD||'';
const secret=process.env.SESSION_SECRET||'';
const configured=password.length>=12&&secret.length>=32;
const serverKey=process.env.SUPABASE_SERVER_KEY||'';
const installKey=(process.env.BE_ENROLL_KEY||'').trim();
const readKey=serverKey||process.env.SUPABASE_KEY||'';
const dbUrl=(process.env.SUPABASE_URL||'').replace(/\/rest\/v1\/?$/,'').replace(/\/$/,'');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const db=dbUrl&&readKey?createClient(dbUrl,readKey,options):null;
const managedDb=dbUrl&&serverKey?createClient(dbUrl,serverKey,options):null;
const TTL=12*60*60*1000, HEARTBEAT_MS=120000;
const attempts=new Map();
function digest(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function mac(s){return crypto.createHmac('sha256',secret).update(s).digest('base64url');}
function equals(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function cookie(req){const m=/(?:^|;\s*)blackeagle_session=([^;]+)/.exec(req.headers.cookie||'');return m?m[1]:'';}
function authorized(req){if(!configured)return false;const p=cookie(req).split('.');if(p.length!==2||!equals(mac(p[0]),p[1]))return false;try{const data=JSON.parse(Buffer.from(p[0],'base64url').toString());return data.u===username&&data.exp>Date.now();}catch{return false;}}
function mustAuth(req,res,next){if(authorized(req))return next();res.status(401).json({error:'登录已过期，请重新登录'});}
function mustOrigin(req,res,next){const origin=req.headers.origin;const referer=req.headers.referer;const candidate=origin||referer;const host=req.get('host');if(!candidate)return res.status(403).json({error:'请求缺少来源验证'});try{const u=new URL(candidate);if(u.host===host&&['https:','http:'].includes(u.protocol))return next();}catch{}return res.status(403).json({error:'请求来源不匹配'});}
function rateLimit(label,ip,max,windowMs){const key=label+':'+ip, now=Date.now();if(attempts.size>3000){for(const [k,v] of attempts){if(now-v.start>windowMs*2)attempts.delete(k);}}let t=attempts.get(key);if(!t||now-t.start>windowMs)t={count:0,start:now};t.count++;attempts.set(key,t);return t.count<=max;}
function value(v,max=96){return typeof v==='string'?v.trim().slice(0,max):'';}
function noteValue(v){return typeof v==='string'?v.trim().slice(0,500):'';}
function clampBattery(x){return Number.isInteger(x)&&x>=0&&x<=100?x:null;}
function failure(res,e,msg='数据库操作失败'){console.error('[blackeagle]',msg,e?.message||String(e));res.status(502).json({error:msg+'：请核对 Supabase SQL 初始化及服务端密钥'});}
function ready(res){if(!managedDb){res.status(503).json({error:'管理功能尚未启用：请配置 SUPABASE_SERVER_KEY，并执行 V5 数据库脚本'});return false;}return true;}
async function audit(action,target='',detail=''){
 if(!managedDb)return;
 try{const {error}=await managedDb.from('be_audit_log').insert({actor:username,action,target,detail:noteValue(detail)});if(error)console.error('[audit]',error.message);}catch(e){console.error('[audit]',e.message);}
}
app.get('/api/health',(_req,res)=>res.json({online:true,version:'5.3.0',adminConfigured:configured,databaseConfigured:!!db,managedConfigured:!!managedDb,enrollmentConfigured:installKey.length>=32}));
app.get('/login',(_req,res)=>res.sendFile(path.join(__dirname,'public/login.html')));
app.post('/api/login',(req,res)=>{
 if(!configured)return res.status(503).json({error:'请先配置 ADMIN_PASSWORD 和 SESSION_SECRET'});
 if(!rateLimit('login',req.ip,12,15*60*1000))return res.status(429).json({error:'尝试次数过多，请15分钟后重试'});
 const u=value(req.body?.username,200),p=typeof req.body?.password==='string'?req.body.password:'';
 if(!equals(digest(u),digest(username))||!equals(digest(p),digest(password)))return res.status(401).json({error:'账号或密码错误'});
 const payload=Buffer.from(JSON.stringify({u:username,exp:Date.now()+TTL})).toString('base64url');
 res.cookie('blackeagle_session',payload+'.'+mac(payload),{httpOnly:true,secure:process.env.NODE_ENV==='production'||!!process.env.RENDER,sameSite:'strict',path:'/',maxAge:TTL});
 res.json({ok:true});
 void audit('login','administrator','后台登录成功');
});
app.post('/api/logout',mustAuth,mustOrigin,(req,res)=>{res.clearCookie('blackeagle_session',{path:'/',sameSite:'strict',httpOnly:true});res.json({ok:true});void audit('logout','administrator','退出登录');});

async function readMeta(keys){
 if(!managedDb||!keys.length)return {};
 const {data,error}=await managedDb.from('be_device_meta').select('device_key,note,group_name').in('device_key',keys.slice(0,500));
 if(error)throw error;
 return Object.fromEntries((data||[]).map(r=>[r.device_key,{note:r.note||'',group_name:r.group_name||'未分组'}]));
}
const fields='id,created_at,device_name,device_id,model,android_version,battery,network,status,country,ip,last_online';
app.get('/api/devices',mustAuth,async(req,res)=>{
 const mode=req.query.mode==='real'?'real':'demo';
 if(mode==='demo'&&!managedDb&&!db)return res.status(503).json({error:'Supabase尚未连接'});
 if(mode==='real'&&!ready(res))return;
 try{
  if(mode==='real'){
   const {data,error}=await managedDb.from('be_real_devices').select('id,device_name,model,android_version,battery,network,country,last_seen,registered_at,revoked_at').is('revoked_at',null).order('registered_at',{ascending:false}).limit(500);
   if(error)throw error;
   const keys=(data||[]).map(r=>'real:'+r.id),meta=await readMeta(keys);
   return res.json((data||[]).map(r=>({id:r.id,device_id:r.id,device_name:r.device_name,model:r.model,android_version:r.android_version,battery:r.battery,network:r.network,country:r.country,ip:'',last_online:r.last_seen,registered_at:r.registered_at,status:r.last_seen&&Date.now()-new Date(r.last_seen).getTime()<=HEARTBEAT_MS?'online':'offline',...meta['real:'+r.id]})));
  }
  const {data,error}=await (managedDb||db).from('devices').select(fields).order('id',{ascending:false}).limit(500);
  if(error)throw error;
  const keys=(data||[]).map(r=>'demo:'+r.id),meta=await readMeta(keys);
  return res.json((data||[]).map(r=>({...r,...meta['demo:'+r.id],isDemo:true})));
 }catch(e){failure(res,e,'设备数据读取失败');}
});
app.patch('/api/devices/:id/meta',mustAuth,mustOrigin,async(req,res)=>{
 if(!ready(res))return;
 const mode=req.query.mode==='real'?'real':'demo';
 const id=value(req.params.id,80);
 if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))return res.status(400).json({error:'无效设备编号'});
 const group_name=value(req.body?.group_name,45)||'未分组';
 const note=noteValue(req.body?.note);
 if(!['string'].includes(typeof req.body?.note)||typeof req.body?.group_name!=='string')return res.status(400).json({error:'请提供设备分组和备注'});
 const device_key=mode+':'+id;
 try{
  const table=mode==='demo'?'devices':'be_real_devices';
  const match=mode==='demo'&&/^\d+$/.test(id)?Number(id):id;
  const {data:check,error:checkErr}=await managedDb.from(table).select('id').eq('id',match).maybeSingle();if(checkErr)throw checkErr;
  if(!check)return res.status(404).json({error:'设备不存在'});
  const {error}=await managedDb.from('be_device_meta').upsert({device_key,group_name,note,updated_at:new Date().toISOString()},{onConflict:'device_key'});
  if(error)throw error;
  await audit('device_meta_update',device_key,'更新设备备注与分组');
  res.json({ok:true,group_name,note});
 }catch(e){failure(res,e,'保存设备设置失败');}
});
// V5.2 - authenticated, read-only detail for a single enrolled device.
// No new SQL columns or Android client changes are required.
app.get('/api/devices/:id/overview',mustAuth,async(req,res)=>{
 if(!ready(res))return;
 const id=value(req.params.id,80);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'设备编号无效'});
 try{
  const {data,error}=await managedDb.from('be_real_devices')
    .select('id,device_name,model,android_version,battery,network,country,last_seen,registered_at,revoked_at')
    .eq('id',id).is('revoked_at',null).maybeSingle();
  if(error)throw error;
  if(!data)return res.status(404).json({error:'设备不存在或授权已撤销'});
  const meta=await readMeta(['real:'+id]);
  const {data:events,error:eventsError}=await managedDb.from('be_audit_log')
    .select('id,actor,action,target,detail,created_at')
    .in('target',[id,'real:'+id]).order('created_at',{ascending:false}).limit(20);
  if(eventsError)throw eventsError;
  const alive=!!(data.last_seen&&Date.now()-new Date(data.last_seen).getTime()<=HEARTBEAT_MS);
  res.json({device:{...data,device_id:data.id,status:alive?'online':'offline',
    last_online:data.last_seen,...(meta['real:'+id]||{note:'',group_name:'未分组'})},
    server_time:new Date().toISOString(),heartbeat_timeout_seconds:HEARTBEAT_MS/1000,
    capabilities:{screen_share:false,remote_control:false,device_info:true},
    events:events||[]});
 }catch(e){failure(res,e,'设备详情读取失败');}
});
// Persist a device's display name, note and group. Never change agent credentials.
app.patch('/api/devices/:id/manage',mustAuth,mustOrigin,async(req,res)=>{
 if(!ready(res))return;
 const id=value(req.params.id,80);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'设备编号无效'});
 if(typeof req.body?.device_name!=='string'||typeof req.body?.group_name!=='string'||typeof req.body?.note!=='string')
  return res.status(400).json({error:'设备名称、分组和备注必须是文本'});
 const device_name=value(req.body.device_name,80),group_name=value(req.body.group_name,45)||'未分组',note=noteValue(req.body.note);
 if(device_name.length<2||/[\x00-\x1f\x7f]/.test(device_name)||/[\x00-\x1f\x7f]/.test(group_name))
  return res.status(400).json({error:'设备名称至少2个字符，且不能含控制字符'});
 try{
  const {data:old,error:fetchError}=await managedDb.from('be_real_devices')
    .select('device_name').eq('id',id).is('revoked_at',null).maybeSingle();
  if(fetchError)throw fetchError;
  if(!old)return res.status(404).json({error:'设备不存在或授权已撤销'});
  if(old.device_name!==device_name){
    const {error}=await managedDb.from('be_real_devices').update({device_name}).eq('id',id).is('revoked_at',null);
    if(error)throw error;
  }
  const {error:metaError}=await managedDb.from('be_device_meta')
    .upsert({device_key:'real:'+id,group_name,note,updated_at:new Date().toISOString()},{onConflict:'device_key'});
  if(metaError){
    // Best effort rollback of the display name in case the metadata table fails.
    if(old.device_name!==device_name)await managedDb.from('be_real_devices').update({device_name:old.device_name}).eq('id',id);
    throw metaError;
  }
  await audit('device_management_update','real:'+id,'修改设备名称、分组及备注');
  res.json({ok:true,device_name,group_name,note});
 }catch(e){failure(res,e,'设备管理信息保存失败');}
});
app.get('/api/audit',mustAuth,async(req,res)=>{
 if(!ready(res))return;
 try{const {data,error}=await managedDb.from('be_audit_log').select('id,actor,action,target,detail,created_at').order('created_at',{ascending:false}).limit(120);if(error)throw error;res.json(data||[]);}catch(e){failure(res,e,'审计日志读取失败');}
});
app.get('/api/admin/status',mustAuth,(req,res)=>res.json({version:'5.3.0',username,database:!!db,managed:!!managedDb,enrollmentConfigured:installKey.length>=32,heartbeatSeconds:HEARTBEAT_MS/1000,sessionHours:TTL/3600000}));
// Android agent enrollment: explicit on-device consent + private installer credential.
// Note: the installation credential is embedded in privately distributed APKs and can
// be extracted by a determined attacker. Treat it as pilot provisioning, rotate if leaked.
function tokenHash(token){return crypto.createHmac('sha256',secret).update('agent:'+token).digest('hex');}
app.post('/api/agent/enroll',async(req,res)=>{
 if(!managedDb||installKey.length<32)return res.status(503).json({error:'服务器未配置设备注册服务'});
 if(!rateLimit('enroll',req.ip,12,60*60*1000))return res.status(429).json({error:'注册过于频繁，请稍后重试'});
 const supplied=req.get('x-be-install-key')||'';
 if(supplied.length>256||!equals(digest(supplied),digest(installKey)))return res.status(401).json({error:'安装包未获授权'});
 if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')return res.status(400).json({error:'缺少设备信息'});
 const device_name=value(req.body.device_name,80)||'Android设备';
 const model=value(req.body.model,80),android_version=value(req.body.android_version,30),network=value(req.body.network,30);
 const battery=clampBattery(req.body.battery);
 if(battery===null)return res.status(400).json({error:'电量必须是0-100之间的整数'});
 try{
  const id=crypto.randomUUID(),token='bea_'+crypto.randomBytes(32).toString('hex');
  const {error}=await managedDb.from('be_real_devices').insert({id,device_name,model,android_version,battery,network,api_token_hash:tokenHash(token),last_seen:new Date().toISOString()});
  if(error)throw error;
  await audit('device_enrolled',id,'已在手机客户端确认授权并注册');
  res.status(201).json({device_id:id,agent_token:token,heartbeat_interval_seconds:40});
 }catch(e){failure(res,e,'设备注册失败');}
});
app.post('/api/agent/heartbeat',async(req,res)=>{
 if(!managedDb)return res.status(503).json({error:'设备连接服务尚未启用'});
 if(!rateLimit('heartbeat',req.ip,20000,15*60*1000))return res.status(429).json({error:'心跳过于频繁'});
 const m=/^Bearer (bea_[0-9a-f]{64})$/.exec(req.headers.authorization||'');if(!m)return res.status(401).json({error:'设备认证失败'});
 const battery=clampBattery(req.body?.battery);if(battery===null)return res.status(400).json({error:'电量必须是0-100之间的整数'});
 try{
  const {data,error}=await managedDb.from('be_real_devices').update({battery,network:value(req.body?.network,30),last_seen:new Date().toISOString()}).eq('api_token_hash',tokenHash(m[1])).is('revoked_at',null).select('id').maybeSingle();if(error)throw error;
  if(!data)return res.status(401).json({error:'设备密钥已失效'});
  res.json({ok:true,server_time:new Date().toISOString()});
 }catch(e){failure(res,e,'心跳更新失败');}
});
// Phone-side disconnect revokes registration and immediately marks offline.
app.post('/api/agent/disconnect',async(req,res)=>{
 if(!managedDb)return res.status(503).json({error:'设备服务未启用'});
 const m=/^Bearer (bea_[0-9a-f]{64})$/.exec(req.headers.authorization||'');
 if(!m)return res.status(401).json({error:'设备认证失败'});
 try{
  const {data,error}=await managedDb.from('be_real_devices').update({last_seen:null,revoked_at:new Date().toISOString()}).eq('api_token_hash',tokenHash(m[1])).is('revoked_at',null).select('id').maybeSingle();
  if(error)throw error;
  if(!data)return res.status(401).json({error:'设备密钥已失效'});
  screenSessions.delete(data.id);await audit('device_self_revoked',data.id,'手机客户端主动断开并解除绑定');
  res.json({ok:true});
 }catch(e){failure(res,e,'断开设备失败');}
});
app.post('/api/devices/:id/revoke',mustAuth,mustOrigin,async(req,res)=>{
 if(!ready(res))return;
 const id=value(req.params.id,80);if(!/^[0-9a-f-]{36}$/.test(id))return res.status(400).json({error:'设备ID错误'});
 try{const {data,error}=await managedDb.from('be_real_devices').update({revoked_at:new Date().toISOString()}).eq('id',id).is('revoked_at',null).select('id').maybeSingle();if(error)throw error;if(!data)return res.status(404).json({error:'设备不存在或已撤销'});screenSessions.delete(id);await audit('device_revoked',id,'管理员撤销设备注册');res.json({ok:true});}catch(e){failure(res,e,'设备撤销失败');}
});
// V5.3 - explicit, user-initiated Android MediaProjection streaming.
// Frames stay in process memory for at most 8 seconds; nothing is saved to Supabase or disk.
// No remote start, no remote touch, no recording, no audio, no publicly readable frames.
const screenSessions=new Map();
const SCREEN_MAX_AGE=8000;
const SCREEN_MAX_SESSIONS=50;
const SCREEN_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function agentDevice(req,res){
 const m=/^Bearer (bea_[0-9a-f]{64})$/.exec(req.headers.authorization||'');
 if(!m){res.status(401).json({error:'设备认证失败'});return null;}
 if(!managedDb){res.status(503).json({error:'设备管理尚未启用'});return null;}
 try {
  const {data,error}=await managedDb.from('be_real_devices').select('id').eq('api_token_hash',tokenHash(m[1])).is('revoked_at',null).maybeSingle();
  if(error)throw error;
  if(!data){res.status(401).json({error:'设备授权已失效'});return null;}
  return data.id;
 }catch(e){failure(res,e,'共享设备认证失败');return null;}
}
function pruneScreens(){
 const now=Date.now();
 for(const [id,state] of screenSessions){
  if(now-state.lastActivity>90000)screenSessions.delete(id);
  else if(state.frame&&now-state.capturedAt>SCREEN_MAX_AGE){state.frame=null;}
 }
}
setInterval(pruneScreens,3000).unref();
app.post('/api/agent/screen/start',async(req,res)=>{
 if(!rateLimit('screen-start',req.ip,18,60*60*1000))return res.status(429).json({error:'共享启动次数过多'});
 const id=await agentDevice(req,res);if(!id)return;
 pruneScreens();
 if(!screenSessions.has(id)&&screenSessions.size>=SCREEN_MAX_SESSIONS)return res.status(503).json({error:'同时共享的设备过多'});
 screenSessions.set(id,{frame:null,capturedAt:0,lastActivity:Date.now()});
 res.json({ok:true,frame_max_age_seconds:8});
 void audit('screen_share_started',id,'手机端通过系统屏幕录制授权后开始共享');
});
app.post('/api/agent/screen/frame',express.raw({type:'image/jpeg',limit:'280kb'}),async(req,res)=>{
 if(!rateLimit('screen-frame',req.ip,9000,15*60*1000))return res.status(429).end();
 const id=await agentDevice(req,res);if(!id)return;
 const state=screenSessions.get(id);if(!state)return res.status(409).json({error:'共享会话未开始'});
 const img=req.body;
 if(!Buffer.isBuffer(img)||img.length<128||img.length>280*1024||img[0]!==0xff||img[1]!==0xd8||img[2]!==0xff||img[img.length-2]!==0xff||img[img.length-1]!==0xd9)
  return res.status(400).json({error:'画面格式错误或超限'});
 state.frame=img;state.capturedAt=Date.now();state.lastActivity=Date.now();
 res.status(204).end();
});
app.post('/api/agent/screen/stop',async(req,res)=>{
 const id=await agentDevice(req,res);if(!id)return;
 screenSessions.delete(id);res.json({ok:true});
 void audit('screen_share_stopped',id,'手机端停止屏幕共享');
});
app.get('/api/devices/:id/screen/frame',mustAuth,async(req,res)=>{
 const id=value(req.params.id,80);if(!SCREEN_ID.test(id))return res.status(400).json({error:'设备ID错误'});
 // Never return cached frames from an expired or revoked device.
 const state=screenSessions.get(id);
 if(!state||!state.frame||Date.now()-state.capturedAt>SCREEN_MAX_AGE)return res.status(204).end();
 // A session is created only after an authenticated Android device starts the service.
 res.set('Content-Type','image/jpeg');res.set('X-Frame-Captured-At',String(state.capturedAt));
 res.send(state.frame);
});

app.get('/app.js',mustAuth,(_req,res)=>res.type('application/javascript').sendFile(path.join(__dirname,'public/app.js')));
app.get('/',(req,res)=>{if(!authorized(req))return res.redirect('/login');res.sendFile(path.join(__dirname,'public/index.html'));});
app.get('/index.html',(_req,res)=>res.redirect('/'));
app.use((_req,res)=>res.status(404).send('Not found'));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Black Eagle remote manager V5.3 started'));
