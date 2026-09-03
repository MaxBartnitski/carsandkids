/**
 * Cars & Kids website form handler
 * Bound to "Cars & Kids Intake" spreadsheet — run setupIntakeSheet() once after paste.
 *
 * Drive + Support also: upsert Google Contact (Volunteer label), invite to upcoming
 * [Cars & Kids] calendar events, send welcome (To max@, BCC volunteer).
 */

var CONFIG = {
  // Bump this when changing doPost / sheet write / CRM logic — health check returns it
  VERSION: '2026-09-03-volunteer-crm-services',
  NOTIFY_EMAIL: 'info@carsandkids.net',
  FROM_EMAIL: 'info@carsandkids.net',
  FROM_NAME: 'Cars & Kids',
  SITE_URL: 'https://carsandkids.net/',
  STATUS_NEW: 'New',
  WELCOME_TO: 'max@carsandkids.net',
  WELCOME_FROM: 'max@carsandkids.net',
  WELCOME_FROM_NAME: 'Max Bartnitski',
  VOLUNTEER_LABEL: 'Volunteer',
  EVENT_TITLE_TAG: '[Cars & Kids]',
  CALENDAR_LOOKAHEAD_MONTHS: 18,
  // Editor tests skip live calendar invites unless you set this true on purpose.
  TEST_SEND_CALENDAR: false,
};

var TAB = {
  ALL: 'All',
  DRIVE: 'Drive',
  VISIT: 'Visit',
  SUPPORT: 'Support',
};

var HEADERS = {};
// All = full CRM view; car before org. Unused fields stay blank per form type.
HEADERS[TAB.ALL] = [
  'submitted_at', 'form_type', 'status', 'name', 'email', 'phone',
  'car', 'org', 'can_do', 'availability', 'why',
  'org_type', 'kids', 'age', 'location', 'constraints', 'timing',
  'support_types', 'notes',
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
    // Always sync header row (does not clear existing data rows)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Drop leftover headers from a previous wider schema
    var lastCol = sheet.getMaxColumns();
    if (lastCol > headers.length) {
      sheet.getRange(1, headers.length + 1, 1, lastCol).clearContent();
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
  // Health check — GET /exec?health=1 returns status + version (proves which deploy is live)
  if (e && e.parameter && e.parameter.health === '1') {
    return jsonResponse_({
      ok: true,
      service: 'carsandkids-forms',
      version: CONFIG.VERSION,
    });
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

    var crm = emptyCrmResult_();
    if (formType === 'drive' || formType === 'support') {
      crm = runVolunteerCrm_(formType, normalized, {
        skipCalendar: data._test === true && !CONFIG.TEST_SEND_CALENDAR,
      });
    }

    try {
      sendNotificationEmail_(formType, normalized, crm);
    } catch (notifyErr) {
      Logger.log('NOTIFICATION FAILED after sheet write: ' + notifyErr.message);
    }

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
      now, formType, status, data.name, data.email, data.phone,
      data.car, '', data.canDo.join('; '), data.availability, data.why,
      '', '', '', '', '', '',
      '', '',
    ]);
    return;
  }

  if (formType === 'visit') {
    appendRow_(ss, TAB.VISIT, [
      now, status, data.org, data.contact, data.email, data.phone, data.type,
      data.kids, data.age, data.location, data.constraints, data.timing,
    ]);
    appendRow_(ss, TAB.ALL, [
      now, formType, status, data.contact, data.email, data.phone,
      '', data.org, '', '', '',
      data.type, data.kids, data.age, data.location, data.constraints, data.timing,
      '', '',
    ]);
    return;
  }

  appendRow_(ss, TAB.SUPPORT, [
    now, status, data.name, data.email, data.org, data.supportTypes.join('; '), data.notes,
  ]);
  appendRow_(ss, TAB.ALL, [
    now, formType, status, data.name, data.email, '',
    '', data.org, '', '', '',
    '', '', '', '', '', '',
    data.supportTypes.join('; '), data.notes,
  ]);
}

