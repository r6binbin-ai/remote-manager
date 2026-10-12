"use strict";
const express = require('express');
const crypto = require('crypto');
const {createClient} = require('@supabase/supabase-js');
const path = require('path');
const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'32kb'}));
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('X-Frame-Options','DENY');res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','no-store');next();});
const username=process.env.ADMIN_USERNAME||'admin';
const password=process.env.ADMIN_PASSWORD||'';
const secret=process.env.SESSION_SECRET||'';
const configured=password.length>=12 && secret.length>=32;
const tokenTTL=12*60*60*1000;
const recentAttempts=new Map();
function mac(s){return crypto.createHmac('sha256',secret).update(s).digest('base64url');}
function equal(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);}
function cookie(req){const m=/\bblackeagle_session=([^;]+)/.exec(req.headers.cookie||'');return m?m[1]:'';}
function isAuthorized(req){if(!configured)return false;const t=cookie(req),parts=t.split('.');if(parts.length!==2||!equal(mac(parts[0]),parts[1]))return false;try{const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));return data.u===username&&data.exp>Date.now();}catch{return false;}}
function mustAuth(req,res,next){if(isAuthorized(req))return next();return res.status(401).json({error:'需要登录'});}
app.get('/api/health',(req,res)=>res.json({online:true,adminConfigured:configured,databaseConfigured:!!process.env.SUPABASE_URL&&!!process.env.SUPABASE_KEY}));
app.get('/login',(req,res)=>res.sendFile(path.join(__dirname,'public','login.html')));
app.post('/api/login',(req,res)=>{
 if(!configured)return res.status(503).json({error:'请先在 Render 配置 ADMIN_PASSWORD 和 SESSION_SECRET'});
 const ip=req.ip,now=Date.now();const track=recentAttempts.get(ip)||{count:0,start:now};if(now-track.start>15*60*1000){track.count=0;track.start=now;}if(track.count>=12)return res.status(429).json({error:'登录尝试过多，请稍后重试'});
 const u=typeof req.body?.username==='string'?req.body.username:'';const p=typeof req.body?.password==='string'?req.body.password:'';
 // Constant-time comparison for both fields (secrets come from environment variables).
 const uok=equal(crypto.createHash('sha256').update(u).digest('hex'),crypto.createHash('sha256').update(username).digest('hex'));
 const pok=equal(crypto.createHash('sha256').update(p).digest('hex'),crypto.createHash('sha256').update(password).digest('hex'));
 if(!uok||!pok){track.count++;recentAttempts.set(ip,track);return res.status(401).json({error:'账号或密码错误'});}
 recentAttempts.delete(ip);const payload=Buffer.from(JSON.stringify({u:username,exp:Date.now()+tokenTTL})).toString('base64url');res.cookie('blackeagle_session',payload+'.'+mac(payload),{httpOnly:true,secure:process.env.NODE_ENV==='production'||!!process.env.RENDER,sameSite:'strict',path:'/',maxAge:tokenTTL});res.json({ok:true});
});
app.post('/api/logout',(req,res)=>{res.clearCookie('blackeagle_session',{path:'/',sameSite:'strict',httpOnly:true});res.json({ok:true});});
let supabase=null;
try{if(process.env.SUPABASE_URL&&process.env.SUPABASE_KEY){const base=process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/,'').replace(/\/$/,'');supabase=createClient(base,process.env.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}}catch(e){console.error('Supabase initialization error:',e.message);}
app.get('/api/devices',mustAuth,async(req,res)=>{
 if(!supabase)return res.status(503).json({error:'Supabase 连接未配置'});
 try{const {data,error}=await supabase.from('devices').select('id,created_at,device_name,device_id,model,android_version,battery,network,status,country,ip,last_online').order('id',{ascending:false}).limit(500);if(error){console.error('Supabase query:',error.message);return res.status(502).json({error:'数据库读取失败（请检查密钥、URL 和表权限）'});}res.json(data||[]);}catch(e){console.error('Devices error:',e.message);res.status(502).json({error:'数据库连接失败'});}
});
app.get('/',(req,res)=>{if(!isAuthorized(req))return res.redirect('/login');res.sendFile(path.join(__dirname,'public','index.html'));});
app.get('/index.html',(req,res)=>res.redirect('/'));
app.use((req,res)=>res.status(404).send('Not found'));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Black Eagle remote manager started'));
