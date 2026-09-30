// trigger Cloudflare build for neon-test
import { neon } from '@neondatabase/serverless';
const j=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8"}});
const id=()=>crypto.randomUUID(), now=()=>new Date().toISOString();
async function ensureNeonSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS meeting_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES meeting_reports(id) ON DELETE CASCADE,
    name TEXT NOT NULL, role TEXT, sort_order INT NOT NULL DEFAULT 0,
    attendance_status TEXT NOT NULL DEFAULT 'pending',
    signature_data TEXT, note TEXT, signed_at TIMESTAMPTZ,
    UNIQUE(report_id,name)
  )`;
  await sql`ALTER TABLE meeting_reports ADD COLUMN IF NOT EXISTS recorder_signature_data TEXT`;
  await sql`ALTER TABLE meeting_reports ADD COLUMN IF NOT EXISTS recorder_signed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE meeting_reports ADD COLUMN IF NOT EXISTS admin_signature_data TEXT`;
  await sql`ALTER TABLE meeting_reports ADD COLUMN IF NOT EXISTS admin_signed_at TIMESTAMPTZ`;
}
export default {async fetch(req,env){const u=new URL(req.url),p=u.pathname,m=req.method;
try{
if(p==="/api/neon-test"&&m==="GET"){
  const sql=neon(env.DATABASE_URL);
  const rows=await sql`SELECT COUNT(*)::int AS reports FROM meeting_reports`;
  return j({ok:true,backend:"neon",reports:Number(rows?.[0]?.reports||0)});
}
if(p==="/api/neon-test"&&m==="POST"){
  const sql=neon(env.DATABASE_URL),rid=id(),t=now();
  await sql`INSERT INTO meeting_reports(id,meeting_no,title,status,created_by,created_at,updated_at,year_be,sequence_no,files_json) VALUES(${rid},${"ครั้งที่ 999/2569"},${"ทดสอบ Cloudflare Worker เชื่อม Neon"},'draft',${"neon-test"},${t},${t},${2569},${999},'[]'::jsonb)`;
  return j({ok:true,backend:"neon",id:rid},201);
}
if(p==="/api/neon-write-test"&&m==="GET"){
  const sql=neon(env.DATABASE_URL),rid=id(),t=now();
  await sql`INSERT INTO meeting_reports(id,meeting_no,title,status,created_by,created_at,updated_at,year_be,sequence_no,files_json) VALUES(${rid},${"ครั้งที่ 999/2569"},${"ทดสอบเขียน Cloudflare ไป Neon"},'draft',${"neon-write-test"},${t},${t},${2569},${999},'[]'::jsonb)`;
  const rows=await sql`SELECT id,title,created_by,created_at FROM meeting_reports WHERE id=${rid}`;
  return j({ok:true,backend:"neon",write:true,row:rows[0]});
}

if(p==="/api/reports"&&m==="GET"){const sql=neon(env.DATABASE_URL);const results=await sql`SELECT id,meeting_no,title,meeting_date,meeting_time,location,attendees,agenda,summary,resolutions,followups,prepared_by,head_note,group_head_note,approval_note,status,created_at,updated_at,submitted_at,checked_at,approved_at,signed_at,year_be,sequence_no,folder_url,files_json,recorder_signed_at,admin_signed_at FROM meeting_reports ORDER BY COALESCE(year_be,0) DESC,COALESCE(sequence_no,999),meeting_date`;return j({reports:results.map(r=>({...r,files_json:Array.isArray(r.files_json)?r.files_json:[]})),backend:"neon"})}
if(p==="/api/migration-status"&&m==="GET"){const sql=neon(env.DATABASE_URL);await ensureNeonSchema(sql);const nr=await sql`SELECT COUNT(*)::int AS n FROM meeting_reports`,na=await sql`SELECT COUNT(*)::int AS n FROM meeting_attendance`;const dr=await env.DB.prepare("SELECT COUNT(*) AS n FROM meeting_reports").first(),da=await env.DB.prepare("SELECT COUNT(*) AS n FROM meeting_attendance").first();return j({backend:"comparison",neon:{reports:Number(nr?.[0]?.n||0),attendance:Number(na?.[0]?.n||0)},d1:{reports:Number(dr?.n||0),attendance:Number(da?.n||0)}})}
if(p==="/api/reports"&&m==="POST"){const sql=neon(env.DATABASE_URL);const b=await req.json(),rid=id(),t=now(),yb=Number(b.year_be||2569),sn=Number(b.sequence_no||1);await sql`INSERT INTO meeting_reports(id,meeting_no,title,meeting_date,meeting_time,location,attendees,agenda,summary,resolutions,followups,prepared_by,status,created_by,created_at,updated_at,year_be,sequence_no,folder_url,files_json) VALUES(${rid},${b.meeting_no||`ครั้งที่ ${sn}/${yb}`},${b.title||"การประชุมกลุ่มงานพัสดุ"},${b.meeting_date||null},${b.meeting_time||""},${b.location||""},${b.attendees||""},${b.agenda||""},${b.summary||""},${b.resolutions||""},${b.followups||""},${b.prepared_by||"ผู้จัดทำ"},'draft',${"ผู้จัดทำ"},${t},${t},${yb},${sn},${b.folder_url||null},'[]'::jsonb)`;return j({report:{id:rid},backend:"neon"},201)}
let x=p.match(/^\/api\/reports\/([^/]+)$/);if(x&&m==="PUT"){const sql=neon(env.DATABASE_URL),b=await req.json(),t=now(),s=b.status||"draft";const rows=await sql`UPDATE meeting_reports SET status=${s},head_note=COALESCE(${b.head_note??null},head_note),group_head_note=COALESCE(${b.group_head_note??null},group_head_note),approval_note=COALESCE(${b.approval_note??null},approval_note),submitted_at=CASE WHEN ${s}='pending_head' THEN COALESCE(submitted_at,${t}::timestamptz) ELSE submitted_at END,checked_at=CASE WHEN ${s}='pending_group_head' THEN COALESCE(checked_at,${t}::timestamptz) ELSE checked_at END,approved_at=CASE WHEN ${s}='approved' THEN COALESCE(approved_at,${t}::timestamptz) ELSE approved_at END,signed_at=CASE WHEN ${s} IN ('completed','signed') THEN COALESCE(signed_at,${t}::timestamptz) ELSE signed_at END,updated_at=${t}::timestamptz WHERE id=${x[1]}::uuid RETURNING id,status,updated_at`;return rows.length?j({report:rows[0],backend:"neon"}):j({error:"ไม่พบรายงาน"},404)}
x=p.match(/^\/api\/attendance\/([^/]+)\/meta$/);if(x&&m==="GET"){const sql=neon(env.DATABASE_URL),rows=await sql`SELECT id,meeting_no,title,meeting_date,meeting_time,location FROM meeting_reports WHERE id=${x[1]}::uuid`;return rows[0]?j({meeting:rows[0],backend:"neon"}):j({error:"ไม่พบการประชุม"},404)}
x=p.match(/^\/api\/attendance\/([^/]+)(?:\/(full))?$/);if(x&&m==="GET"){const sql=neon(env.DATABASE_URL);await ensureNeonSchema(sql);const full=!!x[2];if(full){const rows=await sql`SELECT id,name,role,sort_order,attendance_status,note,signed_at,signature_data FROM meeting_attendance WHERE report_id=${x[1]}::uuid ORDER BY sort_order,name`;return j({attendance:rows,backend:"neon"})}const rows=await sql`SELECT id,name,role,sort_order,attendance_status,note,signed_at,(signature_data IS NOT NULL AND signature_data <> '') AS has_signature FROM meeting_attendance WHERE report_id=${x[1]}::uuid ORDER BY sort_order,name`;return j({attendance:rows,backend:"neon"})}
if(x&&m==="POST"){const sql=neon(env.DATABASE_URL);await ensureNeonSchema(sql);const b=await req.json(),allowed=new Set(["present","vacation","official","personal","sick"]);if(!b.id||!allowed.has(b.status))return j({error:"ข้อมูลลงชื่อไม่ครบ"},400);if(!b.signature_data||!String(b.signature_data).startsWith("data:image/png;base64,"))return j({error:"กรุณาลงลายมือชื่อในช่องก่อนยืนยัน"},400);if(String(b.signature_data).length>250000)return j({error:"ลายเซ็นมีขนาดใหญ่เกินไป"},413);const rows=await sql`UPDATE meeting_attendance SET attendance_status=${b.status},signature_data=${b.signature_data},note=${b.note||""},signed_at=${now()}::timestamptz WHERE id=${b.id}::uuid AND report_id=${x[1]}::uuid RETURNING id,attendance_status`;if(!rows.length)return j({error:"ไม่พบรายชื่อ"},404);return j({attendance:rows[0],backend:"neon"})}
x=p.match(/^\/api\/reports\/([^/]+)\/sign$/);if(x&&m==="POST"){const sql=neon(env.DATABASE_URL);await ensureNeonSchema(sql);const b=await req.json();if(!["recorder","admin"].includes(b.role))return j({error:"บทบาทผู้ลงนามไม่ถูกต้อง"},400);if(!b.signature_data||!String(b.signature_data).startsWith("data:image/png;base64,")||String(b.signature_data).length>250000)return j({error:"ลายเซ็นไม่ถูกต้อง"},400);const t=now();let rows;if(b.role==="recorder"){rows=await sql`UPDATE meeting_reports SET recorder_signature_data=${b.signature_data},recorder_signed_at=${t}::timestamptz,updated_at=${t}::timestamptz WHERE id=${x[1]}::uuid RETURNING id,recorder_signed_at`}else{rows=await sql`UPDATE meeting_reports SET admin_signature_data=${b.signature_data},admin_signed_at=${t}::timestamptz,updated_at=${t}::timestamptz WHERE id=${x[1]}::uuid RETURNING id,admin_signed_at`}return rows.length?j({report:rows[0],backend:"neon"}):j({error:"ไม่พบรายงาน"},404)}
return env.ASSETS.fetch(req)}catch(e){return j({error:e.message},500)}}};