function appendRow_(ss, tabName, row) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    throw new Error('Missing tab "' + tabName + '" — run setupIntakeSheet() first.');
  }
  if (row.length !== HEADERS[tabName].length) {
    throw new Error(
      'Column count mismatch for "' + tabName + '": got ' + row.length +
      ', expected ' + HEADERS[tabName].length + '. Run setupIntakeSheet().'
    );
  }
  sheet.appendRow(row);
}

function emptyCrmResult_() {
  return {
    errors: [],
    warnings: [],
    alreadyVolunteer: false,
    contactOk: false,
    eventsAdded: [],
    eventsSkipped: [],
    eventsNoneFound: false,
    welcomeSent: false,
    welcomeSkipped: false,
  };
}

function runVolunteerCrm_(formType, data, options) {
  options = options || {};
  var result = emptyCrmResult_();
  var alreadyVolunteer = false;

  try {
    var contactInfo = upsertVolunteerContact_(formType, data);
    alreadyVolunteer = !!contactInfo.alreadyVolunteer;
    result.alreadyVolunteer = alreadyVolunteer;
    result.contactOk = true;
  } catch (err) {
    result.errors.push('Google Contact: ' + (err.message || err));
  }

  try {
    if (options.skipCalendar) {
      result.warnings.push(
        'Calendar invites skipped (editor test). Set CONFIG.TEST_SEND_CALENDAR = true to send.'
      );
    } else {
      var cal = inviteToUpcomingEvents_(data.email);
      result.eventsAdded = cal.added;
      result.eventsSkipped = cal.skipped;
      result.eventsNoneFound = cal.noneFound;
      if (cal.noneFound) {
        result.warnings.push('NO UPCOMING [Cars & Kids] EVENTS');
      }
      if (cal.failures && cal.failures.length) {
        result.errors.push('Calendar: ' + cal.failures.join('; '));
      }
    }
  } catch (err) {
    result.errors.push('Calendar: ' + (err.message || err));
  }

  try {
    if (alreadyVolunteer) {
      result.welcomeSkipped = true;
    } else {
      sendWelcomeEmail_(formType, data, result.eventsAdded.length > 0);
      result.welcomeSent = true;
    }
  } catch (err) {
    result.errors.push('Welcome email: ' + (err.message || err));
  }

  return result;
}

function assertPeopleApi_() {
  if (typeof People === 'undefined') {
    throw new Error(
      'People API is not loaded on this deployment. In Apps Script: Services (+) → People API, Save, then Deploy → Manage deployments → pencil → New version. Adding it only in the editor does not update the live form.'
    );
  }
}

function assertCalendarApi_() {
  if (typeof Calendar === 'undefined') {
    throw new Error(
      'Google Calendar API is not loaded on this deployment. In Apps Script: Services (+) → Google Calendar API, Save, then Deploy → Manage deployments → pencil → New version. Adding it only in the editor does not update the live form.'
    );
  }
}

function splitName_(full) {
  var parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { givenName: 'Volunteer', familyName: '' };
  }
  if (parts.length === 1) {
    return { givenName: parts[0], familyName: '' };
  }
  return { givenName: parts[0], familyName: parts.slice(1).join(' ') };
}

function firstName_(full) {
  return splitName_(full).givenName;
}

function personHasEmail_(person, email) {
  var addresses = (person && person.emailAddresses) || [];
  return addresses.some(function (item) {
    return item.value && item.value.toLowerCase() === email;
  });
}

function findContactByEmail_(email) {
  assertPeopleApi_();
  var needle = email.toLowerCase();
  var fields = 'names,emailAddresses,phoneNumbers,biographies,memberships,metadata';

  var searched = People.People.searchContacts({
    query: email,
    readMask: fields,
    pageSize: 25,
  });
  var searchHits = (searched && searched.results) || [];
  var i;
  for (i = 0; i < searchHits.length; i++) {
    if (searchHits[i].person && personHasEmail_(searchHits[i].person, needle)) {
      return searchHits[i].person;
    }
  }

  var pageToken;
  do {
    var conn = People.People.Connections.list('people/me', {
      personFields: fields,
      pageSize: 200,
      pageToken: pageToken,
    });
    var people = (conn && conn.connections) || [];
    for (i = 0; i < people.length; i++) {
      if (personHasEmail_(people[i], needle)) {
        return people[i];
      }
    }
    pageToken = conn && conn.nextPageToken;
  } while (pageToken);

  return null;
}

