import { db, storage } from 'hatchable';

export const access = 'member';
export const methods = ['GET', 'POST'];

async function hydrateFiles(rows) {
  return Promise.all(rows.map(async row => {
    const files = Array.isArray(row.files_json) ? row.files_json : [];
    const hydrated = await Promise.all(files.map(async f => {
      if (!f.storage_key) return f;
      try { return { ...f, url: await storage.url(f.storage_key) }; }
      catch { return { ...f, url: null }; }
    }));
    return { ...row, files_json: hydrated };
  }));
}

export default async function (req, res) {
  if (req.method === 'GET') {
    const { rows } = await db.query(
      `SELECT id, meeting_no, title, meeting_date, meeting_time, location, attendees,
              agenda, summary, resolutions, followups, prepared_by, head_note,
              group_head_note, approval_note, status, created_at, updated_at,
              submitted_at, checked_at, approved_at, signed_at, year_be,
              sequence_no, folder_url, files_json, recorder_signed_at, admin_signed_at
       FROM meeting_reports
       ORDER BY COALESCE(year_be, 0) DESC, COALESCE(sequence_no, 999) ASC, meeting_date ASC`
    );
    return res.json({ reports: await hydrateFiles(rows) });
  }

  const body = req.body || {};
  const yearBe = Number(body.year_be || 2569);
  const sequenceNo = Number(body.sequence_no || 1);
  const meetingNo = body.meeting_no || `ครั้งที่ ${sequenceNo}/${yearBe}`;
  const title = body.title || 'การประชุมกลุ่มงานพัสดุ';
  const creator = req.member?.display_name || req.member?.handle || req.member?.email || 'ผู้จัดทำ';

  const { rows } = await db.query(
    `INSERT INTO meeting_reports (
      meeting_no, title, meeting_date, meeting_time, location, attendees,
      agenda, summary, resolutions, followups, prepared_by, status, created_by,
      year_be, sequence_no, folder_url, files_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,$14,$15,'[]'::jsonb)
    RETURNING *`,
    [meetingNo, title, body.meeting_date || null, body.meeting_time || '', body.location || '',
     body.attendees || '', body.agenda || '', body.summary || '', body.resolutions || '',
     body.followups || '', body.prepared_by || creator, creator, yearBe, sequenceNo,
     body.folder_url || null]
  );
  return res.status(201).json({ report: rows[0] });
}