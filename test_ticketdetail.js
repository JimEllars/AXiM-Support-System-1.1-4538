import fs from 'fs';
let code = fs.readFileSync('src/pages/TicketDetail.jsx', 'utf8');
if (!code.includes("import React, { useState, useEffect")) {
   code = code.replace("import React, { useState,", "import React, { useState, useEffect,");
   fs.writeFileSync('src/pages/TicketDetail.jsx', code);
}
