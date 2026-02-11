import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// CORS (Shoptet stránka musí vedieť volať tvoj endpoint)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const API = "https://api.myshoptet.com/api";
const TOKEN = process.env.SHOPTET_PRIVATE_TOKEN;
const TEMPLATE = process.env.SHOPTET_TEMPLATE_GUID;

function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}
function genCode() {
  return "MIX" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

async function apiGet(path) {
  const r = await fetch(API + path, {
    headers: {
      "Content-Type": "application/json",
      "Shoptet-Private-API-Token": TOKEN
    }
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Shoptet-Private-API-Token": TOKEN
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

app.post("/mix-coupon", async (req, res) => {
  try {
    const promoCode = String(req.body.promoCode || "").trim().toUpperCase();
    const boxCount = Math.max(0, Math.min(10, Number(req.body.boxCount || 0)));
    const cartSubtotal = Math.max(0, Number(req.body.cartSubtotal || 0));

    const boxDiscount = 250 * boxCount;

    let promoDiscount = 0;
    if (promoCode) {
      // Detail promo kupónu
      const promo = await apiGet(`/discount-coupons/${encodeURIComponent(promoCode)}`);
      const c = promo?.data?.coupon;

      if (!c?.discountType) {
        return res.status(400).json({ error: "Neplatný promo kupón." });
      }

      if (c.discountType === "fixed") {
        promoDiscount = Number(c.amount || 0);
      } else if (c.discountType === "percentual") {
        const ratio = Number(c.ratio || 0); // napr. 0.1 = 10 %
        promoDiscount = cartSubtotal * ratio;
      } else {
        return res.status(400).json({ error: "Nepodporovaný typ promo kupónu." });
      }
    }

    const totalDiscount = promoDiscount + boxDiscount;
    if (totalDiscount <= 0) return res.json({ code: "" });

    const code = genCode();

   await apiPost("/discount-coupons", {
  data: {
    coupons: [{
      code,
      discountType: "fixed",
      amount: money(totalDiscount),
      currency: "CZK",
      template: TEMPLATE,
      shippingPrice: "cart",  
      reusable: false,
      remark: `MIX promo=${promoCode || "-"}; box=${boxCount}; subtotal=${cartSubtotal}`
    }]
  }
});

    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: "mix-coupon failed", detail: String(e.message || e) });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("MIX API running"));
