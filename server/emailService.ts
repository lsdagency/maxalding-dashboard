import Anthropic from "@anthropic-ai/sdk";
import { MetricsData, MetricsComparison, METRIC_LABELS, METRIC_FORMATS } from "../shared/metrics";
import { calculateWoWChange } from "./metaAds";
import { ENV } from "./_core/env";
import { Resend } from "resend";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("[Email] RESEND_API_KEY not configured");
      return false;
    }

    const resend = new Resend(resendApiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "reports@maxalding.agency";

    const { data, error } = await resend.emails.send({
      from: `MAXALDING <${fromEmail}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return false;
    }

    console.log("[Email] Sent successfully:", data?.id);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send:", error.message);
    return false;
  }
}

/**
 * Generate a 2-3 sentence performance summary using Claude.
 * Written to sound natural and human — no em dashes, no AI clichés.
 */
export async function generatePerformanceSummary(
  clientName: string,
  metrics: MetricsComparison,
  periodStart: string,
  periodEnd: string
): Promise<string> {
  if (!ENV.anthropicApiKey) {
    console.warn("[AI Summary] ANTHROPIC_API_KEY not set, skipping summary");
    return "";
  }

  const { thisWeek, lastWeek, wowChange } = metrics;

  const lines: string[] = [];
  for (const key of Object.keys(METRIC_LABELS) as Array<keyof MetricsData>) {
    const val = thisWeek[key];
    const wow = wowChange[key];
    if (val === null) continue;
    const formatted = formatMetricValue(val, METRIC_FORMATS[key]);
    const wowStr = wow !== null ? ` (${wow > 0 ? "+" : ""}${wow.toFixed(1)}% vs last week)` : "";
    lines.push(`${METRIC_LABELS[key]}: ${formatted}${wowStr}`);
  }

  const prompt = `You are writing a short performance summary for a digital advertising agency report.

Client: ${clientName}
Period: ${periodStart} to ${periodEnd}

This week's Meta Ads results:
${lines.join("\n")}

Write 2-3 short sentences summarising how the week went. Rules:
- Sound like a real person wrote it, not an AI
- No em dashes, no semicolons, no bullet points
- No phrases like "it is worth noting", "delve into", "in today's landscape", "leveraging", "overall"
- Just plain, direct language about what the numbers show
- Mention 2-3 of the most meaningful metrics (good or bad)
- Keep it under 60 words`;

  try {
    const client = new Anthropic({ apiKey: ENV.anthropicApiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    return text;
  } catch (err: any) {
    console.error("[AI Summary] Failed to generate:", err.message);
    return "";
  }
}

type KpiTargets = Partial<Record<keyof MetricsData, number | null>>;

/**
 * Convert TipTap HTML to email-safe inline-styled HTML.
 * Replaces common tags with inline style equivalents so they render correctly
 * in Outlook and other clients that strip <style> blocks.
 */
function inlineStyleSummary(html: string): string {
  return html
    .replace(/<ul>/g, '<ul style="padding-left:20px;margin:6px 0;">')
    .replace(/<ol>/g, '<ol style="padding-left:20px;margin:6px 0;">')
    .replace(/<li>/g, '<li style="margin:3px 0;">')
    .replace(/<p>/g, '<p style="margin:4px 0;">')
    .replace(/<strong>/g, '<strong style="font-weight:600;color:#fff;">')
    .replace(/<em>/g, '<em style="font-style:italic;">');
}

/**
 * Generate the branded HTML email for a client's weekly performance report.
 * Includes This Week, Last Week, WoW%, and Target columns.
 */
export function generateWeeklyReportEmail(
  clientName: string,
  metrics: MetricsComparison,
  aiSummary: string | null,
  periodStart: string,
  periodEnd: string,
  kpiTargets?: KpiTargets | null
): string {
  const rows = (Object.keys(METRIC_LABELS) as Array<keyof MetricsData>).map((key) => {
    const thisWeekVal = metrics.thisWeek[key];
    const lastWeekVal = metrics.lastWeek[key];
    const wowChange = metrics.wowChange[key];
    const targetVal = kpiTargets?.[key] ?? null;
    const format = METRIC_FORMATS[key];

    const hasTarget = targetVal !== null && targetVal !== undefined;
    const vsKpi = hasTarget && thisWeekVal !== null && targetVal !== 0
      ? ((thisWeekVal - targetVal!) / Math.abs(targetVal!)) * 100
      : null;

    const targetCell = hasTarget
      ? `<td style="padding: 12px 16px; text-align: center; color: #888;">${formatMetricValue(targetVal, format)}</td>`
      : `<td style="padding: 12px 16px; text-align: center; color: #444;">--</td>`;

    const vsKpiCell = `<td style="padding: 12px 16px; text-align: center;">${formatWoWChange(vsKpi)}</td>`;

    return `
      <tr style="border-bottom: 1px solid #333;">
        <td style="padding: 12px 16px; font-weight: 500; color: #fff;">${METRIC_LABELS[key]}</td>
        <td style="padding: 12px 16px; text-align: center; color: #fff;">${formatMetricValue(thisWeekVal, format)}</td>
        <td style="padding: 12px 16px; text-align: center; color: #999;">${formatMetricValue(lastWeekVal, format)}</td>
        <td style="padding: 12px 16px; text-align: center;">${formatWoWChange(wowChange)}</td>
        ${targetCell}
        ${vsKpiCell}
      </tr>
    `;
  }).join("");

  const summarySection = aiSummary
    ? `<div style="margin: 24px 0; padding: 20px; background: #111; border-left: 3px solid #fff;">
        <div style="color: #ccc; font-size: 14px; line-height: 1.6;">${inlineStyleSummary(aiSummary)}</div>
      </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #000; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <div style="max-width: 680px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 40px;">
      <h1 style="color: #fff; font-size: 28px; font-weight: 700; letter-spacing: 2px; margin: 0;">MAXALDING</h1>
      <p style="color: #666; font-size: 12px; letter-spacing: 3px; margin-top: 8px;">PERFORMANCE REPORT</p>
    </div>

    <!-- Client & Period -->
    <div style="margin-bottom: 32px; text-align: center;">
      <h2 style="color: #fff; font-size: 20px; font-weight: 600; margin: 0 0 8px 0;">${clientName}</h2>
      <p style="color: #888; font-size: 14px; margin: 0;">${periodStart} to ${periodEnd}</p>
    </div>

    <!-- AI Performance Summary -->
    ${summarySection}

    <!-- Metrics Table -->
    <table style="width: 100%; border-collapse: collapse; background: #0a0a0a; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #1a1a1a;">
          <th style="padding: 14px 16px; text-align: left; color: #888; font-size: 12px; font-weight: 600; letter-spacing: 1px;">METRIC</th>
          <th style="padding: 14px 16px; text-align: center; color: #888; font-size: 12px; font-weight: 600; letter-spacing: 1px;">THIS WEEK</th>
          <th style="padding: 14px 16px; text-align: center; color: #888; font-size: 12px; font-weight: 600; letter-spacing: 1px;">PREV PERIOD</th>
          <th style="padding: 14px 16px; text-align: center; color: #888; font-size: 12px; font-weight: 600; letter-spacing: 1px;">WoW</th>
          <th style="padding: 14px 16px; text-align: center; color: #888; font-size: 12px; font-weight: 600; letter-spacing: 1px;">TARGET</th>
          <th style="padding: 14px 16px; text-align: center; color: #888; font-size: 12px; font-weight: 600; letter-spacing: 1px;">vs KPI</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <!-- Footer -->
    <div style="margin-top: 40px; text-align: center; border-top: 1px solid #222; padding-top: 24px;">
      <p style="color: #666; font-size: 12px; margin: 0;">Powered by Maxalding Agency</p>
      <p style="color: #444; font-size: 11px; margin-top: 8px;">This report was generated automatically. For questions, contact your account manager.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function formatMetricValue(value: number | null, format: string): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "currency":
      return `$${value.toFixed(2)}`;
    case "percentage":
      return `${value.toFixed(2)}%`;
    case "decimal":
      return value.toFixed(2);
    case "number":
      return value.toLocaleString();
    default:
      return String(value);
  }
}

function formatWoWChange(value: number | null): string {
  if (value === null) return '<span style="color: #666;">—</span>';
  const color = value > 0 ? "#4ade80" : value < 0 ? "#f87171" : "#888";
  const prefix = value > 0 ? "+" : "";
  return `<span style="color: ${color}; font-weight: 600;">${prefix}${value.toFixed(1)}%</span>`;
}
