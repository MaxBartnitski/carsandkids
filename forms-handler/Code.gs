/**
 * Cars & Kids website form handler
 * Bound to "Cars & Kids Intake" spreadsheet — run setupIntakeSheet() once after paste.
 */

var CONFIG = {
  NOTIFY_EMAIL: 'info@carsandkids.net',
  FROM_EMAIL: 'info@carsandkids.net',
  FROM_NAME: 'Cars & Kids',
  SITE_URL: 'https://carsandkids.net/',
  STATUS_NEW: 'New',
};

var TAB = {
  ALL: 'All',
  DRIVE: 'Drive',
  VISIT: 'Visit',
  SUPPORT: 'Support',
};

var HEADERS = {};
HEADERS[TAB.ALL] = [
  'submitted_at', 'form_type', 'status', 'name', 'email', 'phone', 'org', 'details',
];
HEADERS[TAB.DRIVE] = [
  'submitted_at', 'status', 'name', 'email', 'phone', 'car', 'can_do', 'availability', 'why',
];
HEADERS[TAB.VISIT] = [
  'submitted_at', 'status', 'org', 'contact', 'email', 'phone', 'type', 'kids', 'age',
  'location', 'constraints', 'timing',
];
HEADERS[TAB.SUPPORT] = [
  'submitted_at', 'status', 'name', 'email', 'org', 'support_types', 'notes',
];

var FORM_LABELS = {
  drive: 'drive signup',
  visit: 'visit request',
  support: 'support inquiry',
};

var NOTIFY_PREFIX = {
  drive: 'Drive signup',
  visit: 'Visit request',
  support: 'Support inquiry',
};

/**
 * Run once from the Apps Script editor after binding to the intake spreadsheet.
 */
function setupIntakeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Open this script from Extensions > Apps Script on the intake spreadsheet.');
  }

  Object.keys(HEADERS).forEach(function (tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    var headers = HEADERS[tabName];
    var existing = sheet.getLastRow() >= 1 ? sheet.getRange(1, 1, 1, headers.length).getValues()[0] : [];
    var needsHeaders = existing.join('') === '' || existing[0] !== headers[0];
    if (needsHeaders) {
      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });

  // Remove default Sheet1 if empty and not one of our tabs
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 4) {
    var onlyDefault = defaultSheet.getLastRow() <= 1;
    if (onlyDefault) {
      ss.deleteSheet(defaultSheet);
    }
  }

  Logger.log('Intake sheet ready: ' + ss.getUrl());
}

function doPost(e) {
  return handleSubmission_(e);
}

function doGet(e) {
  // Health check — GET /exec returns status (useful after deploy)
  if (e && e.parameter && e.parameter.health === '1') {
    return jsonResponse_({ ok: true, service: 'carsandkids-forms' });
  }
  return jsonResponse_({ ok: false, error: 'Use POST to submit forms.' });
}

function handleSubmission_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Missing request body.');
    }

    var data = JSON.parse(e.postData.contents);

    // Honeypot — silent accept for bots
    if (data.website && String(data.website).trim() !== '') {
      return jsonResponse_({ ok: true });
    }

    var formType = String(data.formType || '').toLowerCase();
    if (!FORM_LABELS[formType]) {
      throw new Error('Invalid form type.');
    }

    var normalized = normalizeSubmission_(formType, data);
    validateSubmission_(formType, normalized);

    appendSubmission_(formType, normalized);
    sendNotificationEmail_(formType, normalized);

    return jsonResponse_({ ok: true });
  } catch (err) {
    Logger.log('Submission failed: ' + err.message);
    return jsonResponse_({ ok: false, error: err.message || 'Submission failed.' });
  }
}

function normalizeSubmission_(formType, data) {
  var trim = function (v) {
    return v == null ? '' : String(v).trim();
  };
  var arr = function (v) {
    if (Array.isArray(v)) {
      return v.map(function (x) { return trim(x); }).filter(Boolean);
    }
    return trim(v) ? [trim(v)] : [];
  };

  if (formType === 'drive') {
    return {
      name: trim(data.name),
      email: trim(data.email).toLowerCase(),
      phone: trim(data.phone),
      car: trim(data.car),
      canDo: arr(data.canDo),
      availability: trim(data.availability),
      why: trim(data.why),
    };
  }

  if (formType === 'visit') {
    return {
      org: trim(data.org),
      contact: trim(data.contact),
      email: trim(data.email).toLowerCase(),
      phone: trim(data.phone),
      type: trim(data.type),
      kids: trim(data.kids),
      age: trim(data.age),
      location: trim(data.location),
      constraints: trim(data.constraints),
      timing: trim(data.timing),
    };
  }

  return {
    name: trim(data.name),
    email: trim(data.email).toLowerCase(),
    org: trim(data.org),
    supportTypes: arr(data.supportType || data.supportTypes),
    notes: trim(data.notes),
  };
}

