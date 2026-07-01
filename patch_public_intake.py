import re

with open("src/pages/PublicIntake.jsx", "r") as f:
    content = f.read()

# Replace the fetch response evaluation block in handleSubmit
old_fetch_logic = """      // CRITICAL FIX: Target the correct API route for edge decryption
      const response = await fetch(`${workerUrl}/api/v1/webhooks/public-ingress`, fetchOptions);

      if (!response.ok) {
         const errText = await response.text();
         throw new Error(`Gateway rejected payload: ${response.status}`);
      }

      const data = await response.json();
      setSubmitSuccess(true);
      setTicketIdReceipt(data.ticket_id);
    } catch (err) {
      console.error("Ingestion error:", err);
      setFileError('Transmission failed. Please check network connectivity and try again.');
      setSubmitResult({ success: false, error: 'Transmission failed. Secure tunnel could not be established.' });
    } finally {
      setIsSubmitting(false);
    }"""

new_fetch_logic = """      // CRITICAL FIX: Target the correct API route for edge decryption
      const response = await fetch(`${workerUrl}/api/v1/webhooks/public-ingress`, fetchOptions);

      if (!response.ok) {
         if (response.status === 429) {
            throw new Error('Cloudflare Edge Shield: Rate limit exceeded. Please wait 60 seconds before submitting again.');
         } else if (response.status === 413) {
            throw new Error('Cloudflare Edge Shield: Payload too large. Maximum combined size is 5MB.');
         } else {
            const errText = await response.text();
            throw new Error(`Ingestion gateway rejected payload: ${response.status}`);
         }
      }

      const data = await response.json();
      setSubmitSuccess(true);
      setTicketIdReceipt(data.ticket_id);
    } catch (err) {
      console.error("Ingestion error:", err);
      // Ensure specific Cloudflare boundary messages override generic network errors
      const isCfBlock = err.message.includes('Cloudflare Edge Shield');
      setFileError(isCfBlock ? err.message : 'Transmission failed. Secure tunnel could not be established.');
      setSubmitResult({ success: false, error: isCfBlock ? err.message : 'Transmission failed. Secure tunnel could not be established.' });
    } finally {
      setIsSubmitting(false);
    }"""

content = content.replace(old_fetch_logic, new_fetch_logic)

with open("src/pages/PublicIntake.jsx", "w") as f:
    f.write(content)