function listContactGroups_() {
  assertPeopleApi_();
  var groups = [];
  var pageToken;
  do {
    var res = People.ContactGroups.list({
      groupFields: 'name,groupType,memberCount',
      pageToken: pageToken,
    });
    var items = (res && res.contactGroups) || [];
    for (var i = 0; i < items.length; i++) {
      groups.push(items[i]);
    }
    pageToken = res && res.nextPageToken;
  } while (pageToken);
  return groups;
}

function ensureVolunteerGroup_() {
  var wanted = CONFIG.VOLUNTEER_LABEL.toLowerCase();
  var groups = listContactGroups_();
  for (var i = 0; i < groups.length; i++) {
    var name = (groups[i].name || '').toLowerCase();
    if (name === wanted) {
      return groups[i];
    }
  }
  var created = People.ContactGroups.create({
    contactGroup: { name: CONFIG.VOLUNTEER_LABEL },
  });
  if (!created || !created.resourceName) {
    throw new Error('People API created no Volunteer contact group.');
  }
  return created;
}

function personInGroup_(person, groupResourceName) {
  var memberships = (person && person.memberships) || [];
  return memberships.some(function (m) {
    var cg = m.contactGroupMembership;
    return cg && cg.contactGroupResourceName === groupResourceName;
  });
}

function contactNotes_(formType, data) {
  var lines = ['Cars & Kids ' + FORM_LABELS[formType]];
  if (formType === 'drive') {
    lines.push('Car: ' + data.car);
    lines.push('Can do: ' + (data.canDo.length ? data.canDo.join(', ') : '(none)'));
    lines.push('Availability: ' + (data.availability || '(none)'));
    lines.push('Why: ' + (data.why || '(none)'));
  } else {
    lines.push('Organization: ' + (data.org || '(none)'));
    lines.push('Support types: ' + (data.supportTypes.length ? data.supportTypes.join(', ') : '(none)'));
    lines.push('Notes: ' + (data.notes || '(none)'));
  }
  return lines.join('\n');
}

function upsertVolunteerContact_(formType, data) {
  assertPeopleApi_();
  var group = ensureVolunteerGroup_();
  var groupResourceName = group.resourceName;
  var existing = findContactByEmail_(data.email);
  var alreadyVolunteer = existing ? personInGroup_(existing, groupResourceName) : false;
  var notes = contactNotes_(formType, data);

  if (!existing) {
    var names = splitName_(data.name);
    var createdBody = {
      names: [{ givenName: names.givenName, familyName: names.familyName }],
      emailAddresses: [{ value: data.email }],
      biographies: [{ value: notes, contentType: 'TEXT_PLAIN' }],
    };
    if (data.phone) {
      createdBody.phoneNumbers = [{ value: data.phone }];
    }
    existing = People.People.createContact(createdBody);
    if (!existing || !existing.resourceName) {
      throw new Error('People API created a contact but returned no resourceName.');
    }
  } else {
    if (!existing.etag) {
      throw new Error('Existing contact is missing etag; cannot update ' + data.email + '.');
    }
    var updateBody = { etag: existing.etag };
    var changedFields = ['biographies'];
    updateBody.biographies = [{ value: notes, contentType: 'TEXT_PLAIN' }];
    if (data.phone) {
      var phones = existing.phoneNumbers ? existing.phoneNumbers.slice() : [];
      var hasPhone = phones.some(function (p) {
        return p.value && p.value.replace(/\D/g, '') === data.phone.replace(/\D/g, '');
      });
      if (!hasPhone) {
        phones.push({ value: data.phone });
        updateBody.phoneNumbers = phones;
        changedFields.push('phoneNumbers');
      }
    }
    People.People.updateContact(updateBody, existing.resourceName, {
      updatePersonFields: changedFields.join(','),
    });
  }

  if (!personInGroup_(existing, groupResourceName)) {
    People.ContactGroups.Members.modify({
      resourceNamesToAdd: [existing.resourceName],
    }, groupResourceName);
  }

  return {
    resourceName: existing.resourceName,
    alreadyVolunteer: alreadyVolunteer,
  };
}

