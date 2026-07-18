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
      // Update header row only — never clear the tab (would wipe live submissions).
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
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return jsonResponse_({ ok: false, error: 'Server busy. Please try again in a moment.' });
  }

  var rollback = null;
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

    // Append both tab rows, then email. On any later failure, roll back sheet writes
    // so a client retry cannot create duplicate/partial intake rows.
    rollback = appendSubmission_(formType, normalized);
    sendNotificationEmail_(formType, normalized);
    sendConfirmationEmail_(formType, normalized);
    rollback = null;

    return jsonResponse_({ ok: true });
  } catch (err) {
    if (rollback) {
      try {
        rollback();
      } catch (rbErr) {
        Logger.log('Rollback failed: ' + rbErr.message);
      }
    }
    Logger.log('Submission failed: ' + err.message);
    return jsonResponse_({ ok: false, error: err.message || 'Submission failed.' });
  } finally {
    lock.releaseLock();
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

/**
 * Appends type-tab + All rows. Returns a rollback function that deletes those
 * rows (in reverse order) if a later step in the intake pipeline fails.
 */
function appendSubmission_(formType, data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Spreadsheet not found — bind script to intake sheet.');
  }

  var now = new Date();
  var status = CONFIG.STATUS_NEW;
  var written = [];

  var rollbackWritten = function () {
    for (var i = written.length - 1; i >= 0; i--) {
      written[i].sheet.deleteRow(written[i].row);
    }
  };

  var write = function (tabName, row) {
    written.push(appendRow_(ss, tabName, row));
  };

  try {
    if (formType === 'drive') {
      write(TAB.DRIVE, [
        now, status, data.name, data.email, data.phone, data.car,
        data.canDo.join('; '), data.availability, data.why,
      ]);
      write(TAB.ALL, [
        now, formType, status, data.name, data.email, data.phone, '',
        buildDetails_({
          car: data.car,
          can_do: data.canDo.join('; '),
          availability: data.availability,
          why: data.why,
        }),
      ]);
    } else if (formType === 'visit') {
      write(TAB.VISIT, [
        now, status, data.org, data.contact, data.email, data.phone, data.type,
        data.kids, data.age, data.location, data.constraints, data.timing,
      ]);
      write(TAB.ALL, [
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
    } else {
      write(TAB.SUPPORT, [
        now, status, data.name, data.email, data.org, data.supportTypes.join('; '), data.notes,
      ]);
      write(TAB.ALL, [
        now, formType, status, data.name, data.email, '', data.org,
        buildDetails_({
          support_types: data.supportTypes.join('; '),
          notes: data.notes,
        }),
      ]);
    }
  } catch (writeErr) {
    try {
      rollbackWritten();
    } catch (rbErr) {
      Logger.log('Append rollback failed: ' + rbErr.message);
    }
    throw writeErr;
  }

  return rollbackWritten;
}

function appendRow_(ss, tabName, row) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    throw new Error('Missing tab "' + tabName + '" — run setupIntakeSheet() first.');
  }
  sheet.appendRow(row);
  return { sheet: sheet, row: sheet.getLastRow() };
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

function sendConfirmationEmail_(formType, data) {
  var label = FORM_LABELS[formType];
  var name = displayName_(formType, data);
  var subject = 'We received your message — Cars & Kids';
  var plain =
    'Hi ' + name + ',\n\n' +
    'Thanks for reaching out. We received your ' + label + ' and will follow up soon.\n\n' +
    '— Cars & Kids\n' +
    CONFIG.SITE_URL;

  var html =
    '<p>Hi ' + escapeHtml_(name) + ',</p>' +
    '<p>Thanks for reaching out. We received your <strong>' + escapeHtml_(label) + '</strong> and will follow up soon.</p>' +
    '<p>— Cars & Kids<br><a href="' + CONFIG.SITE_URL + '">' + CONFIG.SITE_URL + '</a></p>';

  GmailApp.sendEmail(data.email, subject, plain, {
    htmlBody: html,
    name: CONFIG.FROM_NAME,
    replyTo: CONFIG.FROM_EMAIL,
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

function displayName_(formType, data) {
  if (formType === 'visit') return data.contact || 'there';
  return data.name || 'there';
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
