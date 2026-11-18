"""Smoke test CRUD menyeluruh — SARPRAS API. Jalankan: python qa_smoke.py"""
import json, random, urllib.request, urllib.error

B = "http://localhost:8080/api"
FAIL = []

def call(m, p, body=None, token=None):
    d = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = "Bearer " + token
    q = urllib.request.Request(B + p, data=d, headers=h, method=m)
    try:
        with urllib.request.urlopen(q) as x:
            return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"raw": raw[:200].decode("utf-8", "replace")}

def check(label, ok, extra=""):
    print(("  OK   " if ok else "  FAIL ") + label + (f"  {extra}" if extra else ""))
    if not ok:
        FAIL.append(label)

s, r = call("POST", "/auth/login", {"username": "admin", "password": "admin123"})
T = r.get("token")
check("login admin", s == 200 and bool(T), f"status={s}")
if not T:
    raise SystemExit("login gagal — stop")

s, me = call("GET", "/auth/me", token=T)
check("auth/me", s == 200 and me.get("user", {}).get("role") == "admin", f"status={s}")

# --- master data ---
uid = random.randint(10000, 99999)
s, r = call("GET", "/kategori?limit=1", token=T);   kat = r["data"][0]["id"]
s, r = call("GET", "/lokasi?limit=1", token=T);     lok = r["data"][0]["id"]
s, r = call("GET", "/sumber-dana?limit=1", token=T); dan = r["data"][0]["id"]
check("list master (kategori/lokasi/sumber-dana)", all([kat, lok, dan]))

# --- kategori CRUD ---
s, r = call("POST", "/kategori", {"nama": f"QA-Kat-{uid}"}, token=T)
kid = r.get("data", {}).get("id")
check("kategori CREATE", s == 201 and kid, f"status={s}")
s, _ = call("PUT", f"/kategori/{kid}", {"nama": f"QA-Kat-{uid}-E"}, token=T)
check("kategori UPDATE", s == 200, f"status={s}")
s, _ = call("DELETE", f"/kategori/{kid}", token=T)
check("kategori DELETE", s in (200, 204), f"status={s}")

# --- lokasi CRUD ---
s, r = call("POST", "/lokasi", {"nama": f"QA-Lok-{uid}", "gedung": "A"}, token=T)
lid2 = r.get("data", {}).get("id")
check("lokasi CREATE", s == 201 and lid2, f"status={s}")
s, _ = call("PUT", f"/lokasi/{lid2}", {"nama": f"QA-Lok-{uid}-E"}, token=T)
check("lokasi UPDATE", s == 200, f"status={s}")
s, _ = call("DELETE", f"/lokasi/{lid2}", token=T)
check("lokasi DELETE", s in (200, 204), f"status={s}")

# --- aset full CRUD + detail ---
payload = {"nama": f"QA-Aset-{uid}", "kategori_id": kat, "lokasi_id": lok, "sumber_dana_id": dan,
           "nilai_perolehan": 5000000, "tanggal_perolehan": "2026-01-15", "status": "Aktif",
           "kondisi": "Baik", "merk": "QA", "tipe": "T1", "no_seri": f"SN{uid}", "spesifikasi": "test"}
s, r = call("POST", "/aset", payload, token=T)
kode = r.get("data", {}).get("kode")
check("aset CREATE", s == 201 and bool(kode), f"status={s} kode={kode}")

s, r = call("GET", f"/aset/{kode}/detail", token=T)
a = r.get("data", {}).get("aset", {})
check("aset DETAIL (tombol mata)", s == 200 and a.get("nama") == payload["nama"],
      f"status={s} nama={a.get('nama')}")

s, r = call("PUT", f"/aset/{kode}", {**payload, "nama": payload["nama"] + "-E"}, token=T)
check("aset UPDATE (pensil)", s == 200, f"status={s}")
s, r = call("GET", f"/aset/{kode}/detail", token=T)
check("aset UPDATE persist", r.get("data", {}).get("aset", {}).get("nama", "").endswith("-E"))

s, r = call("GET", "/aset?search=" + payload["nama"], token=T)
check("aset SEARCH", s == 200 and r.get("meta", {}).get("total", 0) >= 1,
      f"total={r.get('meta', {}).get('total')}")

# --- validasi harus menolak ---
s, r = call("POST", "/aset", {"nama": ""}, token=T)
check("validasi tolak nama kosong (400)", s == 400, f"status={s} err={str(r.get('error'))[:60]}")

# --- peminjaman ---
s, r = call("POST", "/peminjaman", {"aset_kode": kode, "peminjam": f"QA-{uid}",
                                   "tgl_pinjam": "2026-02-01", "tgl_kembali_rencana": "2026-02-10"}, token=T)
pinjam = r.get("data", {}).get("id")
check("peminjaman CREATE", s == 201 and pinjam, f"status={s} err={str(r.get('error'))[:60]}")

# --- servis ---
s, r = call("POST", "/servis", {"aset_kode": kode, "jenis": "Preventif", "tgl_servis": "2026-02-05",
                                 "deskripsi": "QA servis", "biaya": 100000}, token=T)
check("servis CREATE", s == 201, f"status={s} err={str(r.get('error'))[:60]}")

# --- dokumen ---
s, r = call("POST", f"/dokumen/{kode}", {"jenis": "Faktur", "nama_file": "faktur.pdf",
                                          "url": "https://example.com/faktur.pdf"}, token=T)
check("dokumen CREATE", s == 201, f"status={s} err={str(r.get('error'))[:60]}")
s, r = call("POST", f"/dokumen/{kode}", {"jenis": "Ngawur", "nama_file": "x", "url": "u"}, token=T)
check("dokumen tolak jenis invalid (400)", s == 400, f"status={s}")

# --- dashboard & laporan ---
for ep in ["/dashboard", f"/kir/{lok}", "/audit?limit=3"]:
    s, r = call("GET", ep, token=T)
    check(f"GET {ep}", s == 200, f"status={s}")

# --- otorisasi: tanpa token harus 401 ---
s, _ = call("GET", "/aset")
check("tanpa token ditolak (401)", s == 401, f"status={s}")

# --- cleanup aset ---
s, _ = call("DELETE", f"/aset/{kode}?hard=true", token=T)
check("aset DELETE hard", s == 200, f"status={s}")

print()
if FAIL:
    print(f"GAGAL {len(FAIL)}: {FAIL}")
    raise SystemExit(1)
print("SEMUA PASS")
