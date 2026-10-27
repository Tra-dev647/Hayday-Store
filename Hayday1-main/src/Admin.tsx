import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { fetchProducts, postAdmin, uploadImage } from "./api";
import productsData from "./products.json";
import { FALLBACK_IMG, fmtPrice, makeSets } from "./types";
import type { StoreItem } from "./types";

const KEY_STORE = "hd_admin_key";

const deployed = productsData as unknown as StoreItem[];

// Shrink a photo in the browser (max 900px JPEG) before uploading
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 900;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("canvas"));
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });
}

type Form = {
  name: string;
  desc: string;
  img: string;
  unit: string;
  unitMax: string;
  seven: string;
  oldPrice: string;
};

const emptyForm: Form = { name: "", desc: "", img: "", unit: "", unitMax: "", seven: "", oldPrice: "" };

function toForm(it: StoreItem): Form {
  const first = it.sets[0];
  const last = it.sets[6];
  const unit = first ? first.price : 0;
  const seven = last && last.price !== unit * 7 ? String(last.price) : "";
  return {
    name: it.name,
    desc: it.desc,
    img: it.img,
    unit: String(unit || ""),
    unitMax: first?.priceMax ? String(first.priceMax) : "",
    seven,
    oldPrice: it.oldPrice ?? "",
  };
}