function inviteToUpcomingEvents_(email) {
  assertCalendarApi_();
  var needle = email.toLowerCase();
  var tag = CONFIG.EVENT_TITLE_TAG;
  var start = new Date();
  start.setHours(0, 0, 0, 0);
  var end = new Date(start);
  end.setMonth(end.getMonth() + CONFIG.CALENDAR_LOOKAHEAD_MONTHS);

  var calendars = listWritableCalendars_();
  if (!calendars.length) {
    throw new Error(
      'No writable calendars on this account. Deploy the web app as max@makobabusiness.com.'
    );
  }

  var matches = [];
  var c;
  for (c = 0; c < calendars.length; c++) {
    var pageToken;
    do {
      var res = Calendar.Events.list(calendars[c].id, {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        q: tag,
        pageToken: pageToken,
      });
      var items = (res && res.items) || [];
      var i;
      for (i = 0; i < items.length; i++) {
        var ev = items[i];
        var title = ev.summary || '';
        if (title.indexOf(tag) === -1) continue;
        matches.push({
          calendarId: calendars[c].id,
          event: ev,
          title: title,
        });
      }
      pageToken = res && res.nextPageToken;
    } while (pageToken);
  }

  var added = [];
  var skipped = [];
  var failures = [];

  if (!matches.length) {
    return { added: added, skipped: skipped, failures: failures, noneFound: true };
  }

  for (c = 0; c < matches.length; c++) {
    var match = matches[c];
    var attendees = match.event.attendees ? match.event.attendees.slice() : [];
    var already = attendees.some(function (a) {
      return a.email && a.email.toLowerCase() === needle;
    });
    if (already) {
      skipped.push(match.title);
      continue;
    }
    attendees.push({ email: email });
    try {
      var patched = Calendar.Events.patch(
        { attendees: attendees },
        match.calendarId,
        match.event.id,
        { sendUpdates: 'all' }
      );
      if (!patched || !patched.id) {
        throw new Error('Calendar patch returned no event id.');
      }
      added.push(match.title);
    } catch (err) {
      failures.push(match.title + ': ' + (err.message || err));
    }
  }

  return { added: added, skipped: skipped, failures: failures, noneFound: false };
}

function listWritableCalendars_() {
  assertCalendarApi_();
  var calendars = [];
  var pageToken;
  do {
    var res = Calendar.CalendarList.list({
      minAccessRole: 'writer',
      pageToken: pageToken,
    });
    var items = (res && res.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].id) {
        calendars.push({ id: items[i].id, summary: items[i].summary });
      }
    }
    pageToken = res && res.nextPageToken;
  } while (pageToken);
  return calendars;
}

function assertWelcomeSendAs_() {
  var wanted = CONFIG.WELCOME_FROM.toLowerCase();
  var aliases = GmailApp.getAliases() || [];
  var match = aliases.some(function (alias) {
    return String(alias).toLowerCase() === wanted;
  });
  if (match) return;
  var me = Session.getActiveUser().getEmail();
  if (me && me.toLowerCase() === wanted) return;
  throw new Error(
    'Gmail is not configured to send as ' + CONFIG.WELCOME_FROM +
    '. Available aliases: ' + (aliases.join(', ') || '(none)') +
    '. Add it in Gmail → Settings → Accounts → Send mail as.'
  );
}

function sendWelcomeEmail_(formType, data, invitesSent) {
  assertWelcomeSendAs_();
  var built = buildWelcome_(formType, data, invitesSent);
  GmailApp.sendEmail(CONFIG.WELCOME_TO, built.subject, built.plain, {
    htmlBody: built.html,
    name: CONFIG.WELCOME_FROM_NAME,
    from: CONFIG.WELCOME_FROM,
    replyTo: CONFIG.WELCOME_FROM,
    bcc: data.email,
  });
}

