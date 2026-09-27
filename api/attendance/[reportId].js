import { db } from 'hatchable';

export const access = 'public';
export const methods = ['GET', 'POST'];

const roster = [
  ['วราพร จันทร์ศรีทอง','นักวิชาการพัสดุ'],['พัชราพรรณ ร่มเย็น','นักวิชาการพัสดุ'],
  ['พัทธรินทร์ สุขมี','นักวิชาการพัสดุ'],['นิตยา ม่วงเมือง','นักวิชาการพัสดุ'],
  ['นุชชา อยู่เชื่อ','นักวิชาการพัสดุ'],['สมฤทัย ครูธอินทร์','นักวิชาการพัสดุ'],
  ['สุรชาติ คงคุด','นักวิชาการพัสดุ'],['พิชญ์สุกานต์ ทองทา','เจ้าพนักงานพัสดุ'],
  ['กัลยารัตน์ สินรวม','เจ้าพนักงานพัสดุ'],['จินตนา บุตรดา','เจ้าพนักงานพัสดุ'],
  ['มนูศักดิ์ อยู่บาง','เจ้าพนักงานพัสดุ'],['พิมพ์พรรณ คำพัน','เจ้าพนักงานพัสดุ'],
  ['พศกร นวนสีใส','เจ้าพนักงานพัสดุ'],['รัชดาภรณ์ จันทร์กลัด','เจ้าพนักงานพัสดุ'],
  ['รัตนาภรณ์ ใจแก้ว','เจ้าพนักงานพัสดุ'],['หนึ่งฤทัย เอี่ยมงิ้วงาม','พนักงานพัสดุ'],
  ['เบญจมาศ ทวิกิจสมบูรณ์','พนักงานพัสดุ'],['วันวิสา ศรีวัฒนะ','พนักงานพัสดุ'],
  ['สุรีภรณ์ แหลมไทย','พนักงานพัสดุ'],['สกุณา รีเมือง','พนักงานพัสดุ'],
  ['กรกนก จรรยานะ','พนักงานพัสดุ'],['นายวรายุ เพิ่มธัญกรรม','เจ้าพนักงานพัสดุ'],
  ['นายธนาวุฒิ ประสารศรี','เจ้าพนักงานพัสดุ'],['นายพงศธร เจริญธนะจินดา','เจ้าพนักงานพัสดุ'],
  ['ประยูร บุญพา','พนักงานซักฟอก'],['จรัญ เขียวจันทร์แสง','พนักงานซักฟอก'],
  ['สีดาพร สุวรรณรอด','พนักงานบริการ (คว)']
].map((x,i)=>({name:x[0],role:x[1],sort_order:i+1}));

async function ensureRoster(reportId) {
  const c = await db.query('SELECT COUNT(*)::int AS n FROM meeting_attendance WHERE report_id=$1',[reportId]);
  if ((c.rows[0]?.n || 0) > 0) return;
  await db.query(
    `INSERT INTO meeting_attendance (report_id,name,role,sort_order)
     SELECT $1,x.name,x.role,x.sort_order
     FROM jsonb_to_recordset($2::jsonb) AS x(name text,role text,sort_order int)
     ON CONFLICT (report_id,name) DO NOTHING`,
    [reportId, JSON.stringify(roster)]
  );
}

export default async function (req, res) {
  const reportId = req.params.reportId;
  const found = await db.query('SELECT id FROM meeting_reports WHERE id=$1',[reportId]);
  if (!found.rows.length) return res.status(404).json({ error: 'ไม่พบการประชุม' });
  await ensureRoster(reportId);

  if (req.method === 'GET') {
    const { rows } = await db.query(
      `SELECT id,name,role,sort_order,attendance_status,note,signed_at,
              (signature_data IS NOT NULL AND signature_data <> '') AS has_signature
       FROM meeting_attendance WHERE report_id=$1 ORDER BY sort_order,name`,[reportId]
    );
    return res.json({ attendance: rows });
  }

  const body = req.body || {};
  const allowed = new Set(['present','vacation','official','personal','sick']);
  if (!body.id || !allowed.has(body.status)) return res.status(400).json({ error: 'ข้อมูลลงชื่อไม่ครบ' });
  if (!body.signature_data || !String(body.signature_data).startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error: 'กรุณาลงลายมือชื่อในช่องก่อนยืนยัน' });
  }
  if (String(body.signature_data).length > 250000) return res.status(413).json({ error: 'ลายเซ็นมีขนาดใหญ่เกินไป' });

  const { rows } = await db.query(
    `UPDATE meeting_attendance SET attendance_status=$1,signature_data=$2,note=$3,signed_at=NOW()
     WHERE id=$4 AND report_id=$5
     RETURNING id,name,role,attendance_status,note,signed_at`,
    [body.status, body.signature_data, body.note || '', body.id, reportId]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบรายชื่อ' });
  return res.json({ attendance: rows[0] });
}