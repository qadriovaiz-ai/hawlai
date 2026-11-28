// The QR code a customer scans to pay the seller — the UPI piece of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// AN API ROUTE, NOT A PAGE (Rule 5): it answers with a PNG and nothing
// else. Public, because Instagram fetches an image attachment from its
// URL with no session — and the order's id is a random UUID, so the URL
// is as private as the DM it is sent in.
//
// THE QR HOLDS ONLY WHAT THE DM ALREADY SAYS: the seller's UPI ID, the
// business's name, the amount and the order reference. Nothing about
// the customer.
//
// ONE ANSWER FOR EVERY REFUSAL — 404, the same body. An order that does
// not exist, a website order, one already paid or cancelled, a business
// that switched Seller Mode off or cleared its UPI ID: none of them is
// told apart, so the route cannot be used to learn which ids are real.

import QRCode from "qrcode";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDisplayName } from "@/lib/business/displayName";
import { upiPayLink } from "@/lib/payments/upiRequest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!UUID.test(orderId)) return notFound();

  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, dealership_id, total, channel, payment_status, status")
    .eq("id", orderId)
    .maybeSingle();
  // A FAILED READ IS NOT "NO SUCH ORDER". Said as a 500 so a broken
  // database is not mistaken, in the logs, for a customer with a bad link.
  if (error) return new Response("Couldn't read the order.", { status: 500, headers: { "Cache-Control": "no-store" } });

  // ONLY AN UNPAID DM ORDER. A website order pays at checkout; a paid one
  // must not be offered a second way to pay; a cancelled one is over.
  if (!order || order.channel === "website" || order.payment_status === "paid" || order.status === "cancelled") {
    return notFound();
  }

  const { data: business, error: businessError } = await supabase
    .from("dealerships")
    .select("dealership_name, seller_upi_vpa, instagram_selling_enabled")
    .eq("id", order.dealership_id)
    .maybeSingle();
  if (businessError) return new Response("Couldn't read the order.", { status: 500, headers: { "Cache-Control": "no-store" } });

  // READ NOW, NOT WHEN THE ORDER WAS PLACED. A seller who cleared their
  // UPI ID or switched Seller Mode off has said where money must not go.
  if (!business?.instagram_selling_enabled || !business?.seller_upi_vpa) return notFound();

  let link: string;
  try {
    link = upiPayLink({
      vpa: business.seller_upi_vpa,
      payeeName: businessDisplayName(business.dealership_name),
      amount: Number(order.total),
      orderId: order.id,
    });
  } catch {
    // A total of zero, or a stored UPI ID that no longer passes the
    // check: no QR is better than a QR that asks for the wrong thing.
    return notFound();
  }

  const png = await QRCode.toBuffer(link, { type: "png", width: 512, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), {
    status: 200,
    // NOT CACHED: the seller can change their UPI ID, and an image cached
    // anywhere on the way would keep sending money to the old one.
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