function validateSubmission_(formType, data) {
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (formType === 'drive') {
    if (!data.name) throw new Error('Name is required.');
    if (!data.email || !emailRe.test(data.email)) throw new Error('Valid email is required.');
    if (!data.car) throw new Error('Car make and model is required.');
    return;
  }

  if (formType === 'visit') {
    if (!data.org) throw new Error('Organization name is required.');
    if (!data.contact) throw new Error('Contact name is required.');
    if (!data.email || !emailRe.test(data.email)) throw new Error('Valid email is required.');
    return;
  }

  if (!data.name) throw new Error('Name is required.');
  if (!data.email || !emailRe.test(data.email)) throw new Error('Valid email is required.');
}

function appendSubmission_(formType, data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Spreadsheet not found — bind script to intake sheet.');
  }

  var now = new Date();
  var status = CONFIG.STATUS_NEW;

  if (formType === 'drive') {
    appendRow_(ss, TAB.DRIVE, [
      now, status, data.name, data.email, data.phone, data.car,
      data.canDo.join('; '), data.availability, data.why,
    ]);
    appendRow_(ss, TAB.ALL, [
      now, formType, status, data.name, data.email, data.phone, '',
      buildDetails_({
        car: data.car,
        can_do: data.canDo.join('; '),
        availability: data.availability,
        why: data.why,
      }),
    ]);
    return;
  }

  if (formType === 'visit') {
    appendRow_(ss, TAB.VISIT, [
      now, status, data.org, data.contact, data.email, data.phone, data.type,
      data.kids, data.age, data.location, data.constraints, data.timing,
    ]);
    appendRow_(ss, TAB.ALL, [
      now, formType, status, data.contact, data.email, data.phone, data.org,
      buildDetails_({
        type: data.type,
        kids: data.kids,
        age: data.age,
        location: data.location,
        constraints: data.constraints,
        timing: data.timing,
      }),
    ]);
    return;
  }

  appendRow_(ss, TAB.SUPPORT, [
    now, status, data.name, data.email, data.org, data.supportTypes.join('; '), data.notes,
  ]);
  appendRow_(ss, TAB.ALL, [
    now, formType, status, data.name, data.email, '', data.org,
    buildDetails_({
      support_types: data.supportTypes.join('; '),
      notes: data.notes,
    }),
  ]);
}

function appendRow_(ss, tabName, row) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    throw new Error('Missing tab "' + tabName + '" — run setupIntakeSheet() first.');
  }
  sheet.appendRow(row);
}

function buildDetails_(fields) {
  return Object.keys(fields)
    .filter(function (k) { return fields[k]; })
    .map(function (k) { return k + ': ' + fields[k]; })
    .join(' | ');
}

function sendNotificationEmail_(formType, data) {
  var subject = buildNotifySubject_(formType, data);
  var plain = buildNotifyPlain_(formType, data);
  var html = buildNotifyHtml_(formType, data);
  var replyTo = data.email;

  GmailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, plain, {
    htmlBody: html,
    name: CONFIG.FROM_NAME,
    replyTo: replyTo,
  });
}

function buildNotifySubject_(formType, data) {
  var prefix = NOTIFY_PREFIX[formType];
  if (formType === 'drive') {
    return '[Cars & Kids] ' + prefix + ' — ' + data.name + ' (' + data.car + ')';
  }
  if (formType === 'visit') {
    return '[Cars & Kids] ' + prefix + ' — ' + data.org + ' (' + data.contact + ')';
  }
  var orgPart = data.org ? ' (' + data.org + ')' : '';
  return '[Cars & Kids] ' + prefix + ' — ' + data.name + orgPart;
}

