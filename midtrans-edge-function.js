// ============================================================
// TEMAN MANDI - Supabase Edge Function: Midtrans Token
//
// CARA DEPLOY:
// 1. Install Supabase CLI: npm i -g supabase
// 2. supabase functions new midtrans-token
// 3. Copy isi file ini ke supabase/functions/midtrans-token/index.ts
// 4. Set secret: supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
// 5. supabase functions deploy midtrans-token
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { order_no, amount, customer, items, shipping_cost } = body;

    const SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY") || "";
    const isProduction = !SERVER_KEY.startsWith("SB-");
    const baseUrl = isProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    // Build Midtrans payload
    const payload = {
      transaction_details: {
        order_id: order_no,
        gross_amount: amount,
      },
      customer_details: {
        first_name: customer.name,
        phone: customer.phone,
        shipping_address: { address: customer.address },
      },
      item_details: [
        ...items.map(i => ({
          id: String(i.id || i.name),
          price: i.price,
          quantity: i.qty,
          name: i.name + (i.variant ? " (" + i.variant + ")" : ""),
        })),
        {
          id: "ONGKIR",
          price: shipping_cost,
          quantity: 1,
          name: "Ongkos Kirim JNE",
        },
      ],
      enabled_payments: [
        "gopay", "shopeepay", "other_qris",
        "bca_va", "bni_va", "bri_va", "mandiri_bill", "permata_va",
        "credit_card",
      ],
      callbacks: {
        finish: "https://theotenly.github.io/temanmandi/?order=" + order_no,
      },
    };

    const auth = btoa(SERVER_KEY + ":");
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + auth,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    // Save order to Supabase
    const sbUrl  = Deno.env.get("SUPABASE_URL") || "";
    const sbKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (sbUrl && sbKey) {
      const supabase = createClient(sbUrl, sbKey);
      await supabase.from("orders").insert({
        order_no,
        status: "pending",
        payment_status: "unpaid",
        customer_name:    customer.name,
        customer_phone:   customer.phone,
        customer_address: customer.address,
        shipping_method:  customer.kirim || "reguler",
        notes:            customer.catatan || "",
        items:            items,
        subtotal:         amount - shipping_cost,
        shipping_cost:    shipping_cost,
        total:            amount,
        courier:          "JNE",
      });
    }

    return new Response(JSON.stringify({ token: data.token, redirect_url: data.redirect_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
