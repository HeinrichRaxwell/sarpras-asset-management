"""Smoke test SARPRAS di Cloudflare Workers (local wrangler dev).
Menjalankan CRUD nyata lewat HTTP, bukan mock. Setiap check mencetak status riil.
"""
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-CH-UA-Mobile": "?0",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "application/json",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Dest": "empty",
}
TOKEN = None
fails = []


def call(method, path, body=None, expect=None, label=None, auth=True, raw=False):
    url = BASE + path
    h = dict(HEADERS)
    if TOKEN and auth:
        h["Authorization"] = "Bearer " + TOKEN
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, payload, hdrs = r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        status, payload, hdrs = e.code, e.read(), dict(e.headers)
    except Exception as e:
        status, payload, hdrs = 0, str(e).encode(), {}

    name = label or f"{method} {path}"
    ok = (status == expect) if expect is not None else (200 <= status < 300)
    if raw:
        print(("  OK   " if ok else "  FAIL ") + name + f"  status={status}")
        if not ok:
            fails.append(name)
        return status, payload, hdrs
    try:
        j = json.loads(payload)
    except Exception:
        j = {"_raw": payload[:200].decode(errors="replace")}
    print(("  OK   " if ok else "  FAIL ") + name + f"  status={status}"
          + ("" if ok else f"  body={json.dumps(j)[:220]}"))
    if not ok:
        fails.append(name)
    return status, j, hdrs


print(f"=== smoke {BASE} ===")
call("GET", "/api/health", expect=200, auth=False)

st, j, _ = call("POST", "/api/auth/login", {"username": "admin", "password": "admin123"},
                expect=200, label="login admin", auth=False)
TOKEN = j.get("token")
if not TOKEN:
    print("TOKEN tidak diperoleh, hentikan")
    sys.exit(1)

call("GET", "/api/auth/me", expect=200)
call("GET", "/api/dashboard", expect=200)
call("GET", "/api/kategori", expect=200)
call("GET", "/api/lokasi", expect=200)
call("GET", "/api/lokasi/tree", expect=200)
call("GET", "/api/sumber-dana", expect=200)

suffix = uuid.uuid4().hex[:6]
st, kat, _ = call("POST", "/api/kategori", {"nama": f"QA-Kat-{suffix}"}, expect=201, label="kategori CREATE")
kat_id = kat.get("data", {}).get("id")
call("PUT", f"/api/kategori/{kat_id}", {"deskripsi": "diubah QA"}, expect=200, label="kategori UPDATE")

st, lok, _ = call("POST", "/api/lokasi", {"nama": f"QA-Lok-{suffix}", "gedung": "QA"}, expect=201, label="lokasi CREATE")
lok_id = lok.get("data", {}).get("id")
call("PUT", f"/api/lokasi/{lok_id}", {"lantai": "2"}, expect=200, label="lokasi UPDATE")
call("POST", "/api/lokasi", {"nama": f"QA-Self-{suffix}", "parent_id": lok_id}, expect=201, label="lokasi child CREATE")

st, sd, _ = call("POST", "/api/sumber-dana", {"nama": f"QA-SD-{suffix}", "kode": f"QA{suffix}"}, expect=201, label="sumber-dana CREATE")
sd_id = sd.get("data", {}).get("id")

st, aset, _ = call("POST", "/api/aset",
                   {"nama": f"QA-Aset-{suffix}", "kategori_id": kat_id, "lokasi_id": lok_id,
                    "sumber_dana_id": sd_id, "nilai_perolehan": 1234567},
                   expect=201, label="aset CREATE")
kode = aset.get("data", {}).get("kode")
print("     kode =", kode)
if not kode:
    print("kode aset kosong, hentikan")
    sys.exit(1)

st, det, _ = call("GET", f"/api/aset/{kode}/detail", expect=200, label="aset DETAIL")
print("     detail nama =", det.get("data", {}).get("aset", {}).get("nama"))
call("GET", f"/api/aset/{kode}", expect=200, label="aset GET by kode")
call("PUT", f"/api/aset/{kode}", {"nama": f"QA-Aset-{suffix}-edit"}, expect=200, label="aset UPDATE")
st, chk, _ = call("GET", f"/api/aset/{kode}", expect=200, label="aset UPDATE persist")
print("     nama sekarang =", chk.get("data", {}).get("nama"))
call("GET", f"/api/aset?search=QA-Aset-{suffix}", expect=200, label="aset SEARCH")
call("POST", "/api/aset", {"nama": "", "kategori_id": kat_id}, expect=400, label="validasi nama kosong")
call("POST", "/api/aset", {"nama": "x", "kategori_id": 999999}, expect=400, label="validasi kategori tak ada")

call("POST", "/api/peminjaman", {"aset_kode": kode, "peminjam": "QA", "tgl_kembali_rencana": "2030-01-10"},
     expect=201, label="peminjaman CREATE")
st, pinj, _ = call("GET", f"/api/peminjaman?aset_kode={kode}", expect=200, label="peminjaman LIST")
pid = (pinj.get("data") or [{}])[0].get("id")
call("PATCH", f"/api/peminjaman/{pid}/return", {}, expect=200, label="peminjaman RETURN")

st, srv, _ = call("POST", "/api/servis", {"aset_kode": kode, "jenis": "Preventif", "biaya": 100000},
                  expect=201, label="servis CREATE")
