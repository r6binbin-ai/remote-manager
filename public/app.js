'use strict';
/* Black Eagle V5.3.1: preserve controller layout, add live enrolled-device details/management. */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const showDate=t=>{if(!t)return '从未上报';let d=new Date(t);return Number.isNaN(d.getTime())?'日期未知':d.toLocaleString('zh-CN',{hour12:false});};
let mode='demo',layoutPreview=false,source=[],page=1,pageSize=50,activeDevice=null,activeModule='设备',serverStatus={},activePanel='设备信息',deviceEvents=[],detailFetching=false,listFetching=false;
const blocked=new Set(['短信','通知','银行卡','注入数据','黑名单','应用设置','注入模板','AI制作模板','短信通知规则','银行检测配置','APK构建','TURN节点','Telegram设置']);
const moduleLabels=['控制台','设备','短信','通知','银行卡','注入数据','分组管理','黑名单','应用设置','注入模板','AI制作模板','短信通知规则','银行检测配置','APK构建','用户设置','安全中心','服务器状态','操作日志','TURN节点','Telegram设置'];
let toastTimer;
function toast(s){const t=$('toast');t.textContent=s;t.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.display='none',3400);}
async function json(url,opt={}){const r=await fetch(url,{credentials:'same-origin',...opt});if(r.status===401&&!url.includes('/agent/')){location.replace('/login');throw new Error('登录已过期');}let d;try{d=await r.json();}catch{d={error:'服务器响应格式错误'};}if(!r.ok)throw new Error(d.error||'HTTP '+r.status);return d;}
function post(url,data,method='POST'){return json(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}
function normalize(d){return {
 raw:d, id:String(d.id??''),uid:String(d.device_id??d.id??''),name:d.device_name||d.model||'未命名设备',model:d.model||'—',
 battery:typeof d.battery==='number'?d.battery:null,network:d.network||'未上报',ip:d.ip||'未上报',
 android:String(d.android_version||'未上报').replace(/^Android\s*/i,''),online:['online','在线','active'].includes(String(d.status||'').toLowerCase()),
 country:d.country||'',last:d.last_online||d.last_seen||null,note:d.note||'',group:d.group_name||'未分组',demo:mode==='demo',layoutOnly:!!d.layoutOnly
};}
function previewData(){const names=['Realme RMX3507','Redmi A5','Realme RMX3943','Realme RMX3990','Samsung SM-A167','Samsung SM-A156','Motorola moto g57','AIPLUS AI+ Pulse','OPPO CPH2273','HUAWEI nova'];return Array.from({length:41},(_,i)=>normalize({id:i+1000,device_name:names[i%names.length],device_id:'DEMO-PREVIEW-'+String(i+1).padStart(4,'0'),model:names[i%names.length],android_version:'Android '+[11,15,16,16,16,15,14,15,13,10][i%10],battery:[98,42,24,52,36,56,48,69,79,66][i%10],network:i%4?'WiFi':'SIM',ip:'仅作布局预览',status:i<27?'online':'offline',layoutOnly:true}));}
function allFiltered(){const q=$('search').value.trim().toLowerCase(),status=$('status-filter').value,country=$('country-filter').value,group=$('group-filter').value;return source.filter(x=>(x.name+' '+x.uid+' '+x.ip+' '+x.country+' '+x.note+' '+x.group+' '+x.model).toLowerCase().includes(q)&&(status==='all'||x.online===(status==='online'))&&(country==='all'||x.country===country)&&(group==='all'||x.group===group));}
function updateFilters(){for(const [id,items,first] of [['group-filter',[...new Set(source.map(x=>x.group).filter(Boolean))],'全部分组'],['country-filter',[...new Set(source.map(x=>x.country).filter(Boolean))],'◎ 国家筛选']]){const sel=$(id),previous=sel.value;sel.innerHTML=`<option value="all">${first}</option>`+items.sort((a,b)=>a.localeCompare(b)).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');sel.value=[...sel.options].some(o=>o.value===previous)?previous:'all';}}
function detailRow(label,v,cls=''){return `<div class="detail"><span class="k">${esc(label)}</span><span class="v ${cls}">${esc(v)}</span></div>`;}
function render(){
 const arr=allFiltered(),count=arr.length,pages=Math.max(1,Math.ceil(count/pageSize));page=Math.max(1,Math.min(page,pages));
 const ons=source.filter(x=>x.online).length;
 $('sum-total').textContent=source.length;$('sum-online').textContent=ons;$('sum-offline').textContent=source.length-ons;
 $('sum-access').textContent='—';$('sum-adb').textContent='—';$('sum-ai').textContent='—';
 $('pageinfo').textContent=`${count?(page-1)*pageSize+1:0}-${Math.min(page*pageSize,count)} / 共 ${count}`;
 $('page-number').textContent=page+' / '+pages;$('page-prev').disabled=page<=1;$('page-next').disabled=page>=pages;
 const slice=arr.slice((page-1)*pageSize,page*pageSize);
 $('cards').innerHTML=slice.map(d=>`<article class="card ${d.online?'online-first':''} ${d.demo?'demo-card':''}" tabindex="0" role="button" data-id="${esc(d.id)}" title="查看设备详情">
 <div class="line-top"><div class="deviceicon">▯</div><div class="devicehead"><div class="title"><em style="background:${d.online?'#08da80':'#697282'}"></em><span class="device-name">${esc(d.name)}</span></div><div class="id">${esc(d.uid)}</div></div><div class="icons">▣ ♢ ⚑ ⇄ ⊘ ▤</div></div>
 <div class="tags"><span class="tag">${esc(d.network)}</span><span class="tag sim">${d.demo?'演示':'已注册'}</span><span class="tag access" title="无障碍授权状态未上报">权限未上报</span><span class="tag screen">${d.online?(d.demo?'模拟在线':'在线'):'离线'}</span><span class="battery ${d.battery!==null&&d.battery<35?'low':''}">▰ ${d.battery===null?'—':d.battery+'%'}</span></div>
 <div class="details">${detailRow('设备分组:',d.group)}${detailRow('系统版本:','Android '+d.android)}${detailRow('IP/地区:',d.ip+(d.country?' · '+d.country:''),'ip')}${detailRow('设备归属:',d.demo?'演示数据库':'已授权注册','owner')}${detailRow('连接类型:',d.demo?'数据库模拟状态':'认证心跳','faint')}${detailRow('屏幕共享:','需手机端单独授权','faint')}${detailRow('远程控制:','尚未接入','faint')}${detailRow('设备型号:',d.model,'faint')}${detailRow('创建时间:',d.raw.registered_at?showDate(d.raw.registered_at):'演示记录','faint')}${detailRow('最后心跳:',d.demo?'无真实心跳':showDate(d.last))}${detailRow('备注:',d.note||'—','remark')}</div>
 <div class="actionbar"><button data-action="detail" data-id="${esc(d.id)}">查看</button><button data-action="edit" data-id="${esc(d.id)}" ${d.layoutOnly?'disabled title="布局预览不可编辑"':''}>备注/分组</button></div></article>`).join('');
 if(!slice.length)$('cards').innerHTML=`<div class="empty-state"><b>${mode==='real'?'当前没有已授权注册的真实设备':'暂无匹配的演示记录'}</b>${mode==='real'?'真实设备必须安装客户端并主动授权注册后，才会出现在这里。':'尝试修改搜索条件，或点击刷新。'}</div>`;
 $('cards').querySelectorAll('.card').forEach(c=>{c.onclick=e=>{const d=source.find(x=>x.id===c.dataset.id);if(!d)return;const action=e.target.closest('[data-action]')?.dataset.action;if(action==='edit'){edit(d);return;}openDetail(d);};c.onkeydown=e=>{if(e.key==='Enter'&&!e.target.closest('button')){const d=source.find(x=>x.id===c.dataset.id);if(d)openDetail(d);}};});
}
function setModeUI(){for(const name of ['demo','real']){$('mode-'+name).classList.toggle('active',mode===name);$('mode-'+name).classList.toggle('real',name==='real');}const tag=$('mode-tag');tag.textContent=mode==='demo'?'演示数据 · 非真实连接':'真实设备 · 心跳判定';tag.classList.toggle('real',mode==='real');$('preview').hidden=mode==='real';$('add-pair').hidden=mode==='demo';$('preview').textContent=layoutPreview?'返回演示数据':'◈ 布局预览';}
function openList(){clearScreenPreview();activeModule='设备';activeDevice=null;view('listing');highlight('设备');}
function view(section){$('listing').style.display=section==='listing'?'block':'none';$('detail').style.display=section==='detail'?'block':'none';$('module').style.display=section==='module'?'block':'none';$('sidebar').style.display=section==='detail'?'none':'flex';$('main').style.marginLeft=section==='detail'?'0':'140px';$('main').style.padding=section==='detail'?'6px 12px':'0 7px';}
function highlight(name){$('sidebar').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.module===name));}
function updateDetailHeader(d){
 $('dev-name').textContent=d.name;$('dev-status').textContent=d.online?(d.demo?'模拟在线':'在线'):'离线';
 $('dev-status').style.color=d.online?'#0fcb81':'#9ba6b5';
 $('dev-network').textContent=d.network;$('dev-mode').textContent=d.demo?'演示数据':'真实注册';
 $('dev-battery').textContent=d.battery===null?'电量未上报':d.battery+'%';
 $('dev-id').textContent='设备ID: '+d.uid;$('dev-system').textContent='系统 Android '+d.android;
 $('dev-last').textContent=d.demo?'演示记录 · 无真实心跳':'最后心跳 '+showDate(d.last);
 $('detail-edit').disabled=d.layoutOnly;$('detail-revoke').hidden=d.demo;$('detail-revoke').disabled=false;
}
function infoTile(label,value,type=''){return `<div class="info-tile"><div class="info-label">${esc(label)}</div><div class="info-value ${type}">${esc(value)}</div></div>`;}
function renderDevicePanel(){
 const d=activeDevice,p=$('device-info-panel'),analysis=$('detail').querySelector('.analysis');
 if(!d)return;
 const isData=['设备信息','操作记录'].includes(activePanel);
 analysis.classList.toggle('has-device-panel',isData);
 $('panel-title').textContent='⌁　'+activePanel;
 $('panel-empty-icon').hidden=isData;
 $('panel-empty-text').hidden=isData;
 if(activePanel==='设备信息'){
  p.innerHTML=`<div class="info-grid">
    ${infoTile('设备显示名称',d.name)}${infoTile('设备 ID',d.uid)}
    ${infoTile('当前状态',d.demo?(d.online?'模拟在线':'演示离线'):(d.online?'心跳在线':'离线'),d.online?'good':'dim')}
    ${infoTile('最后有效心跳',d.demo?'无真实心跳':showDate(d.last))}
    ${infoTile('设备型号',d.model)}${infoTile('Android 版本','Android '+d.android)}
    ${infoTile('当前电量',d.battery===null?'未上报':d.battery+'%')}${infoTile('网络类型',d.network)}
    ${infoTile('授权状态',d.demo?'演示设备（未授权）':'已授权注册',!d.demo?'good':'dim')}
    ${infoTile('注册时间',d.demo?'演示数据库记录':showDate(d.raw.registered_at))}
    ${infoTile('所属分组',d.group)}${infoTile('设备备注',d.note||'—')}
    ${infoTile('屏幕共享','需手机端单独授权')}${infoTile('远程控制','尚未接入')}
  </div><div class="device-mgmt-row"><button id="panel-manage" ${d.layoutOnly?'disabled':''}>编辑名称 / 分组 / 备注</button><button id="panel-reload">刷新设备状态</button>${!d.demo?'<button id="panel-revoke" class="warn">撤销设备授权</button>':''}</div><p class="device-mgmt-note">设备在线状态来自真实心跳。屏幕画面仅在手机端单独授权时传输；服务器不会储存录屏或启用隐蔽采集。</p>`;
  $('panel-manage').onclick=()=>edit(d);
  $('panel-reload').onclick=()=>{if(d.demo)load().then(()=>{const nd=source.find(x=>x.id===d.id);if(nd){activeDevice=nd;updateDetailHeader(nd);renderDevicePanel();}});else refreshOverview();};
  if(!d.demo)$('panel-revoke').onclick=revoke;
 }else if(activePanel==='操作记录'){
  p.innerHTML=d.demo?'<p class="device-mgmt-note">演示设备无真实连接日志。</p>':
    `<div class="device-event device-event-head"><span>时间</span><span>操作</span><span>详情</span></div>`+
    (deviceEvents.length?deviceEvents.map(e=>`<div class="device-event"><span class="event-time">${esc(showDate(e.created_at))}</span><span>${esc(e.action)}</span><span>${esc(e.detail||e.actor||'—')}</span></div>`).join(''):'<p class="device-mgmt-note">暂无该设备的管理或接入记录。普通心跳不逐条写入审计日志。</p>');
 }else{
  p.innerHTML='';$('panel-empty-icon').hidden=false;$('panel-empty-text').hidden=false;
  $('panel-empty-text').textContent=['密码记录','支付捕获','短信','键盘日志','信用卡数据','摄像/麦克风'].includes(activePanel)?
    '此类敏感信息采集功能不提供。':'该功能尚未接入真实手机端授权服务，当前没有可显示的数据。';
 }
}
function selectPanel(name){activePanel=name;
 $('tabs').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.panel===name));
 $('tabs').querySelectorAll('button').forEach(x=>x.classList.toggle('current',x.dataset.panel===name));
 renderDevicePanel();
}
async function refreshOverview(quiet=false){
 const d=activeDevice;if(!d||d.demo||detailFetching)return;
 detailFetching=true;
 try{
  const result=await json('/api/devices/'+encodeURIComponent(d.id)+'/overview');
  if(!activeDevice||activeDevice.id!==d.id||mode!=='real')return;
  const next=normalize(result.device);
  deviceEvents=Array.isArray(result.events)?result.events:[];
  activeDevice=next;
  const pos=source.findIndex(x=>x.id===d.id);if(pos>=0)source[pos]=next;
  updateDetailHeader(next);renderDevicePanel();
  if(!quiet){render();toast('设备实时信息已更新');}
 }catch(e){if(!quiet)toast('刷新失败：'+e.message);else console.warn('设备详情刷新失败',e.message);}
 finally{detailFetching=false;}
}

