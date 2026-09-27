import { db } from 'hatchable';

export const access = 'member';
export const methods = ['GET'];

export default async function (req, res) {
  const reportId = req.params.reportId;
  const { rows } = await db.query(
    `SELECT id,name,role,sort_order,attendance_status,note,signed_at,signature_data
     FROM meeting_attendance WHERE report_id=$1 ORDER BY sort_order,name`,[reportId]
  );
  return res.json({ attendance: rows });
}