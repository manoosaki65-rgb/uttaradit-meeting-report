import { db } from 'hatchable';

export const access = 'member';
export const methods = ['POST'];

export default async function (req, res) {
  const id = req.params.id;
  const body = req.body || {};
  if (!['recorder','admin'].includes(body.role)) return res.status(400).json({ error: 'ประเภทลายมือชื่อไม่ถูกต้อง' });
  if (!body.signature_data || !String(body.signature_data).startsWith('data:image/png;base64,')) return res.status(400).json({ error: 'กรุณาลงลายมือชื่อก่อนบันทึก' });
  if (String(body.signature_data).length > 250000) return res.status(413).json({ error: 'ลายเซ็นมีขนาดใหญ่เกินไป' });

  const col = body.role === 'recorder' ? 'recorder_signature_data' : 'admin_signature_data';
  const timeCol = body.role === 'recorder' ? 'recorder_signed_at' : 'admin_signed_at';
  const { rows } = await db.query(`UPDATE meeting_reports SET ${col}=$1, ${timeCol}=NOW(), updated_at=NOW() WHERE id=$2 RETURNING id, recorder_signed_at, admin_signed_at`, [body.signature_data, id]);
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบรายงานการประชุม' });
  return res.json({ report: rows[0] });
}