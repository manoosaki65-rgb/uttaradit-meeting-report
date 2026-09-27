import { db } from 'hatchable';

export const access = 'public';
export const methods = ['GET', 'POST'];

const clean = value => typeof value === 'string' ? value.trim() : '';

export default async function (req, res) {
  if (req.method === 'GET') {
    const { rows } = await db.query(
      `SELECT * FROM meeting_reports ORDER BY updated_at DESC LIMIT 100`,
      []
    );
    return res.json({ items: rows });
  }

  const body = req.body || {};
  const title = clean(body.title);
  const meetingDate = clean(body.meeting_date);
  const preparerName = clean(body.preparer_name);

  if (!title || !meetingDate || !preparerName) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อการประชุม วันที่ประชุม และชื่อผู้จัดทำรายงาน' });
  }

  const status = body.submit === true ? 'supervisor_review' : 'draft';
  const { rows } = await db.query(
    `INSERT INTO meeting_reports
      (meeting_no, title, meeting_date, meeting_time, location, chair, attendees, agenda, summary, resolutions, assignments, preparer_name, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      clean(body.meeting_no), title, meetingDate, clean(body.meeting_time), clean(body.location), clean(body.chair),
      clean(body.attendees), clean(body.agenda), clean(body.summary), clean(body.resolutions), clean(body.assignments), preparerName, status
    ]
  );
  return res.status(201).json({ item: rows[0] });
}