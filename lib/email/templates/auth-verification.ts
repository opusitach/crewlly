type RegistrationVerificationEmailInput = {
  code: string
  recipientName: string
  expiresInMinutes: number
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function buildRegistrationVerificationEmail(input: RegistrationVerificationEmailInput) {
  const safeName = escapeHtml(input.recipientName)

  return {
    subject: "Код подтверждения для Crewlly",
    text: [
      `Здравствуйте, ${input.recipientName}!`,
      "",
      `Ваш код подтверждения: ${input.code}`,
      `Код действует ${input.expiresInMinutes} минут.`,
      "",
      "Если вы не создавали аккаунт в Crewlly, просто проигнорируйте это письмо.",
    ].join("\n"),
    html: `
      <div style="margin:0;padding:32px 16px;background:#fbf8f3;font-family:Inter,Arial,sans-serif;color:#5b4736;">
        <div style="max-width:560px;margin:0 auto;">
          <div style="border-radius:28px;overflow:hidden;background:linear-gradient(135deg,#6a4b2f 0%,#c8873f 58%,#e4b06a 100%);padding:1px;box-shadow:0 24px 80px rgba(106,75,47,0.16);">
            <div style="background:#ffffff;border-radius:27px;padding:36px 32px;">
              <div style="display:inline-flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;background:#f6ecdd;color:#c8873f;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                Crewlly verification
              </div>
              <h1 style="margin:20px 0 12px;font-size:30px;line-height:1.1;font-weight:800;color:#5b4736;">
                Подтвердите email
              </h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#7b6757;">
                Здравствуйте, ${safeName}. Введите этот код в форме регистрации, чтобы завершить создание аккаунта.
              </p>
              <div style="margin:0 0 24px;padding:18px;border-radius:22px;background:linear-gradient(135deg,#f8f1e6 0%,#fdfaf5 100%);border:1px solid rgba(200,135,63,0.18);">
                <div style="margin-bottom:8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a07a55;font-weight:700;">
                  Ваш код
                </div>
                <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:0.35em;color:#5b4736;font-variant-numeric:tabular-nums;">
                  ${input.code}
                </div>
              </div>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#7b6757;">
                Код действует <strong>${input.expiresInMinutes} минут</strong>.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#aa9483;">
                Если это были не вы, просто проигнорируйте письмо.
              </p>
            </div>
          </div>
        </div>
      </div>
    `,
  }
}
