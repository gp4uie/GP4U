const PDFDocument = require('pdfkit');

// Renders a letterhead into an already-open PDFDocument — shared across every document type
// so sick certs, referral letters and prescriptions all look consistent.
function drawLetterhead(doc, practiceName) {
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f6e6e').text(practiceName, { continued: false });
  doc.font('Helvetica').fontSize(9).fillColor('#6b7a7a').text('One Tap. Real Care.');
  doc.moveUp(1).fontSize(9).text('www.gp4u.ie', { align: 'right' });
  doc.moveDown(0.3);
  doc.strokeColor('#0f6e6e').lineWidth(2)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(1);
  doc.fillColor('#1a1a1a');
}

function pdfBufferFrom(renderFn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    renderFn(doc);
    doc.end();
  });
}

function generateSickCertPdf({ fields, booking, doctor, practiceName }) {
  return pdfBufferFrom((doc) => {
    drawLetterhead(doc, practiceName);
    doc.font('Helvetica-Bold').fontSize(14).text('Medical Certificate');
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(11).text(
      `This is to certify that ${booking.patient_name} (DOB ${booking.patient_dob}) of ` +
      `${booking.patient_address || 'the address on file'} was examined by me and is ` +
      `${fields.fitForWork} from ${new Date(fields.dateFrom).toLocaleDateString('en-IE')} to ` +
      `${new Date(fields.dateTo).toLocaleDateString('en-IE')} inclusive, due to: ${fields.diagnosis}.`,
      { align: 'left', lineGap: 4 }
    );
    doc.moveDown(3);
    doc.text(`${doctor.name}`);
    doc.text(`IMC Reg No: ${doctor.reg_number}`);
    doc.text(new Date().toLocaleDateString('en-IE'));
  });
}

function generateReferralPdf({ fields, booking, doctor, practiceName, isAE }) {
  return pdfBufferFrom((doc) => {
    drawLetterhead(doc, practiceName);
    doc.font('Helvetica').fontSize(10).text(new Date().toLocaleDateString('en-IE'));
    doc.moveDown(0.5);
    const toLine = isAE
      ? `Emergency Department, ${fields.hospitalName}`
      : `${fields.specialty}${fields.consultantOrDept ? ' — ' + fields.consultantOrDept : ''}`;
    doc.font('Helvetica-Bold').text('To: ', { continued: true }).font('Helvetica').text(toLine);
    doc.font('Helvetica-Bold').text('Urgency: ', { continued: true }).font('Helvetica').text(fields.urgency);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Re: ', { continued: true }).font('Helvetica')
      .text(`${booking.patient_name}, DOB ${booking.patient_dob}`);
    if (booking.patient_address) doc.text(booking.patient_address);
    doc.text(booking.patient_phone);
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(12).text('Clinical Summary');
    doc.font('Helvetica').fontSize(11).text(fields.clinicalSummary, { lineGap: 4 });
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(12).text('Reason for Referral');
    doc.font('Helvetica').fontSize(11).text(fields.reasonForReferral, { lineGap: 4 });
    doc.moveDown(2);
    doc.text('Yours sincerely,');
    doc.moveDown(1);
    doc.text(doctor.name);
    doc.text(`IMC Reg No: ${doctor.reg_number}`);
  });
}

function generatePrescriptionPdf({ rx, booking, practiceName }) {
  return pdfBufferFrom((doc) => {
    drawLetterhead(doc, practiceName);
    doc.font('Helvetica-Bold').fontSize(14).text('Prescription');
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Patient: ${booking.patient_name} (DOB ${booking.patient_dob})`);
    if (booking.patient_address) doc.text(`Address: ${booking.patient_address}`);
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(12).text(`${rx.medication} — ${rx.dose}`);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Frequency: ${rx.frequency}`);
    doc.text(`Duration: ${rx.duration}`);
    doc.text(`Quantity: ${rx.quantity}`);
    doc.moveDown(0.5);
    doc.text(`Instructions: ${rx.instructions}`, { lineGap: 4 });
    doc.moveDown(2);
    doc.text(`Prescribed by ${rx.doctor_name} (${rx.doctor_reg_number})`);
    doc.text(new Date(rx.issued_at).toLocaleString('en-IE'));
  });
}

module.exports = { generateSickCertPdf, generateReferralPdf, generatePrescriptionPdf };
