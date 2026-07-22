const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail(to, subject, text) {
  try {
    const { data, error } = await resend.emails.send({
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
