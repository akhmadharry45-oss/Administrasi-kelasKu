// Cloudflare Pages Function: POST /api/tugas
// Satu pintu untuk empat tugas AI: rapor | perangkat | soal | lkpd  (body: { task, ... })
const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

const clean = (s, n = 400) => String(s ?? '').slice(0, n);
const num = (v, d, min, max) => Math.min(max, Math.max(min, Math.round(Number(v)) || d));
const SYS =
  'Kamu adalah pakar administrasi dan asesmen sekolah dasar di Indonesia (Kurikulum Merdeka). ' +
  'Tulis dalam Bahasa Indonesia yang jelas, sopan, dan sesuai usia peserta didik SD. ' +
  'Balas HANYA dengan satu objek JSON valid tanpa teks lain dan tanpa markdown.';

const tasks = {
  // ---- deskripsi capaian rapor ----
  rapor(b) {
    const list = (Array.isArray(b.mapel) ? b.mapel : []).slice(0, 14);
    if (!list.length) throw new Error('Data nilai kosong');
    const rows = list
      .map((m) => {
        const t = m.tertinggi ? `TP/materi terkuat: "${clean(m.tertinggi.tp, 120)}"` : 'TP/materi terkuat: (tidak dicatat)';
        const r = m.terendah ? `TP/materi perlu bimbingan: "${clean(m.terendah.tp, 120)}"` : 'TP/materi perlu bimbingan: (tidak dicatat)';
        return `- ${clean(m.nama, 60)} | rata-rata ${Number(m.rata) || 0} | ${t} | ${r}`;
      })
      .join('\n');
    return {
      max: 1800,
      user: `Susun deskripsi capaian kompetensi untuk rapor.
Peserta didik: ${clean(b.nama, 60)} (${b.jk === 'P' ? 'perempuan' : 'laki-laki'}), kelas ${clean(b.kelas, 3) || '-'}.
Batas ketuntasan: ${num(b.kktp, 70, 0, 100)}.
Data per mata pelajaran:
${rows}
Catatan guru tentang siswa: ${clean(b.catatan, 400) || '-'}

Keluarkan JSON: {"deskripsi":{"<nama mata pelajaran persis seperti di data>":"2 sampai 3 kalimat"},"catatan_wali":"2 sampai 3 kalimat"}.
Aturan: sebut siswa dengan "Ananda ${clean(b.nama, 60).split(' ')[0]}"; kalimat positif dan membangun; sebut materi terkuat sebagai yang sudah dikuasai; sebut materi perlu bimbingan hanya jika nilainya di bawah batas ketuntasan atau memang tercatat; JANGAN menulis angka nilai; JANGAN mengarang materi di luar data; jika materi tidak dicatat, tulis capaian umum sesuai rata-rata.`,
    };
  },

  // ---- perangkat ajar: ATP, KKTP, Prota, Promes ----
  perangkat(b) {
    const topik = (Array.isArray(b.topik) ? b.topik : []).map((x) => clean(x, 120)).filter(Boolean).slice(0, 14);
    const total = num(b.totalJp, 64, 4, 400);
    return {
      max: 3200,
      user: `Susun perangkat ajar semester untuk:
- Mata pelajaran: ${clean(b.mapel, 80)}
- Kelas: ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)}), Semester ${clean(b.semester, 2)}
- Total alokasi semester: ${total} JP (${num(b.jpMinggu, 4, 1, 40)} JP per minggu x ${num(b.minggu, 16, 4, 30)} minggu efektif)
- Capaian Pembelajaran / catatan guru: ${clean(b.cp, 1500) || '(tidak diberikan, gunakan CP umum mata pelajaran ini pada fase tersebut)'}
${topik.length ? `- Topik dari guru, pertahankan urutannya (satu item per topik):\n${topik.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}` : '- Topik: usulkan 6 sampai 8 topik/bab yang lazim untuk semester dan kelas ini.'}

Keluarkan JSON: {"items":[{"judul":"","materi":"materi pokok","tp":"tujuan pembelajaran satu kalimat diawali 'Peserta didik mampu'","jp":0,"kktp":{"perlu":"kriteria perlu bimbingan","cukup":"kriteria cukup","baik":"kriteria baik","sangat":"kriteria sangat baik"},"asesmen":"bentuk asesmen singkat"}]}.
Aturan: jumlah "jp" semua item harus sama dengan ${total}; tujuan pembelajaran terukur; kriteria KKTP berbentuk deskripsi capaian, bukan angka; jangan menambah kunci lain.`,
    };
  },

  // ---- soal + kunci ----
  soal(b) {
    const pg = num(b.pg, 10, 0, 20), isi = num(b.isian, 5, 0, 10), ur = num(b.uraian, 2, 0, 5);
    if (!clean(b.topik, 150)) throw new Error('Topik wajib diisi');
    const sumber = clean(b.sumber_teks, 5000);
    return {
      max: 3500,
      user: `Buat soal evaluasi untuk:
- Mata pelajaran: ${clean(b.mapel, 80)}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Topik: ${clean(b.topik, 150)}
- Tujuan pembelajaran: ${clean(b.tp, 600) || '(sesuaikan dengan topik)'}
- Sebaran tingkat berpikir: ${clean(b.level, 40) || 'Campuran C1-C4'}
${sumber ? `- SUMBER MATERI (soal harus bersumber dari sini, jangan menambah fakta di luar sumber):\n"""\n${sumber}\n"""` : ''}

Jumlah: ${pg} pilihan ganda, ${isi} isian singkat, ${ur} uraian.
Keluarkan JSON: {"pg":[{"q":"","a":"","b":"","c":"","d":"","kunci":"A/B/C/D","tp":"","level":"C1"}],"isian":[{"q":"","kunci":"","tp":"","level":"C1"}],"uraian":[{"q":"","kunci":"jawaban dan pedoman skor","tp":"","level":"C3"}]}.
Aturan: bahasa sederhana sesuai usia SD; pilihan ganda hanya satu jawaban benar, pengecoh masuk akal, kunci tersebar merata; jangan memakai gambar atau tabel; jangan menulis huruf A/B/C/D di dalam teks pilihan; kolom "tp" berisi tujuan pembelajaran yang diuji secara singkat.`,
    };
  },

  // ---- LKPD ----
  lkpd(b) {
    const sumber = clean(b.sumber_teks, 4000);
    return {
      max: 1800,
      user: `Buat Lembar Kerja Peserta Didik (LKPD) untuk:
- Mata pelajaran: ${clean(b.mapel, 80)}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Topik: ${clean(b.topik, 150)}
- Tujuan pembelajaran: ${clean(b.tp, 600) || '(sesuaikan dengan topik)'}
${sumber ? `- SUMBER MATERI:\n"""\n${sumber}\n"""` : ''}

Keluarkan JSON: {"judul":"","tujuan":"","petunjuk":"","alat_bahan":"","kegiatan":["langkah 1","langkah 2"],"pertanyaan":["pertanyaan 1","pertanyaan 2"],"refleksi":""}.
Aturan: kegiatan berupa 3 sampai 5 langkah praktis berkelompok yang bisa dikerjakan tanpa proyektor; 4 sampai 6 pertanyaan bertingkat dari mudah ke sulit; bahasa ramah anak.`,
    };
  },
};

function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Respons AI tidak berformat JSON');
  try {
    return JSON.parse(m[0]);
  } catch {
    throw new Error('JSON dari AI tidak valid, coba lagi');
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) return json({ ok: false, error: 'Binding Workers AI (AI) belum dipasang.' }, 500);
    const b = await request.json();
    const t = tasks[b.task];
    if (!t) return json({ ok: false, error: 'Tugas tidak dikenal' }, 400);
    const { user, max } = t(b);
    const out = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: user },
      ],
      max_tokens: max,
      temperature: 0.4,
    });
    const data = parseJson(typeof out === 'string' ? out : out.response || '');
    return json({ ok: true, data });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
