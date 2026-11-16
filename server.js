import { Resend } from 'resend';
import express from "express";
import { createHmac } from 'node:crypto';
import { httpServerHandler } from "cloudflare:node";

const PORT = 3000;

const app = express();
app.use(express.json()); // Parse all incoming json

// The secrets are loaded by the workers runtime & are configured via Cloudflare
const WEBHOOK_SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_SEGMENT_ID = process.env.RESEND_SEGMENT_ID; // The ROOT segment (a segment is like a group of contacts, though contacts can be part of multiple groups)

// Throw if any of these secrets are missing
if (!WEBHOOK_SIGNING_SECRET || !RESEND_API_KEY || !RESEND_SEGMENT_ID) throw new Error("Required secrets are unset, check the .env loading");

const resend = new Resend(RESEND_API_KEY);

app.post('/webhook', async (req, res) => {
    const webhookPayload = req.body;
    const receivedSignature = req.headers['tally-signature'];

    try {
        // Calculate the signature using the signing secret and the payload
        const calculatedSignature = createHmac('sha256', WEBHOOK_SIGNING_SECRET)
            .update(JSON.stringify(webhookPayload))
            .digest('base64');

        // Compare the received signature with the calculated signature
        if (receivedSignature === calculatedSignature) {

            // Extract data from webhook payload
            const webhookData = webhookPayload.data;
            const name = webhookData.fields.find((f) => f.type === "INPUT_TEXT")?.value;
            const emailAddress = webhookData.fields.find((f) => f.type === "INPUT_EMAIL")?.value;
            if (!name) throw new Error("Name is missing from form");
            if (!emailAddress) throw new Error("Email is missing from form");

            // Create Resend contact
            const { error: contactError } = await resend.contacts.create({
                email: emailAddress,
                firstName: name,
                segments: [{ id: RESEND_SEGMENT_ID }]
            });
            if (contactError) {
                console.error("Resend contact creation error:", contactError);
                throw new Error("Contact creation failed");
            }

            // Send confirmation email
            const { error: sendError } = await resend.emails.send({
                from: 'Paul from ROOT <paul@rootprivacy.com>',
                to: [emailAddress],
                subject: 'Added to the email list',
                html: `<p>Hi ${name.replaceAll("<", "").replaceAll(">", "")},<br><br>thank you for joining the ROOT email list!<br><br>Kind regards,<br>Paul from ROOT</p>`,
            });
            if (sendError) {
                console.error("Resend confirmation email send error:", sendError);
                throw new Error("Confirmation email send failed");
            }

            res.status(200).send('Webhook received and processed successfully.');
        } else {
            // Signature is invalid, reject the webhook request
            res.status(401).send('Invalid signature.');
        }
    } catch (error) {
        res.status(500).send('Internal server error.');
        console.error("An error occurred processing the webhhook:", error);
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}.`));

// For Cloudflare workers to know where the entry point for incoming requests is
// It will forward incoming requests to it (and on port 3000 Express is listening)
export default httpServerHandler({ port: PORT });

/*
Example webhook request:

{
    "eventId": "ab5fca5b-f717-4c53-bb04-720eaf9d5141",
    "eventType": "FORM_RESPONSE",
    "createdAt": "2026-11-16T13:44:16.212Z",
    "data": {
        "responseId": "jeRMMP6",
        "submissionId": "jeRMMP6",
        "respondentId": "81OJokY",
        "locale": null,
        "formId": "NpXY1N",
        "formName": "JOIN THE WAITLIST.",
        "createdAt": "2026-11-16T13:44:16.000Z",
        "submissionPdfUrl": "https://api.tally.so/forms/NpXY1N/submissions/...",
        "submissionPreviewUrl": "https://tally.so/forms/NpXY1N/submissions/...",
        "fields": [
            {
                "key": "question_b72yBL",
                "label": "What's your name?",
                "type": "INPUT_TEXT",
                "value": "Paul"
            },
            {
                "key": "question_Ad6GoD",
                "label": "What's your email?",
                "type": "INPUT_EMAIL",
                "value": "paul@gmail.com"
            }
        ]
    }
}

*/