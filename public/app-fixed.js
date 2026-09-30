const API = window.__HATCHABLE__?.api || '/api';
const YEAR = 2569;
let reports = [];
let activeReport = null;
let reportDrawing = false;
let reportHasInk = false;
let reportCanvas = null;
let reportCtx = null;

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const thDate = (v) => v ? new Date(v + (String(v).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}) : 'ยังไม่กำหนดวันประชุม';
const thDateFull = (v) => v ? new Date(v + (String(v).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}) : 'ยังไม่กำหนดวันประชุม';

const statusInfo = {
  draft:['เตรียมการประชุม','draft'], pending_head:['รอหัวหน้างานตรวจ','pending'],
  revision:['ส่งกลับแก้ไข','revision'], pending_group_head:['รอหัวหน้ากลุ่มงานอนุมัติ','approval'],
  approved:['อนุมัติแล้ว · รอ PDF ฉบับสุดท้าย','approval'], completed:['เสร็จสิ้น','complete'], signed:['เสร็จสิ้น','complete']
};

function toast(msg){const e=$('#toast');e.textContent=msg;e.hidden=false;clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>e.hidden=true,2600)}
function setupReportSignature(){
  reportCanvas=$('#reportSigCanvas');
  if(!reportCanvas)return;
  reportCtx=reportCanvas.getContext('2d');
  resetReportCanvas();
  reportCanvas.addEventListener('pointerdown',ev=>{ev.preventDefault();reportDrawing=true;const p=reportPoint(ev);reportCtx.beginPath();reportCtx.moveTo(p.x,p.y)});
  reportCanvas.addEventListener('pointermove',ev=>{if(!reportDrawing)return;ev.preventDefault();const p=reportPoint(ev);reportCtx.lineTo(p.x,p.y);reportCtx.stroke();reportHasInk=true});
  window.addEventListener('pointerup',()=>{reportDrawing=false});
  $('#clearReportSig').addEventListener('click',resetReportCanvas);
  $('#saveReportSig').addEventListener('click',saveReportSignature);
}
function resetReportCanvas(){
  if(!reportCtx||!reportCanvas)return;
  reportCtx.clearRect(0,0,reportCanvas.width,reportCanvas.height);
  reportCtx.fillStyle='#fff';reportCtx.fillRect(0,0,reportCanvas.width,reportCanvas.height);
  reportCtx.lineWidth=3;reportCtx.lineCap='round';reportCtx.lineJoin='round';reportCtx.strokeStyle='#132b3f';reportHasInk=false;
}
function reportPoint(ev){const r=reportCanvas.getBoundingClientRect();return{x:(ev.clientX-r.left)*(reportCanvas.width/r.width),y:(ev.clientY-r.top)*(reportCanvas.height/r.height)}}
window.openReportSign=(role)=>{if(!activeReport)return;$('#reportSignRole').value=role;$('#reportSignTitle').textContent=role==='recorder'?'ลงชื่อผู้จดรายงาน':'ลงชื่อผู้ตรวจรายงาน';$('#reportSignName').textContent=role==='recorder'?'นายมนูศักดิ์ อยู่บาง':'น.ส.กรกนก จรรยานะ';resetReportCanvas();$('#reportSignDialog').showModal()};
async function saveReportSignature(){
  if(!activeReport||!reportHasInk)return toast('กรุณาลงลายมือชื่อก่อนบันทึก');
  const role=$('#reportSignRole').value,btn=$('#saveReportSig');btn.disabled=true;btn.textContent='กำลังบันทึก...';
  try{const res=await fetch(`${API}/reports/${activeReport.id}/sign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,signature_data:reportCanvas.toDataURL('image/png')})});const d=await res.json();if(!res.ok)throw new Error(d.error||'บันทึกลายมือชื่อไม่สำเร็จ');$('#reportSignDialog').close();toast('บันทึกลายมือชื่อแล้ว');const id=activeReport.id;await load();openMeeting(id,{push:false})}catch(err){toast(err.message)}finally{btn.disabled=false;btn.textContent='บันทึกลายมือชื่อ'}
}
function byKind(r,...kinds){return (r.files_json||[]).filter(f=>kinds.includes(f.kind))}
let latestMeeting4PdfUrl='';
async function loadLatestMeeting4Pdf(){
  try{
    const parts=await Promise.all([1,2,3,4,5].map(i=>fetch('./meeting4-pdf-'+i+'.txt',{cache:'no-store'}).then(r=>r.text())));
    const b64=parts.join(''); const bin=atob(b64); const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    latestMeeting4PdfUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  }catch{}
}
function fileUrl(f){if(f?.source==='upload'&&f?.storage_key&&latestMeeting4PdfUrl)return latestMeeting4PdfUrl;return f?.url||'#'}
function fileLink(f,label='เปิด'){return `<div class="file-item"><div class="file-name">📄 ${esc(f.title)}</div><a class="soft link-btn" href="${esc(fileUrl(f))}" target="_blank" rel="noopener">${label}</a></div>`}
function sequenceOf(r){if(r.sequence_no)return Number(r.sequence_no);const m=String(r.meeting_no||'').match(/ครั้งที่\s*(\d+)/);return m?Number(m[1]):999}

function previewUrl(f){
  const u=fileUrl(f); if(!u||u==='#') return '';
  let m=u.match(/drive\.google\.com\/file\/d\/([^/]+)/); if(m)return `https://drive.google.com/file/d/${m[1]}/preview`;
  m=u.match(/docs\.google\.com\/document\/d\/([^/]+)/); if(m)return `https://docs.google.com/document/d/${m[1]}/preview`;
  return u;
}
function primaryFile(r){
  const finals=byKind(r,'final_pdf'), uploads=byKind(r,'report_file'), pdfs=byKind(r,'report_pdf'), legacyWords=byKind(r,'report_word');
  return finals[finals.length-1] || uploads[uploads.length-1] || pdfs.find(f=>/final/i.test(f.title||'')) || pdfs[0] || legacyWords[legacyWords.length-1] || null;
}
function isPdf(f){return !!f && (f.content_type==='application/pdf'||f.kind==='final_pdf'||f.kind==='report_pdf'||/\.pdf(?:$|\?)/i.test(f.url||'')||/\.pdf$/i.test(f.title||''))}
function isImage(f){return !!f && (/^image\//.test(f.content_type||'')||/\.(?:png|jpe?g)(?:$|\?)/i.test(f.url||'')||/\.(?:png|jpe?g)$/i.test(f.title||''))}

async function load(){
  try{const res=await fetch(API+'/reports');if(!res.ok)throw new Error('โหลดรายการประชุมไม่สำเร็จ');const data=await res.json();let legacy={};try{const lr=await fetch('./legacy-files.json',{cache:'no-store'});if(lr.ok)legacy=await lr.json()}catch{} reports=(data.reports||[]).filter(r=>(r.year_be||YEAR)===YEAR||!r.year_be).map(r=>{const live=Array.isArray(r.files_json)?r.files_json:[];const extra=legacy[r.id]||[];const seen=new Set(live.map(f=>(f.kind||'')+'|'+(f.storage_key||f.url||f.title||'')));return {...r,files_json:[...live,...extra.filter(f=>!seen.has((f.kind||'')+'|'+(f.storage_key||f.url||f.title||'')))]}});render()}
  catch(err){toast(err.message)}
}
function render(){
  const yearReports=[...reports].sort((a,b)=>sequenceOf(b)-sequenceOf(a));
  const completed=yearReports.filter(r=>['signed','completed'].includes(r.status)).length;
  const pending=yearReports.length-completed;
  $('#summary').innerHTML=`<div class="sum-card"><strong>${yearReports.length}</strong><span>ครั้งในปี 2569</span></div><div class="sum-card"><strong>${completed}</strong><span>เสร็จสิ้นแล้ว</span></div><div class="sum-card"><strong>${pending}</strong><span>รอตรวจ / กำลังดำเนินการ</span></div>`;
  $('#meetingList').innerHTML=yearReports.map(r=>meetingCard(sequenceOf(r),r)).join('');
}
function resourceChips(r){
  const invite=byKind(r,'invite').length,att=byKind(r,'attendance_source').length,report=primaryFile(r),attachments=byKind(r,'attachment').length,audio=byKind(r,'audio').length;
  return `<div class="resource-line"><span class="chip ${report?'ok':''}">${report?(isPdf(report)?'PDF รายงาน ✓':'Word รายงาน ✓'):'รายงาน —'}</span><span class="chip ${invite?'ok':''}">หนังสือเชิญ ${invite?'✓':'—'}</span><span class="chip ${att?'ok':''}">รายชื่อ ${att?'✓':'—'}</span><span class="chip ${attachments?'ok':''}">เอกสารแนบ ${attachments?attachments+' ไฟล์':'—'}</span><span class="chip ${audio?'ok':''}">ไฟล์เสียง ${audio?'✓':'—'}</span></div>`;
}
function calendarHTML(r){
  if(!r.meeting_date)return '<div class="calendar-empty">ยังไม่กำหนดวันประชุม</div>';
  const raw=String(r.meeting_date);const d=new Date(raw.length===10?raw+'T00:00:00':raw);
  const year=d.getFullYear(),month=d.getMonth(),day=d.getDate();
  const first=new Date(year,month,1).getDay();
  const days=new Date(year,month+1,0).getDate();
  const months=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  let cells='';
  for(let i=0;i<first;i++)cells+='<span class="cal-day blank"></span>';
  for(let x=1;x<=days;x++){
    const hit=x===day;
    cells+=`<button type="button" class="cal-day ${hit?'meeting-day':''}" ${hit?`data-meeting-day="${r.id}" aria-label="เปิดรายงานวันที่ ${x} ${months[month]} ${year+543}"`:'disabled'}>${x}</button>`;
  }
  return `<div class="mini-calendar"><div class="cal-month">${months[month]} <b>${year+543}</b></div><div class="cal-week"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div><div class="cal-grid">${cells}</div></div>`;
}
function meetingCard(n,r){
  const [label,cls]=statusInfo[r.status]||[r.status,'draft'];
  const active=!['signed','completed'].includes(r.status);
  return `<article class="calendar-card ${active?'active':'complete'}"><div class="calendar-card-head"><div><small>การประชุม</small><h3>ครั้งที่ ${n} / 2569</h3><p class="meeting-date-text">วันที่ประชุม: ${thDateFull(r.meeting_date)}</p></div><span class="badge ${cls}">${label}</span></div>${calendarHTML(r)}<div class="calendar-card-foot"><span>📎 ${(r.files_json||[]).length} ไฟล์</span><button class="soft small-btn" data-manage="${r.id}">แนบ/แก้ไขไฟล์</button></div></article>`;
}

function workflowBar(r){
  const [label,cls]=statusInfo[r.status]||[r.status,'draft'];
  return `<span class="status-only badge ${cls}">สถานะ: ${esc(label)}</span>`;
}
function openMeeting(id,{push=true,manage=false}={}){
  const r=reports.find(x=>x.id===id);if(!r)return;activeReport=r;const n=sequenceOf(r);
  $('#listView').hidden=true;$('#detailView').hidden=false;
  $('#detailTitle').textContent=`การประชุมครั้งที่ ${n} / 2569`;
  $('#detailSub').textContent=`${thDate(r.meeting_date)} ${r.meeting_time||''}${r.location?' · '+r.location:''}`;
  $('#workflowBar').innerHTML=workflowBar(r);
  $('#primaryReport').innerHTML=primaryReportHTML(r);
  $('#secondaryDocs').innerHTML=secondaryDocsHTML(r);
  if(manage)setTimeout(()=>$('#secondaryDocs')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
  else window.scrollTo({top:0,behavior:'instant'});
  if(push) history.pushState({meeting:id},'',`#meeting-${n}`);
}
function closeMeeting({fromPop=false}={}){
  activeReport=null;$('#detailView').hidden=true;$('#listView').hidden=false;window.scrollTo({top:0,behavior:'instant'});
  if(!fromPop && location.hash) history.pushState({},'',location.pathname+location.search);
}
function primaryReportHTML(r){
  const f=primaryFile(r);const n=sequenceOf(r);
  if(!f)return `<div class="report-placeholder"><h3>ยังไม่มีไฟล์รายงานการประชุม</h3><p>แนบเป็น PDF หรือไฟล์ภาพ JPG/PNG เพื่อให้ตัวหนังสือและรูปแบบไม่เพี้ยน</p>${uploadBlock('report_file','แนบรายงาน','PDF, JPG หรือ PNG',false)}${reportActions(r)}</div>`;
  const type=isPdf(f)?(r.status==='pending_head'?'PDF ฉบับรอตรวจ':'PDF ฉบับรายงาน'):(isImage(f)?'ภาพรายงานการประชุม':'เอกสารเดิม');
  const preview=isImage(f)?`<img class="report-image" src="${esc(fileUrl(f))}" alt="รายงานการประชุมครั้งที่ ${n}">`:`<iframe class="report-frame" src="${esc(previewUrl(f))}" title="รายงานการประชุมครั้งที่ ${n}"></iframe>`;
  return `<div class="report-head"><div><h3>${type}</h3><div class="sub">${esc(f.title)}</div></div><div class="report-actions"><a class="soft link-btn" href="${esc(fileUrl(f))}" target="_blank" rel="noopener">เปิดเต็มหน้าจอ ↗</a></div></div>${preview}<div class="report-bottom">${reviewPanel(r)}${signaturePanel(r)}${reportActions(r)}${['signed','completed'].includes(r.status)?uploadBlock('final_pdf','แนบ/เปลี่ยน PDF ฉบับสมบูรณ์','PDF เท่านั้น · ฉบับที่แนบล่าสุดจะเป็นฉบับหลัก',false):uploadBlock('report_file','แนบรายงานฉบับแก้ไข/ฉบับใหม่','PDF, JPG หรือ PNG',false)}${['approved','pending_group_head'].includes(r.status)?uploadBlock('final_pdf','แนบ PDF ฉบับสุดท้าย','PDF เท่านั้น',false):''}</div>`;
}
function reviewPanel(r){
  if(r.status!=='pending_head'&&r.status!=='revision')return '';
  return `<section class="review-panel"><h3>📝 หมายเหตุจากหัวหน้างาน</h3><p class="sub">พิมพ์ได้เลย เช่น “แก้ไขวาระที่ 2 ข้อ 2.1 เรื่อง…”</p><textarea id="headReviewText" rows="4" placeholder="ระบุวาระ / ข้อ / ข้อความที่ต้องแก้ไข">${esc(r.head_note||'')}</textarea><div class="box-actions"><button class="soft" onclick="saveHeadReview()">บันทึกหมายเหตุ</button>${r.status==='pending_head'?'<button class="success" onclick="passHeadReview()">ตรวจผ่าน → ส่งหัวหน้ากลุ่มงาน</button>':''}<button class="danger" onclick="returnForRevision()">ส่งกลับแก้ไข</button></div></section>`;
}
function signaturePanel(r){
  const n=sequenceOf(r); if(n<4)return '';
  return `<section class="signature-panel"><h3>✍️ ลายมือชื่อรายงานการประชุม</h3><div class="signature-slots"><div class="signature-slot"><b>ผู้จดรายงานการประชุม</b><span>นายมนูศักดิ์ อยู่บาง</span><small>${r.recorder_signed_at?'✓ ลงชื่อแล้ว':'ยังไม่ได้ลงชื่อ'}</small><button class="soft" onclick="openReportSign('recorder')">${r.recorder_signed_at?'ลงชื่อใหม่':'ลงลายมือชื่อ'}</button></div><div class="signature-slot"><b>ผู้ตรวจรายงานการประชุม</b><span>น.ส.กรกนก จรรยานะ</span><small>${r.admin_signed_at?'✓ ลงชื่อแล้ว':'ยังไม่ได้ลงชื่อ'}</small><button class="soft" onclick="openReportSign('admin')">${r.admin_signed_at?'ลงชื่อใหม่':'ลงลายมือชื่อ'}</button></div><div class="signature-slot approval-slot"><b>หัวหน้ากลุ่มงานพัสดุ</b><span>ตรวจสอบและอนุมัติ</span><small>${['approved','completed','signed'].includes(r.status)?'✓ อนุมัติแล้ว':'รออนุมัติ'}</small>${r.status==='pending_group_head'?'<button class="success" onclick="startStatus(\'approved\')">อนุมัติรายงาน</button>':''}</div></div></section>`;
}
function secondaryDocsHTML(r){
  const invites=byKind(r,'invite'),attendance=byKind(r,'attendance_source'),attachments=byKind(r,'attachment'),audios=byKind(r,'audio');
  return `<section class="doc-box"><h3>✉️ หนังสือเชิญประชุม</h3><div class="sub">เอกสารประกอบก่อนวันประชุม</div><div class="file-list">${invites.length?invites.map(f=>fileLink(f)).join(''):'<div class="sub">ยังไม่มีหนังสือเชิญ</div>'}</div><div class="box-actions"><button class="soft" onclick="printInvitation()">สร้าง/พิมพ์หนังสือเชิญ</button></div>${uploadBlock('invite','แนบหนังสือเชิญ','PDF, JPG หรือ PNG',false)}</section><section class="doc-box"><h3>✍️ รายชื่อ/ลงชื่อเข้าประชุม</h3><div class="sub">เปิดรายชื่อเดิม หรือใช้หน้าลงชื่ออิเล็กทรอนิกส์</div><div class="file-list">${attendance.length?attendance.map(f=>fileLink(f,'ดูรายชื่อเดิม')).join(''):'<div class="sub">ยังไม่มีไฟล์รายชื่อ</div>'}</div><div class="box-actions"><a class="primary link-btn" href="./attendance.html?meeting=${encodeURIComponent(r.id)}" target="_blank">ลงชื่อบนมือถือ</a><button class="soft" onclick="printAttendance()">พิมพ์รายชื่อ</button></div>${uploadBlock('attendance_source','แนบ/เปลี่ยนไฟล์รายชื่อ','PDF, JPG, PNG หรือ Excel',false)}</section><section class="doc-box"><h3>🎙️ ไฟล์เสียง</h3><div class="sub">บันทึกเสียงการประชุม</div><div class="file-list">${audios.length?audios.map(f=>fileLink(f,'เปิดเสียง')).join(''):'<div class="sub">ไม่มีไฟล์เสียง</div>'}</div>${uploadBlock('audio','แนบ/เปลี่ยนไฟล์เสียง','MP3',false)}</section><section class="doc-box attachments"><h3>📎 เอกสารแนบ</h3><div class="sub">เอกสารแนบใหม่ใช้ PDF หรือไฟล์ภาพ เพื่อป้องกันฟอนต์และตัวหนังสือเพี้ยน</div><div class="file-list">${attachments.length?attachments.map(f=>fileLink(f)).join(''):'<div class="sub">ครั้งนี้ไม่มีเอกสารแนบ</div>'}</div>${uploadBlock('attachment','เพิ่มเอกสารแนบ','PDF, JPG หรือ PNG · เลือกหลายไฟล์ได้',true)}</section>`;
}
function uploadBlock(kind,label,hint,multiple){
  const accepts={
    final_pdf:'application/pdf',
    report_file:'application/pdf,image/jpeg,image/png',
    invite:'application/pdf,image/jpeg,image/png',
    attachment:'application/pdf,image/jpeg,image/png',
    attendance_source:'application/pdf,image/jpeg,image/png,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    audio:'audio/mpeg'
  };
  const accept=accepts[kind]||'';
  return `<div class="upload-wrap"><form class="upload-form" data-kind="${kind}"><label>${label}<input type="file" name="files" ${multiple?'multiple':''} ${accept?`accept="${accept}"`:''}></label><div class="sub">${hint}</div><button type="submit" class="soft">อัปโหลด</button></form></div>`;
}
function reportActions(r){
  if(['signed','completed'].includes(r.status))return '<div class="box-actions"><span class="badge complete">✓ เอกสารฉบับสมบูรณ์</span></div>';
  if(r.status==='draft'||r.status==='revision')return `<div class="box-actions"><button class="primary" onclick="startStatus('pending_head')">ส่งหัวหน้างานตรวจ</button></div>`;
  if(r.status==='pending_head')return '';
  if(r.status==='pending_group_head')return `<div class="box-actions"><button class="danger" onclick="startStatus('revision')">ส่งกลับแก้ไข</button></div>`;
  if(r.status==='approved')return `<div class="box-actions"><span class="badge approval">อนุมัติแล้ว — แนบ PDF ฉบับสุดท้ายด้านล่าง</span></div>`;return '';
}

document.addEventListener('click',e=>{
  const create=e.target.closest('[data-create]');if(create){e.stopPropagation();openCreate(Number(create.dataset.create));return}
  const day=e.target.closest('[data-meeting-day]');if(day){openMeeting(day.dataset.meetingDay);return}
  const manage=e.target.closest('[data-manage]');if(manage){openMeeting(manage.dataset.manage,{manage:true});return}
  const close=e.target.closest('[data-close]');if(close){close.closest('dialog')?.close()}
});
$('#backToList').onclick=()=>closeMeeting();
window.addEventListener('popstate',()=>{if(!$('#detailView').hidden)closeMeeting({fromPop:true})});
$('#createMeetingBtn').onclick=()=>{const used=new Set(reports.map(sequenceOf));let n=1;while(used.has(n)&&n<=20)n++;openCreate(n)};
function openCreate(n){const f=$('#newMeetingForm');f.reset();f.elements.sequence_no.value=n;f.elements.title.value='การประชุมกลุ่มงานพัสดุ';$('#newMeetingDialog').showModal()}
$('#newMeetingForm').addEventListener('submit',async e=>{e.preventDefault();const obj=Object.fromEntries(new FormData(e.currentTarget));obj.year_be=YEAR;const res=await fetch(API+'/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});const d=await res.json();if(!res.ok)return toast(d.error||'สร้างแฟ้มไม่สำเร็จ');$('#newMeetingDialog').close();toast('สร้างแฟ้มการประชุมแล้ว');await load()});

document.addEventListener('submit',async e=>{const form=e.target.closest('.upload-form');if(!form)return;e.preventDefault();if(!activeReport)return;const input=form.querySelector('input[type=file]');if(!input.files.length)return toast('กรุณาเลือกไฟล์');const fd=new FormData();fd.append('kind',form.dataset.kind);Array.from(input.files).forEach(f=>fd.append('file',f));const btn=form.querySelector('button');btn.disabled=true;btn.textContent='กำลังอัปโหลด...';try{const res=await fetch(`${API}/reports/${activeReport.id}/files`,{method:'POST',body:fd});const d=await res.json();if(!res.ok)throw new Error(d.error||'อัปโหลดไม่สำเร็จ');const id=activeReport.id;toast(form.dataset.kind==='final_pdf'?'บันทึก PDF ฉบับสมบูรณ์แล้ว':'แนบไฟล์แล้ว');await load();openMeeting(id,{push:false})}catch(err){toast(err.message)}finally{btn.disabled=false;btn.textContent='อัปโหลด'}});

window.startStatus=(status)=>{if(!activeReport)return;const title={pending_head:'ส่งรายงานให้หัวหน้างานตรวจ',pending_group_head:'หัวหน้างานตรวจผ่าน',approved:'หัวหน้ากลุ่มงานอนุมัติ',revision:'ส่งกลับแก้ไข'};const f=$('#noteForm');f.elements.report_id.value=activeReport.id;f.elements.next_status.value=status;f.elements.note.value='';$('#noteTitle').textContent=title[status]||'ยืนยัน';$('#noteDialog').showModal()};
window.saveHeadReview=async()=>{if(!activeReport)return;const note=$('#headReviewText')?.value.trim()||'';const res=await fetch(`${API}/reports/${activeReport.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:activeReport.status,head_note:note})});const d=await res.json();if(!res.ok)return toast(d.error||'บันทึกหมายเหตุไม่สำเร็จ');toast('บันทึกหมายเหตุแล้ว');const id=activeReport.id;await load();openMeeting(id,{push:false})};
window.passHeadReview=async()=>{if(!activeReport)return;const note=$('#headReviewText')?.value.trim()||'';const res=await fetch(`${API}/reports/${activeReport.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'pending_group_head',head_note:note})});const d=await res.json();if(!res.ok)return toast(d.error||'ส่งต่อไม่สำเร็จ');toast('หัวหน้างานตรวจผ่านแล้ว');const id=activeReport.id;await load();openMeeting(id,{push:false})};
window.returnForRevision=async()=>{if(!activeReport)return;const note=$('#headReviewText')?.value.trim()||'';if(!note)return toast('กรุณาระบุข้อความที่ต้องแก้ไข');const res=await fetch(`${API}/reports/${activeReport.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'revision',head_note:note})});const d=await res.json();if(!res.ok)return toast(d.error||'ส่งกลับแก้ไขไม่สำเร็จ');toast('ส่งกลับแก้ไขแล้ว');const id=activeReport.id;await load();openMeeting(id,{push:false})};
$('#noteForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),id=fd.get('report_id'),status=fd.get('next_status'),note=fd.get('note');const body={status};if(status==='pending_group_head'||status==='revision')body.head_note=note;if(status==='approved')body.approval_note=note;const res=await fetch(`${API}/reports/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await res.json();if(!res.ok)return toast(d.error||'อัปเดตไม่สำเร็จ');$('#noteDialog').close();toast('อัปเดตสถานะแล้ว');await load();openMeeting(id,{push:false})});

window.printInvitation=()=>{if(!activeReport)return;const r=activeReport,n=sequenceOf(r);const w=window.open('','_blank');w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เชิญประชุมครั้งที่ ${n}</title><style>body{font-family:"TH Sarabun New",Tahoma,sans-serif;font-size:20px;line-height:1.55;max-width:760px;margin:40px auto}.center{text-align:center}.indent{text-indent:2.5em}.sign{text-align:center;margin-left:45%;margin-top:45px}@media print{body{margin:18mm}}</style></head><body><h2 class="center">บันทึกข้อความ</h2><p><b>ส่วนราชการ</b> กลุ่มงานพัสดุ โรงพยาบาลอุตรดิตถ์</p><p><b>เรื่อง</b> ขอเชิญประชุมกลุ่มงานพัสดุ ครั้งที่ ${n}/${YEAR}</p><p><b>เรียน</b> เจ้าหน้าที่กลุ่มงานพัสดุทุกท่าน</p><p class="indent">ด้วยกลุ่มงานพัสดุ กำหนดจัดประชุมครั้งที่ ${n}/${YEAR} ในวันที่ ${thDate(r.meeting_date)} ${esc(r.meeting_time||'')} ณ ${esc(r.location||'ห้องประชุมกลุ่มงานพัสดุ')} เพื่อแจ้งข้อราชการและพิจารณาเรื่องที่เกี่ยวข้องกับการปฏิบัติงาน</p><p class="indent">จึงเรียนมาเพื่อโปรดทราบและเข้าร่วมประชุมตามวัน เวลา และสถานที่ดังกล่าว</p><div class="sign">ลงชื่อ ........................................<br>หัวหน้ากลุ่มงานพัสดุ</div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()};
window.printAttendance=async()=>{if(!activeReport)return;try{const res=await fetch(`${API}/attendance/${activeReport.id}/full`);if(!res.ok)throw new Error('ยังไม่สามารถเปิดรายชื่อสำหรับพิมพ์ได้');const d=await res.json();const labels={pending:'ยังไม่ลงชื่อ',present:'เข้าร่วม',vacation:'ลาพักผ่อน',official:'ติดราชการ',personal:'ลากิจ',sick:'ลาป่วย'};const n=sequenceOf(activeReport);const rows=(d.attendance||[]).map((a,i)=>`<tr><td>${i+1}</td><td>${esc(a.name)}</td><td>${esc(a.role||'')}</td><td>${esc(labels[a.attendance_status]||a.attendance_status)}</td><td>${a.signature_data?`<img src="${a.signature_data}" style="max-width:110px;max-height:40px">`:'-'}</td></tr>`).join('');const w=window.open('','_blank');w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายชื่อครั้งที่ ${n}</title><style>body{font-family:Tahoma,sans-serif;margin:25px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:7px;font-size:12px}th{background:#eee}@media print{body{margin:10mm}}</style></head><body><h2>รายชื่อผู้เข้าร่วมประชุมกลุ่มงานพัสดุ ครั้งที่ ${n}/${YEAR}</h2><p style="text-align:center">${thDate(activeReport.meeting_date)}</p><table><thead><tr><th>ลำดับ</th><th>ชื่อ-สกุล</th><th>หน้าที่</th><th>สถานะ</th><th>ลายมือชื่อ</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}catch(err){toast(err.message)}};

setupReportSignature();
loadLatestMeeting4Pdf().then(load);