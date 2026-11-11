"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_BYTES,
  QUICK_SCAN,
  adminEmails,
  isAdminEmail,
  siteUrl,
} from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { getOrder, shortId, type FileKind, type Order } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

const BUCKET: Record<FileKind, "packages" | "reports"> = {
  package: "packages",
  report: "reports",
};

function field(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

async function createCheckout(order: Order): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    customer_email: order.email,
    metadata: { order_id: order.id, service: order.service },
    payment_intent_data: {
      description: `${QUICK_SCAN.name} order ${shortId(order.id)}`,
      metadata: { order_id: order.id },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency,
          unit_amount: order.amount_cents,
          product_data: {
            name: `Condo Wise Guys ${QUICK_SCAN.name}`,
            description: `Strata document review for ${order.property}`.slice(0, 300),
          },
        },
      },
    ],
    success_url: `${siteUrl()}/orders/${order.id}?paid=1`,
    cancel_url: `${siteUrl()}/orders/${order.id}?cancelled=1`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout link.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("payment_status", "unpaid");
  if (error) throw new Error(error.message);
  return session.url;
}

/** Step 1: the customer picks Quick Scan. Creates the order, then sends them to Stripe Checkout. */
export async function startQuickScanOrder(formData: FormData) {
  const user = await requireUser("/order/quick-scan");
  const customerName = field(formData, "customer_name", 120);
  const property = field(formData, "property", 240);
  const notes = field(formData, "notes", 2000);
  if (!customerName || !property) redirect("/order/quick-scan?error=missing");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .insert({
      user_id: user.id,
      email: user.email,
      customer_name: customerName,
      property,
      notes: notes || null,
      service: QUICK_SCAN.id,
      amount_cents: QUICK_SCAN.priceCents,
      currency: QUICK_SCAN.currency,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const url = await createCheckout(data as Order);
  redirect(url);
}

/** Lets a customer who abandoned checkout pick the payment back up. */
export async function resumePayment(formData: FormData) {
  const orderId = field(formData, "order_id", 36);
  const user = await requireUser(`/orders/${orderId}`);
  const order = await getOrder(orderId);
  if (!order || order.user_id !== user.id) redirect("/orders");
  if (order.payment_status !== "unpaid" || order.status !== "awaiting_payment") {
    redirect(`/orders/${order.id}`);
  }
  const url = await createCheckout(order);
  redirect(url);
}

type UploadTicket =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; error: string };

/** Who may add which kind of file to an order, and when. */
async function authoriseUpload(orderId: string, kind: FileKind) {
  const user = await requireUser(`/orders/${orderId}`);
  const order = await getOrder(orderId);
  if (!order) return { error: "Order not found." as const };

  if (kind === "report") {
    if (!isAdminEmail(user.email)) return { error: "Not allowed." as const };
    if (order.status === "delivered") return { error: "This report has already been released." as const };
    return { user, order };
  }
  if (order.user_id !== user.id) return { error: "Order not found." as const };
  if (order.payment_status !== "paid") return { error: "This order has not been paid yet." as const };
  if (order.status !== "awaiting_documents" && order.status !== "in_review") {
    return { error: "This order is no longer accepting documents." as const };
  }
  return { user, order };
}

/** Hands the browser a one-time ticket to send a file straight into private storage. */
export async function createUploadTicket(input: {
  orderId: string;
  kind: FileKind;
  filename: string;
  size: number;
}): Promise<UploadTicket> {
  const auth = await authoriseUpload(input.orderId, input.kind);
  if ("error" in auth) return { ok: false, error: auth.error as string };

  const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `File type .${ext} is not accepted.` };
  }
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Files must be 50 MB or smaller." };
  }

  const bucket = BUCKET[input.kind];
  const path = `${auth.order.id}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start the upload." };
  return { ok: true, bucket, path, token: data.token };
}

/** Records a finished upload against the order, after checking the file really arrived. */
export async function recordUpload(input: {
  orderId: string;
  kind: FileKind;
  path: string;
  filename: string;
  contentType: string;
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await authoriseUpload(input.orderId, input.kind);
  if ("error" in auth) return { ok: false, error: auth.error as string };

  const [folder, object, ...rest] = input.path.split("/");
  if (folder !== auth.order.id || !object || rest.length > 0) {
    return { ok: false, error: "Invalid file path." };
  }

  const bucket = BUCKET[input.kind];
  const admin = createAdminClient();
  const { data: found, error: listError } = await admin.storage
    .from(bucket)
    .list(folder, { search: object, limit: 1 });
  const stored = found?.find((f) => f.name === object);
  if (listError || !stored) return { ok: false, error: "The upload did not complete." };

  const { error } = await admin.from("order_files").insert({
    order_id: auth.order.id,
    kind: input.kind,
    bucket,
    storage_path: input.path,
    filename: input.filename.replace(/[\\/]/g, "_").slice(0, 200),
    size_bytes: Number(stored.metadata?.size ?? 0),
    content_type: input.contentType.slice(0, 120) || null,
    uploaded_by: auth.user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/orders/${auth.order.id}`);
  revalidatePath(`/admin/orders/${auth.order.id}`);
  return { ok: true };
}

