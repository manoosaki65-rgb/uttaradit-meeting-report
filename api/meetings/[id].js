import { db } from 'hatchable';

export const access = 'public';
export const methods = ['PUT'];

const clean = value => typeof value === 'string' ? value.trim() : '';

export default async function (req, res) {
  const id = req.params.id;
  const { rows: found } = await db.query('SELECT * FROM meeting_reports WHERE id = $1 LIMIT 1', [id]);
  if (!found.length) return res.status(404).json({ error: 'ไม่พบรายงานการประชุม' });

  const current = found[0];
  const body = req.body || {};
  const action = clean(body.action);
  let sql = '';
  let params = [];
  let message = 'ดำเนินการเรียบร้อย';

  if (action === 'submit') {
    if (!(current.status === 'draft' || (current.status === 'returned' && current.return_to === 'preparer'))) {
      return res.status(400).json({ error: 'สถานะปัจจุบันไม่สามารถเสนอหัวหน้างานได้' });
    }
    sql = `UPDATE meeting_reports SET status='supervisor_review', return_to=NULL, return_note=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`;
    params = [id];
    message = 'เสนอหัวหน้างานตรวจสอบแล้ว';
  } else if (action === 'supervisor_approve') {
    if (!(current.status === 'supervisor_review' || (current.status === 'returned' && current.return_to === 'supervisor'))) {
      return res.status(400).json({ error: 'รายงานไม่ได้อยู่ในขั้นตอนหัวหน้างาน' });
    }
    const name = clean(body.supervisor_name);
    if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อหัวหน้างาน' });
    sql = `UPDATE meeting_reports SET status='group_head_review', supervisor_name=$2, supervisor_note=$3, supervisor_signed_at=NOW(), return_to=NULL, return_note=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`;
    params = [id, name, clean(body.supervisor_note)];
    message = 'หัวหน้างานตรวจแล้ว และส่งต่อหัวหน้ากลุ่มงาน';
  } else if (action === 'supervisor_return') {
    if (current.status !== 'supervisor_review') return res.status(400).json({ error: 'สถานะปัจจุบันไม่สามารถส่งกลับจากหัวหน้างานได้' });
    const note = clean(body.return_note);
    if (!note) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ' });
    sql = `UPDATE meeting_reports SET status='returned', return_to='preparer', return_note=$2, updated_at=NOW() WHERE id=$1 RETURNING *`;
    params = [id, note];
    message = 'ส่งกลับผู้จัดทำเพื่อแก้ไขแล้ว';
  } else if (action === 'group_sign') {
    if (current.status !== 'group_head_review') return res.status(400).json({ error: 'รายงานไม่ได้อยู่ในขั้นตอนหัวหน้ากลุ่มงาน' });
    const name = clean(body.group_head_name);
    if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อหัวหน้ากลุ่มงาน' });
    sql = `UPDATE meeting_reports SET status='signed', group_head_name=$2, group_head_note=$3, group_head_signed_at=NOW(), return_to=NULL, return_note=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`;
    params = [id, name, clean(body.group_head_note)];
    message = 'หัวหน้ากลุ่มงานตรวจสอบและลงนามเรียบร้อย';
  } else if (action === 'group_return') {
    if (current.status !== 'group_head_review') return res.status(400).json({ error: 'สถานะปัจจุบันไม่สามารถส่งกลับจากหัวหน้ากลุ่มงานได้' });
    const note = clean(body.return_note);
    if (!note) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ' });
    sql = `UPDATE meeting_reports SET status='returned', return_to='supervisor', return_note=$2, updated_at=NOW() WHERE id=$1 RETURNING *`;
    params = [id, note];
    message = 'ส่งกลับหัวหน้างานเพื่อตรวจทานแล้ว';
  } else {
    return res.status(400).json({ error: 'ไม่รู้จักคำสั่งที่ร้องขอ' });
  }

  const { rows } = await db.query(sql, params);
  return res.json({ item: rows[0], message });
}