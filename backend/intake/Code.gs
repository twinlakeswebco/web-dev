// Deploy as a Web App executing as casey@twinlakesweb.com.
// RELAY_SECRET lives in Script Properties, never in source control.
var INTAKE_PARENT = '1Fo5UMBAMnvaQD05kdbmIe9U11JpPZNnZ';
var INTAKE_EMAIL = 'casey@twinlakesweb.com';
var INTAKE_MAX_BYTES = 15 * 1024 * 1024;

function setupIntake() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('RELAY_SECRET')) {
    properties.setProperty('RELAY_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  console.log('Folder access: ' + DriveApp.getFolderById(INTAKE_PARENT).getName());
  console.log('Email quota remaining: ' + MailApp.getRemainingDailyQuota());
  console.log('Setup ready. RELAY_SECRET is available in Project Settings > Script Properties.');
}

function doPost(event) {
  var lock = LockService.getScriptLock();
  try {
    var data = JSON.parse(event.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    if (!secret || !data.sharedSecret || !sameSecret(secret, data.sharedSecret)) return intakeResult({ success: false, error: 'Unauthorized.', status: 403 });
    if (!/^[0-9a-f-]{36}$/i.test(data.submissionId) || !/^[0-9a-f]{64}$/.test(data.fingerprint)) throw new Error('Invalid intake identifier.');
    if (!lock.tryLock(25000)) return intakeResult({ success: false, error: 'The storage service is busy. Please retry.', status: 503 });
    var parent = DriveApp.getFolderById(INTAKE_PARENT);
    // The ID makes start idempotent, even if the response was lost after creation.
    var marker = 'Twin Lakes intake ID: ' + data.submissionId;
    var folders = parent.getFolders();
    var folder = null;
    while (folders.hasNext()) {
      var candidate = folders.next();
      if (candidate.getDescription() === marker) { folder = candidate; break; }
    }
    if (!folder) {
      if (data.action !== 'start') throw new Error('Intake not found. Please start again.');
      if (!data.fields || !data.fields.name || !data.fields.email || !Array.isArray(data.files) || data.files.length > 10) throw new Error('Invalid intake.');
      data.files.forEach(function (file) {
        if (!file || file.size < 1 || file.size > INTAKE_MAX_BYTES || !/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type)) throw new Error('Invalid photo.');
      });
      var date = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
      var name = data.fields.name.trim().replace(/[^a-zA-Z0-9\u00c0-\u024f]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'Visitor';
      folder = parent.createFolder(date + '-' + name + '-Intake');
      folder.setDescription(marker);
    }
    var stateFiles = folder.getFilesByName('intake-state.json');
    var stateFile = stateFiles.hasNext() ? stateFiles.next() : null;
    var state;
    if (stateFile) {
      state = JSON.parse(stateFile.getBlob().getDataAsString());
      if (state.fingerprint !== data.fingerprint) return intakeResult({ success: false, error: 'This request was already started with different answers or pictures. Please restore the original selection or start a new request.', status: 409 });
    } else {
      if (data.action !== 'start') throw new Error('Intake not ready. Please retry.');
      state = { fingerprint: data.fingerprint, fields: data.fields, files: data.files, received: {}, createdAt: new Date().toISOString(), completed: false, emailState: 'pending' };
      stateFile = folder.createFile('intake-state.json', JSON.stringify(state), MimeType.PLAIN_TEXT);
    }
    ensureAnswers(folder, state, data.submissionId);
    if (data.action === 'photo') {
      var index = data.index;
      var file = state.files[index];
      if (!file || Math.floor(index) !== index || typeof data.base64 !== 'string' || data.base64.length > Math.ceil(INTAKE_MAX_BYTES / 3) * 4) throw new Error('Invalid photo upload.');
      if (!state.received[index]) {
        var bytes = Utilities.base64Decode(data.base64);
        if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error('Photo integrity check failed.');
        var filename = String(index + 1).padStart(2, '0') + '-' + file.name.replace(/[\x00-\x1f/\\]/g, '_');
        var existing = folder.getFilesByName(filename);
        var saved = existing.hasNext() ? existing.next() : folder.createFile(Utilities.newBlob(bytes, file.type, filename));
        state.received[index] = saved.getId();
        stateFile.setContent(JSON.stringify(state));
      }
    } else if (data.action === 'complete') {
      if (state.files.some(function (_, index) { return !state.received[index]; })) return intakeResult({ success: false, error: 'Some pictures have not finished uploading. Please retry.', status: 409 });
      if (!state.completed) {
        // Persist the email transition first: an ambiguous MailApp failure must
        // never cause an automatic duplicate email on a network retry.
        if (state.emailState === 'sending') return intakeResult({ success: false, error: 'Your inquiry and pictures are saved. Email delivery is awaiting confirmation; please email casey@twinlakesweb.com if needed.', status: 503 });
        if (MailApp.getRemainingDailyQuota() < 1) return intakeResult({ success: false, error: 'Your inquiry is saved. Email notifications are temporarily unavailable. Please email casey@twinlakesweb.com.', status: 503 });
        state.emailState = 'sending';
        stateFile.setContent(JSON.stringify(state));
        MailApp.sendEmail({
          to: INTAKE_EMAIL,
          replyTo: state.fields.email,
          name: 'Twin Lakes Web Co. Website Inquiry',
          subject: 'New Website Inquiry | ' + state.fields.business.replace(/[\r\n]/g, ' '),
          body: 'New inquiry from ' + state.fields.name + '\n\n' + answersText(state, data.submissionId) + '\n\nIntake folder: ' + folder.getUrl() + '\n\nPictures: ' + state.files.length,
        });
        state.emailState = 'sent';
        state.completed = true;
        state.completedAt = new Date().toISOString();
        stateFile.setContent(JSON.stringify(state));
      }
    } else if (data.action !== 'start') throw new Error('Unknown intake action.');
    return intakeResult({ success: true, completed: state.completed });
  } catch (error) {
    console.error('Intake storage operation failed: ' + error.name);
    return intakeResult({ success: false, error: 'Your request could not be confirmed. Please retry with the same pictures.', status: 502 });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function ensureAnswers(folder, state, id) {
  if (!folder.getFilesByName('intake.txt').hasNext()) folder.createFile('intake.txt', answersText(state, id), MimeType.PLAIN_TEXT);
}
function answersText(state, id) {
  var labels = { name: 'Name', email: 'Email', phone: 'Phone', business: '1. Business or organization', business_description: '2. What the business does', primary_purpose: '3. Main website purpose', target_audience: '4. Ideal customer or audience', primary_action: '5. Primary visitor action', pages_needed: '6. Pages needed', priority_offering: '7. Priority services or information', special_features: '8. Special features', content_status: '9. Content status', brand_assets: '10. Brand assets', inspiration_sites: '11. Website inspiration', owns_domain: 'Domain/hosting answer', existing_web_presence: '12. Existing website/domain/hosting', public_contact_info: '13. Public contact information', timeline: '14. Timeline or deadline', budget: '15. Budget and maintenance', reference_links: 'Reference file links' };
  var text = 'TWIN LAKES WEB CO. WEBSITE INTAKE\nSubmitted: ' + state.createdAt + '\nSubmission ID: ' + id + '\n';
  Object.keys(labels).forEach(function (key) { text += '\n' + labels[key] + ':\n' + (state.fields[key] || 'Not provided') + '\n'; });
  text += '\nSelected pictures:\n' + (state.files.map(function (file) { return file.name + ' (' + file.size + ' bytes)'; }).join('\n') || 'None');
  return text;
}
function sha256(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function sameSecret(left, right) {
  var a = sha256(Utilities.newBlob(String(left)).getBytes());
  var b = sha256(Utilities.newBlob(String(right)).getBytes());
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function intakeResult(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