sid = srv.get("data", {}).get("id")
call("PATCH", f"/api/servis/{sid}/status", {"status": "Selesai"}, expect=200, label="servis STATUS")

st, mut, _ = call("POST", "/api/mutasi", {"aset_kode": kode, "lokasi_tujuan_id": lok_id, "alasan": "QA"},
                  expect=201, label="mutasi CREATE")
mid = mut.get("data", {}).get("id")
call("PATCH", f"/api/mutasi/{mid}/approve", {}, expect=200, label="mutasi APPROVE")

st, doc, _ = call("POST", f"/api/dokumen/aset/{kode}",
                  {"jenis": "Faktur", "nama_file": "qa.pdf", "url": "https://example.com/qa.pdf"},
                  expect=201, label="dokumen CREATE")
did = doc.get("data", {}).get("id")
call("GET", f"/api/dokumen/aset/{kode}", expect=200, label="dokumen LIST")
call("POST", f"/api/dokumen/aset/{kode}", {"jenis": "Salah", "nama_file": "x", "url": "y"},
     expect=400, label="dokumen jenis invalid")
call("DELETE", f"/api/dokumen/{did}", expect=200, label="dokumen DELETE")

call("POST", "/api/penyusutan/compute", {"tahun": 2026}, expect=200, label="penyusutan COMPUTE")
call("GET", "/api/penyusutan?year=2026", expect=200, label="penyusutan LIST")
call("GET", f"/api/penyusutan/{kode}", expect=200, label="penyusutan per aset")

st, ph, _ = call("POST", "/api/penghapusan", {"aset_kode": kode, "metode": "Musnah", "alasan": "QA"},
                 expect=201, label="penghapusan CREATE")
phid = ph.get("data", {}).get("id")
st, appr, _ = call("PATCH", f"/api/penghapusan/{phid}/approve", {}, expect=200, label="penghapusan APPROVE")
print("     ketentuan =", appr.get("ketentuan_penghapusan"))

st, gt, _ = call("POST", "/api/gudang-transit", {"nama_barang": f"QA-Barang-{suffix}", "qty": 2},
                 expect=201, label="gudang-transit CREATE")
gtid = gt.get("data", {}).get("id")
st, qc, _ = call("PATCH", f"/api/gudang-transit/{gtid}/qc", {"qc_status": "Lolos", "kategori_id": kat_id,
                                                          "nilai_perolehan": 500000}, expect=200, label="gudang-transit QC Lolos")
qc_kode = qc.get("data", {}).get("aset", {}).get("kode")

st, vf, _ = call("POST", "/api/verifikasi", {"kode": f"OPN-QA-{suffix}", "nama": "QA Opname"},
                 expect=201, label="verifikasi CREATE")
vid = vf.get("data", {}).get("id")
call("POST", f"/api/verifikasi/{vid}/items", {"aset_kode": kode, "ditemukan": True}, expect=201, label="opname item CREATE")
call("GET", f"/api/verifikasi/{vid}/items", expect=200, label="opname item LIST")
call("GET", f"/api/verifikasi/{vid}/summary", expect=200, label="verifikasi SUMMARY")
call("PATCH", f"/api/verifikasi/{vid}/finish", {}, expect=200, label="verifikasi FINISH")
call("DELETE", f"/api/verifikasi/{vid}", expect=200, label="verifikasi DELETE")

call("GET", f"/api/kir/{lok_id}", expect=200, label="KIR json")
call("GET", f"/api/kir/{lok_id}?format=csv", expect=200, label="KIR csv", raw=True)
call("GET", "/api/audit?limit=3", expect=200, label="audit LIST")
call("GET", "/api/users", expect=200, label="users LIST")
call("GET", "/api/aset", expect=401, label="tanpa token ditolak", auth=False)

call("DELETE", f"/api/aset/{kode}?hard=true", expect=200, label="aset DELETE hard")
call("DELETE", f"/api/lokasi/{lok_id}", expect=409, label="lokasi dipakai aset ditolak")
# Aset hasil QC Lolos masih memakai kategori ini; guard 409 harus muncul dulu.
call("DELETE", f"/api/kategori/{kat_id}", expect=409, label="kategori dipakai aset ditolak")
call("DELETE", f"/api/aset/{qc_kode}?hard=true", expect=200, label="aset QC DELETE hard")
call("DELETE", f"/api/kategori/{kat_id}", expect=200, label="kategori DELETE")
call("DELETE", f"/api/sumber-dana/{sd_id}", expect=200, label="sumber-dana DELETE")

st, _body, hdr = call("GET", "/", expect=200, label="SPA index", auth=False, raw=True)
lower = {k.lower(): v for k, v in hdr.items()}
for h in ["x-frame-options", "x-content-type-options", "referrer-policy",
          "permissions-policy", "strict-transport-security", "content-security-policy"]:
    ok = h in lower
    print(("  OK   " if ok else "  FAIL ") + f"header {h}" + (f"  = {lower[h][:60]}" if ok else "  TIDAK ADA"))
    if not ok:
        fails.append(f"header {h}")
csp = lower.get("content-security-policy", "")
for need in ["fonts.googleapis.com", "fonts.gstatic.com"]:
    ok = need in csp
    print(("  OK   " if ok else "  FAIL ") + f"CSP allowlist {need}")
    if not ok:
        fails.append(f"CSP {need}")

print()
if fails:
    print(f"GAGAL {len(fails)}: {fails}")
    sys.exit(1)
print("SEMUA PASS")