function buildNotifyPlain_(formType, data) {
  var lines = ['New ' + FORM_LABELS[formType] + ' from carsandkids.net', ''];

  if (formType === 'drive') {
    lines.push('Name: ' + data.name);
    lines.push('Email: ' + data.email);
    lines.push('Phone: ' + (data.phone || '(none)'));
    lines.push('Car: ' + data.car);
    lines.push('Can do: ' + (data.canDo.length ? data.canDo.join(', ') : '(none)'));
    lines.push('Availability: ' + (data.availability || '(none)'));
    lines.push('Why: ' + (data.why || '(none)'));
  } else if (formType === 'visit') {
    lines.push('Organization: ' + data.org);
    lines.push('Contact: ' + data.contact);
    lines.push('Email: ' + data.email);
    lines.push('Phone: ' + (data.phone || '(none)'));
    lines.push('Type: ' + (data.type || '(none)'));
    lines.push('Approx. kids: ' + (data.kids || '(none)'));
    lines.push('Age range: ' + (data.age || '(none)'));
    lines.push('Location: ' + (data.location || '(none)'));
    lines.push('Constraints: ' + (data.constraints || '(none)'));
    lines.push('Timing: ' + (data.timing || '(none)'));
  } else {
    lines.push('Name: ' + data.name);
    lines.push('Email: ' + data.email);
    lines.push('Organization: ' + (data.org || '(none)'));
    lines.push('Support types: ' + (data.supportTypes.length ? data.supportTypes.join(', ') : '(none)'));
    lines.push('Notes: ' + (data.notes || '(none)'));
  }

  lines.push('');
  lines.push('Reply to this email to reach the submitter.');
  return lines.join('\n');
}

function buildNotifyHtml_(formType, data) {
  var rows = [];
  var add = function (label, value) {
    rows.push('<tr><td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top;">' +
      escapeHtml_(label) + '</td><td style="padding:4px 0;">' +
      escapeHtml_(value || '(none)') + '</td></tr>');
  };

  if (formType === 'drive') {
    add('Name', data.name);
    add('Email', data.email);
    add('Phone', data.phone);
    add('Car', data.car);
    add('Can do', data.canDo.join(', '));
    add('Availability', data.availability);
    add('Why', data.why);
  } else if (formType === 'visit') {
    add('Organization', data.org);
    add('Contact', data.contact);
    add('Email', data.email);
    add('Phone', data.phone);
    add('Type', data.type);
    add('Approx. kids', data.kids);
    add('Age range', data.age);
    add('Location', data.location);
    add('Constraints', data.constraints);
    add('Timing', data.timing);
  } else {
    add('Name', data.name);
    add('Email', data.email);
    add('Organization', data.org);
    add('Support types', data.supportTypes.join(', '));
    add('Notes', data.notes);
  }

  return (
    '<p>New <strong>' + escapeHtml_(FORM_LABELS[formType]) + '</strong> from ' +
    '<a href="' + CONFIG.SITE_URL + '">carsandkids.net</a></p>' +
    '<table style="border-collapse:collapse;">' + rows.join('') + '</table>' +
    '<p style="color:#666;margin-top:16px;">Reply to this email to reach the submitter.</p>'
  );
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run from Apps Script editor after setupIntakeSheet() to verify Sheet + email.
 * Change TEST_EMAIL to your inbox before running.
 */
var TEST_EMAIL = 'max@carsandkids.net';

function testDriveSubmission() {
  runTestSubmission_({
    formType: 'drive',
    name: 'Test Driver',
    email: TEST_EMAIL,
    phone: '555-0100',
    car: 'Test Car 2024',
    canDo: ['Display your car'],
    availability: 'Weekends',
    why: 'Apps Script test submission',
    website: '',
  });
}

function testVisitSubmission() {
  runTestSubmission_({
    formType: 'visit',
    org: 'Test Hospital',
    contact: 'Test Contact',
    email: TEST_EMAIL,
    phone: '555-0101',
    type: 'Hospital',
    kids: '25',
    age: '8-12',
    location: 'Denver, CO',
    constraints: 'Quiet engines only',
    timing: 'Next month',
    website: '',
  });
}

function testSupportSubmission() {
  runTestSubmission_({
    formType: 'support',
    name: 'Test Supporter',
    email: TEST_EMAIL,
    org: 'Test Company',
    supportType: ['Sponsorship'],
    notes: 'Apps Script test submission',
    website: '',
  });
}

function runTestSubmission_(payload) {
  var result = handleSubmission_({
    postData: { contents: JSON.stringify(payload) },
  });
  Logger.log(result.getContent());
}
