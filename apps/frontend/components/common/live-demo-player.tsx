'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/context/language-context';

const DEMO_STORAGE_KEY = 'rm_live_demo_riki';
const STEP_STORAGE_KEY = 'rm_live_demo_step';
const RIKI_RESUME_ID = '661eaa51-2d77-499a-96b9-d93e0ce28496';
const RIKI_FILENAME = 'CV_Riki_Rivaldi_November_2026.pdf';
const TOTAL_STEPS = 7;

const ACCOUNTING_JD = `Position: Staff Accounting / Accounting Operations
Company: PT Nusantara Sejahtera Tbk (Perusahaan Besar / Korporat)

Tanggung Jawab Utama:
- Mengelola siklus akuntansi penuh (General Ledger, jurnal harian, trial balance, dan penutupan buku bulanan/tahunan).
- Melaksanakan rekonsiliasi bank harian/bulanan, verifikasi bukti transaksi fisik terhadap data sistem, serta rekonsiliasi Accounts Payable (AP) dan Accounts Receivable (AR).
- Menyusun laporan keuangan (Neraca, Laba Rugi, Arus Kas) sesuai standar PSAK / SAK Umum dan SAK EMKM.
- Menjaga pengendalian internal (Internal Control), kontrol mutasi kartu persediaan, serta mendukung pelaksanaan stock opname periodik dan audit internal/eksternal.
- Mengoptimalkan pengolahan data keuangan dan otomatisasi rekapitulasi laporan menggunakan Microsoft Excel tingkat lanjut (Pivot Table, VLOOKUP/XLOOKUP, Index-Match, Macro VBA) serta basis data relasional (SQL / Sistem Informasi Akuntansi).

Kualifikasi:
- Pendidikan minimal D3 / S1 Akuntansi (memiliki sertifikasi kompetensi BNSP Teknisi Akuntansi menjadi nilai tambah).
- Menguasai siklus akuntansi, General Ledger, AP/AR, rekonsiliasi bank, pengendalian internal persediaan, serta Microsoft Excel tingkat lanjut (Macro VBA, Pivot Table, VLOOKUP/XLOOKUP).
- Teliti, memiliki ketelitian audit tinggi, mampu menganalisis data keuangan secara terstruktur, dan siap bekerja dalam tim.`;

interface HudState {
  step: number;
  title: string;
  desc: string;
  waiting: boolean;
  btnText: string;
  done: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const findByText = (selector: string, text: string): HTMLElement | null => {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return (
    candidates.find(
      (el) => el.textContent?.includes(text) && !(el as HTMLButtonElement).disabled
    ) ?? null
  );
};

const waitFor = async <T,>(
  getter: () => T | null | undefined,
  timeoutMs = 15000,
  intervalMs = 200
): Promise<T | null> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = getter();
    if (found) return found;
    await sleep(intervalMs);
  }
  return null;
};

const setNativeTextareaValue = (textarea: HTMLTextAreaElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
};

