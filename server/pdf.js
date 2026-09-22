const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'img', 'gp4u-icon-pdf.png');
const logoBuffer = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;

/*
 * Clinic documents as PDFs: sick certificates, referral letters and prescriptions. They share one letterhead (clinic name,
 * address, phone, email and website, all taken from Admin -> Website settings) and one footer (company details, a
 * reference number, when it was issued, page numbers), so everything the clinic sends looks the same and is traceable.
 * Dates are always Irish time, whatever timezone the server runs in.
 */
const TEAL = '#0a4d4d';
const GREY = '#5d6b6b';
const INK = '#1a1a1a';

const dateIE = (d) => new Date(d).toLocaleDateString('en-IE', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeIE = (d) => new Date(d).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dobIE = (dob) => {
  const d = new Date(`${dob}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(dob || '') : d.toLocaleDateString('en-IE', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
};

// "Walk-in clinic visit, 12 March 2026" / "Online GP consultation (video), 12 March 2026"
function visitLine(booking) {
  const when = booking.slot_start ? dateIE(booking.slot_start) : '';
  const what = booking.service_type === 'walk_in' ? 'Walk-in clinic visit' : 'Online GP consultation';
  return when ? `${what}, ${when}` : what;
}

function drawLetterhead(doc, practice) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.y;
  // Logo mark to the left of the practice name, sized to sit level with the two lines of text beside it.
  const logoSize = 30;
  const textLeft = logoBuffer ? left + logoSize + 10 : left;
  if (logoBuffer) doc.image(logoBuffer, left, top, { width: logoSize, height: logoSize });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text(practice.name, textLeft, top, { width: 300 - (textLeft - left) });
  doc.font('Helvetica').fontSize(9).fillColor(GREY).text(practice.tagline || '', textLeft, doc.y + 1, { width: 300 - (textLeft - left) });
  const leftBottom = Math.max(doc.y, top + logoSize);
  // contact block, right-aligned
  const lines = [...practice.addressLines, practice.phone && `Tel ${practice.phone}`, practice.email, practice.website].filter(Boolean);
  let y = top + 2;
  doc.font('Helvetica').fontSize(9).fillColor(GREY);
  lines.forEach((line) => { doc.text(line, left + 300, y, { width: right - left - 300, align: 'right', lineBreak: false }); y += 12; });
  const bottom = Math.max(leftBottom, y) + 6;
  doc.strokeColor(TEAL).lineWidth(2).moveTo(left, bottom).lineTo(right, bottom).stroke();
  doc.x = left; doc.y = bottom + 18;
  doc.fillColor(INK);
}

// Footer on every page: company details (if the admin has entered them), reference, issue date and page numbers.
function drawFooters(doc, practice, reference, issued) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const { left, right } = { left: doc.page.margins.left, right: doc.page.width - doc.page.margins.right };
    const y = doc.page.height - 62;
    doc.page.margins.bottom = 0; // allow drawing inside the bottom margin without starting a new page
    doc.strokeColor('#d9d2c3').lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GREY);
    if (practice.company.length) doc.text(practice.company.join('  ·  '), left, y + 6, { width: right - left, align: 'center', lineBreak: false });
    doc.text(`Reference ${reference}  ·  Issued ${dateTimeIE(issued)}  ·  Page ${i - range.start + 1} of ${range.count}`, left, y + (practice.company.length ? 18 : 8), { width: right - left, align: 'center', lineBreak: false });
    doc.text(`Confidential: this document contains health information intended for the person named above or the recipient it is addressed to.`, left, y + (practice.company.length ? 29 : 19), { width: right - left, align: 'center', lineBreak: false });
  }
}

function pdfBufferFrom(practice, reference, issued, renderFn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 78, left: 50, right: 50 }, bufferPages: true, info: { Title: reference, Author: practice.name, Producer: practice.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      drawLetterhead(doc, practice);
      renderFn(doc);
      drawFooters(doc, practice, reference, issued);
      doc.end();
    } catch (err) { reject(err); }
  });
}

// A label/value row: "Patient   Mary Byrne"
function row(doc, label, value) {
  if (!String(value || '').trim()) return;
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GREY).text(label.toUpperCase(), 50, y + 2, { width: 110, lineBreak: false });
  doc.font('Helvetica').fontSize(11).fillColor(INK).text(String(value), 165, y, { width: doc.page.width - 165 - 50, lineGap: 2 });
  doc.x = doc.page.margins.left; // body text below starts at the left margin again
  doc.moveDown(0.35);
}

function patientBlock(doc, booking, { phone = false } = {}) {
  row(doc, 'Patient', booking.patient_name);
  row(doc, 'Date of birth', dobIE(booking.patient_dob));
  row(doc, 'Address', booking.patient_address);
  if (phone) row(doc, 'Phone', booking.patient_phone);
}

function signature(doc, name, reg, practice) {
  doc.moveDown(2.2);
  const y = doc.y;
  doc.strokeColor('#8a8a8a').lineWidth(0.6).moveTo(50, y).lineTo(230, y).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(name, 50, y + 5);
  doc.font('Helvetica').fontSize(10).fillColor(GREY).text(`IMC Reg No: ${reg}`).text(`Issued electronically by ${practice.name}`);
  doc.fillColor(INK);
}

function generateSickCertPdf({ fields, booking, doctor, practice, id }) {
  const isFitToWork = fields.fitForWork === 'fit to return to work';
  const reference = `CERT-${String(id || '').padStart(5, '0') || 'NEW'}`;
  const issued = new Date();
  return pdfBufferFrom(practice, reference, issued, (doc) => {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(TEAL).text(isFitToWork ? 'Fit to Work Certificate' : 'Medical Certificate');
    doc.moveDown(0.8);
    patientBlock(doc, booking);
    row(doc, 'Seen', visitLine(booking));
    doc.moveDown(0.8);
    const bodyText = isFitToWork
      ? `This is to certify that ${booking.patient_name} was assessed by me and is fit to return to work from ${dateIE(fields.dateFrom)}, due to: ${fields.diagnosis}.`
      : `This is to certify that ${booking.patient_name} was assessed by me and is ${fields.fitForWork} from ` +
        `${dateIE(fields.dateFrom)} to ${dateIE(fields.dateTo)} inclusive, due to: ${fields.diagnosis}.`;
    doc.font('Helvetica').fontSize(11.5).fillColor(INK).text(bodyText, { lineGap: 5 });
    signature(doc, doctor.name, doctor.reg_number, practice);
  });
}

function generateReferralPdf({ fields, booking, doctor, practice, isAE, id }) {
  const reference = `REF-${String(id || '').padStart(5, '0') || 'NEW'}`;
  const issued = new Date();
  return pdfBufferFrom(practice, reference, issued, (doc) => {
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text(dateIE(issued));
    doc.moveDown(0.6);
    const toLine = isAE
      ? `Emergency Department, ${fields.hospitalName}`
      : `${fields.specialty}${fields.consultantOrDept ? ' — ' + fields.consultantOrDept : ''}`;
    row(doc, 'To', toLine);
    row(doc, 'Urgency', fields.urgency);
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text('Re: patient details');
    doc.moveDown(0.3);
    patientBlock(doc, booking, { phone: true });
    row(doc, 'Seen', visitLine(booking));
    row(doc, 'Allergies', booking.allergies);
    row(doc, 'Current medicines', booking.current_medications);
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(11).fillColor(INK).text('Dear Colleague,', { lineGap: 3 });
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(12).text('Clinical summary');
    doc.font('Helvetica').fontSize(11).text(fields.clinicalSummary, { lineGap: 4 });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).text('Reason for referral');
    doc.font('Helvetica').fontSize(11).text(fields.reasonForReferral, { lineGap: 4 });
    doc.moveDown(0.8);
    doc.text(`Thank you for seeing this patient. Please reply to ${[practice.email, practice.phone].filter(Boolean).join(' or ') || practice.name}.`, { lineGap: 3 });
    doc.moveDown(0.6);
    doc.text('Yours sincerely,');
    signature(doc, doctor.name, doctor.reg_number, practice);
  });
}

function generatePrescriptionPdf({ rx, booking, practice }) {
  const reference = `RX-${String(rx.id || '').padStart(5, '0') || 'NEW'}`;
  const issued = rx.issued_at || new Date();
  return pdfBufferFrom(practice, reference, issued, (doc) => {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(TEAL).text('Prescription');
    doc.moveDown(0.8);
    patientBlock(doc, booking);
    row(doc, 'Seen', visitLine(booking));
    row(doc, 'Allergies', booking.allergies);
    row(doc, 'Pharmacy', booking.pharmacy_name);
    doc.moveDown(0.6);
    doc.strokeColor('#d9d2c3').lineWidth(0.6).moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(`${rx.medication} — ${rx.dose}`);
    doc.moveDown(0.5);
    row(doc, 'Frequency', rx.frequency);
    row(doc, 'Duration', rx.duration);
    row(doc, 'Quantity', rx.quantity);
    row(doc, 'Instructions', rx.instructions);
    row(doc, 'Date of issue', dateIE(issued));
    signature(doc, rx.doctor_name, rx.doctor_reg_number, practice);
  });
}

module.exports = { generateSickCertPdf, generateReferralPdf, generatePrescriptionPdf };
