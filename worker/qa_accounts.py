"""Uji akun production: owner full access, demo read-only, akun lama mati."""
import json
import sys
import urllib.error
import urllib.request

BASE = "https://sarpras.heinrichraxwell.my.id"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
H = {"User-Agent": UA, "Accept": "application/json",
     "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
     "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
     "Sec-CH-UA-Platform": '"Windows"', "Sec-CH-UA-Mobile": "?0"}
fails = []


def call(method, path, body=None, token=None):
    h = dict(H)
    if token:
        h["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


def check(label, got, want):
    ok = got == want
    print(("  OK   " if ok else "  FAIL ") + f"{label}  status={got} (harus {want})")
    if not ok:
        fails.append(label)


creds = json.load(open(sys.argv[1], encoding="utf-8"))
owner_pw = sys.stdin.readline().strip()

print("=== akun lama harus mati ===")
for u, p in [("admin", "admin123"), ("petugas", "petugas123"), ("pimpinan", "pimpinan123")]:
    st, _ = call("POST", "/api/auth/login", {"username": u, "password": p})
    check(f"login {u} ditolak", st, 401)

print("\n=== owner Raxwell ===")
st, j = call("POST", "/api/auth/login", {"username": "Raxwell", "password": owner_pw})
check("login Raxwell", st, 200)
owner = j.get("token")
st, j = call("GET", "/api/auth/me", token=owner)
check("me Raxwell", st, 200)
print("     role =", j.get("user", {}).get("role"), "| nama =", j.get("user", {}).get("nama"))
st, _ = call("GET", "/api/users", token=owner)
check("Raxwell lihat daftar pengguna", st, 200)
st, _ = call("GET", "/api/audit?limit=3", token=owner)
check("Raxwell lihat audit", st, 200)
st, _ = call("GET", "/api/dashboard", token=owner)
check("Raxwell dashboard", st, 200)

print("\n=== demo: baca boleh, tulis ditolak ===")
READS = ["/api/dashboard", "/api/aset", "/api/kategori", "/api/lokasi", "/api/sumber-dana",
         "/api/peminjaman", "/api/servis", "/api/mutasi", "/api/verifikasi",
         "/api/gudang-transit", "/api/penyusutan?year=2026", "/api/penghapusan", "/api/kir/5"]
WRITES = [
    ("POST", "/api/kategori", {"nama": "Uji-Coba-Tulis"}),
    ("POST", "/api/aset", {"nama": "Uji-Coba", "kategori_id": 1}),
    ("POST", "/api/lokasi", {"nama": "Uji-Lokasi"}),
    ("POST", "/api/peminjaman", {"aset_kode": "AM-2023-0001", "peminjam": "X", "tgl_kembali_rencana": "2030-01-01"}),
    ("POST", "/api/servis", {"aset_kode": "AM-2023-0001", "jenis": "Kuratif"}),
    ("POST", "/api/mutasi", {"aset_kode": "AM-2023-0001", "lokasi_tujuan_id": 6}),
    ("POST", "/api/verifikasi", {"kode": "OPN-UJI", "nama": "Uji"}),
    ("POST", "/api/gudang-transit", {"nama_barang": "Uji-Barang"}),
    ("POST", "/api/penyusutan/compute", {"tahun": 2026}),
    ("POST", "/api/penghapusan", {"aset_kode": "AM-2023-0001", "metode": "Musnah"}),
    ("PUT", "/api/aset/AM-2023-0001", {"nama": "Diubah-Paksa"}),
    ("DELETE", "/api/aset/AM-2023-0001?hard=true", None),
    ("DELETE", "/api/kategori/1", None),
    ("PATCH", "/api/servis/1/status", {"status": "Selesai"}),
    ("POST", "/api/auth/change-password", {"oldPassword": "x", "newPassword": "passwordbaru123"}),
    ("POST", "/api/users", {"username": "coba-bikin", "password": "rahasia123", "nama": "X"}),
    ("PATCH", "/api/users/4/toggle", {}),
]

for d in creds["demos"]:
    st, j = call("POST", "/api/auth/login", {"username": d["username"], "password": d["password"]})
    check(f"login {d['username']}", st, 200)
    tok = j.get("token")
    print(f"  --- {d['username']} ({d['role']}) ---")
    for path in READS:
        st, _ = call("GET", path, token=tok)
        check(f"{d['username']} GET {path.split('?')[0]}", st, 200)
    for method, path, body in WRITES:
        st, _ = call(method, path, body, token=tok)
        check(f"{d['username']} {method} {path.split('?')[0]}", st, 403)

print("\n=== integritas data setelah percobaan tulis ===")
st, j = call("GET", "/api/dashboard", token=owner)
t = j.get("data", {}).get("totals", {})
check("total aset tetap 8", t.get("total_aset"), 8)
check("nilai tetap 294300000", t.get("total_nilai_perolehan"), 294300000)
st, j = call("GET", "/api/users", token=owner)
names = sorted(u["username"] for u in j.get("data", []))
check("daftar akun tidak bertambah", names, ["Raxwell", "demo-admin", "demo-petugas", "demo-pimpinan"])

print()
if fails:
    print(f"GAGAL {len(fails)}: {fails[:12]}")
    sys.exit(1)
print("SEMUA PASS")