function buildWelcome_(formType, data, invitesSent) {
  var first = firstName_(data.name);
  var lines = ['Hi ' + first + ',', '', 'Thanks for signing up with Cars & Kids. Glad you are in.'];

  if (formType === 'drive' && data.car) {
    lines[2] += ' Excited to have the ' + data.car + ' in the mix.';
  }

  lines.push('');
  if (invitesSent) {
    lines.push(
      'I sent calendar invites for the upcoming events. Please RSVP yes or no on those so I can communicate with the facilities effectively.'
    );
  } else {
    lines.push(
      'I will send calendar invites for upcoming events. Please RSVP yes or no on those so I can communicate with the facilities effectively.'
    );
  }

  if (formType === 'drive') {
    lines.push('');
    lines.push('Reply with a good photo of your car. We use those to promote the event.');
  }

  lines.push('');
  lines.push('If anything looks off, just reply here.');
  lines.push('');
  lines.push('Max');
  lines.push('Cars & Kids');
  lines.push(CONFIG.SITE_URL.replace(/\/$/, ''));

  var plain = lines.join('\n');
  var htmlParts = [];
  var para = [];
  var i;
  for (i = 0; i < lines.length; i++) {
    if (lines[i] === '') {
      if (para.length) {
        htmlParts.push('<p style="margin:0 0 1em 0;">' + para.join('<br>\n') + '</p>');
        para = [];
      }
    } else {
      para.push(escapeHtml_(lines[i]));
    }
  }
  if (para.length) {
    htmlParts.push('<p style="margin:0 0 1em 0;">' + para.join('<br>\n') + '</p>');
  }
  var html = (
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#222;">' +
    htmlParts.join('\n').replace(
      escapeHtml_(CONFIG.SITE_URL.replace(/\/$/, '')),
      '<a href="' + CONFIG.SITE_URL + '">' + escapeHtml_(CONFIG.SITE_URL.replace(/\/$/, '')) + '</a>'
    ) +
    '</div>'
  );

  return {
    subject: 'Welcome to Cars & Kids',
    plain: plain,
    html: html,
  };
}

function sendNotificationEmail_(formType, data, crm) {
  crm = crm || emptyCrmResult_();
  var subject = buildNotifySubject_(formType, data, crm);
  var plain = buildNotifyPlain_(formType, data, crm);
  var html = buildNotifyHtml_(formType, data, crm);
  var replyTo = data.email;

  GmailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, plain, {
    htmlBody: html,
    name: CONFIG.FROM_NAME,
    replyTo: replyTo,
  });
}

function buildNotifySubject_(formType, data, crm) {
  var prefix = NOTIFY_PREFIX[formType];
  var core;
  if (formType === 'drive') {
    core = prefix + ' — ' + data.name + ' (' + data.car + ')';
  } else if (formType === 'visit') {
    core = prefix + ' — ' + data.org + ' (' + data.contact + ')';
  } else {
    var orgPart = data.org ? ' (' + data.org + ')' : '';
    core = prefix + ' — ' + data.name + orgPart;
  }
  if (crm.retry) {
    if (crm.errors && crm.errors.length) {
      return '[Cars & Kids] CRM RETRY FAILED — ' + core;
    }
    return '[Cars & Kids] CRM RETRY — ' + core;
  }
  if (crm.errors && crm.errors.length) {
    return '[Cars & Kids] CONTACT/CALENDAR/WELCOME FAILED — ' + core;
  }
  if (crm.warnings && crm.warnings.length) {
    return '[Cars & Kids] ' + crm.warnings[0] + ' — ' + core;
  }
  return '[Cars & Kids] ' + core;
}