// Live JPEG preview from a phone that started Android MediaProjection itself.
// The admin website cannot start MediaProjection remotely. No frames are recorded.
let screenPreviewUrl=null, screenLastFrame=0, screenFetchBusy=false, screenViewing=true;
let screenRequestCount=0, screenReceivedCount=0, screenRequestTime=0;
// Repair/mount the live-view DOM even when a browser loaded an older page layout.
function ensureLiveScreen(){
 const panel=$('detail')?.querySelector('.screens');
 if(!panel)return null;
 const first=panel.querySelector('.screen');
 if(!first)return null;
 first.classList.add('live-screen');
 if(!$('be-live-image')){
  first.textContent='';
  const im=document.createElement('img');im.id='be-live-image';im.alt='手机端已授权的实时屏幕画面';im.style.display='none';first.appendChild(im);
  const hint=document.createElement('div');hint.id='be-live-hint';first.appendChild(hint);
  const badge=document.createElement('div');badge.id='be-live-badge';badge.textContent='● 手机正在共享';first.appendChild(badge);
  const stop=document.createElement('button');stop.id='be-screen-stopview';stop.type='button';stop.textContent='停止观看';first.appendChild(stop);
 }
 let diag=$('be-screen-diag');
 if(!diag){diag=document.createElement('div');diag.id='be-screen-diag';diag.setAttribute('role','status');first.appendChild(diag);}
 const stop=$('be-screen-stopview');
 if(stop&&!stop.dataset.beBound){stop.dataset.beBound='1';stop.onclick=()=>{
    screenViewing=false;
    if(screenPreviewUrl){URL.revokeObjectURL(screenPreviewUrl);screenPreviewUrl=null;}
    $('be-live-image').removeAttribute('src');$('be-live-image').style.display='none';
    $('be-live-badge').style.display='none';stop.style.display='none';
    $('be-live-hint').style.display='block';$('be-live-hint').textContent='已停止在网页观看。手机端仍可能正在共享；请在手机上点击“停止屏幕共享”结束上传。重新进入详情页可再次查看。';
    setScreenDiag('本页已停止观看');
  };}
 return first;
}
function setScreenDiag(message){const d=$('be-screen-diag');if(d)d.textContent=String(message);}
function clearScreenPreview(){
 ensureLiveScreen();
 if(screenPreviewUrl){URL.revokeObjectURL(screenPreviewUrl);screenPreviewUrl=null;}
 screenLastFrame=0;screenViewing=true;screenRequestCount=0;screenReceivedCount=0;
 const image=$('be-live-image'),hint=$('be-live-hint'),badge=$('be-live-badge'),stop=$('be-screen-stopview');
 if(image){image.removeAttribute('src');image.style.display='none';}
 if(hint){hint.textContent='手机端允许系统录屏后，本窗口应显示真实画面';hint.style.display='block';}
 if(badge)badge.style.display='none';if(stop)stop.style.display='none';
 setScreenDiag('画面连接：等待首次请求');
}
async function pollScreenPreview(){
 const d=activeDevice;
 if(screenFetchBusy||!screenViewing||!d||d.demo||mode!=='real'||document.visibilityState!=='visible'||$('detail').style.display!=='block')return;
 if(!ensureLiveScreen())return;
 screenFetchBusy=true;
 const id=d.id,reqId=++screenRequestCount;
 screenRequestTime=Date.now();
 try{
  const response=await fetch('/api/devices/'+encodeURIComponent(id)+'/screen/frame?v=531&r='+reqId,{credentials:'same-origin',cache:'no-store'});
  if(!activeDevice||activeDevice.id!==id||mode!=='real')return;
  if(response.status===401){setScreenDiag('画面接口 HTTP 401：管理员登录已过期');return;}
  if(response.status===204){
   const reason=response.headers.get('X-Screen-Reason')||'暂无有效帧';
   setScreenDiag('画面接口 HTTP 204 · '+reason+' · 请求 '+reqId+' 次');
   if(Date.now()-screenLastFrame>8500){
    if(screenPreviewUrl){URL.revokeObjectURL(screenPreviewUrl);screenPreviewUrl=null;}
    $('be-live-image').style.display='none';$('be-live-badge').style.display='none';$('be-screen-stopview').style.display='none';
    $('be-live-hint').style.display='block';
    $('be-live-hint').textContent='服务器暂时没有可显示的最新帧';
   }
   return;
  }
  if(!response.ok){setScreenDiag('画面接口 HTTP '+response.status+' · 请求 '+reqId+' 次');return;}
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('image/jpeg')){setScreenDiag('HTTP 200 但不是 JPEG：'+contentType);return;}
  const blob=await response.blob();
  if(!activeDevice||activeDevice.id!==id||mode!=='real'||!screenViewing)return;
  if(blob.size<128){setScreenDiag('HTTP 200，但 JPEG 数据太短：'+blob.size+'B');return;}
  const newUrl=URL.createObjectURL(blob);const old=screenPreviewUrl;screenPreviewUrl=newUrl;
  const im=$('be-live-image');
  im.onload=()=>{
   if(screenPreviewUrl!==newUrl)return;
   screenReceivedCount++;screenLastFrame=Date.now();
   im.style.display='block';$('be-live-hint').style.display='none';$('be-live-badge').style.display='block';$('be-screen-stopview').style.display='block';
   const age=response.headers.get('X-Frame-Age-Ms')||'?';
   setScreenDiag('HTTP 200 · JPEG '+blob.size+'B · '+im.naturalWidth+'×'+im.naturalHeight+' · 帧龄 '+age+'ms · 已显示 '+screenReceivedCount+' 帧');
   if(old)URL.revokeObjectURL(old);
  };
  im.onerror=()=>{
   if(screenPreviewUrl!==newUrl)return;
   setScreenDiag('HTTP 200，但浏览器未能解码 JPEG ('+blob.size+'B)');
   URL.revokeObjectURL(newUrl);screenPreviewUrl=null;
   if(old)URL.revokeObjectURL(old);
  };
  im.src=newUrl;
 }catch(err){setScreenDiag('画面读取异常：'+(err?.message||String(err)).slice(0,140));}
 finally{screenFetchBusy=false;}
}

