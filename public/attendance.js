const API = window.__HATCHABLE__?.api || '/api';
const params = new URLSearchParams(location.search);
const meetingId = params.get('meeting');
let people = [];
let selected = null;

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const labels = {pending:'ยังไม่ลงชื่อ',present:'เข้าร่วมประชุม',vacation:'ลาพักผ่อน',official:'ติดราชการ',personal:'ลากิจ',sick:'ลาป่วย'};
function toast(msg){const e=$('#toast');e.textContent=msg;e.hidden=false;clearTimeout(window.__t);window.__t=setTimeout(()=>e.hidden=true,2400)}
function thDate(v){return v?new Date(v+'T00:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}):''}

async function init(){
  if(!meetingId){$('#personList').innerHTML='<div class="person">ไม่พบรหัสการประชุม</div>';return}
  try{
    const [mr,ar]=await Promise.all([fetch(`${API}/attendance/${meetingId}/meta`),fetch(`${API}/attendance/${meetingId}`)]);
    if(!mr.ok||!ar.ok) throw new Error('เปิดหน้าลงชื่อไม่สำเร็จ');
    const m=(await mr.json()).meeting;people=(await ar.json()).attendance||[];
    $('#meetingName').textContent=m.meeting_no || 'รายชื่อผู้เข้าร่วมประชุม';
    $('#meetingDate').textContent=`${thDate(m.meeting_date)} ${m.meeting_time||''}${m.location?' · '+m.location:''}`;
    renderPeople();
  }catch(err){toast(err.message)}
}
function renderPeople(){
  $('#personList').innerHTML=people.map(p=>`<article class="person ${p.attendance_status!=='pending'?'signed':''}"><div><b>${esc(p.sort_order)}. ${esc(p.name)}</b><div class="role">${esc(p.role||'')} · ${esc(labels[p.attendance_status]||p.attendance_status)}${p.signed_at?' ✓':''}</div></div><button class="${p.attendance_status==='pending'?'primary':'soft'}" data-person="${p.id}">${p.attendance_status==='pending'?'เลือกชื่อของฉัน':'ลงชื่อใหม่/แก้ไข'}</button></article>`).join('');
}
$('#personList').addEventListener('click',e=>{const b=e.target.closest('[data-person]');if(!b)return;selected=people.find(x=>x.id===b.dataset.person);if(!selected)return;$('#selectedName').textContent=selected.name;$('#selectedRole').textContent=selected.role||'';document.querySelector(`input[name=status][value="${selected.attendance_status==='pending'?'present':selected.attendance_status}"]`)?.click();$('#attNote').value=selected.note||'';$('#signCard').hidden=false;clearCanvas();$('#signCard').scrollIntoView({behavior:'smooth',block:'start'});});

const canvas=$('#sigCanvas'),ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#132b3f';let drawing=false,hasInk=false;
function point(ev){const r=canvas.getBoundingClientRect();const src=ev.touches?.[0]||ev;return {x:(src.clientX-r.left)*(canvas.width/r.width),y:(src.clientY-r.top)*(canvas.height/r.height)}}
function start(ev){ev.preventDefault();drawing=true;const p=point(ev);ctx.beginPath();ctx.moveTo(p.x,p.y)}
function move(ev){if(!drawing)return;ev.preventDefault();const p=point(ev);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true}
function stop(ev){if(drawing)ev.preventDefault();drawing=false}
canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);
function clearCanvas(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#132b3f';hasInk=false}
$('#clearSig').onclick=e=>{e.preventDefault();clearCanvas()};clearCanvas();

$('#saveSig').onclick=async e=>{
  e.preventDefault();if(!selected)return;if(!hasInk)return toast('กรุณาลงลายมือชื่อก่อนยืนยัน');
  const status=document.querySelector('input[name=status]:checked')?.value||'present';
  if(!confirm(`ยืนยันว่าเป็น ${selected.name} และต้องการบันทึกสถานะ “${labels[status]}” ใช่หรือไม่`))return;
  const body={id:selected.id,status,note:$('#attNote').value.trim(),signature_data:canvas.toDataURL('image/png')};
  const btn=$('#saveSig');btn.disabled=true;btn.textContent='กำลังบันทึก...';
  try{const r=await fetch(`${API}/attendance/${meetingId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'บันทึกไม่สำเร็จ');toast('บันทึกการลงชื่อเรียบร้อย');$('#signCard').hidden=true;selected=null;const ar=await fetch(`${API}/attendance/${meetingId}`);people=(await ar.json()).attendance||[];renderPeople();window.scrollTo({top:0,behavior:'smooth'})}catch(err){toast(err.message)}finally{btn.disabled=false;btn.textContent='ยืนยันและลงชื่อ'}
};

init();