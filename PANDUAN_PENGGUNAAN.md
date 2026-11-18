# Panduan Lengkap Resume Matcher (Non-Teknis)

Selamat datang di **Resume Matcher**. Dokumen ini menjelaskan tujuan utama website ini, apa saja yang bisa Anda lakukan di dalamnya, dan langkah demi langkah penggunaannya dari awal tanpa istilah teknis.

---

## 1. Fungsi, Tujuan, dan Fokus Utama Website Ini

### Apa tujuan utama Resume Matcher?
**Resume Matcher** dibuat untuk membantu Anda **membuat, menyesuaikan, dan mengecek CV (resume)** agar lebih cocok dengan lowongan kerja yang Anda lamar serta **mudah dibaca oleh sistem penyaringan otomatis perusahaan (ATS / *Applicant Tracking System*)**.

Saat melamar ke perusahaan menengah maupun perusahaan besar, lamaran Anda biasanya melewati dua tahap awal sebelum dipanggil wawancara:
1. **Penyaringan oleh sistem komputer (ATS)** — sistem membaca isi file PDF CV Anda lalu mencocokkannya dengan kata kunci dan syarat lowongan. Jika format CV sulit dibaca komputer atau kata kuncinya tidak nyambung, CV bisa gugur sebelum dibaca HRD.
2. **Penilaian cepat oleh HRD / User** — HRD melihat apakah pengalaman, keahlian, dan pencapaian Anda relevan dengan posisi yang dibuka.

### Apa fokus utama website ini dibanding pembuat CV biasa?
- **Satu CV utama (*Master Resume*) untuk banyak lamaran**: Anda cukup menyiapkan satu data CV lengkap sebagai sumber utama, lalu membuat versi CV khusus yang disesuaikan (*tailored*) untuk tiap lowongan tanpa merusak CV asli Anda.
- **Jujur pada pengalaman nyata Anda**: Sistem dirancang agar **tidak mengarang** pengalaman kerja, jabatan, perusahaan, atau keahlian yang tidak Anda miliki. AI hanya membantu menyusun ulang kalimat dan menonjolkan pengalaman Anda yang paling relevan dengan lowongan.
- **Pemeriksaan ATS yang objektif**: Website ini menguji seberapa cocok kata kunci CV Anda terhadap lowongan (*Cocok JD*) dan menguji apakah file PDF yang dihasilkan benar-benar terbaca rapi oleh mesin (*Cek ATS*).
- **Privasi terjaga di komputer Anda sendiri**: Data CV, deskripsi lowongan, surat lamaran, dan catatan lamaran tersimpan di komputer Anda sendiri, bukan dipublikasikan ke internet.

---

## 2. Apa Saja yang Bisa Dilakukan di Sini?

