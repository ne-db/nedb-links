/**
 * The five transactional emails — production artifacts, not samples.
 *
 * Design: the Signal register. #F7F8FA canvas, one white 560px card
 * (18px radius, #E5E7EB hairline), one strong blue #2563EB, system
 * font stack. Bulletproof email engineering: tables with
 * role="presentation", inline styles only, padded-cell buttons that
 * survive Outlook, a hidden preheader, and a hand-written plain-text
 * twin for every message — multipart/alternative, never an
 * afterthought.
 *
 * Every template returns a complete OutgoingMail ready for sendMail().
 */

import { config } from "./config";
import type { OutgoingMail } from "./mailer";

const BRAND = config.brandName;
const BRAND_UP = BRAND.toUpperCase();

// ── Shared shell ─────────────────────────────────────────────────────────────

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#111827";
const MUTED = "#6B7280";
const FAINT = "#94A3B8";
const BLUE = "#2563EB";
const BORDER = "#E5E7EB";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Bulletproof CTA — padded table cell + inline-block anchor. */
function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 8px;">
  <tr><td align="center" bgcolor="${BLUE}" style="border-radius:12px;">
    <a href="${esc(url)}" target="_blank"
       style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">
      ${esc(label)}
    </a>
  </td></tr>
</table>`;
}

/** Quiet monospace fallback link under a button. */
function fallbackUrl(url: string): string {
  return `<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};text-align:center;word-break:break-all;">
  Button not working? Paste this into your browser:<br/>
  <a href="${esc(url)}" style="color:${BLUE};text-decoration:underline;">${esc(url)}</a>
</p>`;
}

function paragraph(html: string, opts?: { center?: boolean; muted?: boolean }): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${opts?.muted ? MUTED : INK};${opts?.center ? "text-align:center;" : ""}">${html}</p>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${INK};text-align:center;">${esc(text)}</h1>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BORDER};margin:26px 0;"/>`;
}

/**
 * The document. One card on a calm canvas; kicker, content, reasoned
 * footer ("why you got this" is the pro courtesy most products skip).
 */
