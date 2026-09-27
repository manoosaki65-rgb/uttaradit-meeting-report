import { db, storage } from 'hatchable';

export const access = 'member';
export const methods = ['POST'];

const allowedKinds = new Set(['invite','report_file','final_pdf','attachment','attendance_source','audio','other']);
const allowedMimes = new Set([
  'application/pdf',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/mpeg','image/png','image/jpeg'
]);
const kindMimes = {
  invite: new Set(['application/pdf','image/png','image/jpeg']),
  report_file: new Set(['application/pdf','image/png','image/jpeg']),
  final_pdf: new Set(['application/pdf']),
  attachment: new Set(['application/pdf','image/png','image/jpeg']),
  attendance_source: new Set(['application/pdf','image/png','image/jpeg','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  audio: new Set(['audio/mpeg'])
};

export default async function (req, res) {
  const id = req.params.id;
  const kind = String(req.body?.kind || 'attachment');
  if (!allowedKinds.has(kind)) return res.status(400).json({ error: 'ประเภทไฟล์ไม่ถูกต้อง' });
  const uploads = req.files || [];
  if (!uploads.length) return res.status(400).json({ error: 'กรุณาเลือกไฟล์' });
  if (uploads.length > 10) return res.status(400).json({ error: 'อัปโหลดได้ไม่เกิน 10 ไฟล์ต่อครั้ง' });

  const existing = await db.query('SELECT files_json FROM meeting_reports WHERE id=$1',[id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'ไม่พบการประชุม' });
  const files = Array.isArray(existing.rows[0].files_json) ? existing.rows[0].files_json : [];
  const added = [];

  for (const file of uploads) {
    if (file.buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: `${file.filename} มีขนาดเกิน 10 MB` });
    if (!allowedMimes.has(file.contentType)) return res.status(415).json({ error: `${file.filename} เป็นชนิดไฟล์ที่ไม่รองรับ กรุณาใช้ PDF หรือไฟล์ภาพ` });
    if (kindMimes[kind] && !kindMimes[kind].has(file.contentType)) return res.status(415).json({ error: `${file.filename} ไม่ตรงกับประเภทเอกสารนี้` });
    const ext = (file.filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
    const key = `meetings/${id}/${crypto.randomUUID()}.${ext}`;
    const url = await storage.put(key, file.buffer, file.contentType);
    const item = { title:file.filename, kind, storage_key:key, content_type:file.contentType, source:'upload', url };
    files.push({ title:item.title, kind:item.kind, storage_key:item.storage_key, content_type:item.content_type, source:item.source });
    added.push(item);
  }

  const isFinal = kind === 'final_pdf';
  await db.query(
    `UPDATE meeting_reports SET files_json=$1::jsonb,
       status=CASE WHEN $2 THEN 'completed' ELSE status END,
       signed_at=CASE WHEN $2 THEN NOW() ELSE signed_at END,
       updated_at=NOW() WHERE id=$3`,
    [JSON.stringify(files), isFinal, id]
  );
  return res.json({ files: added, completed: isFinal });
}