Di dalam aplikasi web (**<http://localhost:3000>**), Anda dapat memanfaatkan fitur-fitur berikut:

1. **Menyimpan & Mengelola Master Resume (Dasbor)**
   - Mengunggah CV lama berformat PDF atau Word (DOCX) agar otomatis dirapikan menjadi data terstruktur.
   - Atau menyusun CV dari nol melalui tanya-jawab langkah demi langkah (**Panduan Buat Resume**).
   - Menyimpan hingga 5 **Jalur Master** (*Master Track*) jika Anda melamar lebih dari satu bidang karier (misalnya satu Master Resume untuk *Staff Accounting* dan satu lagi untuk *Finance & Tax*).

2. **Menyesuaikan CV untuk Setiap Lowongan (*Sesuaikan Resume*)**
   - Menempelkan teks lowongan kerja yang Anda temukan (dari portal kerja, LinkedIn, atau situs karier perusahaan).
   - Memilih tingkat penyesuaian: dari edit ringan hingga penulisan ulang menyeluruh.
   - Mengatur batas halaman (misalnya wajib 1 halaman atau 2 halaman) dan jumlah poin per pengalaman.
   - Meninjau perbandingan perubahan (*Asli* vs *Baru*) sebelum disimpan.

3. **Memproses Banyak Lowongan Sekaligus (*Antrean Penyesuaian*)**
   - Menempelkan beberapa lowongan sekaligus ke dalam antrean agar diproses satu per satu secara otomatis.

4. **Mengukur Kecocokan & Keterbacaan ATS**
   - **Cocok JD (*JD Match*)**: Menampilkan skor kecocokan 0–100 terhadap lowongan (dari kecocokan kata kunci, cakupan keahlian, kesesuaian jabatan, kelengkapan bagian CV, dan konsistensi penulisan tanggal), menyorot kata yang cocok, serta daftar kata kunci yang masih kurang.
   - **Cek ATS (*ATS Check*)**: Membaca ulang PDF hasil cetak seolah-olah aplikasi ini adalah mesin ATS perusahaan, lalu melaporkan jika ada teks yang tidak terbaca, tata letak kolom yang membingungkan mesin, kontak yang hilang, atau halaman terlalu panjang.
   - **Penulisan (*Writing*)**: Menilai kualitas penulisan kalimat (misalnya kalimat terlalu panjang, kata pembuka lemah, atau kurangnya hasil terukur) dan menawarkan perbaikan tanpa mengubah fakta.

5. **Mengedit Tampilan & Mengunduh PDF Profesional (*Editor Resume*)**
   - Mengedit teks apa pun secara bebas, menambah atau menyembunyikan bagian, dan mengubah urutan bagian.
   - Memilih **10 desain template** profesional (mulai dari format formal 1 kolom seperti *Satu Kolom*, *LaTeX*, *Clean* hingga 2 kolom seperti *Dua Kolom*, *Modern*, *Deedy*, *Vivid*).
   - Mengatur ukuran kertas (A4 atau US Letter), ukuran huruf, margin, warna aksen, dan jarak antarbaris, lalu mengunduh file **PDF** siap kirim.

6. **Membuat Surat Lamaran, Pesan Pendekatan, & Persiapan Wawancara**
   - **Surat Lamaran (*Cover Letter*)**: Menyusun surat lamaran sekitar 200–300 kata yang terhubung langsung dengan pengalaman Anda dan isi lowongan, siap diunduh sebagai PDF.
   - **Pesan Pendekatan (*Outreach Message*)**: Membuat pesan singkat untuk dikirim lewat LinkedIn atau email kepada HRD/perekrut.
   - **Persiapan Wawancara (*Interview Prep*)**: Menyusun analisis kecocokan peran, daftar pertanyaan yang kemungkinan ditanyakan perekrut berdasarkan CV Anda, dan poin jawaban yang bisa Anda siapkan.

7. **Memantau Semua Lamaran (*Pelacak Lamaran*)**
   - Papan pelacak berbentuk kolom (*Disimpan*, *Dilamar*, *Tanpa Respons*, *Ada Respons*, *Wawancara*, *Diterima*, *Ditolak*) untuk mencatat ke mana saja Anda sudah melamar, menyimpan catatan pribadi, dan membuat draf email tindak lanjut (*follow-up*).

---

## 3. Langkah Demi Langkah Penggunaan dari Awal (Non-Teknis)

Ikuti urutan ini setiap kali Anda mulai memakai aplikasi dari nol sampai siap mengirim lamaran.

### Langkah 1: Buka Website & Ubah Bahasa ke Bahasa Indonesia
1. Buka browser Anda (Chrome/Edge) lalu kunjungi **<http://localhost:3000>**.
2. Masuk ke menu **Pengaturan** (**<http://localhost:3000/settings>**).
3. Gulir ke bagian **Bahasa** (*Language*).
4. Pada **Bahasa Antarmuka (UI)**, pilih **Indonesia** agar seluruh tombol dan petunjuk tampil dalam Bahasa Indonesia.
5. Pada **Bahasa Konten** (*Content Language*):
   - Pilih **Indonesia** jika Anda ingin AI menghasilkan CV dan surat lamaran dalam Bahasa Indonesia.
   - Pilih **English** jika Anda melamar ke perusahaan multinasional yang mewajibkan CV berbahasa Inggris.
6. Gulir ke bagian **Konfigurasi LLM**, pastikan statusnya **KONEKSI BERHASIL** atau klik tombol **Uji Koneksi** untuk memastikan AI siap dipakai.
7. *(Opsional)* Di bagian **Pembuatan konten tambahan**, aktifkan **Surat Lamaran**, **Pesan Pendekatan**, dan **Persiapan Wawancara** jika Anda ingin dokumen-dokumen tersebut dapat dibuat untuk tiap lowongan.

---

### Langkah 2: Siapkan *Master Resume* (Cukup Sekali di Awal)
*Master Resume* adalah gudang data lengkap tentang riwayat pendidikan, pekerjaan, magang, sertifikasi, dan keahlian Anda. Semakin lengkap Master Resume Anda, semakin bagus hasil CV yang disesuaikan nanti.

1. Buka menu **Dasbor** (**<http://localhost:3000/dashboard>**).
2. Jika Anda **sudah punya file CV** (PDF atau DOCX):
   - Klik **Unggah Resume** (*Upload Resume*) dan pilih file CV Anda.
   - Tunggu hingga statusnya berubah menjadi **Siap** (*Ready*).
3. Jika Anda **belum punya file CV**:
   - Klik **Buat Baru** → **Susun dengan panduan AI**, lalu jawab pertanyaan satu per satu (nama, kontak, pengalaman kerja, pendidikan, keahlian).
4. Buka Master Resume yang sudah **Siap**, lalu periksa dan rapikan:
   - Pastikan **nama, email, nomor telepon, kota, dan tautan LinkedIn** benar.
   - Pastikan **format tanggal seragam** di semua pengalaman dan pendidikan (contoh: `Jan 2022 - Des 2024` atau `2022 - 2024`, jangan dicampur-campur) agar skor konsistensi tanggal maksimal.
   - Cantumkan hasil kerja nyata atau angka jika ada (contoh: *mengelola rekonsiliasi 5 rekening bank setiap bulan*, *menyelesaikan laporan pajak bulanan tepat waktu sebelum tanggal 10*).
   - Masukkan semua perangkat lunak dan keahlian yang benar-benar Anda kuasai di bagian **Keahlian Teknis** (contoh: `SAP, Accurate, Microsoft Excel, PSAK, e-Faktur`).
5. Jika Anda memiliki lebih dari satu Master Resume, pastikan yang paling utama sudah ditandai **Jadikan utama** (*Set as default*).

---

### Langkah 3: Sesuaikan CV untuk Lowongan Kerja yang Diincar
Setiap kali menemukan satu lowongan kerja yang ingin dilamar:

1. Buka menu **Sesuaikan Resume** (**<http://localhost:3000/tailor>**).
2. Pada **Pilih Resume**, pastikan Master Resume yang tepat sudah terpilih.
3. Pada **Intensitas penyesuaian**, pilih salah satu:
   - **Sentuhan ringan**: ubah sedikit saja agar lebih selaras.
   - **Perkaya kata kunci** *(paling disarankan untuk pemakaian harian)*: memasukkan kata kunci penting dari lowongan tanpa mengubah fakta pengalaman Anda.
   - **Penyesuaian penuh**: menulis ulang ringkasan dan poin agar sangat fokus pada lowongan tersebut.
   - **Tulis ulang menyeluruh**: perubahan paling besar (selalu periksa setiap baris hasilnya agar tetap akurat).
4. Pada **Batas halaman** dan **Poin per posisi**, pilih batas panjang CV (misalnya **1 halaman** untuk *fresh graduate* / staf, atau **2 halaman** jika pengalaman sangat panjang).
5. Salin teks lowongan kerja (jabatan, tanggung jawab, persyaratan) dari situs lowongan, lalu tempelkan ke kotak **Tempel Deskripsi Pekerjaan**.
6. Klik tombol **Buat Resume Disesuaikan** dan tunggu proses selesai.

---

### Langkah 4: Tinjau Perubahan Sebelum Menyimpan
Setelah AI selesai bekerja, layar **Tinjau Hasil Penyesuaian AI** akan muncul:

1. Baca perbandingan antara teks **Asli** dan **Baru**. Pastikan **tidak ada** nama perusahaan, jabatan, tahun, atau kemampuan yang tidak sesuai kenyataan.
2. Perhatikan **Skor ATS** dan bagian **Tambahkan kata kunci yang hilang**:
   - Kata kunci di kelompok **Ada di master resume Anda** aman untuk langsung diterapkan karena sudah didukung riwayat Anda.
   - Kata kunci di kelompok **Belum ada di master resume Anda**: **hanya klik "Saya punya ini"** jika Anda memang benar-benar menguasainya di dunia nyata. Jangan pernah mencentang skill yang tidak Anda pahami karena perekrut akan menanyakannya saat wawancara.
3. Jika sudah puas, klik **Konfirmasi & Simpan**. Master Resume asli Anda tidak berubah; sistem membuat salinan baru khusus untuk lowongan ini.

---

### Langkah 5: Rapikan Tampilan, Audit ATS, dan Unduh PDF
Setelah disimpan, Anda otomatis masuk ke halaman **Editor Resume** (**Builder**):

1. **Cek Kecocokan Lowongan (Tab `COCOK JD`)**:
   - Lihat bagian mana pada CV Anda yang sudah cocok (disorot warna) dan rincian skor ATS-nya.
   - Jika Anda mengedit teks secara manual, klik **Hitung Ulang** untuk melihat pembaruan skor.
2. **Periksa Kualitas Kalimat (Tab `Penulisan`)**:
   - Anda dapat melihat kalimat mana yang terlalu panjang atau kurang kuat, lalu klik **Perbaiki penulisan** bila perlu.
3. **Pilih Desain Template (Panel Kanan: `Template & Format`)**:
   - Untuk melamar ke **perusahaan besar, BUMN, bank, atau korporat** yang memakai sistem ATS ketat, pilih template **1 kolom** seperti **`Satu Kolom`**, **`LaTeX`**, atau **`Clean`**.
   - Atur ukuran kertas ke **A4** (standar di Indonesia) atau **US Letter**, lalu pastikan jumlah halaman rapi (tidak terpotong tanggung beberapa baris di halaman berikutnya; gunakan **Mode Ringkas** atau atur jarak/margin bila perlu).
4. **Jalankan Uji Pembacaan PDF (Tab `CEK ATS` → `JALANKAN CEK`)**:
   - Pastikan status utama **LOLOS**, teks dapat diseleksi, email & nomor telepon terbaca, dan urutan baca satu kolom rapi.
5. **Unduh PDF**:
   - Klik tombol **Unduh** untuk menyimpan file PDF CV ke komputer Anda.

---

### Langkah 6: Siapkan Surat Lamaran, Pesan ke HRD, & Latihan Wawancara
Masih di halaman **Editor Resume** yang sama:
1. Buka tab **SURAT LAMARAN** → klik **Buat Surat Lamaran** → periksa isi surat (biasanya 3–4 paragraf dalam 1 halaman), edit bila perlu agar terasa personal, lalu unduh sebagai PDF.
2. Buka tab **PESAN PENDEKATAN** → buat pesan singkat untuk dikirim melalui LinkedIn atau badan email saat mengirimkan CV.
3. Buka tab **PERSIAPAN WAWANCARA** → baca analisis kecocokan peran dan daftar pertanyaan wawancara yang disarankan untuk latihan sebelum hari wawancara.

---

### Langkah 7: Catat & Pantau Lamaran Anda
1. Buka menu **Pelacak Lamaran** (**<http://localhost:3000/tracker>**).
2. Setiap resume yang sudah Anda sesuaikan dapat dicatat progresnya di papan kolom:
   - **Disimpan** → belum dikirim.
   - **Dilamar** → sudah dikirim ke perusahaan.
   - **Ada Respons / Wawancara / Diterima / Ditolak / Tanpa Respons**.
3. Klik kartu lamaran kapan saja untuk menulis **Catatan** (misalnya nama HRD, tanggal wawancara, atau kisaran gaji) serta membuat **draf email tindak lanjut (*follow-up*)** jika sudah beberapa hari belum ada kabar.

---

### Langkah Tambahan (Opsional): Memproses Banyak Lowongan Sekaligus
Jika Anda mengumpulkan 5–10 lowongan sekaligus:
1. Buka **Antrean Penyesuaian** (**<http://localhost:3000/queue>**).
2. Tempel lowongan pertama → periksa nama **Posisi** dan **Perusahaan** yang terdeteksi otomatis → klik **Tambahkan ke antrean**.
3. Ulangi untuk lowongan berikutnya. Sistem akan memproses semuanya satu per satu di belakang layar, dan hasilnya tinggal Anda buka dari antrean atau **Dasbor**.

---

## 4. Ringkasan Tips Praktis untuk Pemula
- **Jangan pernah memakai 1 CV yang sama persis untuk semua lowongan**—sesuaikan minimal kata kunci dan ringkasannya per posisi.
- **Kejujuran nomor satu**: skor ATS tinggi tidak ada gunanya jika Anda gagal menjawab pertanyaan teknis saat wawancara karena mencantumkan *skill* yang sebenarnya tidak Anda kuasai.
- **Perusahaan besar = utamakan template `Satu Kolom`, `LaTeX`, atau `Clean`** karena tata letak 1 kolom paling aman dibaca oleh hampir semua mesin ATS.
- **Selalu cek hasil PDF secara visual** setelah mengunduh untuk memastikan tidak ada kata terpotong, halaman sisa yang hampir kosong, atau kontak yang salah ketik.