/** Customers can remove a document before submitting; admins can replace a draft report before release. */
export async function deleteFile(formData: FormData) {
  const fileId = field(formData, "file_id", 36);
  const user = await requireUser("/orders");
  const admin = createAdminClient();
  const { data: file } = await admin.from("order_files").select("*").eq("id", fileId).maybeSingle();
  if (!file) return;
  const order = await getOrder(file.order_id);
  if (!order) return;

  const allowed =
    file.kind === "report"
      ? isAdminEmail(user.email) && order.status !== "delivered"
      : order.user_id === user.id && order.status === "awaiting_documents";
  if (!allowed) return;

  await admin.storage.from(file.bucket).remove([file.storage_path]);
  await admin.from("order_files").delete().eq("id", file.id);
  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/admin/orders/${order.id}`);
}

/** Step 3: the customer says the package is complete and hands it over for review. */
export async function submitDocuments(formData: FormData) {
  const orderId = field(formData, "order_id", 36);
  const user = await requireUser(`/orders/${orderId}`);
  const order = await getOrder(orderId);
  if (!order || order.user_id !== user.id) redirect("/orders");
  const hasPackage = order.order_files?.some((f) => f.kind === "package");
  if (order.status !== "awaiting_documents" || !hasPackage) redirect(`/orders/${order.id}`);

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({ status: "in_review", submitted_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "awaiting_documents");
  if (error) throw new Error(error.message);

  await sendEmail(
    adminEmails(),
    `Documents received for order ${shortId(order.id)}`,
    `${order.customer_name} has uploaded the strata package for ${order.property}.\n\n${siteUrl()}/admin/orders/${order.id}`,
  );
  revalidatePath(`/orders/${order.id}`);
  redirect(`/orders/${order.id}`);
}

/** Step 4: the admin approves, which is the only thing that makes the report visible to the customer. */
export async function approveAndRelease(formData: FormData) {
  const orderId = field(formData, "order_id", 36);
  const adminUser = await requireAdmin(`/admin/orders/${orderId}`);
  const order = await getOrder(orderId);
  if (!order) redirect("/admin");
  const hasReport = order.order_files?.some((f) => f.kind === "report");
  if (!hasReport || order.payment_status !== "paid" || order.status === "delivered") {
    redirect(`/admin/orders/${order.id}`);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({
      status: "delivered",
      approved_at: new Date().toISOString(),
      approved_by: adminUser.email,
    })
    .eq("id", order.id);
  if (error) throw new Error(error.message);

  await sendEmail(
    order.email,
    "Your Condo Wise Guys Quick Scan report is ready",
    `Hi ${order.customer_name},\n\nYour Quick Scan report for ${order.property} is ready. For your security it is not attached to this email. Sign in to download it:\n\n${siteUrl()}/orders/${order.id}\n\nCondo Wise Guys`,
  );
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/admin");
  redirect(`/admin/orders/${order.id}`);
}