function buildCrmPlain_(crm) {
  if (!crm) return [];
  var lines = ['', '--- Volunteer CRM ---'];
  if (crm.errors.length) {
    lines.push('FAILED:');
    crm.errors.forEach(function (msg) {
      lines.push('  - ' + msg);
    });
  }
  if (crm.warnings.length) {
    crm.warnings.forEach(function (msg) {
      lines.push('WARNING: ' + msg);
    });
  }
  if (crm.contactOk) {
    lines.push(crm.alreadyVolunteer ? 'Contact: existing Volunteer (updated).' : 'Contact: created/updated + Volunteer label.');
  }
  if (crm.eventsAdded.length) {
    lines.push('Calendar invites sent:');
    crm.eventsAdded.forEach(function (title) {
      lines.push('  - ' + title);
    });
  }
  if (crm.eventsSkipped.length) {
    lines.push('Already a guest (not re-sent):');
    crm.eventsSkipped.forEach(function (title) {
      lines.push('  - ' + title);
    });
  }
  if (crm.welcomeSent) {
    lines.push('Welcome email: sent to ' + CONFIG.WELCOME_TO + ' (BCC volunteer).');
  } else if (crm.welcomeSkipped) {
    lines.push('Welcome email: skipped (already a Volunteer).');
  }
  return lines;
}

function buildNotifyPlain_(formType, data, crm) {
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

  if (formType !== 'visit') {
    lines = lines.concat(buildCrmPlain_(crm));
  }

  lines.push('');
  lines.push('Reply to this email to reach the submitter.');
  return lines.join('\n');
}

function buildCrmHtml_(crm) {
  var chunks = [];
  if (crm.errors.length) {
    chunks.push(
      '<p style="color:#b00020;font-weight:700;margin:16px 0 8px 0;">CONTACT/CALENDAR/WELCOME FAILED</p><ul>' +
      crm.errors.map(function (msg) {
        return '<li>' + escapeHtml_(msg) + '</li>';
      }).join('') +
      '</ul>'
    );
  }
  if (crm.warnings.length) {
    chunks.push(
      '<p style="color:#8a5a00;font-weight:700;">' +
      crm.warnings.map(function (msg) { return escapeHtml_(msg); }).join('<br>') +
      '</p>'
    );
  }
  var rows = [];
  if (crm.contactOk) {
    rows.push(crm.alreadyVolunteer ? 'Existing Volunteer (updated)' : 'Created/updated + Volunteer label');
  }
  if (crm.eventsAdded.length) {
    rows.push('Invites sent: ' + crm.eventsAdded.join('; '));
  }
  if (crm.eventsSkipped.length) {
    rows.push('Already a guest: ' + crm.eventsSkipped.join('; '));
  }
  if (crm.welcomeSent) {
    rows.push('Welcome sent to ' + CONFIG.WELCOME_TO + ' (BCC volunteer)');
  } else if (crm.welcomeSkipped) {
    rows.push('Welcome skipped (already a Volunteer)');
  }
  if (rows.length) {
    chunks.push('<p>' + rows.map(function (r) { return escapeHtml_(r); }).join('<br>') + '</p>');
  }
  return chunks.join('');
}