export function LiveDemoPlayer() {
  const pathname = usePathname();
  const router = useRouter();
  const { uiLanguage, setUiLanguage } = useLanguage();

  const [active, setActive] = useState(false);
  const [cursor, setCursor] = useState({ x: 180, y: 180, label: 'AI Kursor', pulse: false });
  const [hud, setHud] = useState<HudState>({
    step: 1,
    title: 'Mempersiapkan Live Demo...',
    desc: 'Mengaktifkan Bahasa Indonesia dan menyiapkan skenario CV Riki.',
    waiting: false,
    btnText: 'Lanjut ke Tahap Berikutnya ▶',
    done: false,
  });

  const nextResolverRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);
  const runningKeyRef = useRef<string | null>(null);

  const moveCursorTo = useCallback(async (el: HTMLElement, label: string, clickIt = true) => {
    if (cancelledRef.current) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    await sleep(300);
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    setCursor({ x, y, label, pulse: true });
    await sleep(650);
    setCursor((prev) => ({ ...prev, pulse: false }));
    if (clickIt && !cancelledRef.current) {
      el.click();
      await sleep(350);
    }
  }, []);

  const waitForNextClick = useCallback(
    (step: number, title: string, desc: string, btnText: string): Promise<void> =>
      new Promise((resolve) => {
        setHud({ step, title, desc, waiting: true, btnText, done: false });
        nextResolverRef.current = () => {
          nextResolverRef.current = null;
          resolve();
        };
      }),
    []
  );

  const closeDemo = useCallback(() => {
    cancelledRef.current = true;
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
    sessionStorage.removeItem(STEP_STORAGE_KEY);
    nextResolverRef.current?.();
    nextResolverRef.current = null;
    runningKeyRef.current = null;
    setActive(false);
  }, []);

  // Activate via ?demo=riki or active sessionStorage flag
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'riki') {
      sessionStorage.setItem(DEMO_STORAGE_KEY, '1');
      sessionStorage.setItem(STEP_STORAGE_KEY, '1');
      runningKeyRef.current = null;
      if (uiLanguage !== 'id') {
        setUiLanguage('id');
      }
      cancelledRef.current = false;
      setActive(true);
      window.history.replaceState(null, '', pathname);
      if (!pathname.startsWith('/settings')) {
        router.replace('/settings');
      }
    } else if (sessionStorage.getItem(DEMO_STORAGE_KEY) === '1') {
      cancelledRef.current = false;
      setActive(true);
    }
  }, [pathname, router, setUiLanguage, uiLanguage]);

  // Execute stage logic matching current route & persisted step
  useEffect(() => {
    if (!active) return;
    const step = Number(sessionStorage.getItem(STEP_STORAGE_KEY) || '1');
    const stepKey = `${step}:${pathname}`;
    if (runningKeyRef.current === stepKey) return;

    const run = async () => {
      // STAGE 1: Settings check & test connection
      if (step === 1 && pathname.startsWith('/settings')) {
        runningKeyRef.current = stepKey;
        setHud({
          step: 1,
          title: 'Cek Pengaturan Bahasa & AI',
          desc: 'Memastikan Bahasa Indonesia dan model gemini-3.8-flash (mode tertinggi) siap, lalu menjalankan Uji Koneksi.',
          waiting: false,
          btnText: '',
          done: false,
        });
        await sleep(800);
        const testBtn = await waitFor(
          () => findByText('button', 'Uji Koneksi') ?? findByText('button', 'Test Connection'),
          8000
        );
        if (testBtn) {
          await moveCursorTo(testBtn, 'Klik Uji Koneksi', true);
          await sleep(1200);
        }
        if (cancelledRef.current) return;
        await waitForNextClick(
          1,
          'Pengaturan & Koneksi AI Siap',
          'Bahasa Indonesia aktif dan koneksi AI terhubung. Klik tombol di bawah untuk menuju Dasbor dan membuka CV Riki.',
          'Lanjut ke Tahap 2: Lihat CV Riki ▶'
        );
        if (cancelledRef.current) return;
        sessionStorage.setItem(STEP_STORAGE_KEY, '2');
        runningKeyRef.current = null;
        router.push('/dashboard');
        return;
      }

      // STAGE 2: Dashboard -> Open Riki's CV
      if (step === 2 && pathname.startsWith('/dashboard')) {
        runningKeyRef.current = stepKey;
        setHud({
          step: 2,
          title: 'Membuka CV Riki di Dasbor',
          desc: 'Mencari Master Resume milik Riki Rivaldi lalu membukanya untuk pemeriksaan data awal.',
          waiting: false,
          btnText: '',
          done: false,
        });
        const rikiLink = await waitFor(
          () => document.querySelector<HTMLElement>(`a[href*="${RIKI_RESUME_ID}"]`),
          10000
        );
        if (rikiLink) {
          await moveCursorTo(rikiLink, 'Buka CV Riki Rivaldi', true);
        } else {
          router.push(`/resumes/${RIKI_RESUME_ID}`);
        }
        return;
      }

      if (step === 2 && pathname.startsWith(`/resumes/${RIKI_RESUME_ID}`)) {
        runningKeyRef.current = stepKey;
        await sleep(700);
        await waitForNextClick(
          2,
          'Pratinjau Master Resume Riki',
          'CV Riki sudah terbaca (D3 Akuntansi, BNSP Teknisi Akuntansi Madya, magang Bankaltimtara, SIA & Excel Macro VBA). Klik lanjut untuk menyesuaikan CV dengan posisi Accounting.',
          'Lanjut ke Tahap 3: Isi Lowongan Accounting ▶'
        );
        if (cancelledRef.current) return;
        sessionStorage.setItem(STEP_STORAGE_KEY, '3');
        runningKeyRef.current = null;
        router.push('/tailor');
        return;
      }

      // STAGE 3 & 4: Tailor page -> Select Riki CV, fill Accounting JD, Run AI Tailoring, Inspect Diff + ATS Score
      if (step === 3 && pathname.startsWith('/tailor')) {
        runningKeyRef.current = stepKey;
        setHud({
          step: 3,
          title: 'Memilih CV Riki & Mengisi Kriteria Accounting',
          desc: 'Memilih Master Resume Riki, mengatur batas 1 halaman, dan mengisi kriteria kerja Staff Accounting.',
          waiting: false,
          btnText: '',
          done: false,
        });
        await sleep(900);

        const dropdowns = Array.from(
          document.querySelectorAll<HTMLElement>('button[aria-haspopup="listbox"]')
        );
        if (dropdowns[0]) {
          await moveCursorTo(dropdowns[0], 'Pilih Master Resume', true);
          const rikiOpt = await waitFor(() => findByText('[role="option"]', RIKI_FILENAME), 5000);
          if (rikiOpt) await moveCursorTo(rikiOpt, 'Pilih CV Riki Rivaldi', true);
        }

        const updatedDropdowns = Array.from(
          document.querySelectorAll<HTMLElement>('button[aria-haspopup="listbox"]')
        );
        if (updatedDropdowns[2]) {
          await moveCursorTo(updatedDropdowns[2], 'Atur Batas Halaman', true);
          const onePageOpt = await waitFor(
            () =>
              findByText('[role="option"]', '1 halaman') ?? findByText('[role="option"]', '1 page'),
            5000
          );
          if (onePageOpt) await moveCursorTo(onePageOpt, 'Pilih 1 halaman', true);
        }

        const jdBox = await waitFor(
          () => document.querySelector<HTMLTextAreaElement>('#job-description'),
          5000
        );
        if (jdBox) {
          await moveCursorTo(jdBox, 'Tempel Lowongan Staff Accounting', true);
          setNativeTextareaValue(jdBox, ACCOUNTING_JD);
          await sleep(400);
        }

        if (cancelledRef.current) return;
        await waitForNextClick(
          3,
          'Kriteria Kerja Accounting Siap',
          'CV Riki dan kriteria posisi Staff Accounting sudah terisi. Klik tombol di bawah untuk menjalankan AI Tailoring secara live.',
          'Jalankan Live AI Tailoring ▶'
        );
        if (cancelledRef.current) return;

        // STAGE 4: Execute Live AI Tailoring
        sessionStorage.setItem(STEP_STORAGE_KEY, '4');
        setHud({
          step: 4,
          title: 'AI Sedang Menyesuaikan CV Riki...',
          desc: 'Mengirim CV Riki & deskripsi Staff Accounting ke gemini-3.8-flash-high serta menghitung Skor ATS. Harap tunggu sebentar...',
          waiting: false,
          btnText: '',
          done: false,
        });

        const genBtn =
          findByText('button', 'Buat Resume Disesuaikan') ??
          findByText('button', 'Generate Tailored Resume');
        if (genBtn) {
          await moveCursorTo(genBtn, 'Klik Buat Resume Disesuaikan', true);
        }

        const confirmBtn = await waitFor(
          () =>
            findByText('button', 'Konfirmasi & Simpan') ?? findByText('button', 'Confirm & Save'),
          900000,
          400
        );
        if (!confirmBtn || cancelledRef.current) return;

        await moveCursorTo(confirmBtn, 'Hasil AI & Skor ATS Siap', false);
        await waitForNextClick(
          4,
          'Tinjau Hasil Penyesuaian & Skor ATS',
          'Periksa ringkasan perubahan (Asli vs Baru) serta Skor ATS pada modal ini. Klik lanjut untuk menyimpan dan membuka Editor Audit ATS.',
          'Simpan & Lanjut ke Analisis Cocok JD ▶'
        );
        if (cancelledRef.current) return;

        sessionStorage.setItem(STEP_STORAGE_KEY, '5');
        runningKeyRef.current = null;
        await moveCursorTo(confirmBtn, 'Konfirmasi & Simpan', true);
        return;
      }

      // STAGE 5, 6, 7: Builder page
      if ((step === 5 || step === 6 || step === 7) && pathname.startsWith('/builder')) {
        runningKeyRef.current = stepKey;
        await sleep(1000);

        // STAGE 5: COCOK JD
        if (step <= 5) {
          setHud({
            step: 5,
            title: 'Membuka Tab COCOK JD',
            desc: 'Menampilkan perbandingan CV Riki terhadap kata kunci lowongan Staff Accounting beserta rincian Skor ATS.',
            waiting: false,
            btnText: '',
            done: false,
          });
          const jdTab = await waitFor(
            () => findByText('[role="tab"]', 'COCOK JD') ?? findByText('[role="tab"]', 'JD MATCH'),
            10000
          );
          if (jdTab) {
            await moveCursorTo(jdTab, 'Buka Tab COCOK JD', true);
            await sleep(900);
          }
          if (cancelledRef.current) return;
          await waitForNextClick(
            5,
            'Analisis Cocok JD & Sorotan Kata Kunci',
            'Kata kunci yang cocok disorot pada CV Riki dan skor ATS ditampilkan di panel samping. Klik lanjut untuk menjalankan uji pembacaan PDF ATS.',
            'Lanjut ke Tahap 6: Live Cek PDF ATS ▶'
          );
          if (cancelledRef.current) return;
          sessionStorage.setItem(STEP_STORAGE_KEY, '6');
        }

        // STAGE 6: CEK ATS
        setHud({
          step: 6,
          title: 'Menjalankan Live Cek PDF ATS',
          desc: 'Membuka tab CEK ATS dan merender PDF CV Riki untuk diuji dengan pembaca ATS.',
          waiting: false,
          btnText: '',
          done: false,
        });
        const atsTab = await waitFor(
          () => findByText('[role="tab"]', 'CEK ATS') ?? findByText('[role="tab"]', 'ATS CHECK'),
          10000
        );
        if (atsTab) {
          await moveCursorTo(atsTab, 'Buka Tab CEK ATS', true);
          await sleep(500);
        }
        const runBtn = await waitFor(
          () =>
            findByText('button', 'JALANKAN CEK') ??
            findByText('button', 'CEK ULANG') ??
            findByText('button', 'RUN CHECK') ??
            findByText('button', 'RUN AGAIN'),
          8000
        );
        if (runBtn) {
          await moveCursorTo(runBtn, 'Klik JALANKAN CEK', true);
          await waitFor(
            () =>
              findByText('h3, h4, span, div', 'Keterbacaan') ??
              findByText('span, div', 'Parseability'),
            60000,
            400
          );
          await sleep(600);
        }
        if (cancelledRef.current) return;
        await waitForNextClick(
          6,
          'Hasil Uji Keterbacaan PDF ATS',
          'Lihat hasil pembacaan teks PDF, urutan baca satu kolom, detail kontak, dan judul bagian. Klik lanjut untuk memilih template korporat & siap unduh PDF.',
          'Lanjut ke Tahap 7: Template & Unduh PDF ▶'
        );
        if (cancelledRef.current) return;
        sessionStorage.setItem(STEP_STORAGE_KEY, '7');

        // STAGE 7: RESUME preview, corporate template & Download highlight
        setHud({
          step: 7,
          title: 'Memilih Template Korporat & Siap Unduh',
          desc: 'Kembali ke pratinjau RESUME, memilih template Satu Kolom (paling aman untuk ATS), dan menyorot tombol Unduh PDF.',
          waiting: false,
          btnText: '',
          done: false,
        });
        const resumeTab = await waitFor(() => findByText('[role="tab"]', 'RESUME'), 8000);
        if (resumeTab) {
          await moveCursorTo(resumeTab, 'Buka Tab RESUME', true);
          await sleep(500);
        }
        const singleCol =
          findByText('button', 'Satu Kolom') ?? findByText('button', 'Single Column');
        if (singleCol) {
          await moveCursorTo(singleCol, 'Pilih Template Satu Kolom', true);
          await sleep(500);
        }
        const downloadBtn = findByText('button', 'Unduh') ?? findByText('button', 'Download');
        if (downloadBtn) {
          await moveCursorTo(downloadBtn, 'Siap Unduh PDF di sini', false);
        }
        setHud({
          step: 7,
          title: 'Live Demo Selesai!',
          desc: 'CV Riki sudah disesuaikan untuk Staff Accounting dan teruji ATS. Anda bisa langsung klik Unduh untuk menyimpan PDF atau coba tab SURAT LAMARAN / PERSIAPAN WAWANCARA.',
          waiting: false,
          btnText: '',
          done: true,
        });
      }
    };

    void run();
  }, [active, moveCursorTo, pathname, router, waitForNextClick]);

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden="true"
        style={{ left: `${cursor.x}px`, top: `${cursor.y}px` }}
        className="fixed z-50 pointer-events-none transition-[left,top] duration-500 ease-out"
      >
        <svg
          viewBox="0 0 28 28"
          width="32"
          height="32"
          fill="none"
          className="-translate-x-1 -translate-y-1"
        >
          <path
            d="M3 2L24 13L14.5 16L11 25L3 2Z"
            className="fill-destructive stroke-white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <div className="ml-6 -mt-1 whitespace-nowrap rounded-none border border-white bg-primary px-2 py-1 font-mono text-xs font-bold text-white shadow-sw-sm">
          {cursor.label}
        </div>
      </div>

      {cursor.pulse && (
        <div
          aria-hidden="true"
          style={{ left: `${cursor.x}px`, top: `${cursor.y}px` }}
          className="fixed z-40 pointer-events-none h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-none border-2 border-destructive bg-destructive-tint opacity-80"
        />
      )}

      <aside
        aria-label="Live Demo Guide"
        className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] rounded-none border-2 border-primary bg-ink p-4 text-white shadow-sw-lg"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-panel">
            {`LIVE DEMO • TAHAP ${hud.step} / ${TOTAL_STEPS}`}
          </span>
          <button
            type="button"
            onClick={closeDemo}
            className="rounded-none border border-white px-2 py-1 font-mono text-xs font-bold text-white hover:bg-destructive"
          >
            Tutup
          </button>
        </div>

        <h2 className="mb-1 font-sans text-base font-bold text-white">{hud.title}</h2>
        <p className="mb-4 text-sm leading-relaxed text-panel">{hud.desc}</p>

        {hud.done ? (
          <div className="w-full rounded-none bg-success px-3 py-2 text-center font-mono text-xs font-bold uppercase text-white">
            Demo Selesai — Silakan Eksplorasi
          </div>
        ) : hud.waiting ? (
          <button
            type="button"
            onClick={() => nextResolverRef.current?.()}
            className="w-full rounded-none border border-white bg-primary px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-white hover:bg-primary-hover"
          >
            {hud.btnText}
          </button>
        ) : (
          <div className="w-full rounded-none border border-steel bg-ink-soft px-3 py-2 text-center font-mono text-xs font-bold uppercase text-panel">
            Sedang mengeksekusi langkah...
          </div>
        )}
      </aside>
    </>
  );
}
