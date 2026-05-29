const fs = require('fs');
const file = 'onyx-edge-worker/src/index.ts';
let data = fs.readFileSync(file, 'utf8');

const routeToAdd = `
    if (url.pathname === "/api/v1/webhooks/ticket-resolved") {
      return handleTicketResolved(request, env);
    }
`;

data = data.replace(
  /if \(url\.pathname === "\/webhooks\/intake"\) {/,
  `if (url.pathname === "/api/v1/webhooks/ticket-resolved") {
      return handleTicketResolved(request, env);
    }

    if (url.pathname === "/webhooks/intake") {`
);

fs.writeFileSync(file, data);
