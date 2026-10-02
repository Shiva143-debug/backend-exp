const { Resend } = require('resend');

let resend;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.toLowerCase().includes('your-')) {
    throw new Error('RESEND_API_KEY is not configured with a valid Resend API key');
  }

  if (!resend) {
    resend = new Resend(apiKey);
  }

  return resend;
}

async function sendMail(to, subject, text) {
  try {
    const { data, error } = await getResendClient().emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
    });

    if (error) {
      console.error('Resend error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error sending mail:', error);
    throw error;
  }
}

module.exports = { sendMail };
