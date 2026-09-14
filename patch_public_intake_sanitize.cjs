const fs = require('fs');
const file = './src/pages/PublicIntake.jsx';
let data = fs.readFileSync(file, 'utf8');

const replacement = `      const rawPayload = {
        subject: formData.subject,
        description: formData.description,
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        workflow_category: formData.workflow_category,
        customer_id: formData.customer_email, // Map email to ID for simplicity
        source: 'website_support_form',
        urgency_flag: 'standard',
        cf_turnstile_response: turnstileToken // CRITICAL FIX: Pass token to edge
      };

      const sanitizedPayload = sanitizePayload(rawPayload);`;

data = data.replace(/const rawPayload = \{\s*\.\.\.formData,\s*customer_id: formData\.customer_email, \/\/ Map email to ID for simplicity\s*source: 'website_support_form',\s*urgency_flag: 'standard',\s*cf_turnstile_response: turnstileToken \/\/ CRITICAL FIX: Pass token to edge\s*\};\s*const sanitizedPayload = sanitizePayload\(rawPayload\);/, replacement);
fs.writeFileSync(file, data, 'utf8');
