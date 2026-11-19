"""Bersihkan sisa data smoke test (prefix QA-) dari D1 production.
Hanya menghapus baris yang jelas dibuat QA; data seed asli tidak disentuh.
"""
import json
import sys
import urllib.request
import urllib.error

BASE = "https://sarpras.heinrichraxwell.my.id"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
H = {
    "User-Agent": UA,
    "Accept": "application/json",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "Sec-CH-UA-Platform": '"Windows"', "Sec-CH-UA-Mobile": "?0",
}
TOKEN = None


def call(method, path, body=None):
    h = dict(H)
    if TOKEN:
        h["Authorization"] = "Bearer " + TOKEN
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


st, j = call("POST", "/api/auth/login", {"username": "admin", "password": "admin123"})
TOKEN = j.get("token")
if not TOKEN:
    print("login gagal", st, j)
    sys.exit(1)
print("login OK")

removed = {"aset": 0, "lokasi": 0, "kategori": 0, "sumber_dana": 0, "gudang": 0, "verifikasi": 0}

# Aset QA (hard delete agar anak-anaknya ikut bersih)
st, j = call("GET", "/api/aset?search=QA-&limit=500")
for a in j.get("data", []):
    if a["nama"].startswith("QA-") or a["nama"].startswith("QA "):
        s, _ = call("DELETE", f"/api/aset/{a['kode']}?hard=true")
        print("aset", a["kode"], a["nama"][:40], s)
        if s == 200:
            removed["aset"] += 1

# Barang transit QA
st, j = call("GET", "/api/gudang-transit?search=QA-&limit=500")
qa_gt = [g for g in j.get("data", []) if g["nama_barang"].startswith("QA-")]
print("gudang transit QA tersisa:", len(qa_gt), "(tidak ada endpoint delete; dibiarkan tercatat)")

# Sesi verifikasi QA
st, j = call("GET", "/api/verifikasi?search=QA-&limit=500")
for v in j.get("data", []):
    if v["kode"].startswith("OPN-QA-") or v["nama"].startswith("QA"):
        s, _ = call("DELETE", f"/api/verifikasi/{v['id']}")
        print("verifikasi", v["kode"], s)
        if s == 200:
            removed["verifikasi"] += 1

# Lokasi QA: anak dulu, lalu induk
st, j = call("GET", "/api/lokasi?search=QA-&limit=500")
locs = [l for l in j.get("data", []) if l["nama"].startswith("QA-")]
for l in sorted(locs, key=lambda x: (x.get("parent_id") is None, x["id"])):
    s, r = call("DELETE", f"/api/lokasi/{l['id']}")
    print("lokasi", l["nama"][:34], s, r.get("error", ""))
    if s == 200:
        removed["lokasi"] += 1

st, j = call("GET", "/api/kategori?search=QA-&limit=500")
for k in [x for x in j.get("data", []) if x["nama"].startswith("QA-")]:
    s, r = call("DELETE", f"/api/kategori/{k['id']}")
    print("kategori", k["nama"][:34], s, r.get("error", ""))
    if s == 200:
        removed["kategori"] += 1

st, j = call("GET", "/api/sumber-dana?search=QA-&limit=500")
for sd in [x for x in j.get("data", []) if x["nama"].startswith("QA-")]:
    s, r = call("DELETE", f"/api/sumber-dana/{sd['id']}")
    print("sumber-dana", sd["nama"][:34], s, r.get("error", ""))
    if s == 200:
        removed["sumber_dana"] += 1

print("\ndihapus:", removed)
st, j = call("GET", "/api/dashboard")
t = j.get("data", {}).get("totals", {})
print("total_aset sekarang:", t.get("total_aset"), "| nilai:", t.get("total_nilai_perolehan"))