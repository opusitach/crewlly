import "server-only"

import nodemailer from "nodemailer"

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

const DEFAULT_MAILPIT_PORT = 1025
const RESEND_API_URL = "https://api.resend.com/emails"

function resolveEmailProvider(env: NodeJS.ProcessEnv = process.env) {
  if (env.EMAIL_PROVIDER === "resend") {
    return "resend" as const
  }

  return "mailpit" as const
}

function resolveEmailFrom(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.EMAIL_FROM?.trim()
  if (configured) {
    return configured
  }

  if (env.NODE_ENV === "production") {
    throw new Error("EMAIL_FROM is required in production")
  }

  return "Crewlly Dev <no-reply@crewlly.local>"
}

async function sendViaMailpit(input: SendEmailInput) {
  const host = process.env.MAILPIT_SMTP_HOST?.trim() || "127.0.0.1"
  const port = Number.parseInt(process.env.MAILPIT_SMTP_PORT || "", 10) || DEFAULT_MAILPIT_PORT

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
  })

  await transporter.sendMail({
    from: resolveEmailFrom(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })
}

async function sendViaResend(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend")
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resolveEmailFrom(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!response.ok) {
    const payload = await response.text().catch(() => "")
    throw new Error(`Resend request failed with status ${response.status}${payload ? `: ${payload}` : ""}`)
  }
}

export async function sendEmail(input: SendEmailInput) {
  if (resolveEmailProvider() === "resend") {
    await sendViaResend(input)
    return
  }

  await sendViaMailpit(input)
}
