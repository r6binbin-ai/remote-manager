'use strict';
/** 黑鹰安卓远程 Web V5.0: demo and enrolled devices are separate. */
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
app.get('/api/health',(_req,res)=>res.json({online:true,version:'5.0.0',adminConfigured:configured,databaseConfigured:!!db,managedConfigured:!!managedDb}));
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
 if(mode==='demo'&&!db)return res.status(503).json({error:'Supabase尚未连接'});
 if(mode==='real'&&!ready(res))return;
 try{
  if(mode==='real'){
   const {data,error}=await managedDb.from('be_real_devices').select('id,device_name,model,android_version,battery,network,country,last_seen,registered_at,revoked_at').is('revoked_at',null).order('registered_at',{ascending:false}).limit(500);
   if(error)throw error;
   const keys=(data||[]).map(r=>'real:'+r.id),meta=await readMeta(keys);
   return res.json((data||[]).map(r=>({id:r.id,device_id:r.id,device_name:r.device_name,model:r.model,android_version:r.android_version,battery:r.battery,network:r.network,country:r.country,ip:'',last_online:r.last_seen,registered_at:r.registered_at,status:r.last_seen&&Date.now()-new Date(r.last_seen).getTime()<=HEARTBEAT_MS?'online':'offline',...meta['real:'+r.id]})));
  }
  const {data,error}=await db.from('devices').select(fields).order('id',{ascending:false}).limit(500);
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
app.get('/api/audit',mustAuth,async(req,res)=>{
 if(!ready(res))return;
 try{const {data,error}=await managedDb.from('be_audit_log').select('id,actor,action,target,detail,created_at').order('created_at',{ascending:false}).limit(120);if(error)throw error;res.json(data||[]);}catch(e){failure(res,e,'审计日志读取失败');}
});
app.get('/api/admin/status',mustAuth,(req,res)=>res.json({version:'5.0.0',username,database:!!db,managed:!!managedDb,heartbeatSeconds:HEARTBEAT_MS/1000,sessionHours:TTL/3600000}));
// Paired Android agent endpoints: no screen/secret/communications collection.
function pairHash(code){return crypto.createHmac('sha256',secret).update('pair:'+code).digest('hex');}
function tokenHash(token){return crypto.createHmac('sha256',secret).update('agent:'+token).digest('hex');}
app.post('/api/pair-codes',mustAuth,mustOrigin,async(req,res)=>{
 if(!ready(res))return;
 if(!rateLimit('pair',req.ip,8,15*60*1000))return res.status(429).json({error:'配对码创建太频繁'});
 const code=String(crypto.randomInt(10000000,100000000));
 const expires_at=new Date(Date.now()+10*60*1000).toISOString();
 try{const {error}=await managedDb.from('be_pair_codes').insert({code_hash:pairHash(code),expires_at});if(error)throw error;await audit('pair_created','Android设备','创建10分钟有效单次配对码');res.json({code,expires_at});}catch(e){failure(res,e,'配对码创建失败');}
});
app.post('/api/agent/enroll',async(req,res)=>{
 if(!managedDb)return res.status(503).json({error:'设备注册服务尚未启用'});
 if(!rateLimit('enroll',req.ip,20,15*60*1000))return res.status(429).json({error:'注册尝试次数过多'});
 const code=value(req.body?.code,20);
 if(!/^\d{8}$/.test(code))return res.status(400).json({error:'无效配对码'});
 const device_name=value(req.body?.device_name,80)||'Android设备',model=value(req.body?.model,80),android_version=value(req.body?.android_version,30),network=value(req.body?.network,30);
 const battery=clampBattery(req.body?.battery);
 if(battery===null)return res.status(400).json({error:'电量必须是0-100之间的整数'});
 try{
  const {data:used,error:useError}=await managedDb.from('be_pair_codes').update({used_at:new Date().toISOString()}).eq('code_hash',pairHash(code)).is('used_at',null).gt('expires_at',new Date().toISOString()).select('code_hash').maybeSingle();if(useError)throw useError;
  if(!used)return res.status(401).json({error:'配对码无效、已过期或已经使用'});
  const id=crypto.randomUUID(), token='bea_'+crypto.randomBytes(32).toString('hex');
  const {error}=await managedDb.from('be_real_devices').insert({id,device_name,model,android_version,battery,network,api_token_hash:tokenHash(token),last_seen:new Date().toISOString()});if(error)throw error;
  await audit('device_enrolled',id,'Android设备已使用单次配对码注册');
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
app.post('/api/devices/:id/revoke',mustAuth,mustOrigin,async(req,res)=>{
 if(!ready(res))return;
 const id=value(req.params.id,80);if(!/^[0-9a-f-]{36}$/.test(id))return res.status(400).json({error:'设备ID错误'});
 try{const {data,error}=await managedDb.from('be_real_devices').update({revoked_at:new Date().toISOString()}).eq('id',id).is('revoked_at',null).select('id').maybeSingle();if(error)throw error;if(!data)return res.status(404).json({error:'设备不存在或已撤销'});await audit('device_revoked',id,'管理员撤销设备注册');res.json({ok:true});}catch(e){failure(res,e,'设备撤销失败');}
});
app.get('/app.js',mustAuth,(_req,res)=>res.type('application/javascript').sendFile(path.join(__dirname,'public/app.js')));
app.get('/',(req,res)=>{if(!authorized(req))return res.redirect('/login');res.sendFile(path.join(__dirname,'public/index.html'));});
app.get('/index.html',(_req,res)=>res.redirect('/'));
app.use((_req,res)=>res.status(404).send('Not found'));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Black Eagle remote manager V5 started'));
