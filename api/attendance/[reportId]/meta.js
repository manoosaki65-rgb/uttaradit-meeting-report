import { db } from 'hatchable';

export const access = 'public';
export const methods = ['GET'];

export default async function (req, res) {
  const { rows } = await db.query(
    `SELECT id,meeting_no,title,meeting_date,meeting_time,location
     FROM meeting_reports WHERE id=$1`,
    [req.params.reportId]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบการประชุม' });
  return res.json({ meeting: rows[0] });
}