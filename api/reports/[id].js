import { db } from 'hatchable';

export const access = 'member';
export const methods = ['PUT'];

const allowed = new Set(['draft','pending_head','pending_group_head','revision','approved','completed','signed']);

export default async function (req, res) {
  const id = req.params.id;
  const body = req.body || {};
  if (!allowed.has(body.status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });

  const now = new Date().toISOString();
  const submittedAt = body.status === 'pending_head' ? now : null;
  const checkedAt = body.status === 'pending_group_head' ? now : null;
  const approvedAt = body.status === 'approved' ? now : null;
  const signedAt = ['completed','signed'].includes(body.status) ? now : null;

  const { rows } = await db.query(
    `UPDATE meeting_reports
     SET status=$1,
         head_note=COALESCE($2,head_note),
         group_head_note=COALESCE($3,group_head_note),
         approval_note=COALESCE($4,approval_note),
         submitted_at=COALESCE($5,submitted_at),
         checked_at=COALESCE($6,checked_at),
         approved_at=COALESCE($7,approved_at),
         signed_at=COALESCE($8,signed_at),
         updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [body.status, body.head_note ?? null, body.group_head_note ?? null,
     body.approval_note ?? null, submittedAt, checkedAt, approvedAt, signedAt, id]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบรายงานการประชุม' });
  return res.json({ report: rows[0] });
}