sed -i.bak -e 's/from: "AXiM Support System <system@axim.us.com>"/from: env.RESEND_FROM_EMAIL || "AXiM Support System <system@axim.us.com>"/g' onyx-edge-worker/src/index.ts
