export type SetPrice = { qty: number; price: number; priceMax?: number };

export type StoreItem = {
  id: number;
  name: string;
  desc: string;
  oldPrice: string | null;
  img: string;
  sets: SetPrice[];
};

export const CONTACT_URL = "https://t.me/Tradev14";
export const FALLBACK_IMG = "https://cdn-icons-png.flaticon.com/512/679/679720.png";

export const fmtPrice = (x: { price: number; priceMax?: number }) =>
  x.priceMax ? `${x.price}៛ - ${x.priceMax}៛` : `${x.price}៛`;

// set 1..7 = unit price x qty (set 7 can have its own special price)
export const makeSets = (unit: number, unitMax?: number, seven?: number): SetPrice[] =>
  Array.from({ length: 7 }, (_, i) => {
    const qty = i + 1;
    const s: SetPrice = {
      qty,
      price: qty === 7 && seven ? seven : unit * qty,
    };
    if (unitMax) s.priceMax = unitMax * qty;
    return s;
  });