function shell(opts: {
  preheader: string;
  kicker: string;
  content: string;
  reason: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>${esc(BRAND)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F7F8FA;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F7F8FA;">
    <tr><td align="center" style="padding:40px 16px 12px;">
      <p style="margin:0 0 22px;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${FAINT};">
        <span style="color:${BLUE};">&#x2B21;</span>&nbsp; ${esc(BRAND_UP)}
      </p>
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border:1px solid ${BORDER};border-radius:18px;">
        <tr><td style="padding:40px 40px 34px;">
          <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${BLUE};text-align:center;">${esc(opts.kicker)}</p>
          ${opts.content}
        </td></tr>
      </table>
      <p style="margin:22px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};max-width:560px;">
        ${opts.reason}<br/>
        ${esc(BRAND)} — one handle, every surface. Self-hostable, GPLv3.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── 1 · Verify email ─────────────────────────────────────────────────────────

export function verifyEmail(opts: { to: string; verifyUrl: string }): OutgoingMail {
  const html = shell({
    preheader: "One click and your account is live. Link expires in 30 minutes.",
    kicker: "confirm your email",
    content: [
      heading("You're one click away"),
      paragraph(
        "Confirm this address and your account is live. No newsletters follow — we only ever email you about things <b>you</b> do.",
        { center: true, muted: true },
      ),
      button("Confirm my email", opts.verifyUrl),
      fallbackUrl(opts.verifyUrl),
      divider(),
      paragraph(
        `This link expires in 30 minutes and works once. Didn't create an account? Ignore this email — nothing happens without the click.`,
        { center: true, muted: true },
      ),
    ].join("\n"),
    reason: `You're receiving this because this address was used to sign up at ${esc(BRAND)}.`,
  });
  return {
    to: opts.to,
    subject: `Confirm your email — ${BRAND}`,
    html,
    text: [
      `${BRAND_UP} — CONFIRM YOUR EMAIL`,
      "",
      "You're one click away. Confirm this address and your account is live.",
      "",
      `Confirm: ${opts.verifyUrl}`,
      "",
      "This link expires in 30 minutes and works once.",
      "Didn't create an account? Ignore this email — nothing happens without the click.",
    ].join("\n"),
  };
}

// ── 2 · Welcome ──────────────────────────────────────────────────────────────

export function welcomeEmail(opts: { to: string; claimUrl: string }): OutgoingMail {
  const html = shell({
    preheader: "Your account is live. Claim your handle — it takes about a minute.",
    kicker: "welcome",
    content: [
      heading("You're in."),
      paragraph(
        "One handle gets you <b>every surface</b>: a profile page, a print-true business card, a scan-tracked QR code, and a save-to-contacts vCard — all from one editor, all updating together.",
        { center: true, muted: true },
      ),
      button("Claim your handle", opts.claimUrl),
      divider(),
      paragraph(
        `Three things worth knowing:`,
        { muted: true },
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">
          <span style="color:${BLUE};font-weight:700;">1.</span>&nbsp; Your first profile is free, forever — no trial clock.</td></tr>
        <tr><td style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">
          <span style="color:${BLUE};font-weight:700;">2.</span>&nbsp; Every edit is versioned — your page's history is never lost.</td></tr>
        <tr><td style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">
          <span style="color:${BLUE};font-weight:700;">3.</span>&nbsp; Print the QR anywhere — if you ever rename, old codes still work.</td></tr>
      </table>`,
    ].join("\n"),
    reason: `You're receiving this one-time welcome because you just verified your ${esc(BRAND)} account.`,
  });
  return {
    to: opts.to,
    subject: "You're in — claim your handle",
    html,
    text: [
      `${BRAND_UP} — WELCOME`,
      "",
      "You're in. One handle gets you every surface: profile page, business card,",
      "scan-tracked QR, and a save-to-contacts vCard — all from one editor.",
      "",
      `Claim your handle: ${opts.claimUrl}`,
      "",
      "Worth knowing:",
      "1. Your first profile is free, forever — no trial clock.",
      "2. Every edit is versioned — your page's history is never lost.",
      "3. Print the QR anywhere — if you ever rename, old codes still work.",
    ].join("\n"),
  };
}

// ── 3 · Password reset ───────────────────────────────────────────────────────

export function resetEmail(opts: { to: string; resetUrl: string }): OutgoingMail {
  const html = shell({
    preheader: `Reset your ${BRAND} password. Link expires in 30 minutes.`,
    kicker: "password reset",
    content: [
      heading("Reset your password"),
      paragraph(
        "Someone (hopefully you) asked to reset the password for this account. One click sets a new one.",
        { center: true, muted: true },
      ),
      button("Choose a new password", opts.resetUrl),
      fallbackUrl(opts.resetUrl),
      divider(),
      paragraph(
        "This link expires in 30 minutes and works once. <b>Didn't ask?</b> Your account is safe — your password only changes if this link is used. You can ignore this email.",
        { center: true, muted: true },
      ),
    ].join("\n"),
    reason: `You're receiving this because a password reset was requested for this address at ${esc(BRAND)}.`,
  });
  return {
    to: opts.to,
    subject: `Reset your password — ${BRAND}`,
    html,
    text: [
      `${BRAND_UP} — PASSWORD RESET`,
      "",
      "Someone (hopefully you) asked to reset the password for this account.",
      "",
      `Choose a new password: ${opts.resetUrl}`,
      "",
      "This link expires in 30 minutes and works once.",
      "Didn't ask? Your account is safe — ignore this email.",
    ].join("\n"),
  };
}

// ── 4 · You're live — the showpiece, QR inlined ──────────────────────────────

export function publishedEmail(opts: {
  to: string;
  handle: string;
  profileUrl: string;
  qrPng: Buffer;
}): OutgoingMail {
  const u = esc(opts.profileUrl);
  const html = shell({
    preheader: `@${opts.handle} is live — your page, business card, QR, and vCard are all up.`,
    kicker: "you're live",
    content: [
      heading(`@${opts.handle} is live`),
      paragraph(
        `Your page is published at<br/><a href="${u}" style="color:${BLUE};font-weight:600;text-decoration:none;word-break:break-all;">${u}</a>`,
        { center: true },
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto;">
        <tr><td align="center" style="background-color:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:14px;">
          <img src="cid:qr@links" width="180" height="180" alt="QR code for @${esc(opts.handle)}" style="display:block;width:180px;height:180px;"/>
        </td></tr>
        <tr><td align="center" style="padding-top:10px;font-family:${FONT};font-size:12px;color:${FAINT};">
          Print-grade. Scans are tracked separately from taps —<br/>and it survives renames, so print with confidence.
        </td></tr>
      </table>`,
      divider(),
      paragraph("One identity, every surface — all live now:", { center: true, muted: true }),
      `<p style="margin:0;font-family:${FONT};font-size:14px;line-height:2;color:${MUTED};text-align:center;">
        <a href="${u}" style="color:${BLUE};text-decoration:none;font-weight:600;">Page</a>
        &nbsp;&middot;&nbsp;
        <a href="${u}?format=card" style="color:${BLUE};text-decoration:none;font-weight:600;">Business card</a>
        &nbsp;&middot;&nbsp;
        <a href="${u}?format=vcard" style="color:${BLUE};text-decoration:none;font-weight:600;">Save contact</a>
        &nbsp;&middot;&nbsp;
        <a href="${u}?format=qr&amp;download=1" style="color:${BLUE};text-decoration:none;font-weight:600;">QR (SVG)</a>
      </p>`,
    ].join("\n"),
    reason: `You're receiving this because you published @${esc(opts.handle)} on ${esc(BRAND)}.`,
  });
  return {
    to: opts.to,
    subject: `@${opts.handle} is live — page, card, and QR`,
    html,
    text: [
      `${BRAND_UP} — @${opts.handle} IS LIVE`,
      "",
      `Your page: ${opts.profileUrl}`,
      "",
      "Every surface is up:",
      `  Page:           ${opts.profileUrl}`,
      `  Business card:  ${opts.profileUrl}?format=card`,
      `  Save contact:   ${opts.profileUrl}?format=vcard`,
      `  QR (SVG):       ${opts.profileUrl}?format=qr&download=1`,
      "",
      "The attached QR is print-grade. Scans are tracked separately from",
      "taps, and the code survives renames — print with confidence.",
    ].join("\n"),
    attachments: [
      {
        filename: `${opts.handle}-qr.png`,
        content: opts.qrPng,
        contentType: "image/png",
        cid: "qr@links",
      },
    ],
  };
}

// ── 5 · Supporter receipt ────────────────────────────────────────────────────

export function receiptEmail(opts: {
  to: string;
  amountCents: number;
  currency: string;
}): OutgoingMail {
  const amount = `$${(opts.amountCents / 100).toFixed(2)} ${opts.currency.toUpperCase()}`;
  const html = shell({
    preheader: `Unlimited profiles, forever. Receipt for your one-time ${amount} contribution.`,
    kicker: "receipt",
    content: [
      heading("Unlimited, forever. Thank you."),
      paragraph(
        "You paid what <b>you</b> thought it was worth — once. Not a subscription. Nothing renews, nothing expires, nobody emails you about a card on file.",
        { center: true, muted: true },
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:20px auto;">
        <tr><td align="center" style="border:1px solid ${BORDER};border-radius:14px;padding:18px 34px;">
          <p style="margin:0;font-family:${FONT};font-size:13px;color:${FAINT};">one-time contribution</p>
          <p style="margin:4px 0 0;font-family:${FONT};font-size:30px;font-weight:700;letter-spacing:-0.02em;color:${INK};">${esc(amount)}</p>
          <p style="margin:6px 0 0;font-family:${FONT};font-size:13px;color:${MUTED};">unlocked: unlimited profiles, forever</p>
        </td></tr>
      </table>`,
      divider(),
      paragraph(
        "This supports the hosted service. The software itself is GPLv3 and self-hostable — your own instance is unlimited and free, always. Keep this email as your receipt.",
        { center: true, muted: true },
      ),
    ].join("\n"),
    reason: `You're receiving this because you made a one-time contribution on ${esc(BRAND)}.`,
  });
  return {
    to: opts.to,
    subject: `Receipt — unlimited profiles, forever (${amount})`,
    html,
    text: [
      `${BRAND_UP} — RECEIPT`,
      "",
      "Unlimited, forever. Thank you.",
      "",
      `One-time contribution: ${amount}`,
      "Unlocked: unlimited profiles, forever.",
      "",
      "Not a subscription. Nothing renews, nothing expires.",
      "The software is GPLv3 and self-hostable — your own instance is",
      "unlimited and free, always. Keep this email as your receipt.",
    ].join("\n"),
  };
}

// ── 6 · Magic sign-in — the link for this device, the code for another ──────

export function magicLoginEmail(opts: {
  to: string;
  loginUrl: string;
  code: string;
}): OutgoingMail {
  const digits = opts.code
    .split("")
    .map(
      (d) =>
        `<td style="width:44px;height:54px;border:1px solid ${BORDER};border-radius:10px;font-family:${FONT};font-size:26px;font-weight:700;color:${INK};text-align:center;">${esc(d)}</td>`,
    )
    .join(`<td style="width:8px;"></td>`);
  const html = shell({
    preheader: "Tap to sign in, or use the code. Expires in 15 minutes.",
    kicker: "sign in",
    content: [
      heading("Your sign-in link"),
      paragraph(
        "Tap the button on this device — or, if you're signing in somewhere else, type the code instead. Both work once and expire in 15 minutes.",
        { center: true, muted: true },
      ),
      button("Sign me in", opts.loginUrl),
      fallbackUrl(opts.loginUrl),
      divider(),
      paragraph("Signing in on another device? Enter this code:", { center: true, muted: true }),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 2px;"><tr>${digits}</tr></table>`,
      divider(),
      paragraph(
        "Didn't ask to sign in? Ignore this email — nothing happens without the link or the code, and your password is untouched.",
        { center: true, muted: true },
      ),
    ].join("\n"),
    reason: `You're receiving this because a sign-in link was requested for this address at ${esc(BRAND)}.`,
  });
  return {
    to: opts.to,
    subject: `Your sign-in link — ${BRAND}`,
    html,
    text: [
      `${BRAND_UP} — SIGN IN`,
      "",
      `Sign in: ${opts.loginUrl}`,
      "",
      `Or enter this code on the sign-in screen: ${opts.code}`,
      "",
      "Both work once and expire in 15 minutes.",
      "Didn't ask? Ignore this email — your password is untouched.",
    ].join("\n"),
  };
}
