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
 renderNetworkTop();
 $('detail-edit').disabled=d.layoutOnly;$('detail-revoke').hidden=d.demo;$('detail-revoke').disabled=false;
}
function infoTile(label,value,type=''){return `<div class="info-tile"><div class="info-label">${esc(label)}</div><div class="info-value ${type}">${esc(value)}</div></div>`;}
function renderDevicePanel(){
 const d=activeDevice,p=$('device-info-panel'),analysis=$('detail').querySelector('.analysis');
 if(!d)return;
 const isData=['设备信息','操作记录','短信','应用/注入'].includes(activePanel);
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
 }else if(activePanel==='短信'){
  p.innerHTML=`<div class="bh-sms-toolbar"><input type="search" placeholder="搜索发送方/内容..." aria-label="搜索短信" disabled><button disabled>获取短信</button><button disabled>翻译本页</button><button disabled>导出</button><button disabled>刷新</button><button disabled>清空</button></div><table class="bh-sms-table"><thead><tr><th>号码</th><th>内容</th><th>时间</th></tr></thead><tbody><tr><td colspan="3">未接入短信读取功能；这里不会显示或获取手机短信。
此表仅用于还原参考截图的布局。</td></tr></tbody></table>`;
  }else if(activePanel==='应用/注入'){
   p.innerHTML=`<div class="be-apps-root"><div class="be-apps-tabs"><button type="button" class="be-subtab on" data-be-tab="apps">▣ 应用列表 <small id="be-apps-total">0/0</small></button><button type="button" class="be-subtab" data-be-tab="templates">⛶ 注入模板 <small>未启用</small></button><button type="button" class="be-subtab" data-be-tab="records">⚿ 注入数据 <small id="be-record-count">0</small></button></div><div class="be-apps-search"><input id="be-apps-search" type="search" placeholder="搜索应用名称或包名..."><button id="be-apps-refresh" type="button">⟳ 刷新</button></div><div class="be-apps-scroll"><table class="be-apps-table"><thead><tr><th></th><th>应用名</th><th>包名 / 版本</th><th>操作</th></tr></thead><tbody id="be-apps-rows"><tr><td colspan="4">正在读取真实手机的应用列表…</td></tr></tbody></table></div><div class="be-apps-pages"><span id="be-apps-stamp">等待设备上报</span><label>每页行数 <select id="be-apps-size"><option>50</option><option>20</option><option>100</option></select></label><button id="be-apps-prev">‹</button><span id="be-apps-page">1</span><button id="be-apps-next">›</button></div></div>`;
   p.querySelectorAll('[data-be-tab]').forEach(b=>b.onclick=()=>switchAppTab(b.dataset.beTab));
   const search=$('be-apps-search');search.oninput=()=>{appListPage=1;renderAppsRows();};
   $('be-apps-refresh').onclick=()=>{void loadRealApps();};
   $('be-apps-size').onchange=()=>{appListPage=1;renderAppsRows();};
   $('be-apps-prev').onclick=()=>{appListPage=Math.max(1,appListPage-1);renderAppsRows();};
   $('be-apps-next').onclick=()=>{appListPage++;renderAppsRows();};
   if(d.demo){$('be-apps-rows').innerHTML='<tr><td colspan="4">演示设备不读取真实应用。</td></tr>';}
   else if(appListDevice!==d.id||!appListData){void loadRealApps();}
   else renderAppsRows();
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

function openAppModal({title,body,confirmText='确定',onConfirm}){
 document.getElementById('be-app-modal')?.remove();
 const shell=document.createElement('div');shell.id='be-app-modal';shell.className='be-modal-overlay';shell.innerHTML=`<div class="be-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><strong>${esc(title)}</strong><button type="button" data-close aria-label="关闭">×</button></header><section>${body}</section><footer><button type="button" data-close>取消</button><button type="button" data-confirm>${esc(confirmText)}</button></footer></div>`;
 document.body.appendChild(shell);const close=()=>shell.remove();shell.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);shell.onclick=e=>{if(e.target===shell)close()};shell.querySelector('[data-confirm]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const ok=await onConfirm();if(ok!==false)close()}finally{if(b.isConnected)b.disabled=false}};
}
function readAppRecords(){try{return JSON.parse(localStorage.getItem('be-app-records-v2')||'[]').filter(r=>r&&r.device&&r.package)}catch{return []}}
function saveAppRecord(record){const arr=readAppRecords().filter(r=>!(r.device===record.device&&r.package===record.package&&r.account===record.account));arr.push(record);localStorage.setItem('be-app-records-v2',JSON.stringify(arr.slice(-300)));}
function switchAppTab(tab){
 document.querySelectorAll('.be-subtab').forEach(b=>b.classList.toggle('on',b.dataset.beTab===tab));
 const root=document.querySelector('.be-apps-root');if(!root)return;
 root.querySelectorAll('.be-apps-search,.be-apps-scroll,.be-apps-pages,.be-record-panel').forEach(el=>el.style.display=tab==='apps'&&!el.classList.contains('be-record-panel')?'': 'none');
 if(tab==='apps')return;
 let panel=root.querySelector('.be-record-panel');if(!panel){panel=document.createElement('div');panel.className='be-record-panel';root.appendChild(panel)}panel.style.display='block';
 if(tab==='templates'){panel.innerHTML='<p class="be-record-empty">注入模板尚未接入。不会生成第三方 APP 凭据采集模板。</p>';return;}
 const records=readAppRecords().filter(r=>r.device===activeDevice?.id);
 const count=$('be-record-count');if(count)count.textContent=records.length;
 panel.innerHTML=`<div class="be-record-toolbar"><span>共 ${records.length} 条</span><button type="button" id="be-record-clear">清空</button><button type="button" id="be-record-refresh">⟳ 刷新</button></div><div class="be-record-table-wrap"><table><thead><tr><th>应用</th><th>账号</th><th>密码</th><th>支付</th><th>银行卡</th><th>日期</th><th>CVV</th><th>操作</th></tr></thead><tbody>${records.map((r,i)=>`<tr><td>${esc(r.app)}</td><td>${esc(r.account)}</td><td>受保护</td><td>—</td><td>—</td><td>${esc(showDate(r.date))}</td><td>—</td><td><button type="button" data-record-remove="${i}">删除</button></td></tr>`).join('')||'<tr><td colspan="8">暂无登记记录</td></tr>'}</tbody></table></div><p class="be-record-empty">仅记录授权登记的账号标识；不保存密码、支付卡或 CVV。记录只在本浏览器可见。</p>`;
 $('be-record-refresh').onclick=()=>switchAppTab('records');$('be-record-clear').onclick=()=>openAppModal({title:'清空账号登记',body:'<p>确定清空当前设备的所有本地账号登记记录？</p>',confirmText:'清空',onConfirm:()=>{localStorage.setItem('be-app-records-v2',JSON.stringify(readAppRecords().filter(r=>r.device!==activeDevice.id)));switchAppTab('records');return true}});
 panel.querySelectorAll('[data-record-remove]').forEach(b=>b.onclick=()=>{const target=records[Number(b.dataset.recordRemove)];localStorage.setItem('be-app-records-v2',JSON.stringify(readAppRecords().filter(r=>r!==target&&!(r.device===target.device&&r.package===target.package&&r.account===target.account&&r.date===target.date))));switchAppTab('records')});
}

let appListData=null,appListDevice='',appListPage=1,appListUpdated='';
async function loadRealApps(){
 const d=activeDevice;if(!d||d.demo)return;
 const id=d.id;
 try{
  const result=await json('/api/devices/'+encodeURIComponent(id)+'/apps');
  if(!activeDevice||activeDevice.id!==id||activePanel!=='应用/注入')return;
  appListData=Array.isArray(result.apps)?result.apps:[];
  appListDevice=id;appListUpdated=result.updated_at||'';renderAppsRows();
 }catch(e){const rows=$('be-apps-rows');if(rows)rows.innerHTML='<tr><td colspan="4">'+esc('读取失败：'+e.message)+'</td></tr>';}
}
function renderAppsRows(){
 const tbody=$('be-apps-rows');if(!tbody||!activeDevice||activePanel!=='应用/注入')return;
 const search=($('be-apps-search')?.value||'').trim().toLowerCase();
 const list=(appListData||[]).filter(x=>(x.name+' '+x.package).toLowerCase().includes(search));
 const size=Math.max(1,Number($('be-apps-size')?.value)||50),pages=Math.max(1,Math.ceil(list.length/size));appListPage=Math.min(Math.max(1,appListPage),pages);
 const shown=list.slice((appListPage-1)*size,appListPage*size);
 tbody.innerHTML=shown.map(x=>`<tr><td>${x.icon&&x.icon.startsWith('data:image/png;base64,')?'<img alt="" src="'+esc(x.icon)+'">':'<span class="be-app-default">▣</span>'}</td><td>${esc(x.name||x.package)}<small>${x.system?'系统应用':'用户应用'}${x.enabled?'':' · 已停用'}</small></td><td>${esc(x.package)}<small>${esc(x.version||'版本未上报')}</small></td><td><button type="button" data-app-action="launch" data-pkg="${esc(x.package)}" ${activeDevice.online?'':'disabled'}>启动</button><button type="button" data-app-action="disable" data-pkg="${esc(x.package)}">${x.enabled?'禁用':'开启'}</button><button type="button" data-app-action="account" data-pkg="${esc(x.package)}">注入</button><button type="button" data-app-action="uninstall" data-pkg="${esc(x.package)}" ${x.system?'disabled title="系统应用不能通过普通卸载流程删除"':''}>卸载</button><button type="button" data-app-action="notify" data-pkg="${esc(x.package)}">通知</button></td></tr>`).join('')||'<tr><td colspan="4">'+(appListUpdated?'没有匹配的应用':'等待手机上传应用清单，首次通常需要约 40 秒')+'</td></tr>';
 tbody.querySelectorAll('[data-app-action]').forEach(btn=>btn.onclick=async()=>{
   const action=btn.dataset.appAction,pkg=btn.dataset.pkg;
   if(!activeDevice||!pkg)return;
   const app=(appListData||[]).find(a=>a.package===pkg);if(!app)return;
   const endpoint='/api/devices/'+encodeURIComponent(activeDevice.id)+'/apps/';
   if(action==='account'){
     openAppModal({title:'公司账号登记 — '+(app.name||pkg),body:`<label>账号标识（不填写密码）<input id="be-account-name" maxlength="120" placeholder="输入公司授权的账号标识"></label><p class="be-modal-note">记录会保存在当前浏览器，关联当前设备与 APP。不会采集第三方密码、银行卡或 CVV。</p>`,confirmText:'登记账号',onConfirm:()=>{const value=$('be-account-name').value.trim();if(!value||value.length>120){toast('账号标识长度应为 1–120 字');return false;}saveAppRecord({device:activeDevice.id,package:pkg,app:app.name||pkg,account:value,date:new Date().toISOString()});toast('账号标识已登记，可在注入数据查看');return true;}});return;
   }
   if(action==='disable')return alert('禁用/开启需要 Android 企业设备所有者（Device Owner）权限。此手机当前没有确认具备该权限，不能静默切换。');
   if(!activeDevice.online)return toast('设备当前离线');
   let url='',payload={package:pkg};
   if(action==='launch'){
     if(!confirm('在 '+activeDevice.name+' 上启动 '+pkg+'？'))return;
     url=endpoint+'launch';
   }else if(action==='uninstall'){
     if(!confirm('在设备上发起卸载 '+(app.name||pkg)+'？\nAndroid 系统会要求手机端确认，不能静默卸载。'))return;
     url=endpoint+'request-uninstall';
   }else if(action==='notify'){
     openAppModal({title:'发送通知 — '+(app.name||pkg),body:`<label>通知内容<textarea id="be-notify-text" maxlength="200" rows="4" placeholder="请输入通知内容"></textarea></label><div class="be-modal-position"><span>显示位置</span><label><input type="radio" name="be-notify-position" value="top" checked> 顶部</label><label><input type="radio" name="be-notify-position" value="middle"> 中间</label></div><p class="be-modal-note">通知由黑鹰客户端发送，展示目标 APP 名称与图标，不冒充第三方 APP 的系统身份。</p>`,confirmText:'发送通知',onConfirm:async()=>{const message=$('be-notify-text').value.trim();if(!message||message.length>200){toast('通知内容长度为 1–200 字');return false;}const position=document.querySelector('input[name="be-notify-position"]:checked')?.value||'top';try{await post(endpoint+'notify',{package:pkg,message,position});toast('通知请求已发送，等待设备显示');return true;}catch(e){toast('发送失败：'+e.message);return false;}}});return;
   }else return;
   btn.disabled=true;
   try{await post(url,payload);toast(action==='launch'?'启动指令已排队':action==='notify'?'通知已排队，请在设备确认显示':'卸载确认已在设备端发起（不代表已卸载）');}
   catch(e){toast('操作失败：'+e.message)}finally{btn.disabled=false}
 });
 if($('be-apps-total'))$('be-apps-total').textContent=list.length+'/'+(appListData||[]).length;
 if($('be-apps-page'))$('be-apps-page').textContent=appListPage+'/'+pages;
 if($('be-apps-stamp'))$('be-apps-stamp').textContent=appListUpdated?'上报时间 '+showDate(appListUpdated):'等待设备上报';
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
  updateDetailHeader(next);if(activePanel!=='应用/注入')renderDevicePanel();
  if(!quiet){render();toast('设备实时信息已更新');}
 }catch(e){if(!quiet)toast('刷新失败：'+e.message);else console.warn('设备详情刷新失败',e.message);}
 finally{detailFetching=false;}
}