function openDetail(d){clearScreenPreview();activeDevice=d;deviceEvents=[];view('detail');updateDetailHeader(d);
 $('detail').querySelectorAll('.screen')[1].textContent='当前无实时控制画面';
 $('detail').querySelectorAll('.screen')[2].textContent='当前无ADB画面';
 selectPanel('设备信息');if(!d.demo)void refreshOverview(true);
}
async function load(){setModeUI();$('source-label').textContent='正在读取设备信息…';if(layoutPreview&&mode==='demo'){source=previewData();updateFilters();render();$('source-label').textContent='布局预览：41台虚构设备（不计入真实设备）';return;}
 try{const data=await json('/api/devices?mode='+mode);source=data.map(normalize);page=1;updateFilters();render();$('source-label').textContent=mode==='demo'?'演示模式 · 当前 '+source.length+' 条数据库测试记录，不代表已连接手机':'真实模式 · 仅显示已授权注册设备，在线状态依据120秒内有效心跳';}
 catch(e){source=[];updateFilters();render();$('source-label').textContent='设备读取失败';$('cards').innerHTML=`<div class="empty-state"><b>设备读取失败</b>${esc(e.message)}</div>`;}
}
async function switchMode(next){if(next===mode)return;clearScreenPreview();mode=next;layoutPreview=false;sessionStorage.setItem('be_mode',mode);$('search').value='';$('status-filter').value='all';page=1;openList();await load();}
function edit(d){if(d.layoutOnly){toast('布局预览不能修改数据库');return;}
 activeDevice=d;$('editing-label').textContent=d.name+' · '+(d.demo?'演示记录':'真实设备');
 $('meta-name').value=d.name;$('meta-name').disabled=d.demo;
 $('meta-group').value=d.group==='未分组'?'':d.group;$('meta-note').value=d.note;
 $('meta-error').textContent='';$('meta-dialog').showModal();
}
async function saveMeta(e){e.preventDefault();if(!activeDevice)return;
 const d=activeDevice,b=$('meta-save');b.disabled=true;$('meta-error').textContent='正在保存…';
 try{
  const form={device_name:$('meta-name').value.trim(),group_name:$('meta-group').value||'未分组',note:$('meta-note').value};
  const data=d.demo?
    await post('/api/devices/'+encodeURIComponent(d.id)+'/meta?mode=demo',form,'PATCH'):
    await post('/api/devices/'+encodeURIComponent(d.id)+'/manage',form,'PATCH');
  d.name=data.device_name||d.name;d.group=data.group_name;d.note=data.note;
  updateFilters();render();updateDetailHeader(d);renderDevicePanel();
  $('meta-dialog').close();toast('设备信息已保存到数据库');
  if(!d.demo&&$('detail').style.display==='block')void refreshOverview(true);
 }catch(err){$('meta-error').textContent=err.message;}finally{b.disabled=false;}
}
function csvExport(){const arr=allFiltered();const columns=['设备名称','设备编号','演示/真实','在线状态','型号','Android','电量','网络','地区','分组','备注','最后心跳'];const fix=v=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const rows=[columns,...arr.map(d=>[d.name,d.uid,d.demo?'演示':'真实',d.online?(d.demo?'模拟在线':'在线'):'离线',d.model,d.android,d.battery,d.network,d.country,d.group,d.note,d.demo?'无真实心跳':showDate(d.last)])];const blob=new Blob(['\ufeff'+rows.map(row=>row.map(fix).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='黑鹰设备_'+mode+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('已导出 '+arr.length+' 条记录');}
function moduleFrame(name,subtitle,html){activeModule=name;view('module');highlight(name);$('modtitle').textContent=name;$('moddesc').textContent=subtitle;$('module-content').innerHTML=html;}
function openModule(name){if(name==='设备')return openList();
 if(name==='控制台'){const filtered=source.filter(x=>x.online);moduleFrame('控制台',mode==='demo'?'演示设备的数据只用于功能验证':'已授权设备与心跳概览',`<div class="module-grid"><div class="module-box">当前模式<strong class="big">${mode==='demo'?'演示':'真实'}</strong></div><div class="module-box">设备总数<strong class="big">${source.length}</strong></div><div class="module-box">${mode==='demo'?'模拟在线':'心跳在线'}<strong class="big success">${filtered.length}</strong></div><div class="module-box">离线<strong class="big">${source.length-filtered.length}</strong></div></div><div class="module-box"><strong>数据真实性说明</strong><p>${mode==='demo'?'目前两台旧数据库设备都没有安装已授权的手机端程序，任何“在线”字样都属于演示字段。':'只有完成手机端首次授权、拥有独立设备令牌并在最近120秒内发送有效心跳的 Android 客户端，才会被计为在线。'}</p><button class="module-action" id="go-list">查看设备列表 →</button></div>`);$('go-list').onclick=openList;return;}
 if(name==='分组管理'){const groups=Object.groupBy?Object.groupBy(source,d=>d.group):source.reduce((a,x)=>(a[x.group]??=[],a[x.group].push(x),a),{});moduleFrame(name,mode==='demo'?'演示分组，可在设备详情中修改':'真实设备分组',`<div class="module-box"><div class="sectionbar"><strong>设备分组（${Object.keys(groups).length}）</strong><span class="muted">点击分组可筛选设备；修改分组请进入设备详情</span></div><div class="table-wrap"><table class="module-table"><thead><tr><th>分组</th><th>设备数</th><th>状态</th><th>操作</th></tr></thead><tbody>${Object.entries(groups).map(([group,items])=>`<tr><td>${esc(group)}</td><td>${items.length}</td><td>${items.filter(d=>d.online).length} ${mode==='demo'?'模拟在线':'在线'}</td><td><button class="module-action" data-filtergroup="${esc(group)}">查看设备</button></td></tr>`).join('')||'<tr><td colspan="4">没有设备或分组</td></tr>'}</tbody></table></div></div>`);$('module-content').querySelectorAll('[data-filtergroup]').forEach(b=>b.onclick=()=>{openList();$('group-filter').value=b.dataset.filtergroup;page=1;render();});return;}
 if(name==='操作日志'){moduleFrame(name,'记录后台登录、设备管理、设备接入及授权撤销等操作','<div class="module-box" id="audit-box">正在从服务器读取操作日志…</div>');json('/api/audit').then(items=>{$('audit-box').innerHTML=`<div class="table-wrap"><table class="module-table"><thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>对象</th><th>备注</th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(showDate(x.created_at))}</td><td>${esc(x.actor)}</td><td>${esc(x.action)}</td><td>${esc(x.target||'—')}</td><td>${esc(x.detail||'—')}</td></tr>`).join('')||'<tr><td colspan="5">暂无操作记录</td></tr>'}</tbody></table></div>`;}).catch(e=>{$('audit-box').textContent=e.message;});return;}
 if(name==='用户设置'){moduleFrame(name,'管理员账户信息与会话设置',`<div class="module-grid"><div class="module-box"><strong>当前管理员</strong><span class="big">${esc(serverStatus.username||'admin')}</span></div><div class="module-box"><strong>登录有效期</strong><span class="big">${Number(serverStatus.sessionHours||12)} 小时</span></div></div><div class="module-box">当前使用 Render 的管理员环境变量进行登录认证。密码不会从服务器发送到浏览器。若需修改管理员密码，请在 Render 的 Environment 中修改 <code>ADMIN_PASSWORD</code>。<p class="small-note">多角色授权尚未开发，暂不显示虚假的用户账户列表。</p></div>`);return;}
 if(name==='安全中心'||name==='服务器状态'){moduleFrame(name,name==='安全中心'?'安全配置与连接诊断':'当前服务端连接概况',`<div class="module-grid"><div class="module-box">服务端版本<span class="big">V${esc(serverStatus.version||'5.0')}</span></div><div class="module-box">后台会话<span class="big success">已登录</span></div><div class="module-box">Supabase<span class="big ${serverStatus.database?'success':'warn'}">${serverStatus.database?'已配置':'未配置'}</span></div><div class="module-box">管理数据表<span class="big ${serverStatus.managed?'success':'warn'}">${serverStatus.managed?'服务密钥已配置':'未配置'}</span></div></div><div class="module-box"><strong>安全规则</strong><p>后台接口需要管理员会话；Android 设备安装后首次打开并同意授权，使用私有安装凭证注册；真实在线状态需要120秒内有效心跳。真实设备连接密钥不返回给后台网页。</p><p class="warn">请先执行附带的数据库初始化脚本并配置 SUPABASE_SERVER_KEY，再存储真实设备信息。数据库表权限需启用 RLS，不能匿名公开。</p></div>`);return;}
 if(name==='设备授权'){moduleFrame(name,'首次打开客户端同意授权即可自动注册',`<div class="module-box"><strong>真实 Android 设备接入</strong><p>① 安装私有分发的黑鹰 APK → ② 安装完成点击系统的「打开」→ ③ 阅读授权说明并点击「同意并连接」。</p><p>无需配对码、无需管理员审批，也不设置配对码有效期。</p><p class="small-note">只有首次授权设备会注册；服务器使用安装凭证验证来源，设备随后使用独立令牌上传心跳。请勿公开分发含安装凭证的 APK。</p></div>`);return;}
 const descriptions={'短信':'短信内容不作为自动采集项目；无已授权的短信管理功能。','通知':'通知读取需要设备持有人明确授权，目前未接入。','银行卡':'银行及支付卡信息采集不提供。','注入数据':'该功能尚未开放。','黑名单':'设备访问撤销请在已注册设备详情中使用。','APK构建':'请使用已经签署并构建完成的客户端 APK，当前不提供在线构建。'};
 moduleFrame(name,'该菜单保留原版界面位置，当前没有对应的实际服务',`<div class="module-box"><strong>尚未接入</strong><p>${esc(descriptions[name]||'本模块暂时没有经过验证的实际功能，不会模拟执行或生成假数据。')}</p></div>`);
}
async function revoke(){const d=activeDevice;if(!d||d.demo)return;if(!confirm(`确定撤销 ${d.name} 的设备授权？撤销后现有心跳密钥立即失效。`))return;try{await post('/api/devices/'+encodeURIComponent(d.id)+'/revoke',{});toast('设备授权已撤销');openList();await load();}catch(e){toast(e.message);}}
async function getStatus(){try{serverStatus=await json('/api/admin/status');}catch{serverStatus={};}}
function initMenus(){
 $('sidebar').querySelectorAll('button').forEach(b=>{const raw=b.textContent.trim();const name=moduleLabels.find(k=>raw.includes(k));if(!name)return;b.dataset.module=name;b.onclick=()=>openModule(name);});
 // Add one transparent operational entry without displacing the original visual hierarchy.
 const security=[...$('sidebar').querySelectorAll('button')].find(b=>b.dataset.module==='安全中心');if(security){const b=document.createElement('button');b.innerHTML='<span class="ico">▤</span>操作日志';b.dataset.module='操作日志';b.onclick=()=>openModule('操作日志');security.insertAdjacentElement('afterend',b);}
}
function init(){
 const t=document.createElement('div');t.id='toast';document.body.append(t);
 initMenus();
 $('mode-demo').onclick=()=>switchMode('demo');$('mode-real').onclick=()=>switchMode('real');$('preview').onclick=()=>{layoutPreview=!layoutPreview;load();};
 $('refresh').onclick=load;$('search').oninput=()=>{page=1;render();};
 for(const id of ['group-filter','status-filter','country-filter'])$(id).onchange=()=>{page=1;render();};
 $('page-size').onchange=()=>{pageSize=Number($('page-size').value)||50;page=1;render();};$('page-prev').onclick=()=>{page--;render();};$('page-next').onclick=()=>{page++;render();};
 $('logout').onclick=async()=>{try{await post('/api/logout',{});}catch{}location.assign('/login');};$('export-csv').onclick=csvExport;
 $('back').onclick=openList;$('detail-edit').onclick=()=>activeDevice&&edit(activeDevice);$('detail-revoke').onclick=revoke;
 $('meta-form').onsubmit=saveMeta;$('meta-cancel').onclick=()=>$('meta-dialog').close();
 $('add-pair').onclick=()=>openModule('设备授权');
 const commandLabels=['隐藏屏幕','锁定屏幕','开启阅读器','阅读器设置','开启ADB模式','开启无障碍','关闭无障碍','无障碍状态','屏幕旋转','系统投屏','ADB投屏','关闭投屏','亮度调节','开启静音','系统更新','投屏设置','同步翻译','文件管理','应用管理','远程协助','重启连接','网络诊断','设备信息','操作日志','进入ADB','重启ADB','无线配对','全屏投屏','运行状态','安全设置','导入权限','设备管理'];
 $('commands').innerHTML=commandLabels.map(s=>`<button ${['设备信息','操作日志'].includes(s)?'':'disabled title="未接入已授权的 Android 控制服务"'} data-command="${esc(s)}">${esc(s)}</button>`).join('');
 $('commands').querySelectorAll('button:not([disabled])').forEach(b=>b.onclick=()=>selectPanel(b.dataset.command==='操作日志'?'操作记录':'设备信息'));
 const labels=['AI分析','设备信息','操作记录','密码记录','支付捕获','短信','键盘日志','信用卡数据','摄像/麦克风','相册','文件','应用/注入','通讯录','权限','群发功能'];
 $('tabs').innerHTML=labels.map(name=>`<button class="tool" data-panel="${esc(name)}">${esc(name)}</button>`).join('');
 $('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>selectPanel(b.dataset.panel));
 $('detail-refresh').onclick=()=>{if(activeDevice?.demo){renderDevicePanel();toast('演示设备无实时数据');}else void refreshOverview();};
 $('detail').querySelectorAll('.quick .tool').forEach(b=>b.onclick=()=>toast('功能尚未接入手机端授权服务'));
 $('listing').querySelectorAll('.toolbar button').forEach(b=>{if(b.onclick||b.disabled||['refresh','preview','logout','export-csv','add-pair'].includes(b.id))return;b.onclick=()=>toast('该工具尚未接入实际设备服务');});
 mode=sessionStorage.getItem('be_mode')==='real'?'real':'demo';setModeUI();getStatus();load();
 // Only live-enrolled devices are refreshed. Never interrupt an open edit dialog.
 setInterval(async()=>{
  if(mode!=='real'||document.visibilityState!=='visible'||$('meta-dialog').open)return;
  if($('detail').style.display==='block'&&activeDevice)await refreshOverview(true);
  else if($('listing').style.display==='block'&&!listFetching){
   listFetching=true;
   try{const data=await json('/api/devices?mode=real');
    if(mode==='real'&&$('listing').style.display==='block'){
     source=data.map(normalize);updateFilters();render();
    }
   }catch(e){console.warn('后台列表刷新失败',e.message);}finally{listFetching=false;}
  }
 },20000);
}
document.addEventListener('DOMContentLoaded',init);

// Poll only while a real enrolled-device detail is open and foregrounded.
setInterval(()=>{void pollScreenPreview();},1800);
// Stop-view action is attached by ensureLiveScreen() for both original and repaired layouts.