function buildNotifyHtml_(formType, data, crm) {
  crm = crm || emptyCrmResult_();
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

  var crmHtml = formType === 'visit' ? '' : buildCrmHtml_(crm);

  return (
    '<p>New <strong>' + escapeHtml_(FORM_LABELS[formType]) + '</strong> from ' +
    '<a href="' + CONFIG.SITE_URL + '">carsandkids.net</a></p>' +
    crmHtml +
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
 * Calendar invites are skipped unless CONFIG.TEST_SEND_CALENDAR is true.
 */
var TEST_EMAIL = 'max@carsandkids.net';

/**
 * Run from the editor to confirm People + Calendar advanced services are loaded
 * in THIS project (editor HEAD). The live website still needs a New version deploy.
 */
function checkAdvancedServices() {
  var missing = [];
  if (typeof People === 'undefined') missing.push('People API');
  if (typeof Calendar === 'undefined') missing.push('Google Calendar API');
  if (missing.length) {
    throw new Error(
      'Not enabled in this script: ' + missing.join(', ') +
      '. Left sidebar Services (+) → add each one → Save.'
    );
  }
  Logger.log('People API and Google Calendar API are loaded in the editor.');
}

/**
 * Set this, then run retryVolunteerCrm() from the editor after services are enabled.
 * Replays Contact + Calendar for that email from the latest Drive/Support sheet row.
 * Does not send a second welcome.
 */
var RETRY_EMAIL = 'amypeet@live.com';

function retryVolunteerCrm() {
  checkAdvancedServices();
  var email = String(RETRY_EMAIL || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Set RETRY_EMAIL, then run retryVolunteerCrm.');
  }

  var found = findLatestVolunteerSubmission_(email);
  if (!found) {
    throw new Error(
      'No Drive or Support row for ' + email + '. Check the Cars & Kids Intake sheet.'
    );
  }

  var crm = emptyCrmResult_();
  crm.retry = true;
  crm.welcomeSkipped = true;

  try {
    var contactInfo = upsertVolunteerContact_(found.formType, found.data);
    crm.alreadyVolunteer = !!contactInfo.alreadyVolunteer;
    crm.contactOk = true;
  } catch (err) {
    crm.errors.push('Google Contact: ' + (err.message || err));
  }

  try {
    var cal = inviteToUpcomingEvents_(found.data.email);
    crm.eventsAdded = cal.added;
    crm.eventsSkipped = cal.skipped;
    crm.eventsNoneFound = cal.noneFound;
    if (cal.noneFound) {
      crm.warnings.push('NO UPCOMING [Cars & Kids] EVENTS');
    }
    if (cal.failures && cal.failures.length) {
      crm.errors.push('Calendar: ' + cal.failures.join('; '));
    }
  } catch (err) {
    crm.errors.push('Calendar: ' + (err.message || err));
  }

  sendNotificationEmail_(found.formType, found.data, crm);
  Logger.log(JSON.stringify({
    email: email,
    formType: found.formType,
    contactOk: crm.contactOk,
    eventsAdded: crm.eventsAdded,
    eventsSkipped: crm.eventsSkipped,
    errors: crm.errors,
    warnings: crm.warnings,
  }));
  if (crm.errors.length) {
    throw new Error('CRM retry failed: ' + crm.errors.join(' | '));
  }
}

function findLatestVolunteerSubmission_(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Open this script from Extensions > Apps Script on the intake spreadsheet.');
  }

  var needle = String(email || '').trim().toLowerCase();
  if (!needle) {
    throw new Error('email is required.');
  }

  var candidates = [];
  var drive = ss.getSheetByName(TAB.DRIVE);
  if (!drive) {
    throw new Error('Missing tab "Drive" — run setupIntakeSheet() first.');
  }
  var driveRows = drive.getDataRange().getValues();
  var i;
  for (i = 1; i < driveRows.length; i++) {
    var d = driveRows[i];
    if (String(d[3] || '').trim().toLowerCase() !== needle) continue;
    candidates.push({
      at: d[0],
      formType: 'drive',
      data: {
        name: String(d[2] || '').trim(),
        email: needle,
        phone: String(d[4] || '').trim(),
        car: String(d[5] || '').trim(),
        canDo: splitSheetList_(d[6]),
        availability: String(d[7] || '').trim(),
        why: String(d[8] || '').trim(),
      },
    });
  }

  var support = ss.getSheetByName(TAB.SUPPORT);
  if (!support) {
    throw new Error('Missing tab "Support" — run setupIntakeSheet() first.');
  }
  var supportRows = support.getDataRange().getValues();
  for (i = 1; i < supportRows.length; i++) {
    var s = supportRows[i];
    if (String(s[3] || '').trim().toLowerCase() !== needle) continue;
    candidates.push({
      at: s[0],
      formType: 'support',
      data: {
        name: String(s[2] || '').trim(),
        email: needle,
        org: String(s[4] || '').trim(),
        supportTypes: splitSheetList_(s[5]),
        notes: String(s[6] || '').trim(),
      },
    });
  }

  if (!candidates.length) return null;

  candidates.sort(function (a, b) {
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });
  return candidates[0];
}

function splitSheetList_(value) {
  return String(value || '')
    .split(';')
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
}

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
    _test: true,
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
    _test: true,
  });
}

function runTestSubmission_(payload) {
  var result = handleSubmission_({
    postData: { contents: JSON.stringify(payload) },
  });
  Logger.log(result.getContent());
}
