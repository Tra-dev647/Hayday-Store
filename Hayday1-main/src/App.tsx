import { useEffect, useRef, useState } from "react";
import Admin from "./Admin";
import productsData from "./products.json";
import { fetchProducts } from "./api";
import { FALLBACK_IMG, fmtPrice } from "./types";
import type { StoreItem } from "./types";

const defaultItems = productsData as unknown as StoreItem[];

type CheckoutSelection = { item: StoreItem; qty: number; amount: number };

function StoreCard({ item, delay, onBuy }: { item: StoreItem; delay: number; onBuy: (selection: CheckoutSelection) => void }) {
  const [qty, setQty] = useState(1);
  const picked = item.sets?.find((x) => x.qty === qty);
  const fmt = fmtPrice;
  const priceText = picked ? fmt(picked) : "";

  return (
    <div className="store-item" style={{ animationDelay: `${delay}s` }}>
      <div className="store-img-wrapper">
        <img src={item.img} alt={item.name} className="store-img" onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }} />
        {item.oldPrice && <span className="sale-badge">SALE</span>}
      </div>
      <div className="store-info">
        <h3>{item.name}</h3>
        <p>{item.desc}</p>
        {item.sets.length > 0 && (
          <div className="set-picker">
            <span className="set-label">ជ្រើស set:</span>
            <div className="set-chips">
              {item.sets.map((x) => <button key={x.qty} type="button" className={`set-chip${x.qty === qty ? " active" : ""}`} onClick={() => setQty(x.qty)}>{x.qty}</button>)}
            </div>
          </div>
        )}
        <div className="store-bottom">
          <div className="price-box">
            <span className="price-tag"><span className="coin">🪙</span> {priceText}</span>
            {item.oldPrice && qty === 1 && <span className="old-price">{item.oldPrice}</span>}
          </div>
          <button type="button" className="buy-btn" disabled={!picked} onClick={() => picked && onBuy({ item, qty, amount: picked.price })}>🛍️ ទិញ</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  const [storeItems, setStoreItems] = useState<StoreItem[]>(defaultItems);
  const [selection, setSelection] = useState<CheckoutSelection | null>(null);
  const [buyerId, setBuyerId] = useState("");
  const [chosenAmount, setChosenAmount] = useState(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [payment, setPayment] = useState<{ qr: string; md5: string; amount: number; billNumber: string } | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [paid, setPaid] = useState(false);

  const startCheckout = (next: CheckoutSelection) => {
    setSelection(next);
    setChosenAmount(next.amount);
    setBuyerId("");
    setCheckoutError("");
    setPayment(null);
    setVerifyMessage("");
    setPaid(false);
  };

  const createPayment = async () => {
    if (!selection) return;
    if (!buyerId.trim()) { setCheckoutError("សូមបញ្ចូល ID ក្នុងហ្គេម ឬ Telegram របស់អ្នក"); return; }
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const r = await fetch("/api/bakong-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selection.item.id, itemName: selection.item.name, qty: selection.qty, amount: chosenAmount, buyerId: buyerId.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "មិនអាចបង្កើត QR បានទេ");
      setPayment({ qr: data.qr, md5: data.md5, amount: data.amount, billNumber: data.billNumber });
      setVerifyMessage("");
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "មានបញ្ហា សូមព្យាយាមម្តងទៀត");
    } finally { setCheckoutBusy(false); }
  };
  const verifyPayment = async () => {
    if (!payment) return;
    setVerifyBusy(true);
    setVerifyMessage("");
    try {
      const r = await fetch("/api/bakong-verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md5: payment.md5, billNumber: payment.billNumber, buyerId: buyerId.trim(), amount: payment.amount }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "មិនអាចផ្ទៀងផ្ទាត់ការបង់ប្រាក់បានទេ");
      if (data.paid) {
        setPaid(true);
        setVerifyMessage("បានទទួលការបង់ប្រាក់ជោគជ័យ! យើងបានទទួលការបញ្ជាទិញរបស់អ្នកហើយ។");
      } else {
        setVerifyMessage(data.message || "មិនទាន់ឃើញការបង់ប្រាក់ទេ។ សូមរង់ចាំបន្តិច រួចចុចពិនិត្យម្តងទៀត។");
      }
    } catch (e) {
      setVerifyMessage(e instanceof Error ? e.message : "មានបញ្ហា សូមព្យាយាមម្តងទៀត");
    } finally { setVerifyBusy(false); }
  };

  useEffect(() => {
    let alive = true;
    fetchProducts().then((live) => {
      if (alive && live) setStoreItems(live);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Automatically check the Bakong transaction while the QR checkout is open.
  // Once the official Bakong API confirms payment, redirect the buyer to the one-time Telegram invite.
  useEffect(() => {
    if (!payment || paid) return;
    let stopped = false;
    let checking = false;
    const checkPaid = async () => {
      if (stopped || checking) return;
      checking = true;
      try {
        const r = await fetch("/api/bakong-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ md5: payment.md5, billNumber: payment.billNumber, buyerId: buyerId.trim(), amount: payment.amount }),
        });
        const data = await r.json().catch(() => ({}));
        if (stopped) return;
        if (r.ok && data.paid) {
          setPaid(true);
          setVerifyMessage("បានទទួលការបង់ប្រាក់ជោគជ័យ! យើងបានទទួលការបញ្ជាទិញរបស់អ្នកហើយ។");
        } else if (r.ok) {
          setVerifyMessage("កំពុងរង់ចាំការបង់ប្រាក់… បន្ទាប់ពីបង់រួច ប្រព័ន្ធនឹងទទួលការបញ្ជាទិញដោយស្វ័យប្រវត្តិ។");
        }
      } catch {
        if (!stopped) setVerifyMessage("កំពុងពិនិត្យការបង់ប្រាក់ឡើងវិញដោយស្វ័យប្រវត្តិ…");
      } finally {
        checking = false;
      }
    };
    void checkPaid();
    const timer = window.setInterval(() => { void checkPaid(); }, 4000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [payment, paid, buyerId]);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Secret entry: tap the cat's tongue 7 times quickly to open Admin
  const taps = useRef({ count: 0, last: 0 });
  const onSecretTap = () => {
    const now = Date.now();
    const t = taps.current;
    t.count = now - t.last > 1500 ? 1 : t.count + 1;
    t.last = now;
    if (t.count >= 7) {
      t.count = 0;
      window.location.hash = "#admin";
    }
  };

  if (route === "#admin") return <Admin />;

  return (
    <div className="app">
      <div className="secret-spot" onClick={onSecretTap} />
      <div className="sky">
        <div className="sun">🌞</div>
        <div className="cloud cloud-1">☁️</div>
        <div className="cloud cloud-2">☁️</div>
        <div className="cloud cloud-3">☁️</div>
        <div className="cloud cloud-4">☁️</div>
      </div>

      <div className="bio-card">
        <div className="store-section">
          <h2 className="store-title">🛒 Hayday Store</h2>
          <div className="store-grid">
            {storeItems.map((item, i) => (
              <StoreCard key={item.id} item={item} delay={1 + 0.15 * i} onBuy={startCheckout} />
            ))}
          </div>
        </div>

      </div>

      {selection && (
        <div className="checkout-overlay" role="dialog" aria-modal="true" aria-label="Bakong checkout">
          <div className="checkout-modal">
            <button type="button" className="checkout-close" aria-label="បិទ" onClick={() => { setSelection(null); setPayment(null); }}>×</button>
            <h2>💳 បង់ប្រាក់តាម Bakong KHQR</h2>
            <p className="checkout-product">{selection.item.name} · {selection.qty} set</p>
            {!payment ? (
              <>
                {selection.item.sets.find((x) => x.qty === selection.qty)?.priceMax ? (
                  <label className="checkout-label">ជ្រើសតម្លៃដែលត្រូវបង់
                    <select className="checkout-input" value={chosenAmount} onChange={(e) => setChosenAmount(Number(e.target.value))}>
                      {[selection.item.sets.find((x) => x.qty === selection.qty)!.price, selection.item.sets.find((x) => x.qty === selection.qty)!.priceMax!].map((v) => <option key={v} value={v}>{v.toLocaleString()} ៛</option>)}
                    </select>
                  </label>
                ) : <p className="checkout-total">សរុប៖ {chosenAmount.toLocaleString()} ៛</p>}
                <label className="checkout-label">ID ក្នុងហ្គេម ឬ Telegram
                  <input className="checkout-input" value={buyerId} onChange={(e) => setBuyerId(e.target.value)} placeholder="បញ្ចូល ID របស់អ្នក" maxLength={80} />
                </label>
                {checkoutError && <p className="checkout-error">{checkoutError}</p>}
                <button type="button" className="checkout-submit" onClick={createPayment} disabled={checkoutBusy}>{checkoutBusy ? "កំពុងបង្កើត QR…" : "បង្កើត QR បង់ប្រាក់"}</button>
                <p className="checkout-hint">QR នឹងបង្ហាញតម្លៃតាម set ដែលអ្នកបានជ្រើស។</p>
              </>
            ) : (
              <>
                <p className="checkout-total">សូមស្កេន QR ដើម្បីបង់ {payment.amount.toLocaleString()} ៛</p>
                <img className="checkout-qr" alt="Bakong KHQR payment" src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payment.qr)}`} />
                <p className="checkout-hint">បើកកម្មវិធី Bakong ឬ Mobile Banking ដែលគាំទ្រ KHQR ហើយស្កេន QR នេះ។ បន្ទាប់ពីបង់ប្រាក់ជោគជ័យ ប្រព័ន្ធនឹងពិនិត្យដោយស្វ័យប្រវត្តិ ហើយទទួលការបញ្ជាទិញរបស់អ្នក។</p>
                <p className="checkout-hint">លេខបញ្ជាទិញ៖ {payment.billNumber}</p>
                {!paid ? <button type="button" className="checkout-submit" onClick={verifyPayment} disabled={verifyBusy}>{verifyBusy ? "កំពុងពិនិត្យការបង់ប្រាក់…" : "ពិនិត្យការបង់ប្រាក់ឥឡូវនេះ"}</button> : <p className="checkout-total">✅ បង់ប្រាក់ជោគជ័យ!</p>}
                {verifyMessage && <p className="checkout-hint" role="status">{verifyMessage}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