export default function Admin() {
  const [adminKey, setAdminKey] = useState(() => {
    try {
      return sessionStorage.getItem(KEY_STORE) || "";
    } catch {
      return "";
    }
  });
  const authed = adminKey !== "";
  const [pw, setPw] = useState("");
  const [items, setItems] = useState<StoreItem[]>(deployed);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchProducts().then((live) => {
      if (alive && live) setItems(live);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Save to server: live on the website immediately
  const persist = async (next: StoreItem[], okMsg: string) => {
    const prev = items;
    setItems(next);
    setBusy(true);
    const r = await postAdmin(adminKey, next);
    setBusy(false);
    if (r.ok) {
      setMsg(okMsg);
    } else {
      setItems(prev);
      setMsg("❌ " + (r.error || "រក្សាទុកមិនបាន"));
    }
  };

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg("⏳ កំពុង upload រូប...");
    try {
      const dataUrl = await compressImage(file);
      const r = await uploadImage(adminKey, dataUrl);
      if (r.ok && r.url) {
        setForm((f) => ({ ...f, img: r.url as string }));
        setMsg("✅ បាន upload រូបរួច សូមចុច «បន្ថែម/រក្សាទុក»");
      } else {
        setMsg("❌ " + (r.error || "upload រូបមិនបាន"));
      }
    } catch {
      setMsg("❌ មិនអាចអានរូបនេះបានទេ");
    }
    setBusy(false);
  };

  const login = async () => {
    setBusy(true);
    const r = await postAdmin(pw);
    setBusy(false);
    if (r.ok) {
      try {
        sessionStorage.setItem(KEY_STORE, pw);
      } catch {
        /* ignore */
      }
      setAdminKey(pw);
      setMsg("");
    } else {
      setMsg("❌ " + (r.error || "Key មិនត្រឹមត្រូវ"));
    }
  };

  const save = () => {
    const unit = Number(form.unit);
    const unitMax = form.unitMax ? Number(form.unitMax) : undefined;
    const seven = form.seven ? Number(form.seven) : undefined;
    if (!form.name.trim()) return setMsg("សូមបញ្ចូលឈ្មោះទំនិញ");
    if (!unit || unit <= 0) return setMsg("សូមបញ្ចូលតម្លៃ 1 set (ជាលេខ)");
    const base = {
      name: form.name.trim(),
      desc: form.desc.trim(),
      img: form.img.trim() || FALLBACK_IMG,
      oldPrice: form.oldPrice.trim() || null,
      sets: makeSets(unit, unitMax, seven),
    };
    if (editId === null) {
      const id = items.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      persist([...items, { id, ...base }], "✅ បានបន្ថែម ហើយបង្ហាញលើគេហទំព័ររួច");
    } else {
      persist(
        items.map((x) => (x.id === editId ? { id: x.id, ...base } : x)),
        "✅ បានកែប្រែ ហើយបង្ហាញលើគេហទំព័ររួច"
      );
    }
    setForm(emptyForm);
    setEditId(null);
  };

  const edit = (it: StoreItem) => {
    setEditId(it.id);
    setForm(toForm(it));
    setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = (it: StoreItem) => {
    if (window.confirm(`លុប "${it.name}" ?`)) {
      persist(items.filter((x) => x.id !== it.id), "✅ បានលុបរួច");
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    persist(next, "✅ បានប្តូរលំដាប់រួច");
  };

  const reset = () => {
    if (window.confirm("ត្រឡប់ទៅទំនិញដើម (ពេលដំឡើងដំបូង)?")) {
      persist(deployed, "✅ បានត្រឡប់ទៅទំនិញដើមរួច");
      setForm(emptyForm);
      setEditId(null);
    }
  };

  if (!authed) {
    return (
      <div className="adm-wrap">
        <div className="adm-card">
          <h2 className="adm-title">🔐 Admin</h2>
          <input
            className="adm-input"
            type="password"
            placeholder="Key"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
          <button className="adm-btn adm-green" onClick={login} disabled={busy}>
            ចូល
          </button>
          {msg && <p className="adm-msg">{msg}</p>}
          <a className="adm-link" href="#">
            ← ត្រឡប់ទៅហាង
          </a>
        </div>
      </div>
    );
  }

  const field = (label: string, key: keyof Form, props: { placeholder?: string; inputMode?: "numeric" } = {}) => (
    <label className="adm-label">
      {label}
      <input
        className="adm-input"
        value={form[key]}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="adm-wrap">
      <div className="adm-card">
        <h2 className="adm-title">🛠️ Admin · Hayday Store</h2>
        <a className="adm-link" href="#">
          ← ត្រឡប់ទៅហាង
        </a>

        <h3 className="adm-sub">{editId === null ? "➕ បន្ថែមទំនិញថ្មី" : "✏️ កែប្រែទំនិញ"}</h3>
        {field("ឈ្មោះទំនិញ", "name")}
        <label className="adm-label">
          ការពិពណ៌នា
          <textarea
            className="adm-input"
            rows={3}
            value={form.desc}
            onChange={(e) => setForm({ ...form, desc: e.target.value })}
          />
        </label>
        <div className="adm-label">
          រូបភាព
          {form.img && <img className="adm-preview" src={form.img} alt="" />}
          <label className="adm-btn adm-blue adm-upload">
            📷 ជ្រើសរូបពីទូរស័ព្ទ
            <input type="file" accept="image/*" onChange={onPickImage} disabled={busy} hidden />
          </label>
        </div>
        {field("ឬដាក់តំណរូបភាព (URL)", "img", { placeholder: "https://..." })}
        {field("តម្លៃ 1 set (៛)", "unit", { inputMode: "numeric", placeholder: "700" })}
        {field("តម្លៃខ្ពស់បំផុត 1 set (ទុកទទេ បើតម្លៃតែមួយ)", "unitMax", { inputMode: "numeric" })}
        {field("តម្លៃ 7 set ពិសេស (ទុកទទេ បើគុណធម្មតា)", "seven", { inputMode: "numeric", placeholder: "4800" })}
        {field("តម្លៃចាស់ (ឧ. 1000៛ ទុកទទេ បើគ្មាន)", "oldPrice")}

        <div className="adm-row">
          <button className="adm-btn adm-green" onClick={save} disabled={busy}>
            {editId === null ? "បន្ថែម" : "រក្សាទុក"}
          </button>
          {editId !== null && (
            <button
              className="adm-btn adm-gray"
              onClick={() => {
                setEditId(null);
                setForm(emptyForm);
              }}
            >
              បោះបង់
            </button>
          )}
        </div>
        {msg && <p className="adm-msg">{msg}</p>}

        <h3 className="adm-sub">📦 ទំនិញទាំងអស់ ({items.length})</h3>
        {items.map((it, idx) => (
          <div className="adm-item" key={it.id}>
            <img
              src={it.img}
              alt=""
              onError={(e) => {
                e.currentTarget.src = FALLBACK_IMG;
              }}
            />
            <div className="adm-item-info">
              <b>{it.name}</b>
              <span>{it.sets[0] ? fmtPrice(it.sets[0]) : ""} / 1 set</span>
              <div className="adm-row">
                <button className="adm-mini" onClick={() => move(idx, -1)}>↑</button>
                <button className="adm-mini" onClick={() => move(idx, 1)}>↓</button>
                <button className="adm-mini" onClick={() => edit(it)}>កែ</button>
                <button className="adm-mini adm-red" onClick={() => remove(it)}>លុប</button>
              </div>
            </div>
          </div>
        ))}

        <button className="adm-btn adm-gray" onClick={reset}>
          ↩︎ ត្រឡប់ទៅទំនិញដើម
        </button>
      </div>
    </div>
  );
}
