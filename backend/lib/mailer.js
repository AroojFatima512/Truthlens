// Sends e-mail (password reset links) through any SMTP server, e.g. Gmail with an App Password.
//   npm install nodemailer
// .env:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=yourname@gmail.com  SMTP_PASS=<16-letter app password>
//   MAIL_FROM="TruthLens <yourname@gmail.com>"   (optional, defaults to SMTP_USER)
// Without SMTP settings nothing is sent: the message, with its link, is printed in the backend terminal
// instead, so the reset flow can still be tried on a development machine.
let transport = null;
let sentForTests = null;          // tests collect messages here instead of sending

const configured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function getTransport() {
  if (transport) return transport;
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch {
    throw new Error('nodemailer is not installed. Run "npm install nodemailer" in the backend folder.');
  }
  const port = Number(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

// message: { to, subject, text, html }  -> { sent: true } | { sent: false, logged: true }
async function sendMail(message) {
  if (sentForTests) { sentForTests.push(message); return { sent: true }; }
  if (!configured()) {
    console.log(`\n[mail] SMTP is not set up, so this e-mail was NOT sent. To: ${message.to}\n[mail] ${message.subject}\n${message.text}\n`);
    return { sent: false, logged: true };
  }
  await getTransport().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, ...message });
  return { sent: true };
}

const captureForTests = () => { sentForTests = []; return sentForTests; };

module.exports = { sendMail, configured, captureForTests };
