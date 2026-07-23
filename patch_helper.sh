sed -i '450i\
// --- EMAILIT DISPATCH UTILITY ---\
async function sendEmailItNotification(\
  to: string,\
  subject: string,\
  htmlBody: string,\
  env: Env\
): Promise<boolean> {\
  const apiKey = env.EMAILIT_API_KEY || (env as any).EMAIL_IT_API_KEY;\
  if (!apiKey) {\
    console.warn("[EMAILIT] Missing EMAILIT_API_KEY secret binding in worker environment.");\
    return false;\
  }\
\
  try {\
    const res = await fetch("https://api.emailit.com/v1/emails", {\
      method: "POST",\
      headers: {\
        "Content-Type": "application/json",\
        "Authorization": `Bearer ${apiKey}`\
      },\
      body: JSON.stringify({\
        from: "AXiM Support Operations <notifications@axim.us.com>",\
        to,\
        subject,\
        html: htmlBody\
      })\
    });\
\
    return res.ok;\
  } catch (err: any) {\
    console.error("[EMAILIT DISPATCH FAULT] Failed to deliver email:", err.message);\
    return false;\
  }\
}\
' onyx-edge-worker/src/index.ts