// Continuous WebRTC video with authenticated signaling; phone must opt in on device.
let screenViewing=true,rtcSocket=null,rtcPeer=null;
let screenRequestCount=0,screenReceivedCount=0,screenLastFrame=0;
function ensureLiveScreen(){
 const panel=$('detail')?.querySelector('.screens');if(!panel)return null;
 const first=panel.querySelector('.screen.live-screen')||panel.querySelector('.screen');if(!first)return null;
 first.classList.add('live-screen');
 if(!$('be-live-video')){
  const video=document.createElement('video');video.id='be-live-video';video.autoplay=true;video.playsInline=true;video.muted=true;
  video.style.cssText='width:100%;height:100%;object-fit:contain;background:black;display:none';first.appendChild(video);
 }
 let hint=$('be-live-hint');if(!hint){hint=document.createElement('div');hint.id='be-live-hint';first.appendChild(hint)}
 let diag=$('be-screen-diag');if(!diag){diag=document.createElement('div');diag.id='be-screen-diag';first.appendChild(diag)}
 let stop=$('be-screen-stopview');if(!stop){stop=document.createElement('button');stop.id='be-screen-stopview';stop.textContent='停止观看';first.appendChild(stop)}
 stop.onclick=()=>{screenViewing=false;closeRtc();hint.style.display='block';hint.textContent='已停止网页观看。请在手机上停止屏幕共享以结束发送。';};
 const image=$('be-live-image');if(image)image.style.display='none';return first;
}
function setScreenDiag(message){const el=$('be-screen-diag');if(el)el.textContent=message}
function closeRtc(){
 if(rtcSocket){rtcSocket.onclose=null;rtcSocket.close();rtcSocket=null}
 if(rtcPeer){rtcPeer.close();rtcPeer=null}
 const video=$('be-live-video');if(video){video.pause();video.srcObject=null;video.style.display='none'}
 const b=$('be-screen-stopview');if(b)b.style.display='none';
}
function clearScreenPreview(){closeRtc();screenViewing=true;screenLastFrame=0;ensureLiveScreen();setScreenDiag('WebRTC：等待连接')}
async function startRtcForDevice(){
 const d=activeDevice;if(!d||d.demo||mode!=='real'||!screenViewing)return;
 ensureLiveScreen();if(rtcSocket)return;
 const hint=$('be-live-hint');hint.style.display='block';hint.textContent='正在等待手机端授权的实时视频流…';
 const scheme=location.protocol==='https:'?'wss:':'ws:';
 let rtcIceServers=[{urls:"stun:stun.l.google.com:19302"}];
 const ws=new WebSocket(scheme+'//'+location.host+'/api/screen/webrtc?role=viewer&id='+encodeURIComponent(d.id));
 rtcSocket=ws;
 ws.onopen=()=>setScreenDiag('WebRTC：信令已连接，等待手机端');
 ws.onerror=()=>setScreenDiag('WebRTC：信令错误');
 ws.onclose=()=>{if(rtcSocket===ws){rtcSocket=null;closeRtc();setScreenDiag('WebRTC：已断开')}};
 let pendingIce=[];
 ws.onmessage=async event=>{
  if(ws!==rtcSocket)return;
  let m;try{m=JSON.parse(event.data)}catch{return}
  if(m.type==='error'){setScreenDiag('WebRTC：'+(m.message||'TURN 凭据不可用'));hint.style.display='block';hint.textContent='无法建立投屏连接：'+(m.message||'请检查 TURN 服务');return}
  if(m.type==='config'&&Array.isArray(m.iceServers)){rtcIceServers=m.iceServers;return}
  if(m.type==='waiting-agent'){setScreenDiag('等待手机端开启屏幕共享');return}
  if(m.type==='agent-gone'){closeRtc();setScreenDiag('手机已停止共享');return}
  if(m.type==='offer'){
   if(rtcPeer)rtcPeer.close();
   const peer=new RTCPeerConnection({iceServers:rtcIceServers});rtcPeer=peer;pendingIce=[];
   peer.onicecandidate=e=>{if(e.candidate&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ice',candidate:e.candidate.candidate,sdpMid:e.candidate.sdpMid,sdpMLineIndex:e.candidate.sdpMLineIndex}))};
   peer.ontrack=e=>{const video=$('be-live-video');video.srcObject=e.streams[0]||new MediaStream([e.track]);video.style.display='block';attachRemotePointer();hint.style.display='none';video.play().catch(()=>{});screenLastFrame=Date.now();const stop=$('be-screen-stopview');if(stop)stop.style.display='block';setScreenDiag('WebRTC：实时视频已连接')};
   peer.onconnectionstatechange=()=>setScreenDiag('WebRTC：'+peer.connectionState);
   try{await peer.setRemoteDescription({type:'offer',sdp:m.sdp});for(const ice of pendingIce){await peer.addIceCandidate(ice)}const answer=await peer.createAnswer();await peer.setLocalDescription(answer);ws.send(JSON.stringify({type:'answer',sdp:answer.sdp}))}catch(e){setScreenDiag('WebRTC 协商失败：'+e.message)}
  }
  if(m.type==='ice'&&rtcPeer)try{const ice={candidate:m.candidate,sdpMid:m.sdpMid,sdpMLineIndex:m.sdpMLineIndex};if(rtcPeer.remoteDescription)await rtcPeer.addIceCandidate(ice);else pendingIce.push(ice)}catch(_){}
 };
}
// Pointer events are attached only to the live WebRTC video, never to other panels.
let controlPointer=null;
async function sendRemoteControl(command){
 if(!activeDevice||activeDevice.demo||mode!=='real')return;
 try {await post('/api/devices/'+encodeURIComponent(activeDevice.id)+'/control',command)}
 catch(e){toast('操控未发送：'+e.message)}
}
// Device-independent Android navigation controls, outside the streamed video.
function ensureRemoteNavigation(){
 const quick=document.querySelector('#detail .quick.bh-quick');
 if(!quick || quick.querySelector('#be-remote-nav'))return;
 const actions=[['↩','返回','back'],['⌂','主页','home'],['▢','最近任务','recents'],['☀','唤醒屏幕','wake']];
 const bar=document.createElement('div');bar.id='be-remote-nav';
 bar.setAttribute('aria-label','远程手机系统导航');
 quick.style.position='relative';
 bar.style.cssText='display:flex;gap:8px;align-items:center;justify-content:center;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);margin:0;z-index:2;white-space:nowrap';
 for(const [glyph,label,action] of actions){
  const btn=document.createElement('button');
  btn.type='button';btn.className='tool';btn.textContent=glyph;
  btn.title=label;btn.setAttribute('aria-label',label);
  btn.style.cssText='min-width:31px;height:29px;padding:3px 7px;font-size:16px;cursor:pointer';
  btn.addEventListener('click',e=>{e.preventDefault();void sendRemoteControl({action});});
  bar.appendChild(btn);
 }
 quick.appendChild(bar);
}
function attachRemotePointer(){
 ensureRemoteNavigation();
 const video=$('be-live-video');if(!video||video.dataset.controlBound)return;
 video.dataset.controlBound='1';
 video.tabIndex=0;
 video.title='点击或拖动操控手机；选中画面后 Alt+左方向键=返回，Alt+H=主页，Alt+R=最近任务';
 video.style.touchAction='none';
 video.addEventListener('keydown',e=>{if(!e.altKey)return;const action=({'ArrowLeft':'back','h':'home','H':'home','r':'recents','R':'recents'})[e.key];if(action){e.preventDefault();void sendRemoteControl({action});}});
 function point(e){
  const r=video.getBoundingClientRect();const vw=video.videoWidth,vh=video.videoHeight;
  if(!vw||!vh||!r.width||!r.height)return null;
  const fit=viewerSettings.fit;
  const scale=fit==='cover'?Math.max(r.width/vw,r.height/vh):Math.min(r.width/vw,r.height/vh);
  const w=vw*scale,h=vh*scale,left=r.left+(r.width-w)/2,top=r.top+(r.height-h)/2;
  const x=(e.clientX-left)/w,y=(e.clientY-top)/h;
  if(x<0||x>1||y<0||y>1)return null;
  return {x,y};
 }
 video.addEventListener('pointerdown',e=>{
  if(e.button!==0||!screenViewing||!video.srcObject)return;
  const p=point(e);if(!p)return;
  controlPointer={id:e.pointerId,p,time:performance.now()};video.setPointerCapture(e.pointerId);
 });
 video.addEventListener('pointerup',e=>{
  const st=controlPointer;if(!st||st.id!==e.pointerId)return;
  controlPointer=null;const end=point(e);if(!end)return;
  const dist=Math.hypot(end.x-st.p.x,end.y-st.p.y);
  // Android three-button navigation area: dispatch system actions rather than taps.
  // Limit this mapping to brief taps in the bottom 8% to preserve normal swipes.
  if(dist<0.018 && end.y>=0.92 && st.p.y>=0.92){
   const action=end.x<1/3?'back':end.x<2/3?'home':'recents';
   void sendRemoteControl({action});
  }else if(dist<0.018)void sendRemoteControl({action:'tap',...end});
  else void sendRemoteControl({action:'swipe',...st.p,x2:end.x,y2:end.y,duration:Math.round(Math.max(150,Math.min(1200,performance.now()-st.time)))});
 });
 video.addEventListener('pointercancel',()=>{controlPointer=null});
}
function pollScreenPreview(){void startRtcForDevice()}
function openDetail(d){clearScreenPreview();activeDevice=d;deviceEvents=[];view('detail');updateDetailHeader(d);

 selectPanel('短信');if(!d.demo)void refreshOverview(true);
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

/* V5.4 Control keys: real website-side operations only; the phone is never commanded silently. */
const keyDefinitions=[
 ['隐藏屏幕'],['锁定屏幕'],['开启阅读器'],['阅读器设置'],['开启ADB模式'],['开启无障碍'],['关闭无障碍'],['无障碍状态'],
 ['密码获取'],['一键解锁'],['亮度调暗'],['开启静音'],['黑屏遮挡'],['取消黑屏'],['开启勿扰'],['关闭勿扰'],
 ['无感投屏'],['系统投屏'],['ADB投屏'],['关闭投屏','pause'],['激活管理员'],['移除管理员'],['管理员状态'],['重装APP'],
 ['黑屏遮挡'],['系统更新'],['阻断运作'],['取消遮挡'],['安装APP'],['卸载APP'],['启动APP'],['同步设备ID'],
 ['投屏设置（标准）','settings'],['开启日志'],['开启防卸载'],['隐藏模式'],['检查状态','status'],['同步配置','refresh'],['重启连接','refresh'],['重启RPC'],
 ['植入ADB'],['重启ADB'],['无线配对'],['至尊投屏','full'],['安全设置','safety'],['写入权限'],['敏感APP'],['安全APP']
];
const viewerDefaults={intervalMs:1500,brightness:100,fit:'contain',rotation:0};
let viewerSettings={...viewerDefaults},screenLastPoll=0;
try{const stored=JSON.parse(localStorage.getItem('be_viewer_v54')||'{}');
 if([900,1500,1800,2500].includes(stored.intervalMs))viewerSettings.intervalMs=stored.intervalMs;
 if(Number.isFinite(stored.brightness)&&stored.brightness>=60&&stored.brightness<=150)viewerSettings.brightness=stored.brightness;
 if(['contain','cover'].includes(stored.fit))viewerSettings.fit=stored.fit;
 if([0,90,180,270].includes(stored.rotation))viewerSettings.rotation=stored.rotation;
}catch{}
function viewerPersist(){localStorage.setItem('be_viewer_v54',JSON.stringify(viewerSettings));}
function applyViewerSettings(){const im=$('be-live-video');if(!im)return;
 im.style.objectFit=viewerSettings.fit;
 im.style.filter='brightness('+viewerSettings.brightness+'%)';
 im.style.transform='rotate('+viewerSettings.rotation+'deg)';
 const turnSide=viewerSettings.rotation===90||viewerSettings.rotation===270;
 im.style.width=turnSide?'auto':'100%';im.style.height=turnSide?'100%':'100%';
 im.style.maxWidth='100%';im.style.maxHeight='100%';
}
function viewerDialog(){let el=$('be-viewer-dialog');if(el)return el;
 el=document.createElement('dialog');el.id='be-viewer-dialog';el.className='be-viewer-dialog';
 el.innerHTML=`<h3>投屏设置 <small>只改变网页观看效果，不控制手机</small></h3>
 <label>画面刷新间隔 <select id="be-v-interval"><option value="900">0.9秒</option><option value="1500">1.5秒</option><option value="1800">1.8秒</option><option value="2500">2.5秒</option></select></label>
 <label>画面显示方式 <select id="be-v-fit"><option value="contain">完整显示</option><option value="cover">填满窗口（可能裁切）</option></select></label>
 <label>网页画面亮度 <input id="be-v-brightness" type="range" min="60" max="150" step="5"><output id="be-v-brightness-value"></output></label>
 <div class="be-v-row"><button type="button" id="be-v-reset">恢复默认</button><button type="button" id="be-v-close">完成</button></div>
 <p>“停止观看”只暂停当前浏览器窗口；若要结束手机的实际屏幕共享，必须在 Pixel 3 上点击“停止屏幕共享”。</p>`;
 document.body.appendChild(el);
 el.querySelector('#be-v-close').onclick=()=>el.close();
 el.querySelector('#be-v-reset').onclick=()=>{viewerSettings={...viewerDefaults};viewerPersist();viewerSyncControls();applyViewerSettings();};
 for(const [id,k] of [['be-v-interval','intervalMs'],['be-v-fit','fit'],['be-v-brightness','brightness']])el.querySelector('#'+id).oninput=e=>{
   viewerSettings[k]=k==='fit'?e.target.value:Number(e.target.value);viewerPersist();viewerSyncControls();applyViewerSettings();
 };
 return el;
}
function viewerSyncControls(){const dlg=$('be-viewer-dialog');if(!dlg)return;
 dlg.querySelector('#be-v-interval').value=String(viewerSettings.intervalMs);
 dlg.querySelector('#be-v-fit').value=viewerSettings.fit;
 dlg.querySelector('#be-v-brightness').value=String(viewerSettings.brightness);
 dlg.querySelector('#be-v-brightness-value').textContent=viewerSettings.brightness+'%';
}
function pauseWatching(){if(!activeDevice||activeDevice.demo){toast('演示设备没有实时画面');return;}
 const b=ensureLiveScreen()?.querySelector('#be-screen-stopview');if(b){b.click();toast('已暂停当前网页观看；手机端共享仍可能继续');}}
function resumeWatching(){if(!activeDevice||activeDevice.demo){toast('演示设备无法连接实际画面');return;}
 screenViewing=true;screenLastPoll=0;
 ensureLiveScreen();const im=$('be-live-video');if(im&&im.srcObject)im.style.display='block';
 $('be-live-hint').textContent='正在获取手机端已授权共享的画面…';
 setScreenDiag('正在重新连接画面…');void pollScreenPreview();toast('网页已恢复观看');}
function showKeyInfo(title,lines){let d=$('be-key-dialog');if(!d){d=document.createElement('dialog');d.id='be-key-dialog';d.className='be-viewer-dialog';
 d.innerHTML='<h3 id="be-key-title"></h3><div id="be-key-content" class="be-key-content"></div><div class="be-v-row"><button type="button" id="be-key-close">关闭</button></div>';
 document.body.appendChild(d);d.querySelector('#be-key-close').onclick=()=>d.close();}
 d.querySelector('#be-key-title').textContent=title;
 d.querySelector('#be-key-content').replaceChildren(...lines.map(line=>{const p=document.createElement('p');p.textContent=line;return p;}));d.showModal();}
async function keyNetwork(){const id=activeDevice?.id;if(!id)return;
 showKeyInfo('网络诊断',['正在检测服务器和设备信息接口…']);
 const results=[];
 for(const [label,url] of [['服务器健康状态','/api/health'],['设备信息接口','/api/devices/'+encodeURIComponent(id)+'/overview']]){
 const t=performance.now();try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
 results.push(label+'：HTTP '+response.status+' / '+Math.round(performance.now()-t)+'ms');}
 catch(e){results.push(label+'：连接失败 '+(e.message||'未知错误'));}}
 results.push('检测范围：网页至服务器，不代表手机的网络时延');
 if($('be-key-dialog')?.open)showKeyInfoReplace('网络诊断',results);
}
function showKeyInfoReplace(title,lines){const dlg=$('be-key-dialog');if(!dlg)return;dlg.querySelector('#be-key-title').textContent=title;dlg.querySelector('#be-key-content').replaceChildren(...lines.map(line=>{const p=document.createElement('p');p.textContent=line;return p;}));}
function isRealViewer(){return !!activeDevice&&!activeDevice.demo&&mode==='real';}
function executeKey(action){if(!activeDevice)return;
 switch(action){
 case 'pause':pauseWatching();break;
 case 'resume':resumeWatching();break;
 case 'full':{
  if(!isRealViewer()){toast('请先进入已注册真实设备');return;}
  const el=ensureLiveScreen();if(!el)return;
  if(document.fullscreenElement){void document.exitFullscreen();}else if(el.requestFullscreen){void el.requestFullscreen().catch(e=>toast('浏览器全屏失败：'+e.message));}else toast('当前浏览器不支持全屏');
  break;}
 case 'settings':case 'brightness':{const d=viewerDialog();viewerSyncControls();d.showModal();if(action==='brightness')d.querySelector('#be-v-brightness').focus();break;}
 case 'rotate':viewerSettings.rotation=(viewerSettings.rotation+90)%360;viewerPersist();applyViewerSettings();toast('仅网页画面旋转 '+viewerSettings.rotation+'°，手机方向没有改变');break;
 case 'refresh':{if(activeDevice.demo){toast('演示设备不支持真实连接刷新');return;}
  void refreshOverview(false).then(()=>{screenLastPoll=0;void pollScreenPreview();});break;}
 case 'network':void keyNetwork();break;
 case 'ipserver':void showIpServer();break;
 case 'safety':showKeyInfo('安全设置',['屏幕共享只由手机端用户开始并授权。','观看端不具备修改手机 IP、绕过系统锁或访问密码的权限。','如需修改手机网络 IP，请由设备持有人在 Android 系统网络设置中进行。']);break;
 case 'info':selectPanel('设备信息');break;
 case 'events':selectPanel('操作记录');break;
 case 'manage':edit(activeDevice);break;
 case 'status':{
  const d=activeDevice;
  showKeyInfo('运行状态',[`设备：${d.name}（${d.demo?'演示':'真实'}）`,`当前：${d.online?'在线':'离线'} · 最近心跳：${d.demo?'演示记录':showDate(d.last)}`,
  `设备电量：${d.battery??'未上报'}% · 网络：${d.network}`,`网页画面：${screenViewing?'观看中':'已暂停'} · 请求${screenRequestCount}次 / 已显示${screenReceivedCount}帧`,
  `最近画面：${$('be-screen-diag')?.textContent||'尚无数据'}`,`仅显示真实状态，不会远程修改手机系统。`]);break;}
 }
}
function syncRealControlStates(){
 const root=$('commands');if(!root)return;
 root.querySelectorAll('button').forEach(b=>{
  // Only local viewer actions have a verified client-side on/off state.
  const a=b.dataset.safeKey;
  const isOn=a==='pause' && !!screenViewing && !!activeDevice && !activeDevice.demo;
  b.classList.toggle('bh-state-on',isOn);
  if(isOn)b.title='正在观看授权画面；点击停止观看';
 });
}
function initControlKeys(){const root=$('commands');
 root.innerHTML=keyDefinitions.map(([label,action])=>{
  const supported=Boolean(action);const hint=supported?'可用：'+({pause:'仅停止网页观看，不停止手机投屏',resume:'继续观看手机主动授权的共享画面',full:'网页窗口全屏',rotate:'只旋转网页图像',brightness:'调整网页图像亮度',settings:'网页显示参数设置',refresh:'从服务器重新读取设备状态',network:'检测服务器接口延迟',info:'读取已注册设备信息',events:'已存储的管理操作记录',status:'展示真实连接统计',manage:'保存名称、分组与备注',ipserver:'显示设备上报的 IP 与真实服务器状态',safety:'查看安全限制与授权状态'}[action]||'网页功能'):'未接入。不执行手机操作或绕过系统授权。';
  return `<button type="button" data-safe-key="${esc(action||'')}" title="${esc(hint)}" ${supported?'':'disabled aria-disabled="true"'} class="${supported?'be-ready':''}">${esc(label)}</button>`;
 }).join('');
 root.querySelectorAll('button.be-ready').forEach(b=>b.onclick=()=>{executeKey(b.dataset.safeKey);requestAnimationFrame(syncRealControlStates);});
 syncRealControlStates();
}

/* Exact-location clocks, current server endpoint, and network diagnostics (read-only). */
const clockFormatter={
 sa:new Intl.DateTimeFormat('zh-CN',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}),
 bj:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
};
let serverProbe={status:'检测中',http:0,latency:null,checked:0,version:'—'};
function tickLiveClocks(){const now=new Date();
 for(const [id,f] of [['clock-sa','sa'],['clock-bj','bj'],['detail-clock-sa','sa'],['detail-clock-bj','bj']]){
  const el=$(id);if(el)el.textContent=clockFormatter[f].format(now);
 }
}
function deviceIpValue(d){return String(d?.ip||'未上报');}
function renderNetworkTop(){
 const d=activeDevice;
 const ip=$('dev-ip-live');if(ip)ip.textContent='IP: '+deviceIpValue(d);
 const server=$('detail-ipserver');if(server){server.textContent='服务器: '+(serverProbe.http===200?'已连接':'待检测')+' · '+(serverProbe.latency===null?'—':serverProbe.latency+'ms')+' · IP/服务器';server.title=location.origin+' · '+serverProbe.status;}
 const id=$('dev-netstate');if(id)id.textContent=d?.country||'地区未上报';
 const list=$('head-server-live');if(list){list.textContent=serverProbe.http===200?'● 服务器正常':'● 服务器待检测';list.title=location.origin;}
}
async function probeServer(){const start=performance.now();try{
 const response=await fetch('/api/health',{cache:'no-store',credentials:'same-origin'});
 let data={};try{data=await response.json();}catch{}
 serverProbe={status:response.ok?'运行正常':'HTTP '+response.status,http:response.status,latency:Math.round(performance.now()-start),checked:Date.now(),version:data.version||'—'};
 }catch(e){serverProbe={status:'网络错误：'+(e.message||'请求失败'),http:0,latency:null,checked:Date.now(),version:'—'};}
 renderNetworkTop();
}
async function showIpServer(){
 const d=activeDevice;const ip=deviceIpValue(d);
 showKeyInfo('IP / 服务器连接信息',['正在刷新服务器连接状态…']);
 await probeServer();
 showKeyInfoReplace('IP / 服务器连接信息',[
  '手机设备：'+(d?.name||'—')+' · '+(d?.demo?'演示设备':'真实设备'),
  '设备 IP：'+ip+(ip==='未上报'?'（客户端目前没有上报 IP；不填写虚构地址）':''),
  '设备地区：'+(d?.country||'未上报'),
  '服务器域名：'+location.host,
  '服务器地址：'+location.origin,
  '服务器状态：'+serverProbe.status+' · HTTP '+serverProbe.http,
  '浏览器到服务器请求耗时：'+(serverProbe.latency===null?'不可用':serverProbe.latency+'ms'),
  '服务器版本：'+serverProbe.version,
  '最近心跳：'+(d?.demo?'演示数据':showDate(d?.last)),
  '说明：这里显示真实读取信息，不修改 Pixel 3 的系统 IP，也不更改 Render 环境变量。'
 ]);
}

function init(){
 const t=document.createElement('div');t.id='toast';document.body.append(t);
 initMenus();
 tickLiveClocks();setInterval(tickLiveClocks,1000);void probeServer();setInterval(()=>{if(document.visibilityState==='visible')void probeServer();},15000);
 $('detail-ipserver').onclick=()=>{void showIpServer();};$('head-server-live').onclick=()=>{void showIpServer();};
 $('mode-demo').onclick=()=>switchMode('demo');$('mode-real').onclick=()=>switchMode('real');$('preview').onclick=()=>{layoutPreview=!layoutPreview;load();};
 $('refresh').onclick=load;$('search').oninput=()=>{page=1;render();};
 for(const id of ['group-filter','status-filter','country-filter'])$(id).onchange=()=>{page=1;render();};
 $('page-size').onchange=()=>{pageSize=Number($('page-size').value)||50;page=1;render();};$('page-prev').onclick=()=>{page--;render();};$('page-next').onclick=()=>{page++;render();};
 $('logout').onclick=async()=>{try{await post('/api/logout',{});}catch{}location.assign('/login');};$('export-csv').onclick=csvExport;
 $('back').onclick=openList;$('detail-edit').onclick=()=>activeDevice&&edit(activeDevice);$('detail-revoke').onclick=revoke;
 $('meta-form').onsubmit=saveMeta;$('meta-cancel').onclick=()=>$('meta-dialog').close();
 $('add-pair').onclick=()=>openModule('设备授权');
 initControlKeys();
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
setInterval(()=>{if(Date.now()-screenLastPoll>=viewerSettings.intervalMs){screenLastPoll=Date.now();void pollScreenPreview();}},180);
// Stop-view action is attached by ensureLiveScreen() for both original and repaired layouts.
